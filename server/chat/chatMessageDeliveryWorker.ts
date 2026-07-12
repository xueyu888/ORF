import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import {
  claimChatMessageDeliveries,
  completeChatMessageDelivery,
  failChatMessageDelivery,
  oldestPendingChatMessageDeliveryAgeMs,
} from "./chatMessageDeliveryOutbox";
import {
  CHAT_MESSAGE_DELIVERY_BATCH_SIZE,
  CHAT_MESSAGE_DELIVERY_CONCURRENCY,
  normalizeChatMessageDeliveryResult,
  type ChatMessageDeliveryClaim,
  type ChatMessageDeliveryResult,
} from "./chatMessageDeliveryModel";

type DeliveryWorkerDependencies = {
  claim: (limit: number) => Promise<ChatMessageDeliveryClaim[]>;
  complete: (claim: ChatMessageDeliveryClaim, result: ChatMessageDeliveryResult) => Promise<boolean>;
  deliver: (claim: ChatMessageDeliveryClaim) => Promise<ChatMessageDeliveryResult>;
  fail: (
    claim: ChatMessageDeliveryClaim,
    error: unknown,
  ) => Promise<{ persisted: boolean; status: "dead_letter" | "retry_scheduled" }>;
  onBatch?: (result: ChatMessageDeliveryWorkerBatchResult) => void;
  onError?: (error: unknown, claim?: ChatMessageDeliveryClaim) => void;
};

export type ChatMessageDeliveryWorkerBatchResult = {
  attempted: number;
  completed: number;
  deadLettered: number;
  retryScheduled: number;
};

const waitForNextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createChatMessageDeliveryWorker(
  dependencies: DeliveryWorkerDependencies,
  options: { batchSize?: number; concurrency?: number } = {},
) {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? CHAT_MESSAGE_DELIVERY_BATCH_SIZE));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? CHAT_MESSAGE_DELIVERY_CONCURRENCY));
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
        let claims: ChatMessageDeliveryClaim[];
        try {
          claims = await dependencies.claim(batchSize);
        } catch (error) {
          dependencies.onError?.(error);
          continue;
        }
        const result: ChatMessageDeliveryWorkerBatchResult = {
          attempted: claims.length,
          completed: 0,
          deadLettered: 0,
          retryScheduled: 0,
        };
        for (let index = 0; index < claims.length; index += concurrency) {
          await Promise.all(claims.slice(index, index + concurrency).map(async (claim) => {
            let deliveryResult: ChatMessageDeliveryResult;
            try {
              deliveryResult = normalizeChatMessageDeliveryResult(await dependencies.deliver(claim));
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
              return;
            }
            try {
              const persisted = await dependencies.complete(claim, deliveryResult);
              if (persisted) result.completed += 1;
            } catch (persistenceError) {
              // Keep the claim in processing so the lease can recover it. A
              // transport success must not be rewritten as a transport failure.
              dependencies.onError?.(persistenceError, claim);
            }
          }));
        }
        dependencies.onBatch?.(result);
        if (claims.length === batchSize) requested = true;
        if (requested && !stopped) await waitForNextTurn();
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
    if (!runPromise) {
      runPromise = Promise.resolve().then(run);
    }
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

let activeWorker: ReturnType<typeof createChatMessageDeliveryWorker> | null = null;

export function wakeChatMessageDeliveryWorker() {
  activeWorker?.request();
}

export function startChatMessageDeliveryWorker(
  log: FastifyBaseLogger,
  deliver: (claim: ChatMessageDeliveryClaim) => Promise<ChatMessageDeliveryResult>,
) {
  if (activeWorker) return async () => undefined;
  const worker = createChatMessageDeliveryWorker({
    claim: claimChatMessageDeliveries,
    complete: completeChatMessageDelivery,
    deliver,
    fail: failChatMessageDelivery,
    onBatch: (result) => {
      if (result.attempted > 0) log.info(result, "Processed chat message delivery queue");
    },
    onError: (error, claim) => {
      if (claim) log.warn({ err: error, ...claim }, "Chat message delivery attempt failed");
      else log.warn({ err: error }, "Chat message delivery queue claim failed");
    },
  });
  activeWorker = worker;
  worker.request();
  const timer = setInterval(() => worker.request(), env.ORF_CHAT_DELIVERY_RETRY_INTERVAL_MS);
  const ageTimer = setInterval(() => {
    void oldestPendingChatMessageDeliveryAgeMs()
      .then((oldestPendingAgeMs) => {
        if (oldestPendingAgeMs > 0) log.info({ oldestPendingAgeMs }, "Chat message delivery queue age");
      })
      .catch((error) => log.warn({ err: error }, "Chat message delivery queue age check failed"));
  }, 60_000);
  return async () => {
    clearInterval(timer);
    clearInterval(ageTimer);
    if (activeWorker === worker) activeWorker = null;
    await worker.stop();
  };
}
