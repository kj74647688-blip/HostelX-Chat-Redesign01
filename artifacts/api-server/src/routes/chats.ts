import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AddChatMembersBody,
  AddChatMembersResponse,
  CreateChatBody,
  CreateChatResponse,
  DeleteChatParams,
  ListChatMessagesParams,
  ListChatMessagesResponse,
  ListChatsResponse,
  RemoveChatMemberParams,
  SendChatMessageParams,
  SendChatMessageBody,
  SendChatMessageResponse,
  UpdateChatBody,
  UpdateChatParams,
  UpdateChatResponse,
} from "@workspace/api-zod";
import {
  chatMembersTable,
  chatMessagesTable,
  chatsTable,
  db,
  usersTable,
  type HostelxChat,
} from "@workspace/db";

import {
  authUser,
  requireAdmin,
  requireAuth,
  requireCompletedProfile,
} from "../lib/hostelx-auth";
import { assertOwnedCompletedUpload } from "../lib/hostelx-storage";

const router: IRouter = Router();
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ChatMemberView = {
  internalId: string;
  loginId: string;
  displayName: string | null;
  displayId: string | null;
  role: "owner" | "admin" | "user";
  profilePhotoPath: string | null;
};

type ChatView = {
  id: string;
  name: string;
  photoPath: string | null;
  archived: boolean;
  createdAt: Date;
  members: ChatMemberView[];
};

function sortAccountIds<T extends { internalId: string }>(values: T[]): T[] {
  return values.sort(
    (left, right) =>
      Number(left.internalId.replace("user", "")) -
      Number(right.internalId.replace("user", "")),
  );
}

async function loadMembers(chatId: string): Promise<ChatMemberView[]> {
  const rows = await db
    .select({
      internalId: usersTable.id,
      loginId: usersTable.loginId,
      displayName: usersTable.displayName,
      displayId: usersTable.displayId,
      role: usersTable.role,
      profilePhotoPath: usersTable.profilePhotoPath,
    })
    .from(chatMembersTable)
    .innerJoin(usersTable, eq(chatMembersTable.userId, usersTable.id))
    .where(eq(chatMembersTable.chatId, chatId));
  return sortAccountIds(rows);
}

async function loadChat(chat: HostelxChat): Promise<ChatView> {
  return {
    id: chat.id,
    name: chat.name,
    photoPath: chat.photoPath,
    archived: chat.archived,
    createdAt: chat.createdAt,
    members: await loadMembers(chat.id),
  };
}

async function validateMembers(memberIds: string[]): Promise<boolean> {
  const uniqueIds = new Set(memberIds);
  if (uniqueIds.size !== memberIds.length || uniqueIds.size === 0) {
    return false;
  }

  const registered = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.id, [...uniqueIds]));
  return registered.length === uniqueIds.size;
}

async function canAccessChat(
  chatId: string,
  userId: string,
  isAdministrator: boolean,
): Promise<boolean> {
  const condition = isAdministrator
    ? eq(chatsTable.id, chatId)
    : and(
        eq(chatsTable.id, chatId),
        eq(chatMembersTable.userId, userId),
        eq(chatsTable.archived, false),
      );

  const query = db
    .select({ id: chatsTable.id })
    .from(chatsTable);
  const [result] = isAdministrator
    ? await query.where(condition).limit(1)
    : await query
        .innerJoin(chatMembersTable, eq(chatMembersTable.chatId, chatsTable.id))
        .where(condition)
        .limit(1);
  return Boolean(result);
}

