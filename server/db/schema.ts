import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type {
  BountySource,
  ChallengeApplication,
  ContributionAllocation,
  LootResultClaim,
  NotificationKind,
  NotificationTargetType,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  ObjectiveTrialReviewStatus,
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
export const feedbackStatusEnum = pgEnum("feedback_status", ["Open", "Closed"]);
export const teamRoleEnum = pgEnum("team_role", ["admin", "member", "readonly", "supervisor"]);
export const commentTargetTypeEnum = pgEnum("comment_target_type", ["objective", "result", "task", "subtask", "feedback"]);
export const commentStatusEnum = pgEnum("comment_status", ["open", "resolved"]);
export const chatChannelTypeEnum = pgEnum("chat_channel_type", ["public", "private", "direct", "group"]);
export const chatMemberRoleEnum = pgEnum("chat_member_role", ["owner", "admin", "member"]);
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
  stage: text("stage").$type<OrfStage>().notNull().default("orfReestimate"),
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
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
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
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
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
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    status: text("status").$type<ObjectiveAlignmentRequestStatus>().notNull().default("requested"),
    proposedAt: timestamp("proposed_at", { mode: "string", withTimezone: true }).notNull(),
    scheduledAt: timestamp("scheduled_at", { mode: "string", withTimezone: true }),
    meetingRoom: text("meeting_room"),
    note: text("note"),
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

export const objectiveContributionReviews = pgTable("objective_contribution_reviews", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  reviewer: text("reviewer").notNull(),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
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
  userId: uuid("user_id").references(() => users.id),
  memberName: text("member_name").notNull(),
  points: real("points").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
});

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
  definerUserId: uuid("definer_user_id").references(() => users.id),
  uncertaintyScore: integer("uncertainty_score").notNull().default(0),
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
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
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
  suggestedAdjustment: text("suggested_adjustment").notNull(),
  status: feedbackStatusEnum("status").notNull(),
  owner: text("owner").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  createdAt: date("created_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
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
  ownerUserId: uuid("owner_user_id").references(() => users.id),
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
