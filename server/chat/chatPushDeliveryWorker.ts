import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import {
  claimChatPushDeliveries,
  completeChatPushDelivery,
  failChatPushDelivery,
  oldestPendingChatPushDeliveryAgeMs,
} from "./chatPushDeliveryOutbox";
import {
  CHAT_PUSH_DELIVERY_CONCURRENCY,
  normalizeChatPushDeliveryResult,
  type ChatPushDeliveryClaim,
  type ChatPushDeliveryResult,
} from "./chatPushDeliveryModel";

type PushWorkerDependencies = {
  claim: (limit: number) => Promise<ChatPushDeliveryClaim[]>;
  complete: (claim: ChatPushDeliveryClaim, result: ChatPushDeliveryResult) => Promise<boolean>;
  deliver: (claim: ChatPushDeliveryClaim) => Promise<ChatPushDeliveryResult>;
  fail: (claim: ChatPushDeliveryClaim, error: unknown) => Promise<{ persisted: boolean; status: "dead_letter" | "retry_scheduled" }>;
  onBatch?: (result: ChatPushDeliveryWorkerBatchResult) => void;
  onError?: (error: unknown, claim?: ChatPushDeliveryClaim) => void;
};

export type ChatPushDeliveryWorkerBatchResult = {
  attempted: number;
  completed: number;
  deadLettered: number;
  retryScheduled: number;
};

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createChatPushDeliveryWorker(dependencies: PushWorkerDependencies, concurrency = CHAT_PUSH_DELIVERY_CONCURRENCY) {
  const limit = Math.max(1, Math.floor(concurrency));
  let requested = false;
  let running = false;
  let stopped = false;
  let runPromise: Promise<void> | null = null;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (requested && !stopped) {
        requested = false;
        let claims: ChatPushDeliveryClaim[];
        try {
          // Never lease more work than this process can execute immediately.
          claims = await dependencies.claim(limit);
        } catch (error) {
          dependencies.onError?.(error);
          continue;
        }
        const result: ChatPushDeliveryWorkerBatchResult = {
          attempted: claims.length,
          completed: 0,
          deadLettered: 0,
          retryScheduled: 0,
        };
        await Promise.all(claims.map(async (claim) => {
          try {
            const delivered = normalizeChatPushDeliveryResult(await dependencies.deliver(claim));
            if (await dependencies.complete(claim, delivered)) result.completed += 1;
          } catch (error) {
            dependencies.onError?.(error, claim);
            try {
              const decision = await dependencies.fail(claim, error);
              if (decision.persisted) {
                if (decision.status === "dead_letter") result.deadLettered += 1;
                else result.retryScheduled += 1;
              }
            } catch (persistenceError) {
              dependencies.onError?.(persistenceError, claim);
            }
          }
        }));
        dependencies.onBatch?.(result);
        if (claims.length === limit) requested = true;
        if (requested && !stopped) await nextTurn();
      }
    } finally {
      running = false;
      runPromise = null;
      if (requested && !stopped) request();
    }
  };

  const request = () => {
    if (stopped) return;
    requested = true;
    if (!runPromise) runPromise = Promise.resolve().then(run);
  };

  return {
    request,
    async stop() {
      stopped = true;
      requested = false;
      await runPromise;
    },
  };
}

let activeWorker: ReturnType<typeof createChatPushDeliveryWorker> | null = null;

export function wakeChatPushDeliveryWorker() {
  activeWorker?.request();
}

export function startChatPushDeliveryWorker(
  log: FastifyBaseLogger,
  deliver: (claim: ChatPushDeliveryClaim) => Promise<ChatPushDeliveryResult>,
) {
  if (activeWorker) return async () => undefined;
  const worker = createChatPushDeliveryWorker({
    claim: claimChatPushDeliveries,
    complete: completeChatPushDelivery,
    deliver,
    fail: failChatPushDelivery,
    onBatch: (result) => {
      if (result.attempted > 0) log.info(result, "Processed chat push delivery queue");
    },
    onError: (error, claim) => {
      if (claim) log.warn({ err: error, ...claim }, "Chat push delivery attempt failed");
      else log.warn({ err: error }, "Chat push delivery queue claim failed");
    },
  });
  activeWorker = worker;
  worker.request();
  const retryTimer = setInterval(() => worker.request(), env.ORF_CHAT_PUSH_RETRY_INTERVAL_MS);
  const ageTimer = setInterval(() => {
    void oldestPendingChatPushDeliveryAgeMs()
      .then((oldestPendingAgeMs) => {
        if (oldestPendingAgeMs > 0) log.info({ oldestPendingAgeMs }, "Chat push delivery queue age");
      })
      .catch((error) => log.warn({ err: error }, "Chat push delivery queue age check failed"));
  }, 60_000);
  return async () => {
    clearInterval(retryTimer);
    clearInterval(ageTimer);
    if (activeWorker === worker) activeWorker = null;
    await worker.stop();
  };
}
