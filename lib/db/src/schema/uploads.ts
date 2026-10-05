import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { usersTable } from "./accounts";

export const hostelxUploadPurpose = pgEnum("hostelx_upload_purpose", [
  "profile",
  "chat",
]);

export const userUploadsTable = pgTable("hostelx_uploads", {
  objectPath: varchar("object_path", { length: 256 }).primaryKey(),
  userId: varchar("user_id", { length: 16 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  purpose: hostelxUploadPurpose("purpose").notNull(),
  fileName: varchar("file_name", { length: 180 }).notNull(),
  contentType: varchar("content_type", { length: 64 }).notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type HostelxUpload = typeof userUploadsTable.$inferSelect;
