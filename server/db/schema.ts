import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ChatIntegrationProvider } from "../../src/domain/chatIntegrationProvider";
import type {
  BountySource,
  ChallengeApplication,
  ChatMessageSource,
  ChatMessageSystemMetadata,
  ChatPollSelectionMode,
  ChatPollVisibility,
  ChatSystemKind,
  CommentTargetType,
  LootResultClaim,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  ObjectiveSettlementEventKind,
  ObjectiveTrialReviewStatus,
  OrfStage,
  ResultAcceptedResult,
  UserStatus,
  WorkLogClassificationDecisionOperation,
  WorkLogClassificationKind,
  WorkLogClassificationSuggestionKind,
  WorkLogReminderStatus,
} from "../../src/types/orf";

export const workStatusEnum = pgEnum("work_status", ["On Track", "At Risk", "Blocked", "Draft"]);
export const taskStatusEnum = pgEnum("task_status", ["Backlog", "Todo", "In Progress", "In Review", "Done"]);
export const priorityEnum = pgEnum("priority", ["Low", "Medium", "High", "Critical"]);
export const metricDirectionEnum = pgEnum("metric_direction", ["increase", "decrease"]);
export const uncertaintyLevelEnum = pgEnum("uncertainty_level", ["简易", "入门", "进阶", "破局", "渡劫", "飞升"]);
export const evidenceTypeEnum = pgEnum("evidence_type", ["Eval run", "Log sample", "User report", "Dashboard snapshot", "Incident report"]);
export const teamRoleEnum = pgEnum("team_role", ["admin", "member", "readonly", "supervisor"]);
export const commentTargetTypeEnum = pgEnum("comment_target_type", ["objective", "result", "task", "subtask", "feedback", "workLog"]);
export const commentStatusEnum = pgEnum("comment_status", ["open", "resolved"]);
export const chatChannelTypeEnum = pgEnum("chat_channel_type", ["public", "private", "direct"]);
export const chatMemberRoleEnum = pgEnum("chat_member_role", ["owner", "admin", "member"]);
export const driveNodeTypeEnum = pgEnum("drive_node_type", ["folder", "file"]);
export const drivePreviewKindEnum = pgEnum("drive_file_preview_kind", ["download", "docx", "image", "markdown", "pdf", "text"]);
export const driveNodeEventActionEnum = pgEnum("drive_node_event_action", [
  "folder_created",
  "file_uploaded",
  "file_version_uploaded",
  "file_version_restored",
  "node_deleted",
  "node_restored",
  "context_linked",
  "context_unlinked",
  "chat_linked",
  "chat_unlinked",
]);
export const driveContextTypeEnum = pgEnum("drive_context_type", [
  "project",
  "objective",
  "result",
  "task",
  "feedback",
  "workLog",
  "chatChannel",
  "chatMessage",
  "chatThread",
]);
export const notificationStreamEnum = pgEnum("notification_stream", ["personalNotification", "teamAnnouncement"]);
export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: date("created_at", { mode: "string" }).notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    oryIdentityId: text("ory_identity_id"),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    createdAt: date("created_at", { mode: "string" }).notNull(),
    lastOnlineAt: timestamp("last_online_at", { mode: "string", withTimezone: true }),
    avatarObjectKey: text("avatar_object_key"),
    avatarMimeType: text("avatar_mime_type"),
    avatarUpdatedAt: timestamp("avatar_updated_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    oryIdentityIdUnique: uniqueIndex("users_ory_identity_id_unique").on(table.oryIdentityId),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
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

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull(),
    name: text("name").notNull(),
    createdAt: date("created_at", { mode: "string" }).notNull(),
    updatedAt: date("updated_at", { mode: "string" }).notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (table) => ({
    teamNameUnique: uniqueIndex("projects_team_name_unique").on(table.teamId, table.name),
  }),
);

export const driveNodes = pgTable(
  "drive_nodes",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    nodeType: driveNodeTypeEnum("node_type").notNull(),
    name: text("name").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    teamParent: index("drive_nodes_team_parent_idx").on(table.teamId, table.parentId),
  }),
);

export const driveFiles = pgTable(
  "drive_files",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => driveNodes.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    previewKind: drivePreviewKindEnum("preview_kind").notNull().default("download"),
    previewObjectKey: text("preview_object_key"),
    previewMimeType: text("preview_mime_type"),
    previewFileSize: bigint("preview_file_size", { mode: "number" }),
    previewGeneratedAt: timestamp("preview_generated_at", { mode: "string", withTimezone: true }),
    previewError: text("preview_error"),
    width: integer("width"),
    height: integer("height"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    nodeUnique: uniqueIndex("drive_files_node_unique").on(table.nodeId),
    teamCreated: index("drive_files_team_created_idx").on(table.teamId, table.createdAt),
  }),
);

