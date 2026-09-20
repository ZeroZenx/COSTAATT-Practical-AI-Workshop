CREATE TABLE IF NOT EXISTS participants (
  participant_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 1,
  completed_json TEXT NOT NULL DEFAULT '[]',
  challenge_count INTEGER NOT NULL DEFAULT 0,
  game_answer_count INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS participants_last_seen_idx
  ON participants(last_seen DESC);
