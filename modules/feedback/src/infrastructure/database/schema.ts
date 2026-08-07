import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  feedbackActivityTypeValues,
  feedbackImpactValues,
  feedbackPriorityValues,
  feedbackRelationTypeValues,
  feedbackResolutionValues,
  feedbackStageValues,
  type FeedbackActivityType,
  type FeedbackImpact,
  type FeedbackPriority,
  type FeedbackRelationType,
  type FeedbackResolution,
  type FeedbackStage,
} from "../../contracts/index";
import { notificationEvents, projects, teams, users } from "../../../../../server/db/schema";

export const feedbackStageEnum = pgEnum("feedback_stage", feedbackStageValues);
export const feedbackResolutionEnum = pgEnum("feedback_resolution", feedbackResolutionValues);
export const feedbackImpactEnum = pgEnum("feedback_impact", feedbackImpactValues);
export const feedbackPriorityEnum = pgEnum("feedback_priority", feedbackPriorityValues);
export const feedbackRelationTypeEnum = pgEnum("feedback_relation_type", feedbackRelationTypeValues);
export const feedbackActivityTypeEnum = pgEnum("feedback_activity_type", feedbackActivityTypeValues);

export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    stage: feedbackStageEnum("stage").$type<FeedbackStage>().notNull().default("open"),
    resolution: feedbackResolutionEnum("resolution").$type<FeedbackResolution>(),
    impact: feedbackImpactEnum("impact").$type<FeedbackImpact>().notNull().default("medium"),
    priority: feedbackPriorityEnum("priority").$type<FeedbackPriority>(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { mode: "string", withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    assigneeStage: index("feedback_assignee_stage_idx").on(table.teamId, table.assigneeUserId, table.stage),
    createdByStage: index("feedback_created_by_stage_idx").on(table.teamId, table.createdBy, table.stage),
    lifecycleInvariant: check(
      "feedback_lifecycle_invariant_check",
      sql`
        (
          ${table.stage} in ('open', 'in_progress')
          and ${table.resolution} is null
          and ${table.closedAt} is null
          and ${table.closedByUserId} is null
        )
        or (
          ${table.stage} = 'pending_verification'
          and ${table.resolution} is not null
          and ${table.closedAt} is null
          and ${table.closedByUserId} is null
        )
        or (
          ${table.stage} = 'closed'
          and ${table.resolution} is not null
          and ${table.closedAt} is not null
          and ${table.closedByUserId} is not null
        )
      `,
    ),
    project: index("feedback_project_idx").on(table.teamId, table.projectId),
    teamStageUpdated: index("feedback_team_stage_updated_idx").on(table.teamId, table.stage, table.updatedAt),
    teamUpdated: index("feedback_team_updated_idx").on(table.teamId, table.updatedAt),
    versionNonNegative: check("feedback_version_non_negative_check", sql`${table.version} >= 0`),
  }),
);

export const feedbackReportAttachments = pgTable(
  "feedback_report_attachments",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    sourceCommentAttachmentId: text("source_comment_attachment_id"),
  },
  (table) => ({
    feedbackOrder: index("feedback_report_attachments_feedback_order_idx").on(table.feedbackId, table.sortOrder),
    objectKeyUnique: uniqueIndex("feedback_report_attachments_object_key_unique").on(table.objectKey),
  }),
);

export const feedbackCauseCategories = pgTable(
  "feedback_cause_categories",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.feedbackId, table.category] }),
    teamCategory: index("feedback_cause_categories_team_category_idx").on(table.teamId, table.category),
  }),
);

export const feedbackRelations = pgTable(
  "feedback_relations",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sourceFeedbackId: text("source_feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    targetFeedbackId: text("target_feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    type: feedbackRelationTypeEnum("type").$type<FeedbackRelationType>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    noSelf: check("feedback_relations_no_self_check", sql`${table.sourceFeedbackId} <> ${table.targetFeedbackId}`),
    relatedCanonical: check(
      "feedback_relations_related_canonical_check",
      sql`${table.type} <> 'related' or ${table.sourceFeedbackId} < ${table.targetFeedbackId}`,
    ),
    source: index("feedback_relations_source_idx").on(table.teamId, table.sourceFeedbackId, table.type),
    target: index("feedback_relations_target_idx").on(table.teamId, table.targetFeedbackId, table.type),
    uniqueRelation: uniqueIndex("feedback_relations_unique_idx").on(
      table.teamId,
      table.type,
      table.sourceFeedbackId,
      table.targetFeedbackId,
    ),
  }),
);

export const feedbackActivityEvents = pgTable(
  "feedback_activity_events",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    activityType: feedbackActivityTypeEnum("activity_type").$type<FeedbackActivityType>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    feedbackSequence: index("feedback_activity_events_feedback_sequence_idx").on(table.feedbackId, table.sequence),
    sequenceUnique: uniqueIndex("feedback_activity_events_sequence_unique").on(table.sequence),
    teamSequence: index("feedback_activity_events_team_sequence_idx").on(table.teamId, table.sequence),
  }),
);