export const driveFileVersions = pgTable(
  "drive_file_versions",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => driveNodes.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    previewKind: drivePreviewKindEnum("preview_kind").notNull().default("download"),
    previewObjectKey: text("preview_object_key"),
    previewMimeType: text("preview_mime_type"),
    previewFileSize: bigint("preview_file_size", { mode: "number" }),
    previewGeneratedAt: timestamp("preview_generated_at", { mode: "string", withTimezone: true }),
    previewError: text("preview_error"),
    width: integer("width"),
    height: integer("height"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    fileVersionUnique: uniqueIndex("drive_file_versions_file_version_unique").on(table.fileId, table.versionNumber),
    teamFileCreated: index("drive_file_versions_team_file_created_idx").on(table.teamId, table.fileId, table.createdAt),
  }),
);

export const driveNodeEvents = pgTable(
  "drive_node_events",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => driveNodes.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: driveNodeEventActionEnum("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    teamCreated: index("drive_node_events_team_created_idx").on(table.teamId, table.createdAt),
    nodeCreated: index("drive_node_events_node_created_idx").on(table.nodeId, table.createdAt),
  }),
);

export const driveNodeContextLinks = pgTable(
  "drive_node_context_links",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => driveNodes.id, { onDelete: "cascade" }),
    contextType: driveContextTypeEnum("context_type").notNull(),
    contextId: text("context_id").notNull(),
    label: text("label"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    nodeContextUnique: uniqueIndex("drive_node_context_links_node_context_unique").on(table.teamId, table.nodeId, table.contextType, table.contextId),
    contextLookup: index("drive_node_context_links_context_idx").on(table.teamId, table.contextType, table.contextId),
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
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  cycle: text("cycle").notNull(),
  stage: text("stage").$type<OrfStage>().notNull().default("goalSetting"),
  flowStatus: text("flow_status").$type<ObjectiveFlowStatus>().notNull().default("candidate"),
  status: workStatusEnum("status").notNull(),
  confidence: integer("confidence").notNull(),
  progress: integer("progress").notNull(),
  boundary: text("boundary").notNull(),
  successDefinition: text("success_definition").notNull(),
  finalDueAt: date("final_due_at", { mode: "string" }).notNull().default(sql`(CURRENT_DATE + INTERVAL '14 day')`),
  challengers: jsonb("challengers").$type<string[]>().notNull().default([]),
  challengerUserIds: jsonb("challenger_user_ids").$type<string[]>().notNull().default([]),
  assignedChallengers: jsonb("assigned_challengers").$type<string[]>().notNull().default([]),
  assignedChallengerUserIds: jsonb("assigned_challenger_user_ids").$type<string[]>().notNull().default([]),
  challengeApplications: jsonb("challenge_applications").$type<ChallengeApplication[]>().notNull().default([]),
  acceptedAt: timestamp("accepted_at", { mode: "string", withTimezone: true }),
  confirmationDueAt: timestamp("confirmation_due_at", { mode: "string", withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { mode: "string", withTimezone: true }),
  lootSubmittedAt: timestamp("loot_submitted_at", { mode: "string", withTimezone: true }),
  acceptedResult: text("accepted_result").$type<ObjectiveAcceptedResult>(),
  completionMultiplier: real("completion_multiplier"),
  objectiveBasePoints: integer("objective_base_points").notNull().default(0),
  objectiveSettlementPoints: real("objective_settlement_points"),
  publishedAt: date("published_at", { mode: "string" }),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
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
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  resultClaims: jsonb("result_claims").$type<LootResultClaim[]>().notNull().default([]),
  selfTestReportUrl: text("self_test_report_url"),
  selfTestReportBody: text("self_test_report_body"),
  submittedAt: timestamp("submitted_at", { mode: "string", withTimezone: true }).notNull(),
});

export const objectiveTrialReviews = pgTable(
  "objective_trial_reviews",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    resultClaims: jsonb("result_claims").$type<LootResultClaim[]>().notNull().default([]),
    selfTestReportBody: text("self_test_report_body"),
    status: text("status").$type<ObjectiveTrialReviewStatus>().notNull().default("requested"),
    commanderFeedback: text("commander_feedback"),
    reviewedBy: text("reviewed_by"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { mode: "string", withTimezone: true }),
    requestedAt: timestamp("requested_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    objectiveOnce: uniqueIndex("objective_trial_reviews_objective_once_idx").on(table.objectiveId),
  }),
);

