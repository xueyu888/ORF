import type { FastifyInstance } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
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
} from "../server/notificationDispatch";
import type { FeedbackNotificationPort } from "../server/notificationProtocol";
import {
  createFeedbackServerApplication,
} from "../server/application";
import {
  registerFeedbackHttpRoutes,
} from "../server/httpRoutes";
import {
  createFeedbackCommentTargetAdapter,
  type FeedbackCommentTargetAdapterContribution,
} from "../server/commentTarget";
import {
  createFeedbackNotificationPresentationProvider,
  type FeedbackNotificationPresentationProviderContribution,
} from "../server/notificationPresentation";
import type {
  FeedbackApplicationDatabase,
  FeedbackServerApplicationPorts,
} from "../server/applicationPorts";

type FeedbackModuleStop = () => Promise<void> | void;

interface FeedbackHttpRouteRegistration {
  readonly moduleId: "feedback";
  readonly mountPath: "/api/feedback";
  register(app: FastifyInstance): void;
}

interface FeedbackHttpRouteRegistry {
  registerRoutes(registration: FeedbackHttpRouteRegistration): void;
}

interface FeedbackRuntimeTaskRegistration {
  readonly moduleId: "feedback";
  readonly taskId: "daily-digest" | "notification-dispatch";
  start(): FeedbackModuleStop;
}

interface FeedbackRuntimeLifecycleRegistry {
  registerTask(registration: FeedbackRuntimeTaskRegistration): FeedbackModuleStop;
}

interface FeedbackCommentTargetRegistration {
  readonly moduleId: "feedback";
  readonly adapter: FeedbackCommentTargetAdapterContribution;
  readonly type: "feedback";
}

interface FeedbackCommentTargetRegistry {
  registerTarget(registration: FeedbackCommentTargetRegistration): void;
}

type FeedbackReferenceProviderContribution = ReturnType<typeof createFeedbackReferenceProvider>;

interface FeedbackReferenceProviderRegistry {
  registerProvider(provider: FeedbackReferenceProviderContribution): void;
}

interface FeedbackDriveContextReference {
  readonly id: string;
  readonly title: string;
}

interface FeedbackDriveContextProviderContribution {
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

interface FeedbackDriveContextRegistry {
  registerProvider(provider: FeedbackDriveContextProviderContribution): void;
}

interface FeedbackNotificationPresentationRegistry {
  registerProvider(provider: FeedbackNotificationPresentationProviderContribution): void;
}

type FeedbackServerDatabase = FeedbackApplicationDatabase & FeedbackReferenceDatabase & Pick<NodePgDatabase<any>, "select">;

interface FeedbackRequiredPorts extends FeedbackServerApplicationPorts {
  readonly backgroundJobs: {
    readonly enabled: boolean;
  };
  readonly database: FeedbackServerDatabase;
  readonly dailyDigest: {
    readonly config: FeedbackDailyDigestRuntime["config"];
    readonly listActiveRecipients: FeedbackDailyDigestRuntime["listActiveRecipients"];
    readonly publishNotification: FeedbackDailyDigestRuntime["publishNotification"];
  };
  readonly log: FeedbackDailyDigestRuntime["log"];
  readonly notificationDispatch: {
    readonly publish: FeedbackNotificationPort;
  };
}

interface FeedbackServerHost {
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
  const application = createFeedbackServerApplication(host.ports);

  try {
    host.references.registerProvider(createFeedbackReferenceProvider());
    host.driveContexts.registerProvider(createFeedbackDriveContextProvider(host.ports.database));
    host.notificationKinds.registerProvider(createFeedbackNotificationPresentationProvider());
    host.commentTargets.registerTarget({
      adapter: createFeedbackCommentTargetAdapter(application),
      moduleId: "feedback",
      type: "feedback",
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
          publishNotification: host.ports.notificationDispatch.publish,
        }),
      }));
    }
    host.http.registerRoutes({
      moduleId: "feedback",
      mountPath: "/api/feedback",
      register: (app) => registerFeedbackHttpRoutes(app, application),
    });
  } catch (error) {
    void stopFeedbackTasks(taskStops).catch((stopError) => {
      host.ports.log.warn({ error: errorMessage(stopError) }, "Failed to stop feedback runtime tasks after registration failure.");
    });
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

async function stopFeedbackTasks(taskStops: readonly FeedbackModuleStop[]) {
  for (const stop of [...taskStops].reverse()) {
    await stop();
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
