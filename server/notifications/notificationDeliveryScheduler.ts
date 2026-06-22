import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import { flushPendingNotificationChatDeliveries } from "../repositories/notificationRepository";

let schedulerStarted = false;

export function startNotificationDeliveryScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await flushPendingNotificationChatDeliveries();
      if (result.attempted > 0) {
        log.info(result, "Flushed ORF notification chat delivery outbox");
      }
    } catch (error) {
      log.warn({ error }, "ORF notification chat delivery outbox flush failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_NOTIFICATION_DELIVERY_RETRY_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
