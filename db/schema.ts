import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const participants = sqliteTable("participants", {
  participantId: text("participant_id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  organization: text("organization").notNull().default(""),
  consent: integer("consent").notNull().default(1),
  completedJson: text("completed_json").notNull().default("[]"),
  challengeCount: integer("challenge_count").notNull().default(0),
  gameAnswerCount: integer("game_answer_count").notNull().default(0),
  joinedAt: text("joined_at").notNull(),
  lastSeen: text("last_seen").notNull(),
}, (table) => [index("participants_last_seen_idx").on(table.lastSeen)]);

export const projectionRooms = sqliteTable("projection_rooms", {
  roomId: text("room_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("projection_rooms_expires_at_idx").on(table.expiresAt)]);
