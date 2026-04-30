CREATE TYPE "public"."delivery_rating" AS ENUM('普通', '复杂', '攻坚', '挑战');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('Eval run', 'Log sample', 'User report', 'Dashboard snapshot', 'Incident report');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('User report', 'Eval run', 'Log', 'Incident', 'Team review');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('New', 'Reviewing', 'Action Created', 'Result Updated', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."impact" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('Backlog', 'Todo', 'In Progress', 'In Review', 'Done');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('admin', 'member', 'readonly', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('On Track', 'At Risk', 'Blocked', 'Draft');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"type" "evidence_type" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"owner" text NOT NULL,
	"linked_result_id" text NOT NULL,
	"linked_feedback_id" text,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"phenomenon" text NOT NULL,
	"impact" "impact" NOT NULL,
	"linked_objective_id" text NOT NULL,
	"linked_result_id" text NOT NULL,
	"suggested_adjustment" text NOT NULL,
	"source" "feedback_source" NOT NULL,
	"status" "feedback_status" NOT NULL,
	"owner" text NOT NULL,
	"created_at" date NOT NULL,
	"updated_at" date NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "feedback_cause_categories" (
	"feedback_id" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "feedback_cause_categories_feedback_id_category_pk" PRIMARY KEY("feedback_id","category")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"owner" text NOT NULL,
	"cycle" text NOT NULL,
	"status" "work_status" NOT NULL,
	"confidence" integer NOT NULL,
	"progress" integer NOT NULL,
	"boundary" text NOT NULL,
	"success_definition" text NOT NULL,
	"created_at" date NOT NULL,
	"updated_at" date NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "result_trend_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"result_id" text NOT NULL,
	"date" text NOT NULL,
	"value" real NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metric_name" text NOT NULL,
	"metric_requirement" text,
	"statistical_object" text,
	"completion_standard" text,
	"sample_set" text,
	"measurement_scope" text,
	"delivery_rating" "delivery_rating",
	"baseline" real NOT NULL,
	"current" real NOT NULL,
	"target" real NOT NULL,
	"unit" text NOT NULL,
	"direction" "metric_direction" NOT NULL,
	"status" "work_status" NOT NULL,
	"confidence" integer NOT NULL,
	"owner" text NOT NULL,
	"review_cadence" text NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"label" text NOT NULL,
	"done" boolean NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "task_status" NOT NULL,
	"priority" "priority" NOT NULL,
	"assignee" text NOT NULL,
	"linked_objective_id" text NOT NULL,
	"linked_result_id" text NOT NULL,
	"feedback_origin_id" text,
	"due_date" date NOT NULL,
	"tags" jsonb NOT NULL,
	"created_at" date NOT NULL,
	"updated_at" date NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_role" NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"created_at" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_linked_result_id_results_id_fk" FOREIGN KEY ("linked_result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_linked_feedback_id_feedback_id_fk" FOREIGN KEY ("linked_feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_linked_objective_id_objectives_id_fk" FOREIGN KEY ("linked_objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_linked_result_id_results_id_fk" FOREIGN KEY ("linked_result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cause_categories" ADD CONSTRAINT "feedback_cause_categories_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_trend_points" ADD CONSTRAINT "result_trend_points_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_objective_id_objectives_id_fk" FOREIGN KEY ("linked_objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_result_id_results_id_fk" FOREIGN KEY ("linked_result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;