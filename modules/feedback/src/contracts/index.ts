import { z } from "zod";
import {
  feedbackActivityTypeValues,
  feedbackActorRoleValues,
  feedbackActorStatusValues,
  feedbackCommandResolutionValues,
  feedbackImpactValues,
  feedbackPriorityValues,
  feedbackRelationTypeValues,
  feedbackResolutionValues,
  feedbackStageValues,
  feedbackSubscriptionModeValues,
  feedbackSubscriptionMutationModeValues,
  feedbackTransitionTypeValues,
} from "./values";

export * from "./links";
export * from "./capabilities";
export * from "./categories";
export * from "./commandResult";
export * from "./labels";
export * from "./dashboardSummary";
export * from "./issueList";
export * from "./notifications";
export * from "./readModel";
export * from "./reportAttachments";
export * from "./values";

export const feedbackStageSchema = z.enum(feedbackStageValues);
export const feedbackResolutionSchema = z.enum(feedbackResolutionValues);
export const feedbackCommandResolutionSchema = z.enum(feedbackCommandResolutionValues);
export const feedbackImpactSchema = z.enum(feedbackImpactValues);
export const feedbackPrioritySchema = z.enum(feedbackPriorityValues);
export const feedbackActorRoleSchema = z.enum(feedbackActorRoleValues);
export const feedbackActorStatusSchema = z.enum(feedbackActorStatusValues);
export const feedbackRelationTypeSchema = z.enum(feedbackRelationTypeValues);
export const feedbackSubscriptionModeSchema = z.enum(feedbackSubscriptionModeValues);
export const feedbackSubscriptionMutationModeSchema = z.enum(feedbackSubscriptionMutationModeValues);
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

export const feedbackFollowUpTransitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({
    type: z.literal("submit_verification"),
    resolution: feedbackCommandResolutionSchema,
    note: feedbackTransitionNoteSchema,
    duplicateTargetFeedbackId: feedbackIdSchema.optional(),
  }),
  z.object({
    type: z.literal("accept_verification"),
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  z.object({
    type: z.literal("reject_verification"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  z.object({
    type: z.literal("withdraw"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
  z.object({
    type: z.literal("reopen"),
    note: feedbackTransitionNoteSchema,
    administrativeTakeover: administrativeTakeoverSchema.optional(),
  }),
]);

export const feedbackFollowUpInputSchema = z.object({
  expectedVersion: feedbackVersionSchema,
  comment: z.object({
    body: z.string().trim().min(1),
    parentMessageId: z.string().trim().min(1).optional(),
    replyToMessageId: z.string().trim().min(1).optional(),
  }).strict().optional(),
  assigneeUserId: feedbackUserIdSchema.nullable().optional(),
  transition: feedbackFollowUpTransitionSchema.optional(),
}).strict().refine(
  (input) => input.comment !== undefined || input.assigneeUserId !== undefined || input.transition !== undefined,
  { message: "Feedback follow-up must contain a comment, assignee change, or lifecycle transition" },
);

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
export type FeedbackSubscriptionMode = z.infer<typeof feedbackSubscriptionModeSchema>;
export type FeedbackSubscriptionMutationMode = z.infer<typeof feedbackSubscriptionMutationModeSchema>;
export type FeedbackTransitionType = z.infer<typeof feedbackTransitionTypeSchema>;
export type FeedbackActivityType = z.infer<typeof feedbackActivityTypeSchema>;
export type FeedbackLifecycleSnapshot = z.infer<typeof feedbackLifecycleSnapshotSchema>;
export type FeedbackActorSnapshot = z.infer<typeof feedbackActorSnapshotSchema>;
export type FeedbackImportActor = FeedbackActorSnapshot;
export type FeedbackEntitySnapshot = z.infer<typeof feedbackEntitySnapshotSchema>;
export type FeedbackTransitionInput = z.infer<typeof feedbackTransitionInputSchema>;
export type FeedbackFollowUpInput = z.infer<typeof feedbackFollowUpInputSchema>;
export type FeedbackFollowUpTransition = z.infer<typeof feedbackFollowUpTransitionSchema>;
export type FeedbackRelationDraft = z.infer<typeof feedbackRelationDraftSchema>;
export type FeedbackCapabilities = z.infer<typeof feedbackCapabilitiesSchema>;
