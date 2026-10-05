import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const hostelxRole = pgEnum("hostelx_role", ["owner", "admin", "user"]);

export const usersTable = pgTable("hostelx_users", {
  id: varchar("id", { length: 16 }).primaryKey(),
  loginId: varchar("login_id", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 60 }),
  displayId: varchar("display_id", { length: 80 }).unique(),
  role: hostelxRole("role").notNull().default("user"),
  firstLogin: boolean("first_login").notNull().default(true),
  profilePhotoPath: text("profile_photo_path"),
  about: text("about"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userSessionsTable = pgTable(
  "hostelx_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 16 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("hostelx_sessions_user_id_idx").on(table.userId)],
);

export type HostelxUser = typeof usersTable.$inferSelect;
export type HostelxSession = typeof userSessionsTable.$inferSelect;