async function getVisibleChats(
  userId: string,
  isAdministrator: boolean,
): Promise<ChatView[]> {
  const rows = isAdministrator
    ? await db.select().from(chatsTable).orderBy(desc(chatsTable.createdAt))
    : await db
        .select({
          id: chatsTable.id,
          name: chatsTable.name,
          photoPath: chatsTable.photoPath,
          archived: chatsTable.archived,
          createdBy: chatsTable.createdBy,
          createdAt: chatsTable.createdAt,
        })
        .from(chatsTable)
        .innerJoin(chatMembersTable, eq(chatMembersTable.chatId, chatsTable.id))
        .where(
          and(
            eq(chatMembersTable.userId, userId),
            eq(chatsTable.archived, false),
          ),
        )
        .orderBy(desc(chatsTable.createdAt));

  if (rows.length === 0) {
    return [];
  }

  const chatIds = rows.map((chat) => chat.id);
  const memberRows = await db
    .select({
      chatId: chatMembersTable.chatId,
      internalId: usersTable.id,
      loginId: usersTable.loginId,
      displayName: usersTable.displayName,
      displayId: usersTable.displayId,
      role: usersTable.role,
      profilePhotoPath: usersTable.profilePhotoPath,
    })
    .from(chatMembersTable)
    .innerJoin(usersTable, eq(chatMembersTable.userId, usersTable.id))
    .where(inArray(chatMembersTable.chatId, chatIds));

  const membersByChat = new Map<string, ChatMemberView[]>();
  for (const member of memberRows) {
    const list = membersByChat.get(member.chatId) ?? [];
    list.push({
      internalId: member.internalId,
      loginId: member.loginId,
      displayName: member.displayName,
      displayId: member.displayId,
      role: member.role,
      profilePhotoPath: member.profilePhotoPath,
    });
    membersByChat.set(member.chatId, list);
  }

  return rows.map((chat) => ({
    id: chat.id,
    name: chat.name,
    photoPath: chat.photoPath,
    archived: chat.archived,
    createdAt: chat.createdAt,
    members: sortAccountIds(membersByChat.get(chat.id) ?? []),
  }));
}

router.get(
  "/chats",
  requireAuth,
  requireCompletedProfile,
  async (request, response) => {
    const currentUser = authUser(request);
    const chats = await getVisibleChats(
      currentUser.id,
      currentUser.role === "owner" || currentUser.role === "admin",
    );
    response.json(ListChatsResponse.parse(chats));
  },
);

router.post(
  "/chats",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const parsed = CreateChatBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Enter a chat name and select members." });
      return;
    }

    if (!(await validateMembers(parsed.data.memberIds))) {
      response.status(400).json({ error: "Select valid, unique registered members." });
      return;
    }

    const currentUser = authUser(request);
    const photoPath = parsed.data.photoPath ?? null;
    if (
      photoPath &&
      !(await assertOwnedCompletedUpload(currentUser.id, photoPath))
    ) {
      response.status(400).json({ error: "That chat photo is not available." });
      return;
    }

    const createdChat = await db.transaction(async (transaction) => {
      const [chat] = await transaction
        .insert(chatsTable)
        .values({
          name: parsed.data.name.trim(),
          photoPath,
          createdBy: currentUser.id,
        })
        .returning();
      await transaction.insert(chatMembersTable).values(
        parsed.data.memberIds.map((userId) => ({
          chatId: chat.id,
          userId,
        })),
      );
      return chat;
    });

    response.status(201).json(
      CreateChatResponse.parse(await loadChat(createdChat)),
    );
  },
);

router.patch(
  "/chats/:chatId",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const params = UpdateChatParams.safeParse(request.params);
    const parsed = UpdateChatBody.safeParse(request.body);
    if (
      !params.success ||
      !uuidPattern.test(params.data.chatId) ||
      !parsed.success ||
      Object.keys(parsed.data).length === 0
    ) {
      response.status(400).json({ error: "Invalid chat update." });
      return;
    }

    const changes: Partial<typeof chatsTable.$inferInsert> = {};
    if (parsed.data.name !== undefined) {
      const name = parsed.data.name.trim();
      if (!name) {
        response.status(400).json({ error: "Chat name cannot be empty." });
        return;
      }
      changes.name = name;
    }
    if (parsed.data.archived !== undefined) {
      changes.archived = parsed.data.archived;
    }
    if (parsed.data.photoPath !== undefined) {
      if (
        parsed.data.photoPath &&
        !(await assertOwnedCompletedUpload(
          authUser(request).id,
          parsed.data.photoPath,
        ))
      ) {
        response.status(400).json({ error: "That chat photo is not available." });
        return;
      }
      changes.photoPath = parsed.data.photoPath;
    }

    const [updatedChat] = await db
      .update(chatsTable)
      .set(changes)
      .where(eq(chatsTable.id, params.data.chatId))
      .returning();
    if (!updatedChat) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }
    response.json(UpdateChatResponse.parse(await loadChat(updatedChat)));
  },
);

router.delete(
  "/chats/:chatId",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const parsed = DeleteChatParams.safeParse(request.params);
    if (!parsed.success || !uuidPattern.test(parsed.data.chatId)) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }
    const [deletedChat] = await db
      .delete(chatsTable)
      .where(eq(chatsTable.id, parsed.data.chatId))
      .returning({ id: chatsTable.id });
    if (!deletedChat) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }
    response.status(204).end();
  },
);

