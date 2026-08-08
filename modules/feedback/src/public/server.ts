export type FeedbackModuleStop = () => Promise<void> | void;

export {
  markFeedbackViewed,
  recordFeedbackCommentCreatedActivity,
} from "../server/activity";
export {
  startFeedbackDailyDigestScheduler,
} from "../server/dailyDigestScheduler";
export {
  createFeedbackReferenceProvider,
  getFeedbackCommentNotificationFacts,
  getFeedbackReferences,
  lockFeedbackCommentTarget,
  listFeedbackReferences,
  resolveFeedbackCommentTarget,
  searchFeedbackReferences,
} from "../server/references";
export {
  getFeedbackDashboardSummary,
  getFeedbackReadModelIssue,
  getFeedbackReadModelIssues,
  getFeedbackReadModelListPage,
} from "../server/readModel";
export type { FeedbackReadModelViewer } from "../server/readModelProtocol";
export {
  insertFeedbackNotificationDispatch,
  publishFeedbackNotificationDispatch,
  startFeedbackNotificationDispatchWorker,
} from "../server/notificationDispatch";
export {
  buildFeedbackAssigneeChangedNotificationDispatch,
  buildFeedbackCommentCreatedNotificationDispatch,
  buildFeedbackCreatedNotificationDispatch,
  buildFeedbackLifecycleChangedNotificationDispatch,
} from "../server/notificationDispatchPlans";
export {
  feedbackReportAttachmentResponseContentType,
  getFeedbackReportAttachmentContentFacts,
} from "../server/reportAttachmentContent";
export {
  getFeedbackAssignmentNotificationDispatchRecipients,
  getFeedbackLifecycleNotificationDispatchRecipients,
  getFeedbackOrdinaryNotificationDispatchRecipients,
  getFeedbackSubscriptionMode,
  setFeedbackSubscriptionMode,
} from "../server/subscriptions";
export {
  addFeedbackIssueRelation,
  createFeedbackDraft,
  createFeedbackIssue,
  removeFeedbackIssueRelation,
  transitionFeedbackIssue,
  updateFeedbackIssueAssignee,
  updateFeedbackIssueMetadata,
} from "../server/writeModel";
export {
  commitFeedbackImportBatch,
  preflightFeedbackImport,
} from "../server/transfer";

export interface FeedbackServerHost {
  readonly protocolVersion: 1;
  registerHttpRoutes(): void;
  startDailyDigestScheduler(): FeedbackModuleStop;
  startNotificationDispatchWorker(): FeedbackModuleStop;
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
  const stopNotificationDispatchWorker = host.startNotificationDispatchWorker();
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
      await stopNotificationDispatchWorker();
      await stopDailyDigestScheduler();
    },
  };
}
