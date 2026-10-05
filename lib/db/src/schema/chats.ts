import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { usersTable } from "./accounts";

export const chatsTable = pgTable("hostelx_chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  photoPath: text("photo_path"),
  archived: boolean("archived").notNull().default(false),
  createdBy: varchar("created_by", { length: 16 })
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMembersTable = pgTable(
  "hostelx_chat_members",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chatsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 16 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
    index("hostelx_chat_members_user_id_idx").on(table.userId),
  ],
);

export type HostelxChat = typeof chatsTable.$inferSelect;
export type HostelxChatMember = typeof chatMembersTable.$inferSelect;