export const objectiveAlignmentRequests = pgTable(
  "objective_alignment_requests",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ObjectiveAlignmentRequestKind>().notNull(),
    requestedBy: text("requested_by").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
    status: text("status").$type<ObjectiveAlignmentRequestStatus>().notNull().default("requested"),
    proposedAt: timestamp("proposed_at", { mode: "string", withTimezone: true }).notNull(),
    scheduledAt: timestamp("scheduled_at", { mode: "string", withTimezone: true }),
    meetingRoom: text("meeting_room"),
    note: text("note"),
    confirmationDueAt: timestamp("confirmation_due_at", { mode: "string", withTimezone: true }),
    commanderFeedback: text("commander_feedback"),
    reviewedBy: text("reviewed_by"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    objectiveKindStatus: index("objective_alignment_requests_objective_kind_status_idx").on(table.objectiveId, table.kind, table.status),
    teamProposedAt: index("objective_alignment_requests_team_proposed_at_idx").on(table.teamId, table.proposedAt),
  }),
);

export const objectiveAcceptanceReviews = pgTable(
  "objective_acceptance_reviews",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    lootId: text("loot_id")
      .notNull()
      .references(() => objectiveLoot.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id),
    acceptedResult: text("accepted_result").$type<ObjectiveAcceptedResult>().notNull(),
    resultReviews: jsonb("result_reviews").$type<Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>>().notNull().default([]),
    reason: text("reason"),
    reviewedAt: timestamp("reviewed_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    objectiveReviewedAt: index("objective_acceptance_reviews_objective_reviewed_at_idx").on(table.objectiveId, table.reviewedAt),
    teamReviewedAt: index("objective_acceptance_reviews_team_reviewed_at_idx").on(table.teamId, table.reviewedAt),
  }),
);

export const objectiveSettlementEvents = pgTable(
  "objective_settlement_events",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ObjectiveSettlementEventKind>().notNull(),
    lootId: text("loot_id").references(() => objectiveLoot.id, { onDelete: "set null" }),
    basePoints: real("base_points").notNull(),
    multiplier: real("multiplier").notNull(),
    settlementPoints: real("settlement_points").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    objectiveKind: uniqueIndex("objective_settlement_events_objective_kind_idx").on(table.objectiveId, table.kind),
    teamCreatedAt: index("objective_settlement_events_team_created_at_idx").on(table.teamId, table.createdAt),
  }),
);

export const pointLedger = pgTable("point_ledger", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  settlementEventId: text("settlement_event_id").references(() => objectiveSettlementEvents.id, { onDelete: "set null" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  memberName: text("member_name").notNull(),
  points: real("points").notNull(),
  reason: text("reason").notNull(),
  settlementPeriodAt: timestamp("settlement_period_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
});

export const workLogCategories = pgTable(
  "work_log_categories",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    teamName: uniqueIndex("work_log_categories_team_name_idx").on(table.teamId, table.normalizedName),
  }),
);

export const workLogEntries = pgTable(
  "work_log_entries",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    authorNameSnapshot: text("author_name_snapshot").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    objectiveId: text("objective_id").references(() => objectives.id, { onDelete: "set null" }),
    objectiveIdSnapshot: text("objective_id_snapshot"),
    objectiveTitleSnapshot: text("objective_title_snapshot"),
    categoryId: text("category_id").references(() => workLogCategories.id, { onDelete: "set null" }),
    categoryIdSnapshot: text("category_id_snapshot"),
    categoryNameSnapshot: text("category_name_snapshot"),
    bodyMarkdown: text("body_markdown").notNull(),
    remainingEstimatePercent: integer("remaining_estimate_percent"),
    durationMinutes: integer("duration_minutes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    authorDate: index("work_log_entries_author_date_idx").on(table.teamId, table.authorUserId, table.workDate),
    teamDate: index("work_log_entries_team_date_idx").on(table.teamId, table.workDate),
    objective: index("work_log_entries_objective_snapshot_idx").on(table.teamId, table.objectiveIdSnapshot),
    category: index("work_log_entries_category_snapshot_idx").on(table.teamId, table.categoryIdSnapshot),
  }),
);

