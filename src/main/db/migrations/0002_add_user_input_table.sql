CREATE TABLE `user_inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`tool_call_id` integer,
	`question` text NOT NULL,
	`choices` text,
	`decision` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_call_id`) REFERENCES `tool_calls`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_task` ON `user_inputs` (`task_id`);