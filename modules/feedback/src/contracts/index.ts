import { z } from "zod";

export * from "./notifications";

export const feedbackStageValues = [
  "open",
  "in_progress",
  "pending_verification",
  "closed",
] as const;

export const feedbackResolutionValues = [
  "resolved",
  "not_needed",
  "cannot_resolve",
  "duplicate",
  "unspecified",
] as const;

export const feedbackCommandResolutionValues = [
  "resolved",
  "not_needed",
  "cannot_resolve",
  "duplicate",
] as const;

export const feedbackImpactValues = ["low", "medium", "high", "critical"] as const;
export const feedbackPriorityValues = ["p0", "p1", "p2", "p3"] as const;
export const feedbackActorRoleValues = ["member", "admin"] as const;
export const feedbackActorStatusValues = ["active", "inactive"] as const;
export const feedbackRelationTypeValues = ["related", "duplicates", "blocks"] as const;
export const feedbackTransitionTypeValues = [
  "start",
  "submit_verification",
  "accept_verification",
  "reject_verification",
  "withdraw",
  "reopen",
] as const;

export const feedbackActivityTypeValues = [
  "feedback.created",
  "feedback.metadata.changed",
  "feedback.assignee.changed",
  "feedback.lifecycle.changed",
  "feedback.relation.added",
  "feedback.relation.removed",
  "feedback.comment.created",
  "feedback.comment.edited",
  "feedback.report.changed",
  "feedback.imported",
] as const;

export const feedbackStageSchema = z.enum(feedbackStageValues);
export const feedbackResolutionSchema = z.enum(feedbackResolutionValues);
export const feedbackCommandResolutionSchema = z.enum(feedbackCommandResolutionValues);
export const feedbackImpactSchema = z.enum(feedbackImpactValues);
export const feedbackPrioritySchema = z.enum(feedbackPriorityValues);
export const feedbackActorRoleSchema = z.enum(feedbackActorRoleValues);
export const feedbackActorStatusSchema = z.enum(feedbackActorStatusValues);
export const feedbackRelationTypeSchema = z.enum(feedbackRelationTypeValues);
export const feedbackTransitionTypeSchema = z.enum(feedbackTransitionTypeValues);
export const feedbackActivityTypeSchema = z.enum(feedbackActivityTypeValues);

export const feedbackIdSchema = z.string().trim().min(1);
export const feedbackUserIdSchema = z.string().trim().min(1);
export const feedbackTeamIdSchema = z.string().trim().min(1);
export const feedbackProjectIdSchema = z.string().trim().min(1);
export const feedbackVersionSchema = z.number().int().nonnegative();

export const feedbackLifecycleSnapshotSchema = z.object({
  stage: feedbackStageSchema,
  resolution: feedbackResolutionSchema.nullable(),
  version: feedbackVersionSchema,
  closedAt: z.string().trim().min(1).nullable().optional(),
  closedByUserId: feedbackUserIdSchema.nullable().optional(),
});

export const feedbackActorSnapshotSchema = z.object({
  id: feedbackUserIdSchema,
  teamId: feedbackTeamIdSchema,
  role: feedbackActorRoleSchema,
  status: feedbackActorStatusSchema,
});

export const feedbackEntitySnapshotSchema = feedbackLifecycleSnapshotSchema.extend({
  id: feedbackIdSchema,
  teamId: feedbackTeamIdSchema,
  projectId: feedbackProjectIdSchema.nullable().optional(),
  createdByUserId: feedbackUserIdSchema,
  assigneeUserId: feedbackUserIdSchema.nullable(),
  priority: feedbackPrioritySchema.nullable(),
  impact: feedbackImpactSchema,
  visibleUserIds: z.array(feedbackUserIdSchema).readonly().optional(),
});

export const administrativeTakeoverSchema = z.object({
  reason: z.string().trim().min(1),
});

const feedbackTransitionBaseSchema = z.object({
  expectedVersion: feedbackVersionSchema,
});

const feedbackTransitionNoteSchema = z.string().trim().min(1);

export const feedbackTransitionInputSchema = z.discriminatedUnion("type", [
  feedbackTransitionBaseSchema.extend({
    type: z.literal("start"),
  }),
  feedbackTransitionBaseSchema.extend({
    type: z.literal("submit_verification"),
    resolution: feedbackCommandResolutionSchema,
    note: feedbackTransitionNoteSchema,
    duplicateTargetFeedbackId: feedbackIdSchema.optional(),
  }),
  feedbackTransitionBaseSchema.extend({
    type: z.literal("accept_verification"),
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  feedbackTransitionBaseSchema.extend({
    type: z.literal("reject_verification"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  feedbackTransitionBaseSchema.extend({
    type: z.literal("withdraw"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  feedbackTransitionBaseSchema.extend({
    type: z.literal("reopen"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
]);

export const feedbackRelationDraftSchema = z.object({
  sourceFeedbackId: feedbackIdSchema,
  targetFeedbackId: feedbackIdSchema,
  type: feedbackRelationTypeSchema,
});

export const feedbackCapabilitiesSchema = z.object({
  canView: z.boolean(),
  canStart: z.boolean(),
  canSubmitVerification: z.boolean(),
  canAcceptVerification: z.boolean(),
  canRejectVerification: z.boolean(),
  canWithdraw: z.boolean(),
  canReopen: z.boolean(),
  canEditReport: z.boolean(),
  canSetPriority: z.boolean(),
  canChangeAssignee: z.boolean(),
  canImportExport: z.boolean(),
});

export type FeedbackStage = z.infer<typeof feedbackStageSchema>;
export type FeedbackResolution = z.infer<typeof feedbackResolutionSchema>;
export type FeedbackCommandResolution = z.infer<typeof feedbackCommandResolutionSchema>;
export type FeedbackImpact = z.infer<typeof feedbackImpactSchema>;
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>;
export type FeedbackActorRole = z.infer<typeof feedbackActorRoleSchema>;
export type FeedbackActorStatus = z.infer<typeof feedbackActorStatusSchema>;
export type FeedbackRelationType = z.infer<typeof feedbackRelationTypeSchema>;
export type FeedbackTransitionType = z.infer<typeof feedbackTransitionTypeSchema>;
export type FeedbackActivityType = z.infer<typeof feedbackActivityTypeSchema>;
export type FeedbackLifecycleSnapshot = z.infer<typeof feedbackLifecycleSnapshotSchema>;
export type FeedbackActorSnapshot = z.infer<typeof feedbackActorSnapshotSchema>;
export type FeedbackEntitySnapshot = z.infer<typeof feedbackEntitySnapshotSchema>;
export type FeedbackTransitionInput = z.infer<typeof feedbackTransitionInputSchema>;
export type FeedbackRelationDraft = z.infer<typeof feedbackRelationDraftSchema>;
export type FeedbackCapabilities = z.infer<typeof feedbackCapabilitiesSchema>;