export const workLogClassificationDecisions = pgTable(
  "work_log_classification_decisions",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    entryId: text("entry_id")
      .notNull()
      .references(() => workLogEntries.id, { onDelete: "cascade" }),
    operation: text("operation").$type<WorkLogClassificationDecisionOperation>().notNull(),
    suggestedKind: text("suggested_kind").$type<WorkLogClassificationSuggestionKind>().notNull(),
    suggestedTargetId: text("suggested_target_id"),
    suggestedTargetName: text("suggested_target_name").notNull(),
    suggestedConfidence: real("suggested_confidence").notNull(),
    suggestedReason: text("suggested_reason"),
    bodyMarkdownSnapshot: text("body_markdown_snapshot").notNull(),
    selectedKind: text("selected_kind").$type<WorkLogClassificationKind>().notNull(),
    selectedTargetId: text("selected_target_id"),
    selectedTargetName: text("selected_target_name").notNull(),
    isMatch: boolean("is_match").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    operation: check("work_log_classification_decisions_operation_check", sql`${table.operation} IN ('create', 'update')`),
    suggestedKind: check("work_log_classification_decisions_suggested_kind_check", sql`${table.suggestedKind} IN ('objective', 'category', 'newCategory', 'uncategorized')`),
    suggestedConfidence: check("work_log_classification_decisions_confidence_check", sql`${table.suggestedConfidence} >= 0 AND ${table.suggestedConfidence} <= 1`),
    selectedKind: check("work_log_classification_decisions_selected_kind_check", sql`${table.selectedKind} IN ('objective', 'category', 'uncategorized')`),
    teamCreated: index("work_log_classification_decisions_team_created_idx").on(table.teamId, table.createdAt),
    entryCreated: index("work_log_classification_decisions_entry_created_idx").on(table.entryId, table.createdAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull().default(""),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetType: text("target_type").$type<NotificationTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    targetHref: text("target_href").notNull(),
    readAt: timestamp("read_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  },
  (table) => ({
    recipientCreatedAt: index("notifications_recipient_created_at_idx").on(table.recipientUserId, table.createdAt),
    recipientUnread: index("notifications_recipient_unread_idx").on(table.recipientUserId, table.readAt),
    teamCreatedAt: index("notifications_team_created_at_idx").on(table.teamId, table.createdAt),
  }),
);

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    stream: notificationStreamEnum("stream").$type<NotificationStream>().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull().default(""),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetType: text("target_type").$type<NotificationTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    targetHref: text("target_href").notNull(),
    replyTargetType: commentTargetTypeEnum("reply_target_type").$type<CommentTargetType>(),
    replyTargetId: text("reply_target_id"),
    sourceEventKey: text("source_event_key"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  },
  (table) => ({
    streamCreatedAt: index("notification_events_stream_created_at_idx").on(table.teamId, table.stream, table.createdAt),
    teamSourceEventKeyUnique: uniqueIndex("notification_events_team_source_event_key_unique")
      .on(table.teamId, table.sourceEventKey)
      .where(sql`source_event_key IS NOT NULL`),
    target: index("notification_events_target_idx").on(table.teamId, table.targetType, table.targetId),
  }),
);

export const notificationReceipts = pgTable(
  "notification_receipts",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => notificationEvents.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { mode: "string", withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { mode: "string", withTimezone: true }).notNull(),
    recipientReasons: jsonb("recipient_reasons").$type<string[]>().notNull().default([]),
    deliveryClass: text("delivery_class").$type<"direct" | "mandatory" | "ordinary">().notNull().default("ordinary"),
    attentionLevel: text("attention_level").$type<"action_required" | "normal">().notNull().default("normal"),
  },
  (table) => ({
    attentionLevelCheck: check("notification_receipts_attention_level_check", sql`${table.attentionLevel} IN ('normal', 'action_required')`),
    deliveryClassCheck: check("notification_receipts_delivery_class_check", sql`${table.deliveryClass} IN ('mandatory', 'direct', 'ordinary')`),
    pk: primaryKey({ columns: [table.eventId, table.recipientUserId] }),
    recipientDeliveredAt: index("notification_receipts_recipient_delivered_at_idx").on(table.recipientUserId, table.deliveredAt),
    recipientUnread: index("notification_receipts_recipient_unread_idx").on(table.recipientUserId, table.readAt),
  }),
);

export const workLogReminderStates = pgTable(
  "work_log_reminder_states",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<WorkLogReminderStatus>().notNull(),
    windowStartDate: date("window_start_date", { mode: "string" }).notNull(),
    windowEndDate: date("window_end_date", { mode: "string" }).notNull(),
    requiredDates: jsonb("required_dates").$type<string[]>().notNull().default([]),
    missingDates: jsonb("missing_dates").$type<string[]>().notNull().default([]),
    lastRemindedAt: timestamp("last_reminded_at", { mode: "string", withTimezone: true }),
    nextRemindAt: timestamp("next_remind_at", { mode: "string", withTimezone: true }),
    snoozeCount: integer("snooze_count").notNull().default(0),
    notificationEventId: text("notification_event_id").references(() => notificationEvents.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
    statusNextRemindAt: index("work_log_reminder_states_status_next_remind_at_idx").on(table.status, table.nextRemindAt),
    notificationEvent: index("work_log_reminder_states_notification_event_idx").on(table.notificationEventId),
  }),
);

