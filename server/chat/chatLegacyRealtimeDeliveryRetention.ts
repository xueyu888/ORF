import type { FastifyBaseLogger } from "fastify";
import { pool } from "../db/client";

const RETENTION_SWEEP_INTERVAL_MS = 60 * 60_000;

export async function purgeExpiredLegacyRealtimeDeliveries() {
  const result = await pool.query("DELETE FROM chat_legacy_realtime_deliveries WHERE purge_after <= now()");
  return result.rowCount ?? 0;
}

export function startLegacyRealtimeDeliveryRetention(log: FastifyBaseLogger) {
  const sweep = () => void purgeExpiredLegacyRealtimeDeliveries()
    .then((deletedCount) => {
      if (deletedCount > 0) log.info({ deletedCount }, "Purged expired legacy realtime delivery diagnostics");
    })
    .catch((error) => log.warn({ err: error }, "Legacy realtime delivery retention sweep failed"));
  sweep();
  const timer = setInterval(sweep, RETENTION_SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
