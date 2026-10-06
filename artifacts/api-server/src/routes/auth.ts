import { randomBytes } from "node:crypto";
import { and, eq, ne, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CompleteFirstLoginSetupBody,
  CompleteFirstLoginSetupResponse,
  GetSessionResponse,
  ListAdminUsersResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  ResetUserPasswordResponse,
  SetUserRoleBody,
  SetUserRoleResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { db, userSessionsTable, usersTable, type HostelxUser } from "@workspace/db";

import {
  authSessionHash,
  authUser,
  clearSessionCookie,
  createSession,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireCompletedProfile,
  requireOwner,
  resolveSession,
  revokeCurrentSession,
  verifyPassword,
} from "../lib/hostelx-auth";
import { assertOwnedCompletedUpload } from "../lib/hostelx-storage";

const router: IRouter = Router();
const failedLoginAttempts = new Map<
  string,
  { count: number; windowStartedAt: number }
>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));
const validAccountLoginId = /^user(?:[1-9]|[1-4][0-9]|50)\.hostelx\.in$/;
const validDisplayLoginId = /^[a-z0-9]+\.hostelx\.in$/;

function userResponse(user: HostelxUser) {
  return {
    internalId: user.id,
    loginId: user.loginId,
    displayName: user.displayName,
    displayId: user.displayId,
    role: user.role,
    firstLogin: user.firstLogin,
    profilePhotoPath: user.profilePhotoPath,
    about: user.about,
    createdAt: user.createdAt,
  };
}

function formatDisplayId(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return normalized || "resident";
}

async function findAvailableDisplayId(
  displayName: string,
  userId: string,
): Promise<string> {
  // Leave enough room for the domain and collision suffix in the login field.
  const base = formatDisplayId(displayName).slice(0, 50);
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate = `${base}${suffix === 1 ? "" : suffix}.hostelx.in`;
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          ne(usersTable.id, userId),
          or(
            eq(usersTable.displayId, candidate),
            eq(usersTable.loginId, candidate),
          ),
        ),
      )
      .limit(1);
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not generate an available display ID.");
}

function tooManyAttempts(loginId: string): boolean {
  const now = Date.now();
  const current = failedLoginAttempts.get(loginId);
  if (!current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    failedLoginAttempts.delete(loginId);
    return false;
  }
  return current.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(loginId: string): void {
  const now = Date.now();
  const current = failedLoginAttempts.get(loginId);
  if (!current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    failedLoginAttempts.set(loginId, { count: 1, windowStartedAt: now });
    return;
  }
  current.count += 1;
}

router.post("/auth/login", async (request, response) => {
  const parsed = LoginBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a login ID and password." });
    return;
  }

  const loginId = parsed.data.loginId.trim().toLowerCase();
  if (parsed.data.password.length > 128) {
    response.status(400).json({ error: "Password must be 128 characters or fewer." });
    return;
  }
  if (
    !validAccountLoginId.test(loginId) &&
    !validDisplayLoginId.test(loginId)
  ) {
    verifyPassword(parsed.data.password, DUMMY_HASH);
    response.status(401).json({ error: "Login ID or password is incorrect." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      validAccountLoginId.test(loginId)
        ? eq(usersTable.loginId, loginId)
        : or(
            eq(usersTable.displayId, loginId),
            eq(usersTable.loginId, loginId),
          ),
    )
    .limit(1);
  const rateLimitKey = user?.loginId ?? loginId;
  if (tooManyAttempts(rateLimitKey)) {
    response.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const passwordMatches = verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !passwordMatches) {
    recordFailedAttempt(rateLimitKey);
    if (tooManyAttempts(rateLimitKey)) {
      response.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    response.status(401).json({ error: "Login ID or password is incorrect." });
    return;
  }

  failedLoginAttempts.delete(loginId);
  failedLoginAttempts.delete(rateLimitKey);
  await createSession(user.id, response);
  response.json(LoginResponse.parse({ user: userResponse(user) }));
});

router.get("/auth/session", async (request, response) => {
  const session = await resolveSession(request);
  response.json(
    GetSessionResponse.parse({
      user: session ? userResponse(session.user) : null,
    }),
  );
});

router.post("/auth/logout", requireAuth, async (request, response) => {
  await revokeCurrentSession(request);
  clearSessionCookie(response);
  response.json(LogoutResponse.parse({ ok: true }));
});

router.post("/auth/setup", requireAuth, async (request, response) => {
  const currentUser = authUser(request);
  if (!currentUser.firstLogin) {
    response.status(409).json({ error: "First-time setup is already complete." });
    return;
  }

  const parsed = CompleteFirstLoginSetupBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the profile and password fields." });
    return;
  }

  const profilePhotoPath = parsed.data.profilePhotoPath ?? null;
  if (
    profilePhotoPath &&
    !(await assertOwnedCompletedUpload(currentUser.id, profilePhotoPath))
  ) {
    response.status(400).json({ error: "That profile photo is not available." });
    return;
  }

  try {
    const displayId = await findAvailableDisplayId(
      parsed.data.displayName.trim(),
      currentUser.id,
    );
    const [updatedUser] = await db
      .update(usersTable)
      .set({
        displayName: parsed.data.displayName.trim(),
        displayId,
        profilePhotoPath,
        about: parsed.data.about?.trim() || null,
        passwordHash: hashPassword(parsed.data.newPassword),
        firstLogin: false,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, currentUser.id))
      .returning();

    await db
      .delete(userSessionsTable)
      .where(
        and(
          eq(userSessionsTable.userId, currentUser.id),
          ne(userSessionsTable.tokenHash, authSessionHash(request)),
        ),
      );

    response.json(
      CompleteFirstLoginSetupResponse.parse({
        user: userResponse(updatedUser),
      }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      response.status(409).json({ error: "That display ID is already in use." });
      return;
    }
    throw error;
  }
});

router.patch(
  "/auth/profile",
  requireAuth,
  requireCompletedProfile,
  async (request, response) => {
    const currentUser = authUser(request);
    const parsed = UpdateProfileBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Check the profile fields." });
      return;
    }

    const changes: Partial<typeof usersTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parsed.data.displayName !== undefined) {
      const displayName = parsed.data.displayName.trim();
      if (!displayName) {
        response.status(400).json({ error: "Display name cannot be empty." });
        return;
      }
      changes.displayName = displayName;
      changes.displayId = await findAvailableDisplayId(displayName, currentUser.id);
    }

    if (parsed.data.profilePhotoPath !== undefined) {
      if (
        parsed.data.profilePhotoPath &&
        !(await assertOwnedCompletedUpload(
          currentUser.id,
          parsed.data.profilePhotoPath,
        ))
      ) {
        response.status(400).json({ error: "That profile photo is not available." });
        return;
      }
      changes.profilePhotoPath = parsed.data.profilePhotoPath;
    }

    if (parsed.data.about !== undefined) {
      changes.about = parsed.data.about?.trim() || null;
    }

    try {
      const [updatedUser] = await db
        .update(usersTable)
        .set(changes)
        .where(eq(usersTable.id, currentUser.id))
        .returning();
      response.json(UpdateProfileResponse.parse(userResponse(updatedUser)));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        response.status(409).json({ error: "That display ID is already in use." });
        return;
      }
      throw error;
    }
  },
);

