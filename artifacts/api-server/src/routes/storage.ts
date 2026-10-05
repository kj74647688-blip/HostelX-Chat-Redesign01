import { Readable } from "node:stream";
import { and, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CompleteUploadBody,
  CompleteUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  chatMembersTable,
  chatsTable,
  db,
  userUploadsTable,
  usersTable,
} from "@workspace/db";

import {
  authUser,
  requireAuth,
  requireCompletedProfile,
} from "../lib/hostelx-auth";
import {
  completePrivateImageUpload,
  isObjectUploadPath,
  objectStorageService,
} from "../lib/hostelx-storage";
import { ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isAdministrator(role: string): boolean {
  return role === "owner" || role === "admin";
}

router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (request, response) => {
    const parsed = RequestUploadUrlBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid image information." });
      return;
    }

    const currentUser = authUser(request);
    const { name, size, contentType, purpose } = parsed.data;
    if (size > MAX_IMAGE_SIZE || !allowedContentTypes.has(contentType)) {
      response.status(400).json({ error: "Photos must be 5 MB or smaller." });
      return;
    }
    if (
      purpose === "chat" &&
      (currentUser.firstLogin || !isAdministrator(currentUser.role))
    ) {
      response.status(403).json({ error: "Administrator access required." });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);
      if (!isObjectUploadPath(objectPath)) {
        throw new Error("Storage returned an invalid image path.");
      }

      await db.insert(userUploadsTable).values({
        objectPath,
        userId: currentUser.id,
        purpose,
        fileName: name,
        contentType,
        size,
      });
      response.json(
        RequestUploadUrlResponse.parse({ uploadURL, objectPath }),
      );
    } catch (error) {
      request.log.error({ err: error }, "Failed to create private upload URL");
      response.status(500).json({ error: "Could not prepare the image upload." });
    }
  },
);

router.post(
  "/storage/uploads/complete",
  requireAuth,
  async (request, response) => {
    const parsed = CompleteUploadBody.safeParse(request.body);
    if (!parsed.success || !isObjectUploadPath(parsed.data?.objectPath ?? "")) {
      response.status(400).json({ error: "Invalid image upload." });
      return;
    }

    const currentUser = authUser(request);
    const [upload] = await db
      .select()
      .from(userUploadsTable)
      .where(
        and(
          eq(userUploadsTable.objectPath, parsed.data.objectPath),
          eq(userUploadsTable.userId, currentUser.id),
        ),
      )
      .limit(1);
    if (!upload) {
      response.status(404).json({ error: "Image upload not found." });
      return;
    }
    if (
      upload.purpose === "chat" &&
      (currentUser.firstLogin || !isAdministrator(currentUser.role))
    ) {
      response.status(403).json({ error: "Administrator access required." });
      return;
    }

    try {
      const completed = await completePrivateImageUpload({
        userId: currentUser.id,
        objectPath: upload.objectPath,
      });
      if (!completed) {
        response.status(400).json({ error: "Image is missing or invalid." });
        return;
      }
      response.json(
        CompleteUploadResponse.parse({ objectPath: upload.objectPath }),
      );
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        response.status(400).json({ error: "Image upload was not received." });
        return;
      }
      request.log.error({ err: error }, "Failed to complete private image upload");
      response.status(500).json({ error: "Could not complete the image upload." });
    }
  },
);

router.get(
  "/storage/objects/:objectId",
  requireAuth,
  requireCompletedProfile,
  async (request, response) => {
    const rawObjectId = request.params.objectId;
    const objectId = Array.isArray(rawObjectId) ? rawObjectId[0] : rawObjectId;
    if (!objectId) {
      response.status(404).json({ error: "Image not found." });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(objectId)) {
      response.status(404).json({ error: "Image not found." });
      return;
    }

    const currentUser = authUser(request);
    const objectPath = `/objects/uploads/${objectId}`;
    let allowed = isAdministrator(currentUser.role);

    const profileOwners = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.profilePhotoPath, objectPath));
    if (
      profileOwners.some((owner) => owner.id === currentUser.id)
    ) {
      allowed = true;
    }
    if (!allowed && profileOwners.length > 0) {
      const ownerIds = profileOwners.map((owner) => owner.id);
      const activeChatIds = await db
        .select({ id: chatMembersTable.chatId })
        .from(chatMembersTable)
        .innerJoin(chatsTable, eq(chatMembersTable.chatId, chatsTable.id))
        .where(
          and(
            eq(chatMembersTable.userId, currentUser.id),
            eq(chatsTable.archived, false),
          ),
        );
      if (activeChatIds.length > 0) {
        const [sharedChat] = await db
          .select({ id: chatMembersTable.chatId })
          .from(chatMembersTable)
          .where(
            and(
              inArray(chatMembersTable.userId, ownerIds),
              inArray(
                chatMembersTable.chatId,
                activeChatIds.map((chat) => chat.id),
              ),
            ),
          )
          .limit(1);
        allowed = Boolean(sharedChat);
      }
    }

    const photoChats = await db
      .select({ id: chatsTable.id, archived: chatsTable.archived })
      .from(chatsTable)
      .where(eq(chatsTable.photoPath, objectPath));
    if (
      !allowed &&
      photoChats.some((chat) => !chat.archived)
    ) {
      const activePhotoChatIds = photoChats
        .filter((chat) => !chat.archived)
        .map((chat) => chat.id);
      const [membership] = await db
        .select({ userId: chatMembersTable.userId })
        .from(chatMembersTable)
        .where(
          and(
            eq(chatMembersTable.userId, currentUser.id),
            inArray(chatMembersTable.chatId, activePhotoChatIds),
          ),
        )
        .limit(1);
      allowed = Boolean(membership);
    }

    if (!allowed) {
      response.status(403).json({ error: "You cannot view this image." });
      return;
    }

    try {
      const file = await objectStorageService.getObjectEntityFile(objectPath);
      const image = await objectStorageService.downloadObject(file, 60);
      response.status(image.status);
      image.headers.forEach((value, key) => response.setHeader(key, value));
      response.setHeader("Cache-Control", "private, max-age=60");
      response.setHeader("X-Content-Type-Options", "nosniff");

      if (image.body) {
        Readable.fromWeb(
          image.body as ReadableStream<Uint8Array>,
        ).pipe(response);
      } else {
        response.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        response.status(404).json({ error: "Image not found." });
        return;
      }
      request.log.error({ err: error }, "Failed to read private image");
      response.status(500).json({ error: "Could not load the image." });
    }
  },
);

export default router;
