CREATE TABLE `projection_rooms` (
	`room_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projection_rooms_expires_at_idx` ON `projection_rooms` (`expires_at`);