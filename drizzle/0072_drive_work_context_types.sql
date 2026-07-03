ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'result' AFTER 'objective';
--> statement-breakpoint
ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'task' AFTER 'result';
--> statement-breakpoint
ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'feedback' AFTER 'task';
--> statement-breakpoint
ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'workLog' AFTER 'feedback';
--> statement-breakpoint
ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'chatMessage' AFTER 'chatChannel';
--> statement-breakpoint
ALTER TYPE "drive_context_type" ADD VALUE IF NOT EXISTS 'chatThread' AFTER 'chatMessage';
