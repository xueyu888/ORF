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
  runFeedbackDailyDigestSweep,
  startFeedbackDailyDigestScheduler,
  type FeedbackDailyDigestConfig,
  type FeedbackDailyDigestDatabase,
  type FeedbackDailyDigestLogger,
  type FeedbackDailyDigestNotificationInput,
  type FeedbackDailyDigestRecipient,
  type FeedbackDailyDigestRuntime,
} from "../server/dailyDigestScheduler";

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
