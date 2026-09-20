import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
});
