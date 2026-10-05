import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { usersTable } from "./accounts";
import { chatsTable } from "./chats";

export const chatMessagesTable = pgTable(
  "hostelx_messages",
  {
    id: serial("id").primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chatsTable.id, { onDelete: "cascade" }),
    senderId: varchar("sender_id", { length: 16 })
      .notNull()
      .references(() => usersTable.id),
    senderName: varchar("sender_name", { length: 60 }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("hostelx_messages_chat_created_idx").on(table.chatId, table.createdAt)],
);

export type HostelxMessage = typeof chatMessagesTable.$inferSelect;