export const pushDevices = pgTable(
  "push_devices",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    tokenHash: text("token_hash").notNull(),
    token: text("token").notNull(),
    appVersion: text("app_version"),
    appBuild: text("app_build"),
    deviceLabel: text("device_label"),
    deviceManufacturer: text("device_manufacturer"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    sdkInt: integer("sdk_int"),
    googlePlayServicesAvailable: boolean("google_play_services_available"),
    notificationPermission: text("notification_permission"),
    lastClientUpdateVersion: text("last_client_update_version"),
    lastClientUpdatePushedAt: timestamp("last_client_update_pushed_at", { mode: "string", withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "string", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    teamUser: index("push_devices_team_user_idx").on(table.teamId, table.userId, table.enabled),
    tokenUnique: uniqueIndex("push_devices_team_platform_token_unique").on(table.teamId, table.platform, table.tokenHash),
    updated: index("push_devices_updated_idx").on(table.updatedAt),
  }),
);

export const pushRegistrationStatuses = pgTable(
  "push_registration_statuses",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    detail: text("detail"),
    appVersion: text("app_version"),
    appBuild: text("app_build"),
    deviceLabel: text("device_label"),
    deviceManufacturer: text("device_manufacturer"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    sdkInt: integer("sdk_int"),
    googlePlayServicesAvailable: boolean("google_play_services_available"),
    notificationPermission: text("notification_permission"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId, table.platform] }),
    teamUpdated: index("push_registration_statuses_team_updated_idx").on(table.teamId, table.updatedAt),
  }),
);

export const clientUpdateReceipts = pgTable(
  "client_update_receipts",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    releaseVersion: text("release_version").notNull(),
    platform: text("platform").notNull(),
    currentVersion: text("current_version").notNull(),
    checkedAt: timestamp("checked_at", { mode: "string", withTimezone: true }).notNull(),
    promptedAt: timestamp("prompted_at", { mode: "string", withTimezone: true }),
    installStartedAt: timestamp("install_started_at", { mode: "string", withTimezone: true }),
    activatedAt: timestamp("activated_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    nativePlatform: check("client_update_receipts_platform_check", sql`${table.platform} IN ('android', 'desktop-windows')`),
    pk: primaryKey({ columns: [table.teamId, table.userId, table.releaseVersion, table.platform] }),
    teamRelease: index("client_update_receipts_team_release_idx").on(table.teamId, table.releaseVersion),
    teamUpdated: index("client_update_receipts_team_updated_idx").on(table.teamId, table.updatedAt),
  }),
);

export const pushVendorDevices = pgTable(
  "push_vendor_devices",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    vendor: text("vendor").notNull(),
    tokenHash: text("token_hash").notNull(),
    token: text("token").notNull(),
    appVersion: text("app_version"),
    appBuild: text("app_build"),
    deviceLabel: text("device_label"),
    deviceManufacturer: text("device_manufacturer"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    sdkInt: integer("sdk_int"),
    notificationPermission: text("notification_permission"),
    lastClientUpdateVersion: text("last_client_update_version"),
    lastClientUpdatePushedAt: timestamp("last_client_update_pushed_at", { mode: "string", withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "string", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    teamUser: index("push_vendor_devices_team_user_idx").on(table.teamId, table.userId, table.vendor, table.enabled),
    tokenUnique: uniqueIndex("push_vendor_devices_team_vendor_platform_token_unique").on(table.teamId, table.vendor, table.platform, table.tokenHash),
    updated: index("push_vendor_devices_updated_idx").on(table.updatedAt),
  }),
);

export const pushVendorRegistrationStatuses = pgTable(
  "push_vendor_registration_statuses",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    vendor: text("vendor").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    detail: text("detail"),
    appVersion: text("app_version"),
    appBuild: text("app_build"),
    deviceLabel: text("device_label"),
    deviceManufacturer: text("device_manufacturer"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    sdkInt: integer("sdk_int"),
    notificationPermission: text("notification_permission"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId, table.platform, table.vendor] }),
    teamUpdated: index("push_vendor_registration_statuses_team_updated_idx").on(table.teamId, table.updatedAt),
  }),
);

