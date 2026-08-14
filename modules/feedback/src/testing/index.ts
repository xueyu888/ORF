import type {
  FeedbackActorSnapshot,
  FeedbackEntitySnapshot,
} from "../contracts/index";
export {
  applyFeedbackTransition,
  canonicalizeFeedbackRelation,
  deriveFeedbackCapabilities,
  validateFeedbackLifecycle,
} from "../domain/index";
export {
  feedbackDailyDigestListHref,
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  localFeedbackDailyDigestClock,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
} from "../server/dailyDigest";
export {
  commitFeedbackImportBatch,
  preflightFeedbackImport,
} from "../server/transfer";
export {
  commitFeedbackFollowUp,
} from "../server/writeModel";
export {
  feedbackServerMinimumPollIntervalMs,
  feedbackServerPollIntervalMs,
} from "../server/polling";
export {
  createFeedbackNotificationPresentationProvider,
} from "../server/notificationPresentation";
export {
  submitFeedbackFollowUp as submitFeedbackFollowUpForTesting,
} from "../web/api";

export function feedbackEntityFixture(
  overrides: Partial<FeedbackEntitySnapshot> = {},
): FeedbackEntitySnapshot {
  return {
    id: "feedback-1",
    teamId: "team-1",
    projectId: "project-1",
    createdByUserId: "reporter-1",
    assigneeUserId: "assignee-1",
    priority: null,
    impact: "medium",
    stage: "open",
    resolution: null,
    version: 0,
    closedAt: null,
    closedByUserId: null,
    visibleUserIds: ["reporter-1", "assignee-1", "member-1", "admin-1"],
    ...overrides,
  };
}

export function feedbackActorFixture(
  overrides: Partial<FeedbackActorSnapshot> = {},
): FeedbackActorSnapshot {
  return {
    id: "member-1",
    teamId: "team-1",
    role: "member",
    status: "active",
    ...overrides,
  };
}
