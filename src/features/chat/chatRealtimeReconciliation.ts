import type { ChatRealtimeEventType } from "../../types/realtime";

export type ChatRealtimeReconciliationScope = {
  readonly bootstrap: boolean;
  readonly feed: boolean;
  readonly thread: boolean;
};

const noReconciliation: ChatRealtimeReconciliationScope = {
  bootstrap: false,
  feed: false,
  thread: false,
};

export function chatRealtimeReconciliationScope(eventType: ChatRealtimeEventType): ChatRealtimeReconciliationScope {
  if (eventType === "typing") return noReconciliation;
  if (eventType === "read.changed") {
    return { bootstrap: true, feed: false, thread: true };
  }
  if (eventType === "message.created") {
    return { bootstrap: true, feed: true, thread: true };
  }
  if (eventType === "message.updated" || eventType === "message.deleted" || eventType === "reaction.changed") {
    return { bootstrap: false, feed: true, thread: true };
  }
  return { bootstrap: true, feed: false, thread: false };
}
