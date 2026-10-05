import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import {
  db,
  userSessionsTable,
  usersTable,
  type HostelxUser,
} from "@workspace/db";

const SESSION_COOKIE = "hostelx_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type AuthenticatedRequest = Request & {
  hostelxUser: HostelxUser;
  hostelxSessionHash: string;
};

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is required for HostelX sessions.");
  }
  return value;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/i.test(digest)) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashSessionToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function createSession(
  userId: string,
  response: Response,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.delete(userSessionsTable).where(lt(userSessionsTable.expiresAt, new Date()));
  await db.insert(userSessionsTable).values({ tokenHash, userId, expiresAt });
  response.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_MS,
  });
  return tokenHash;
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function revokeCurrentSession(request: Request): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") {
    return;
  }
  await db
    .delete(userSessionsTable)
    .where(eq(userSessionsTable.tokenHash, hashSessionToken(token)));
}

export async function resolveSession(
  request: Request,
): Promise<{ user: HostelxUser; tokenHash: string } | null> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(
      and(
        eq(userSessionsTable.tokenHash, tokenHash),
        gt(userSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await db
        .delete(userSessionsTable)
        .where(eq(userSessionsTable.tokenHash, tokenHash));
    }
    return null;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  if (!user) {
    return null;
  }

  return { user, tokenHash };
}

export const requireAuth: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  void resolveSession(request)
    .then((session) => {
      if (!session) {
        response.status(401).json({ error: "Sign-in required." });
        return;
      }
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.hostelxUser = session.user;
      authenticatedRequest.hostelxSessionHash = session.tokenHash;
      next();
    })
    .catch(next);
};

export const requireCompletedProfile: RequestHandler = (
  request,
  response,
  next,
) => {
  if ((request as AuthenticatedRequest).hostelxUser.firstLogin) {
    response.status(403).json({ error: "Complete first-time setup to continue." });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (request, response, next) => {
  const { role } = (request as AuthenticatedRequest).hostelxUser;
  if (role !== "owner" && role !== "admin") {
    response.status(403).json({ error: "Administrator access required." });
    return;
  }
  next();
};

export const requireOwner: RequestHandler = (request, response, next) => {
  const user = (request as AuthenticatedRequest).hostelxUser;
  if (user.id !== "user1" || user.role !== "owner") {
    response.status(403).json({ error: "Owner access required." });
    return;
  }
  next();
};

export function authUser(request: Request): HostelxUser {
  return (request as AuthenticatedRequest).hostelxUser;
}

export function authSessionHash(request: Request): string {
  return (request as AuthenticatedRequest).hostelxSessionHash;
}
