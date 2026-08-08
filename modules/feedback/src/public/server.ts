import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  feedbackNotificationEventKindValues,
  type FeedbackNotificationEventKind,
  type FeedbackReferenceSummary,
} from "../contracts";
import {
  createFeedbackReferenceProvider,
  getFeedbackReferences,
  searchFeedbackReferences,
  type FeedbackReferenceDatabase,
} from "../server/references";
import {
  startFeedbackDailyDigestScheduler,
  type FeedbackDailyDigestRuntime,
} from "../server/dailyDigestScheduler";
import {
  startFeedbackNotificationDispatchWorker,
  type FeedbackNotificationDispatchDatabase,
} from "../server/notificationDispatch";
import type {
  FeedbackNotificationPort,
} from "../server/notificationProtocol";

export type FeedbackModuleStop = () => Promise<void> | void;

export interface FeedbackHttpRouteRegistration {
  readonly moduleId: "feedback";
  readonly mountPath: "/api/feedback";
  register(): void;
}

export interface FeedbackHttpRouteRegistry {
  registerRoutes(registration: FeedbackHttpRouteRegistration): void;
}

export interface FeedbackRuntimeTaskRegistration {
  readonly moduleId: "feedback";
  readonly taskId: "daily-digest" | "notification-dispatch";
  start(): FeedbackModuleStop;
}

export interface FeedbackRuntimeLifecycleRegistry {
  registerTask(registration: FeedbackRuntimeTaskRegistration): FeedbackModuleStop;
}

export interface FeedbackCommentTargetRegistration {
  readonly moduleId: "feedback";
  readonly type: "feedback";
  register(): void;
}

export interface FeedbackCommentTargetRegistry {
  registerTarget(registration: FeedbackCommentTargetRegistration): void;
}

export type FeedbackReferenceProviderContribution = ReturnType<typeof createFeedbackReferenceProvider>;

export interface FeedbackReferenceProviderRegistry {
  registerProvider(provider: FeedbackReferenceProviderContribution): void;
}

export interface FeedbackDriveContextReference {
  readonly id: string;
  readonly title: string;
}

export interface FeedbackDriveContextProviderContribution {
  readonly protocolVersion: 1;
  readonly type: "feedback";
  getReferences(input: {
    readonly contextIds: readonly string[];
    readonly storageScopeId: string;
  }): Promise<readonly FeedbackDriveContextReference[]>;
  searchReferences(input: {
    readonly limit?: number;
    readonly query: string;
    readonly storageScopeId: string;
  }): Promise<readonly FeedbackDriveContextReference[]>;
}

export interface FeedbackDriveContextRegistry {
  registerProvider(provider: FeedbackDriveContextProviderContribution): void;
}

export interface FeedbackNotificationPolicyDescriptor {
  readonly kind: string;
  readonly replyTarget: "notification-target" | "metadata-comment-target" | "none";
  readonly stream: "personalNotification";
}

export type FeedbackNotificationAction = {
  readonly href: string;
  readonly label: string;
} | null;

export interface FeedbackNotificationPresentationActionInput {
  readonly body: string;
  readonly kind: string;
  readonly metadata?: Record<string, string> | null;
  readonly targetHref: string;
  readonly targetType: string;
  readonly title: string;
}

export interface FeedbackNotificationPresentationProviderContribution {
  readonly namespace: "feedback";
  readonly kinds: readonly string[];
  policy(kind: string): FeedbackNotificationPolicyDescriptor;
  action(input: FeedbackNotificationPresentationActionInput): FeedbackNotificationAction;
}

export interface FeedbackNotificationPresentationRegistry {
  registerProvider(provider: FeedbackNotificationPresentationProviderContribution): void;
}

export type FeedbackServerDatabase =
  & FeedbackReferenceDatabase
  & FeedbackDailyDigestRuntime["database"]
  & FeedbackNotificationDispatchDatabase
  & Pick<NodePgDatabase<any>, "select">;

export interface FeedbackRequiredPorts {
  readonly backgroundJobs: {
    readonly enabled: boolean;
  };
  readonly commentTarget: {
    register(): void;
  };
  readonly database: FeedbackServerDatabase;
  readonly dailyDigest: {
    readonly config: FeedbackDailyDigestRuntime["config"];
    readonly listActiveRecipients: FeedbackDailyDigestRuntime["listActiveRecipients"];
    readonly publishNotification: FeedbackDailyDigestRuntime["publishNotification"];
  };
  readonly httpRoutes: {
    register(): void;
  };
  readonly log: FeedbackDailyDigestRuntime["log"];
  readonly notificationDispatch: {
    readonly publishNotification: FeedbackNotificationPort;
  };
}

export {
  markFeedbackViewed,
  recordFeedbackCommentCreatedActivity,
} from "../server/activity";
export {
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
  readonly commentTargets: FeedbackCommentTargetRegistry;
  readonly driveContexts: FeedbackDriveContextRegistry;
  readonly http: FeedbackHttpRouteRegistry;
  readonly lifecycle: FeedbackRuntimeLifecycleRegistry;
  readonly notificationKinds: FeedbackNotificationPresentationRegistry;
  readonly ports: FeedbackRequiredPorts;
  readonly references: FeedbackReferenceProviderRegistry;
}

