import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import { deliverChatMessageDelivery } from "../repositories/chatRepository";
import { flushChatMessageDeliveries } from "./chatMessageDeliveryOutbox";

let schedulerStarted = false;

export function startChatMessageDeliveryScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted) return () => undefined;
  schedulerStarted = true;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await flushChatMessageDeliveries({
        deliver: deliverChatMessageDelivery,
        onError: (error, claim) => log.warn({ err: error, ...claim }, "Chat message delivery failed and was scheduled for retry"),
      });
      if (result.attempted > 0) log.info(result, "Flushed chat message delivery outbox");
    } catch (error) {
      log.warn({ err: error }, "Chat message delivery outbox flush failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_CHAT_DELIVERY_RETRY_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