export const results = pgTable("results", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
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
  definerUserId: uuid("definer_user_id").notNull().references(() => users.id),
  uncertaintyScore: integer("uncertainty_score").notNull().default(0),
  executionCompleted: boolean("execution_completed").notNull().default(false),
  acceptedResult: text("accepted_result").$type<ResultAcceptedResult>().notNull().default("unreviewed"),
  reviewCadence: text("review_cadence").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
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
  assigneeUserId: uuid("assignee_user_id").notNull().references(() => users.id),
  linkedObjectiveId: text("linked_objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  definitionContributorUserIds: jsonb("definition_contributor_user_ids").$type<string[]>().notNull().default([]),
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
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  linkedResultId: text("linked_result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
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
  createdBy: uuid("created_by")
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
  authorUserId: uuid("author_user_id")
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

export const commentAttachments = pgTable(
  "comment_attachments",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    targetType: commentTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    messageId: text("message_id").references(() => commentMessages.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    attachedAt: timestamp("attached_at", { mode: "string", withTimezone: true }),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    message: index("comment_attachments_message_idx").on(table.messageId),
    pendingByCreator: index("comment_attachments_pending_creator_idx").on(table.createdBy, table.targetType, table.targetId, table.expiresAt),
    teamTarget: index("comment_attachments_team_target_idx").on(table.teamId, table.targetType, table.targetId),
  }),
);

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    type: chatChannelTypeEnum("type").notNull(),
    name: text("name"),
    integrationProvider: text("integration_provider").$type<ChatIntegrationProvider>(),
    systemKind: text("system_kind").$type<ChatSystemKind>(),
    systemRecipientUserId: uuid("system_recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    purpose: text("purpose").notNull().default(""),
    header: text("header").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    archivedAt: timestamp("archived_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    teamType: index("chat_channels_team_type_idx").on(table.teamId, table.type),
    teamUpdated: index("chat_channels_team_updated_idx").on(table.teamId, table.updatedAt),
    teamNameUnique: uniqueIndex("chat_channels_team_name_unique").on(table.teamId, table.name),
    teamSystemAnnouncementUnique: uniqueIndex("chat_channels_team_system_announcement_unique")
      .on(table.teamId, table.systemKind)
      .where(sql`system_kind = 'teamAnnouncement'`),
    teamSystemPersonalUnique: uniqueIndex("chat_channels_team_system_personal_unique")
      .on(table.teamId, table.systemKind, table.systemRecipientUserId)
      .where(sql`system_kind = 'personalNotification'`),
    project: index("chat_channels_project_idx").on(table.teamId, table.projectId),
  }),
);

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: chatMemberRoleEnum("role").notNull().default("member"),
    favorite: boolean("favorite").notNull().default(false),
    muted: boolean("muted").notNull().default(false),
    manuallyUnread: boolean("manually_unread").notNull().default(false),
    lastViewedAt: timestamp("last_viewed_at", { mode: "string", withTimezone: true }),
    lastReadAt: timestamp("last_read_at", { mode: "string", withTimezone: true }),
    lastReadMessageId: text("last_read_message_id"),
    joinedAt: timestamp("joined_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.channelId, table.userId] }),
    user: index("chat_channel_members_user_idx").on(table.userId),
  }),
);

export const chatChannelDriveLinks = pgTable(
  "chat_channel_drive_links",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => driveNodes.id, { onDelete: "cascade" }),
    label: text("label"),
    isDefaultUploadTarget: boolean("is_default_upload_target").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    channelNodeUnique: uniqueIndex("chat_channel_drive_links_channel_node_unique").on(table.channelId, table.nodeId),
    channelDefaultUpload: index("chat_channel_drive_links_channel_default_idx").on(table.channelId, table.isDefaultUploadTarget),
    teamChannel: index("chat_channel_drive_links_team_channel_idx").on(table.teamId, table.channelId),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").$type<ChatMessageSource>().notNull().default("user"),
    systemMetadata: jsonb("system_metadata").$type<ChatMessageSystemMetadata>().notNull().default({}),
    body: text("body").notNull(),
    rootMessageId: text("root_message_id"),
    parentMessageId: text("parent_message_id"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    editedAt: timestamp("edited_at", { mode: "string", withTimezone: true }),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    channelCreated: index("chat_messages_channel_created_idx").on(table.channelId, table.createdAt),
    rootCreated: index("chat_messages_root_created_idx").on(table.rootMessageId, table.createdAt),
    teamCreated: index("chat_messages_team_created_idx").on(table.teamId, table.createdAt),
  }),
);

