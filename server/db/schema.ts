import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgEnum, pgTable, primaryKey, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type {
  BountySource,
  ChallengeApplication,
  ContributionAllocation,
  LootResultClaim,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  OrfStage,
  ResultAcceptedResult,
  UserStatus,
} from "../../src/types/orf";

export const workStatusEnum = pgEnum("work_status", ["On Track", "At Risk", "Blocked", "Draft"]);
export const taskStatusEnum = pgEnum("task_status", ["Backlog", "Todo", "In Progress", "In Review", "Done"]);
export const priorityEnum = pgEnum("priority", ["Low", "Medium", "High", "Critical"]);
export const impactEnum = pgEnum("impact", ["Low", "Medium", "High", "Critical"]);
export const metricDirectionEnum = pgEnum("metric_direction", ["increase", "decrease"]);
export const uncertaintyLevelEnum = pgEnum("uncertainty_level", ["入门", "进阶", "破局", "渡劫", "飞升"]);
export const evidenceTypeEnum = pgEnum("evidence_type", ["Eval run", "Log sample", "User report", "Dashboard snapshot", "Incident report"]);
export const feedbackSourceEnum = pgEnum("feedback_source", ["User report", "Eval run", "Log", "Incident", "Team review"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["New", "Reviewing", "Action Created", "Result Updated", "Closed"]);
export const teamRoleEnum = pgEnum("team_role", ["admin", "member", "readonly", "supervisor"]);
export const commentTargetTypeEnum = pgEnum("comment_target_type", ["objective", "result", "task", "subtask"]);
export const commentStatusEnum = pgEnum("comment_status", ["open", "resolved"]);

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: date("created_at", { mode: "string" }).notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  status: text("status").$type<UserStatus>().notNull().default("active"),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  lastOnlineAt: timestamp("last_online_at", { mode: "string", withTimezone: true }),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  }),
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull(),
    stage: text("stage").notNull(),
    resource: text("resource").notNull(),
    actions: jsonb("actions").$type<string[]>().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.role, table.stage, table.resource] }),
  }),
);

export const objectives = pgTable("objectives", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  cycle: text("cycle").notNull(),
  stage: text("stage").$type<OrfStage>().notNull().default("orfReestimate"),
  flowStatus: text("flow_status").$type<ObjectiveFlowStatus>().notNull().default("candidate"),
  status: workStatusEnum("status").notNull(),
  confidence: integer("confidence").notNull(),
  progress: integer("progress").notNull(),
  boundary: text("boundary").notNull(),
  successDefinition: text("success_definition").notNull(),
  finalDueAt: date("final_due_at", { mode: "string" }).notNull().default(sql`(CURRENT_DATE + INTERVAL '14 day')`),
  challengers: jsonb("challengers").$type<string[]>().notNull().default([]),
  assignedChallengers: jsonb("assigned_challengers").$type<string[]>().notNull().default([]),
  challengeApplications: jsonb("challenge_applications").$type<ChallengeApplication[]>().notNull().default([]),
  acceptedAt: timestamp("accepted_at", { mode: "string", withTimezone: true }),
  confirmationDueAt: timestamp("confirmation_due_at", { mode: "string", withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { mode: "string", withTimezone: true }),
  lootSubmittedAt: timestamp("loot_submitted_at", { mode: "string", withTimezone: true }),
  acceptedResult: text("accepted_result").$type<ObjectiveAcceptedResult>(),
  completionMultiplier: real("completion_multiplier"),
  objectiveBasePoints: integer("objective_base_points").notNull().default(0),
  objectiveSettlementPoints: real("objective_settlement_points"),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const objectiveLoot = pgTable("objective_loot", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  submittedBy: text("submitted_by").notNull(),
  body: text("body").notNull(),
  resultClaims: jsonb("result_claims").$type<LootResultClaim[]>().notNull().default([]),
  selfTestReportUrl: text("self_test_report_url"),
  selfTestReportBody: text("self_test_report_body"),
  submittedAt: timestamp("submitted_at", { mode: "string", withTimezone: true }).notNull(),
});

export const objectiveContributionReviews = pgTable("objective_contribution_reviews", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  reviewer: text("reviewer").notNull(),
  allocations: jsonb("allocations").$type<ContributionAllocation[]>().notNull().default([]),
  submittedAt: timestamp("submitted_at", { mode: "string", withTimezone: true }).notNull(),
});

export const pointLedger = pgTable("point_ledger", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  memberName: text("member_name").notNull(),
  points: real("points").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
});

export const results = pgTable("results", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  metricName: text("metric_name").notNull(),
  metricRequirement: text("metric_requirement"),
  statisticalObject: text("statistical_object"),
  completionStandard: text("completion_standard"),
  sampleSet: text("sample_set"),
  measurementScope: text("measurement_scope"),
  uncertaintyLevel: uncertaintyLevelEnum("uncertainty_level"),
  baseline: real("baseline").notNull(),
  current: real("current").notNull(),
  target: real("target").notNull(),
  unit: text("unit").notNull(),
  direction: metricDirectionEnum("direction").notNull(),
  status: workStatusEnum("status").notNull(),
  confidence: integer("confidence").notNull(),
  source: text("source").$type<BountySource>().notNull().default("managerDefined"),
  definer: text("definer").notNull().default(""),
  uncertaintyScore: integer("uncertainty_score").notNull().default(30),
  acceptedResult: text("accepted_result").$type<ResultAcceptedResult>().notNull().default("unreviewed"),
  reviewCadence: text("review_cadence").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const resultTrendPoints = pgTable("result_trend_points", {
  id: serial("id").primaryKey(),
  resultId: text("result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  value: real("value").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: taskStatusEnum("status").notNull(),
  priority: priorityEnum("priority").notNull(),
  assignee: text("assignee").notNull(),
  linkedObjectiveId: text("linked_objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  linkedResultId: text("linked_result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  feedbackOriginId: text("feedback_origin_id"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const taskChecklistItems = pgTable("task_checklist_items", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  done: boolean("done").notNull(),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
});

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  phenomenon: text("phenomenon").notNull(),
  impact: impactEnum("impact").notNull(),
  linkedObjectiveId: text("linked_objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  linkedResultId: text("linked_result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  suggestedAdjustment: text("suggested_adjustment").notNull(),
  source: feedbackSourceEnum("source").notNull(),
  status: feedbackStatusEnum("status").notNull(),
  owner: text("owner").notNull(),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const feedbackCauseCategories = pgTable(
  "feedback_cause_categories",
  {
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.feedbackId, table.category] }),
  }),
);

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  type: evidenceTypeEnum("type").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  source: text("source").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  owner: text("owner").notNull(),
  linkedResultId: text("linked_result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  linkedFeedbackId: text("linked_feedback_id").references(() => feedback.id),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const commentThreads = pgTable("comment_threads", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  targetType: commentTargetTypeEnum("target_type").notNull(),
  targetId: text("target_id").notNull(),
  targetTitle: text("target_title").notNull(),
  status: commentStatusEnum("status").notNull().default("open"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
});

export const commentMessages = pgTable("comment_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => commentThreads.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => users.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  parentMessageId: text("parent_message_id"),
  replyToMessageId: text("reply_to_message_id"),
  replyToAuthor: text("reply_to_author"),
  sortOrder: integer("sort_order").notNull().default(0),
});