export const feedbackUserViews = pgTable(
  "feedback_user_views",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastSeenSequence: bigint("last_seen_sequence", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.feedbackId, table.userId] }),
    userUpdated: index("feedback_user_views_user_updated_idx").on(table.teamId, table.userId, table.updatedAt),
  }),
);

export const feedbackParticipants = pgTable(
  "feedback_participants",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstParticipatedAt: timestamp("first_participated_at", { mode: "string", withTimezone: true }).notNull(),
    lastParticipatedAt: timestamp("last_participated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.feedbackId, table.userId] }),
    userLast: index("feedback_participants_user_last_idx").on(table.teamId, table.userId, table.lastParticipatedAt),
  }),
);

export const feedbackSubscriptions = pgTable(
  "feedback_subscriptions",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").$type<"subscribed" | "muted">().notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    feedbackMode: index("feedback_subscriptions_feedback_mode_idx").on(table.teamId, table.feedbackId, table.mode),
    modeCheck: check("feedback_subscriptions_mode_check", sql`${table.mode} IN ('subscribed', 'muted')`),
    pk: primaryKey({ columns: [table.teamId, table.feedbackId, table.userId] }),
    userMode: index("feedback_subscriptions_user_mode_idx").on(table.teamId, table.userId, table.mode),
  }),
);

export const feedbackEventDispatches = pgTable(
  "feedback_event_dispatches",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    activityEventId: text("activity_event_id")
      .notNull()
      .references(() => feedbackActivityEvents.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"failed" | "pending" | "published">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    notificationEventId: text("notification_event_id").references(() => notificationEvents.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    activity: index("feedback_event_dispatches_activity_idx").on(table.activityEventId),
    idempotencyUnique: uniqueIndex("feedback_event_dispatches_idempotency_unique").on(table.idempotencyKey),
    statusUpdated: index("feedback_event_dispatches_status_updated_idx").on(table.status, table.updatedAt),
    statusCheck: check("feedback_event_dispatches_status_check", sql`${table.status} IN ('pending', 'published', 'failed')`),
  }),
);

export const feedbackEventDispatchRecipients = pgTable(
  "feedback_event_dispatch_recipients",
  {
    dispatchId: text("dispatch_id")
      .notNull()
      .references(() => feedbackEventDispatches.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    deliveryClass: text("delivery_class").$type<"direct" | "mandatory" | "ordinary">().notNull(),
    attentionLevel: text("attention_level").$type<"action_required" | "normal">().notNull(),
    muted: boolean("muted").notNull().default(false),
  },
  (table) => ({
    deliveryClassCheck: check(
      "feedback_event_dispatch_recipients_delivery_class_check",
      sql`${table.deliveryClass} IN ('mandatory', 'direct', 'ordinary')`,
    ),
    attentionLevelCheck: check(
      "feedback_event_dispatch_recipients_attention_level_check",
      sql`${table.attentionLevel} IN ('normal', 'action_required')`,
    ),
    pk: primaryKey({ columns: [table.dispatchId, table.recipientUserId] }),
  }),
);

export const feedbackImportBatches = pgTable(
  "feedback_import_batches",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<"committed" | "failed" | "uploaded" | "validated">().notNull(),
    sourceKind: text("source_kind").notNull(),
    fileName: text("file_name"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    statusCheck: check("feedback_import_batches_status_check", sql`${table.status} IN ('uploaded', 'validated', 'committed', 'failed')`),
    teamCreated: index("feedback_import_batches_team_created_idx").on(table.teamId, table.createdAt),
  }),
);

export const feedbackImportOrigins = pgTable(
  "feedback_import_origins",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sourceSystem: text("source_system").notNull(),
    externalId: text("external_id").notNull(),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    importBatchId: text("import_batch_id").references(() => feedbackImportBatches.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    feedback: index("feedback_import_origins_feedback_idx").on(table.feedbackId),
    pk: primaryKey({ columns: [table.teamId, table.sourceSystem, table.externalId] }),
  }),
);

export const feedbackDailyDigestRuns = pgTable(
  "feedback_daily_digest_runs",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    assigneeUserId: uuid("assignee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    status: text("status").$type<"failed" | "pending" | "sent">().notNull().default("pending"),
    feedbackCount: integer("feedback_count").notNull().default(0),
    notificationEventId: text("notification_event_id").references(() => notificationEvents.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    notificationEvent: index("feedback_daily_digest_runs_notification_event_idx").on(table.notificationEventId),
    pk: primaryKey({ columns: [table.teamId, table.assigneeUserId, table.localDate] }),
    statusCheck: check("feedback_daily_digest_runs_status_check", sql`${table.status} IN ('pending', 'sent', 'failed')`),
    teamDate: index("feedback_daily_digest_runs_team_date_idx").on(table.teamId, table.localDate),
  }),
);
