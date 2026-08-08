export type FeedbackModuleStop = () => Promise<void> | void;

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
  createFeedbackReferenceProvider,
  getFeedbackCommentNotificationFacts,
  getFeedbackReferences,
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
  getFeedbackReadModelIssue,
  getFeedbackReadModelIssues,
  type FeedbackReadModelActivityItem,
  type FeedbackReadModelDatabase,
  type FeedbackReadModelIssue,
  type FeedbackReadModelRelation,
  type FeedbackReadModelReportAttachment,
  type FeedbackReadModelViewer,
} from "../server/readModel";
export {
  buildFeedbackNotificationDispatchDraft,
  feedbackNotificationRecipient,
  insertFeedbackNotificationDispatch,
  mergeFeedbackNotificationDispatchRecipients,
  publishFeedbackNotificationDispatch,
  publishPendingFeedbackNotificationDispatches,
  startFeedbackNotificationDispatchWorker,
  type FeedbackNotificationAttentionLevel,
  type FeedbackNotificationDeliveryClass,
  type FeedbackNotificationDispatchDatabase,
  type FeedbackNotificationDispatchDraft,
  type FeedbackNotificationDispatchRecipient,
  type FeedbackNotificationPort,
  type FeedbackNotificationPortResult,
  type FeedbackNotificationRecipientReason,
} from "../server/notificationDispatch";
export {
  feedbackReportAttachmentResponseContentType,
  getFeedbackReportAttachmentContentFacts,
  listFeedbackReportAttachmentObjectRefs,
  type FeedbackReportAttachmentContentDatabase,
  type FeedbackReportAttachmentContentDisposition,
  type FeedbackReportAttachmentContentFacts,
  type FeedbackReportAttachmentContentFactsOutcome,
  type FeedbackReportAttachmentObjectRef,
} from "../server/reportAttachmentContent";
export {
  getFeedbackAssignmentNotificationDispatchRecipients,
  getFeedbackOrdinaryNotificationDispatchRecipients,
  getFeedbackSubscriptionMode,
  setFeedbackSubscriptionMode,
  type ExplicitFeedbackSubscriptionMode,
  type FeedbackNotificationRecipientDirectory,
  type FeedbackSubscriptionActor,
  type FeedbackSubscriptionDatabase,
  type FeedbackSubscriptionResult,
} from "../server/subscriptions";
export {
  addFeedbackIssueRelation,
  createFeedbackDraft,
  createFeedbackIssue,
  removeFeedbackIssueRelation,
  transitionFeedbackIssue,
  updateFeedbackIssueAssignee,
  updateFeedbackIssueMetadata,
  type AddFeedbackRelationWriteInput,
  type CreateFeedbackIssueWriteInput,
  type CreateFeedbackIssueWriteResult,
  type FeedbackCommandResult,
  type FeedbackCreateDraft,
  type FeedbackCreateReportAttachmentInput,
  type FeedbackTargetTitleSync,
  type FeedbackTransitionNotificationDispatchContext,
  type FeedbackTransitionNotificationDispatchFactory,
  type FeedbackWriteActor,
  type FeedbackWriteClient,
  type FeedbackWriteDatabase,
  type FeedbackWriteHost,
  type RemoveFeedbackRelationWriteInput,
  type TransitionFeedbackIssueWriteInput,
  type TransitionFeedbackIssueWriteResult,
  type UpdateFeedbackAssigneeWriteInput,
  type UpdateFeedbackAssigneeWriteResult,
  type UpdateFeedbackMetadataWriteInput,
} from "../server/writeModel";
export {
  buildFeedbackBackupZip,
  commitFeedbackImportBatch,
  feedbackBackupZipFileName,
  preflightFeedbackImport,
  type FeedbackBackupAttachmentFile,
  type FeedbackBackupAttachmentKind,
  type FeedbackBackupZipInput,
  type FeedbackImportCommitResult,
  type FeedbackImportFieldDiff,
  type FeedbackImportFieldMapping,
  type FeedbackImportPreflight,
  type FeedbackImportReferenceIssue,
  type FeedbackImportReferenceKind,
  type FeedbackImportReferenceMappings,
  type FeedbackImportResultReport,
  type FeedbackImportSourceKind,
  type FeedbackImportUpdateDiff,
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