export const chatPolls = pgTable(
  "chat_polls",
  {
    messageId: text("message_id")
      .primaryKey()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    selectionMode: text("selection_mode").$type<ChatPollSelectionMode>().notNull(),
    visibility: text("visibility").$type<ChatPollVisibility>().notNull(),
    closedAt: timestamp("closed_at", { mode: "string", withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    selectionModeCheck: check("chat_polls_selection_mode_check", sql`${table.selectionMode} IN ('single', 'multiple')`),
    visibilityCheck: check("chat_polls_visibility_check", sql`${table.visibility} IN ('named', 'anonymous')`),
  }),
);

export const chatPollOptions = pgTable(
  "chat_poll_options",
  {
    id: text("id").primaryKey(),
    pollMessageId: text("poll_message_id")
      .notNull()
      .references(() => chatPolls.messageId, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
  },
  (table) => ({
    pollPositionUnique: uniqueIndex("chat_poll_options_poll_position_unique").on(table.pollMessageId, table.position),
    pollOptionUnique: uniqueIndex("chat_poll_options_poll_option_unique").on(table.pollMessageId, table.id),
    positionCheck: check("chat_poll_options_position_check", sql`${table.position} >= 0`),
    labelCheck: check("chat_poll_options_label_check", sql`char_length(btrim(${table.label})) BETWEEN 1 AND 80`),
  }),
);

export const chatPollVotes = pgTable(
  "chat_poll_votes",
  {
    pollMessageId: text("poll_message_id").notNull(),
    optionId: text("option_id").notNull(),
    voterUserId: uuid("voter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pollMessageId, table.voterUserId, table.optionId] }),
    pollOptionForeignKey: foreignKey({
      columns: [table.pollMessageId, table.optionId],
      foreignColumns: [chatPollOptions.pollMessageId, chatPollOptions.id],
      name: "chat_poll_votes_poll_option_fk",
    }).onDelete("cascade"),
    option: index("chat_poll_votes_option_idx").on(table.pollMessageId, table.optionId),
    voter: index("chat_poll_votes_voter_idx").on(table.voterUserId),
  }),
);

export const chatSyncEvents = pgTable(
  "chat_sync_events",
  {
    seq: bigserial("seq", { mode: "bigint" }).primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    protocolVersion: integer("protocol_version").notNull().default(1),
    eventType: text("event_type").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    channelId: text("channel_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { mode: "string", withTimezone: true }).notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, boolean | number | string | null>>().notNull().default({}),
  },
  (table) => ({
    teamSeq: index("chat_sync_events_team_seq_idx").on(table.teamId, table.seq),
    teamOccurred: index("chat_sync_events_team_occurred_idx").on(table.teamId, table.occurredAt),
    channelSeq: index("chat_sync_events_channel_seq_idx").on(table.channelId, table.seq),
  }),
);

export const chatPushDeliveries = pgTable(
  "chat_push_deliveries",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    outcome: text("outcome"),
    attempts: integer("attempts").notNull().default(0),
    targetCount: integer("target_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "string", withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "string", withTimezone: true }),
    completedAt: timestamp("completed_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    messageRecipient: uniqueIndex("chat_push_deliveries_message_recipient_unique")
      .on(table.messageId, table.recipientUserId),
    retry: index("chat_push_deliveries_retry_idx")
      .on(table.status, table.nextAttemptAt, table.leaseExpiresAt, table.createdAt),
  }),
);

export const chatLegacyRealtimeDeliveries = pgTable(
  "chat_legacy_realtime_deliveries",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    teamId: text("team_id").notNull(),
    channelId: text("channel_id").notNull(),
    recipientUserId: uuid("recipient_user_id").notNull(),
    status: text("status").notNull().default("completed"),
    finalReason: text("final_reason").notNull().default("legacy_realtime_retired"),
    originalStatus: text("original_status").notNull(),
    originalOutcome: text("original_outcome"),
    attempts: integer("attempts").notNull().default(0),
    targetCount: integer("target_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    originalUpdatedAt: timestamp("original_updated_at", { mode: "string", withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    purgeAfter: timestamp("purge_after", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    purge: index("chat_legacy_realtime_deliveries_purge_idx").on(table.purgeAfter),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => notificationEvents.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    destinationId: text("destination_id"),
    messageId: text("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "string", withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    eventChannel: index("notification_deliveries_event_channel_idx").on(table.eventId, table.channel),
    retry: index("notification_deliveries_retry_idx").on(table.channel, table.status, table.nextAttemptAt),
    teamChatOnce: uniqueIndex("notification_deliveries_team_chat_unique")
      .on(table.eventId, table.channel)
      .where(sql`recipient_user_id IS NULL AND destination_id IS NULL`),
    destinationChatOnce: uniqueIndex("notification_deliveries_destination_chat_unique")
      .on(table.eventId, table.channel, table.destinationId)
      .where(sql`recipient_user_id IS NULL AND destination_id IS NOT NULL`),
    destinationRetry: index("notification_deliveries_destination_retry_idx").on(table.channel, table.destinationId, table.status, table.nextAttemptAt),
    userChatOnce: uniqueIndex("notification_deliveries_user_chat_unique")
      .on(table.eventId, table.recipientUserId, table.channel)
      .where(sql`recipient_user_id IS NOT NULL`),
  }),
);

export const chatMessageReactions = pgTable(
  "chat_message_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emojiName: text("emoji_name").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId, table.emojiName] }),
    user: index("chat_message_reactions_user_idx").on(table.userId),
  }),
);

export const chatMessageAckRequests = pgTable(
  "chat_message_ack_requests",
  {
    messageId: text("message_id")
      .primaryKey()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    teamChannel: index("chat_message_ack_requests_team_channel_idx").on(table.teamId, table.channelId, table.requestedAt),
  }),
);

export const chatMessageAckRecipients = pgTable(
  "chat_message_ack_recipients",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessageAckRequests.messageId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId] }),
    user: index("chat_message_ack_recipients_user_idx").on(table.userId),
  }),
);

export const chatMessagePins = pgTable(
  "chat_message_pins",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    pinnedBy: uuid("pinned_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId] }),
    channelPinnedAt: index("chat_message_pins_channel_pinned_at_idx").on(table.channelId, table.pinnedAt),
    pinnedBy: index("chat_message_pins_pinned_by_idx").on(table.pinnedBy),
  }),
);

export const chatMessageSaves = pgTable(
  "chat_message_saves",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId] }),
    userSavedAt: index("chat_message_saves_user_saved_at_idx").on(table.userId, table.savedAt),
  }),
);

