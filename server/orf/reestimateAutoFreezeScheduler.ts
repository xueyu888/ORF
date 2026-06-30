import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";
import { freezeOverdueReestimatingObjectives } from "../repositories/orfRepository";

let schedulerStarted = false;

export function startReestimateAutoFreezeScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  let lastBlockedSignature = "";
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await freezeOverdueReestimatingObjectives();
      if (result.frozen > 0) {
        log.info(result, "Auto-froze overdue ORF reestimate objectives");
      }

      const blockedCount = Object.values(result.blocked).reduce((sum, value) => sum + (value ?? 0), 0);
      const blockedSignature = blockedCount > 0 ? JSON.stringify(result.blocked) : "";
      if (blockedSignature && blockedSignature !== lastBlockedSignature) {
        log.warn(result, "Some overdue ORF reestimate objectives could not be auto-frozen");
      }
      lastBlockedSignature = blockedSignature;
    } catch (error) {
      log.warn({ error }, "ORF reestimate auto-freeze scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_REESTIMATE_AUTO_FREEZE_POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
