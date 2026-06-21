import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import { runWorkLogReminderSweep } from "./workLogReminderState";

let schedulerStarted = false;

export function startWorkLogReminderScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_WORK_LOG_REMINDER_ENABLED) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runWorkLogReminderSweep(log);
    } catch (error) {
      log.warn({ error }, "ORF work log reminder scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_WORK_LOG_REMINDER_POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
