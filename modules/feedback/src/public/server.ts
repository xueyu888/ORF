export type FeedbackModuleStop = () => Promise<void> | void;

export {
  feedbackDailyDigestListHref,
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  localFeedbackDailyDigestClock,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
  type FeedbackDailyDigestClock,
  type FeedbackDailyDigestItem,
} from "../server/dailyDigest";
export {
  markFeedbackViewed,
  recordFeedbackCommentCreatedActivity,
  type FeedbackActivityDatabase,
  type FeedbackCommentCreatedActivityInput,
  type FeedbackViewedInput,
  type FeedbackViewedResult,
} from "../server/activity";
export {
  runFeedbackDailyDigestSweep,
  startFeedbackDailyDigestScheduler,
  type FeedbackDailyDigestConfig,
  type FeedbackDailyDigestDatabase,
  type FeedbackDailyDigestLogger,
  type FeedbackDailyDigestNotificationInput,
  type FeedbackDailyDigestRecipient,
  type FeedbackDailyDigestRuntime,
} from "../server/dailyDigestScheduler";
export {
  findFeedbackTeamId,
  getFeedbackCommentNotificationFacts,
  getFeedbackReferences,
  hasFeedbackLinkedToProject,
  hasFeedbackUserReference,
  lockFeedbackCommentTarget,
  listFeedbackReferences,
  resolveFeedbackCommentTarget,
  searchFeedbackReferences,
  type FeedbackCommentNotificationFacts,
  type FeedbackCommentTargetReference,
  type FeedbackReferenceDatabase,
  type FeedbackReferenceSummary,
} from "../server/references";
export {
  getFeedbackReadModelIssues,
  type FeedbackReadModelActivityItem,
  type FeedbackReadModelDatabase,
  type FeedbackReadModelIssue,
  type FeedbackReadModelRelation,
  type FeedbackReadModelReportAttachment,
  type FeedbackReadModelViewer,
} from "../server/readModel";
export {
  getFeedbackAssignmentNotificationRecipients,
  getFeedbackOrdinaryNotificationRecipients,
  getFeedbackSubscriptionMode,
  setFeedbackSubscriptionMode,
  type ExplicitFeedbackSubscriptionMode,
  type FeedbackNotificationRecipientDirectory,
  type FeedbackSubscriptionActor,
  type FeedbackSubscriptionDatabase,
  type FeedbackSubscriptionResult,
} from "../server/subscriptions";

export interface FeedbackServerHost {
  readonly protocolVersion: 1;
  registerHttpRoutes(): void;
  startDailyDigestScheduler(): FeedbackModuleStop;
}

export interface FeedbackModuleHealth {
  readonly id: "feedback";
  readonly ok: boolean;
  readonly stopped: boolean;
}

export interface FeedbackModuleHandle {
  readonly id: "feedback";
  health(): Promise<FeedbackModuleHealth>;
  stop(): Promise<void>;
}

export function registerFeedbackServerModule(host: FeedbackServerHost): FeedbackModuleHandle {
  if (host.protocolVersion !== 1) {
    throw new Error("Unsupported feedback server host protocol version.");
  }

  host.registerHttpRoutes();
  const stopDailyDigestScheduler = host.startDailyDigestScheduler();
  let stopped = false;

  return {
    id: "feedback",
    async health() {
      return {
        id: "feedback",
        ok: !stopped,
        stopped,
      };
    },
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      await stopDailyDigestScheduler();
    },
  };
}
