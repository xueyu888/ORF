import type { SystemBroadcast } from "../../types/realtime";

export function enqueueSystemBroadcast(items: SystemBroadcast[], broadcast: SystemBroadcast, limit = 3) {
  return [broadcast, ...items.filter((item) => item.id !== broadcast.id)].slice(0, limit);
}
