CREATE TYPE "orf_current"."comment_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "orf_current"."comment_target_type" AS ENUM('objective', 'result', 'task', 'subtask');--> statement-breakpoint
CREATE TABLE "comment_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"parent_message_id" text,
	"reply_to_message_id" text,
	"reply_to_author" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"target_type" "comment_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"target_title" text NOT NULL,
	"status" "comment_status" DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_messages" ADD CONSTRAINT "comment_messages_thread_id_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "orf_current"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_messages" ADD CONSTRAINT "comment_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "orf_current"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "orf_current"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "orf_current"."users"("id") ON DELETE no action ON UPDATE no action;