router.get(
  "/admin/users",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (_request, response) => {
    const users = await db.select().from(usersTable);
    users.sort((left, right) => {
      const leftNumber = Number(left.id.replace("user", ""));
      const rightNumber = Number(right.id.replace("user", ""));
      return leftNumber - rightNumber;
    });
    response.json(ListAdminUsersResponse.parse(users.map(userResponse)));
  },
);

router.post(
  "/admin/users/:userId/reset-password",
  requireAuth,
  requireCompletedProfile,
  requireAdmin,
  async (request, response) => {
    const rawUserId = request.params.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      response.status(404).json({ error: "Account not found." });
      return;
    }
    const currentUser = authUser(request);
    if (!/^user(?:[1-9]|[1-4][0-9]|50)$/.test(userId)) {
      response.status(404).json({ error: "Account not found." });
      return;
    }
    if (userId === currentUser.id) {
      response.status(409).json({ error: "Use your account settings to change your own password." });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      response.status(404).json({ error: "Account not found." });
      return;
    }

    const temporaryPassword = randomBytes(12).toString("base64url");
    await db.transaction(async (transaction) => {
      await transaction
        .update(usersTable)
        .set({
          passwordHash: hashPassword(temporaryPassword),
          firstLogin: true,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));
      await transaction
        .delete(userSessionsTable)
        .where(eq(userSessionsTable.userId, userId));
    });

    response.json(
      ResetUserPasswordResponse.parse({ temporaryPassword }),
    );
  },
);

router.patch(
  "/admin/users/:userId/role",
  requireAuth,
  requireCompletedProfile,
  requireOwner,
  async (request, response) => {
    const parsed = SetUserRoleBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose a valid account role." });
      return;
    }

    const rawUserId = request.params.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      response.status(404).json({ error: "Account not found." });
      return;
    }
    if (!/^user(?:[1-9]|[1-4][0-9]|50)$/.test(userId) || userId === "user1") {
      response.status(404).json({ error: "Account not found." });
      return;
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ role: parsed.data.role, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    if (!updatedUser) {
      response.status(404).json({ error: "Account not found." });
      return;
    }
    response.json(SetUserRoleResponse.parse(userResponse(updatedUser)));
  },
);

export default router;