router.post(
  "/chats/:chatId/members",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const parsed = AddChatMembersBody.safeParse(request.body);
    const chatId = request.params.chatId;
    if (
      !parsed.success ||
      !chatId ||
      Array.isArray(chatId) ||
      !uuidPattern.test(chatId)
    ) {
      response.status(400).json({ error: "Select valid members." });
      return;
    }

    const [chat] = await db
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(eq(chatsTable.id, chatId))
      .limit(1);
    if (!chat) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }
    if (!(await validateMembers(parsed.data.userIds))) {
      response.status(404).json({ error: "One or more accounts were not found." });
      return;
    }

    await db
      .insert(chatMembersTable)
      .values(parsed.data.userIds.map((userId) => ({ chatId, userId })))
      .onConflictDoNothing();
    const [updatedChat] = await db
      .select()
      .from(chatsTable)
      .where(eq(chatsTable.id, chatId))
      .limit(1);
    response.json(AddChatMembersResponse.parse(await loadChat(updatedChat)));
  },
);

router.delete(
  "/chats/:chatId/members/:userId",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const params = RemoveChatMemberParams.safeParse(request.params);
    if (
      !params.success ||
      !uuidPattern.test(params.data.chatId) ||
      !/^user(?:[1-9]|[1-4][0-9]|50)$/.test(params.data.userId)
    ) {
      response.status(404).json({ error: "Chat member not found." });
      return;
    }

    const [removed] = await db
      .delete(chatMembersTable)
      .where(
        and(
          eq(chatMembersTable.chatId, params.data.chatId),
          eq(chatMembersTable.userId, params.data.userId),
        ),
      )
      .returning({ userId: chatMembersTable.userId });
    if (!removed) {
      response.status(404).json({ error: "Chat member not found." });
      return;
    }
    response.status(204).end();
  },
);

router.get(
  "/chats/:chatId/messages",
  requireAuth,
  requireCompletedProfile,
  async (request, response) => {
    const params = ListChatMessagesParams.safeParse(request.params);
    if (!params.success || !uuidPattern.test(params.data.chatId)) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }

    const currentUser = authUser(request);
    const isAdministrator =
      currentUser.role === "owner" || currentUser.role === "admin";
    if (
      !(await canAccessChat(
        params.data.chatId,
        currentUser.id,
        isAdministrator,
      ))
    ) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.chatId, params.data.chatId))
      .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
      .limit(500);
    response.json(
      ListChatMessagesResponse.parse(
        messages.reverse().map((message) => ({
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          senderName: message.senderName,
          text: message.text,
          createdAt: message.createdAt,
        })),
      ),
    );
  },
);

router.post(
  "/chats/:chatId/messages",
  requireAuth,
  requireCompletedProfile,
  async (request, response) => {
    const params = SendChatMessageParams.safeParse(request.params);
    const parsed = SendChatMessageBody.safeParse(request.body);
    if (
      !params.success ||
      !uuidPattern.test(params.data.chatId) ||
      !parsed.success
    ) {
      response.status(400).json({ error: "Enter a message to send." });
      return;
    }

    const currentUser = authUser(request);
    const isAdministrator =
      currentUser.role === "owner" || currentUser.role === "admin";
    const [chat] = await db
      .select()
      .from(chatsTable)
      .where(eq(chatsTable.id, params.data.chatId))
      .limit(1);
    if (
      !chat ||
      !(await canAccessChat(
        params.data.chatId,
        currentUser.id,
        isAdministrator,
      ))
    ) {
      response.status(404).json({ error: "Chat not found." });
      return;
    }
    if (chat.archived) {
      response.status(409).json({ error: "Archived chats are read-only." });
      return;
    }

    const text = parsed.data.text.trim();
    if (!text) {
      response.status(400).json({ error: "Message cannot be empty." });
      return;
    }

    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        chatId: chat.id,
        senderId: currentUser.id,
        senderName: currentUser.displayName ?? currentUser.loginId,
        text,
      })
      .returning();
    response.status(201).json(
      SendChatMessageResponse.parse({
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        senderName: message.senderName,
        text: message.text,
        createdAt: message.createdAt,
      }),
    );
  },
);

export default router;