export interface FeedbackPublicQueries {
  readonly protocolVersion: 1;
}

export interface FeedbackModuleHealth {
  readonly id: "feedback";
  readonly ok: boolean;
  readonly stopped: boolean;
}

export interface FeedbackModuleHandle {
  readonly id: "feedback";
  readonly queries: FeedbackPublicQueries;
  health(): Promise<FeedbackModuleHealth>;
  stop(): Promise<void>;
}

export function registerFeedbackServerModule(host: FeedbackServerHost): FeedbackModuleHandle {
  assertFeedbackServerHost(host);
  const taskStops: FeedbackModuleStop[] = [];
  let stopped = false;

  try {
    host.references.registerProvider(createFeedbackReferenceProvider());
    host.driveContexts.registerProvider(createFeedbackDriveContextProvider(host.ports.database));
    host.notificationKinds.registerProvider(createFeedbackNotificationPresentationProvider());
    host.commentTargets.registerTarget({
      moduleId: "feedback",
      type: "feedback",
      register: host.ports.commentTarget.register,
    });
    if (host.ports.backgroundJobs.enabled) {
      taskStops.push(host.lifecycle.registerTask({
        moduleId: "feedback",
        taskId: "daily-digest",
        start: () => startFeedbackDailyDigestScheduler({
          config: host.ports.dailyDigest.config,
          database: host.ports.database,
          listActiveRecipients: host.ports.dailyDigest.listActiveRecipients,
          log: host.ports.log,
          publishNotification: host.ports.dailyDigest.publishNotification,
        }),
      }));
      taskStops.push(host.lifecycle.registerTask({
        moduleId: "feedback",
        taskId: "notification-dispatch",
        start: () => startFeedbackNotificationDispatchWorker({
          database: host.ports.database,
          log: host.ports.log,
          publishNotification: host.ports.notificationDispatch.publishNotification,
        }),
      }));
    }
    host.http.registerRoutes({
      moduleId: "feedback",
      mountPath: "/api/feedback",
      register: host.ports.httpRoutes.register,
    });
  } catch (error) {
    stopFeedbackTasks(taskStops);
    throw error;
  }

  return {
    id: "feedback",
    queries: {
      protocolVersion: 1,
    },
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
      await stopFeedbackTasks(taskStops);
    },
  };
}

function assertFeedbackServerHost(host: FeedbackServerHost) {
  if (host.protocolVersion !== 1) {
    throw new Error("Unsupported feedback server host protocol version.");
  }
  const requiredRegistries: Array<keyof FeedbackServerHost> = [
    "commentTargets",
    "driveContexts",
    "http",
    "lifecycle",
    "notificationKinds",
    "ports",
    "references",
  ];
  for (const key of requiredRegistries) {
    if (!host[key]) {
      throw new Error(`Feedback server host is missing ${key}.`);
    }
  }
}

function createFeedbackDriveContextProvider(database: FeedbackServerDatabase): FeedbackDriveContextProviderContribution {
  return {
    protocolVersion: 1,
    type: "feedback",
    getReferences(input) {
      return getFeedbackReferences(database, {
        feedbackIds: input.contextIds,
        teamId: input.storageScopeId,
      }).then(feedbackDriveContextReferences);
    },
    searchReferences(input) {
      return searchFeedbackReferences(database, {
        limit: input.limit,
        query: input.query,
        teamId: input.storageScopeId,
      }).then(feedbackDriveContextReferences);
    },
  };
}

function feedbackDriveContextReferences(items: readonly FeedbackReferenceSummary[]): readonly FeedbackDriveContextReference[] {
  return items.map((item) => ({ id: item.id, title: item.title }));
}

function createFeedbackNotificationPresentationProvider(): FeedbackNotificationPresentationProviderContribution {
  return {
    namespace: "feedback",
    kinds: feedbackNotificationEventKindValues,
    policy(kind) {
      return {
        kind: assertFeedbackNotificationKind(kind),
        replyTarget: kind === "feedback.assignee.digest" ? "none" : "notification-target",
        stream: "personalNotification",
      };
    },
    action(input) {
      return {
        href: input.targetHref,
        label: feedbackNotificationActionLabel(assertFeedbackNotificationKind(input.kind)),
      };
    },
  };
}

const feedbackNotificationKindSet = new Set<string>(feedbackNotificationEventKindValues);

function assertFeedbackNotificationKind(kind: string): FeedbackNotificationEventKind {
  if (!feedbackNotificationKindSet.has(kind)) {
    throw new Error(`Unsupported feedback notification kind ${kind}.`);
  }
  return kind as FeedbackNotificationEventKind;
}

function feedbackNotificationActionLabel(kind: FeedbackNotificationEventKind) {
  if (kind === "feedback.comment.created") return "打开评论";
  if (kind === "feedback.assignee.digest") return "打开反馈列表";
  return "打开反馈";
}

async function stopFeedbackTasks(taskStops: readonly FeedbackModuleStop[]) {
  for (const stop of [...taskStops].reverse()) {
    await stop();
  }
}