export const chatThreadFollows = pgTable(
  "chat_thread_follows",
  {
    rootMessageId: text("root_message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    following: boolean("following").notNull().default(true),
    lastViewedAt: timestamp("last_viewed_at", { mode: "string", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.rootMessageId, table.userId] }),
    user: index("chat_thread_follows_user_idx").on(table.userId),
  }),
);

export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    attachedAt: timestamp("attached_at", { mode: "string", withTimezone: true }),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    message: index("chat_attachments_message_idx").on(table.messageId),
    pendingByCreator: index("chat_attachments_pending_creator_idx").on(table.createdBy, table.channelId, table.expiresAt),
    teamChannel: index("chat_attachments_team_channel_idx").on(table.teamId, table.channelId),
  }),
);

export const chatImportMappings = pgTable(
  "chat_import_mappings",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sourceSystem: text("source_system").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: text("target_id").notNull(),
    targetSecondaryId: text("target_secondary_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    importedAt: timestamp("imported_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.sourceSystem, table.sourceKind, table.sourceId] }),
    target: index("chat_import_mappings_target_idx").on(table.teamId, table.targetTable, table.targetId),
  }),
);

export const gitLabOrfChannelSubscriptions = pgTable(
  "gitlab_orf_channel_subscriptions",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    chatChannelId: text("chat_channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    gitlabGroupPath: text("gitlab_group_path").notNull(),
    gitlabProjectId: text("gitlab_project_id"),
    gitlabProjectPath: text("gitlab_project_path"),
    gitlabProjectUrl: text("gitlab_project_url").notNull().default(""),
    eventTypes: jsonb("event_types").$type<string[]>().notNull().default(sql`'["push","tag_push","merge_request","issue","pipeline"]'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    channel: index("gitlab_orf_channel_subscriptions_channel_idx").on(table.teamId, table.chatChannelId),
    project: index("gitlab_orf_channel_subscriptions_project_idx").on(table.teamId, table.gitlabProjectId),
    enabled: index("gitlab_orf_channel_subscriptions_enabled_idx").on(table.teamId, table.enabled),
    groupUnique: uniqueIndex("gitlab_orf_channel_subscriptions_group_unique")
      .on(table.teamId, table.chatChannelId, table.gitlabGroupPath)
      .where(sql`gitlab_project_id IS NULL`),
    projectUnique: uniqueIndex("gitlab_orf_channel_subscriptions_project_unique")
      .on(table.teamId, table.chatChannelId, table.gitlabProjectId)
      .where(sql`gitlab_project_id IS NOT NULL`),
  }),
);

export const gitLabOrfEventDeliveries = pgTable(
  "gitlab_orf_event_deliveries",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    externalEventKey: text("external_event_key").notNull(),
    subscriptionId: text("subscription_id").references(() => gitLabOrfChannelSubscriptions.id, { onDelete: "set null" }),
    gitlabProjectId: text("gitlab_project_id").notNull(),
    gitlabProjectPath: text("gitlab_project_path").notNull().default(""),
    gitlabProjectUrl: text("gitlab_project_url").notNull().default(""),
    eventType: text("event_type").notNull(),
    chatChannelId: text("chat_channel_id").references(() => chatChannels.id, { onDelete: "set null" }),
    chatMessageId: text("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    status: text("status").$type<"reserved" | "delivered" | "failed" | "ignored">().notNull(),
    error: text("error"),
    receivedAt: timestamp("received_at", { mode: "string", withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { mode: "string", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    channelEventUnique: uniqueIndex("gitlab_orf_event_deliveries_channel_event_unique").on(table.teamId, table.chatChannelId, table.externalEventKey),
    subscription: index("gitlab_orf_event_deliveries_subscription_idx").on(table.subscriptionId, table.receivedAt),
    project: index("gitlab_orf_event_deliveries_project_idx").on(table.teamId, table.gitlabProjectId, table.receivedAt),
    status: index("gitlab_orf_event_deliveries_status_idx").on(table.teamId, table.status, table.updatedAt),
  }),
);

export const gitHubOrfChatDeliveries = pgTable(
  "github_orf_chat_deliveries",
  {
    deliveryKey: text("delivery_key").primaryKey(),
    repository: text("repository").notNull(),
    eventType: text("event_type").$type<"push" | "issue" | "issues-snapshot">().notNull(),
    subject: text("subject").notNull(),
    externalId: text("external_id").notNull(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    source: text("source").$type<"webhook" | "api-poll" | "git-poll">().notNull(),
    status: text("status").$type<"reserved" | "delivered" | "failed">().notNull().default("reserved"),
    chatMessageId: text("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    repositoryEvent: index("github_orf_chat_deliveries_repo_event_idx").on(table.repository, table.eventType, table.subject, table.createdAt),
    status: index("github_orf_chat_deliveries_status_idx").on(table.status, table.updatedAt),
  }),
);
