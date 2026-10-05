import { db, usersTable } from "@workspace/db";

import { hashPassword } from "./hostelx-auth";

export async function ensureSeedAccounts(): Promise<void> {
  const existing = new Set(
    (await db.select({ id: usersTable.id }).from(usersTable)).map((row) => row.id),
  );
  const missing = [];

  for (let number = 1; number <= 50; number += 1) {
    const id = `user${number}`;
    if (existing.has(id)) {
      continue;
    }

    missing.push({
      id,
      loginId: `${id}.hostelx.in`,
      passwordHash: hashPassword(id),
      displayName: number === 1 ? "Kartik" : null,
      role: number === 1 ? ("owner" as const) : ("user" as const),
      firstLogin: true,
    });
  }

  if (missing.length > 0) {
    await db.insert(usersTable).values(missing).onConflictDoNothing();
  }
}
