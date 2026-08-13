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
export const feedbackSubscriptionModeValues = ["none", "participating", "subscribed", "muted"] as const;
export const feedbackSubscriptionMutationModeValues = ["none", "subscribed", "muted"] as const;
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
