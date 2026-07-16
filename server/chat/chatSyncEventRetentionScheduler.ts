import type { FastifyBaseLogger } from "fastify";
import { pruneChatSyncEvents } from "./chatSyncRepository";

export const CHAT_SYNC_EVENT_RETENTION_DAYS = 30;
export const CHAT_SYNC_EVENT_MAX_PER_TEAM = 1_000_000;
const CHAT_SYNC_EVENT_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

let schedulerStarted = false;

export function startChatSyncEventRetentionScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted) return () => undefined;
  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await pruneChatSyncEvents({
        maxEventsPerTeam: CHAT_SYNC_EVENT_MAX_PER_TEAM,
        retentionDays: CHAT_SYNC_EVENT_RETENTION_DAYS,
      });
      if (result.expired > 0 || result.overflow > 0) {
        log.info(result, "Pruned retained chat sync events");
      }
    } catch (error) {
      log.warn({ err: error }, "Chat sync event retention cleanup failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), CHAT_SYNC_EVENT_CLEANUP_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
