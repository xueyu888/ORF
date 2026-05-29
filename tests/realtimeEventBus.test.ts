import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publishRealtimeSystemBroadcast,
  subscribeRealtimeEvents,
} from "../server/realtime/realtimeEventBus";
import type { RealtimeEvent, SystemBroadcast } from "../src/types/realtime";

const baseBroadcast: SystemBroadcast = {
  id: "objective-published:objective-1",
  title: "新悬赏发布",
  body: "新的悬赏目标「目标 A」已发布到悬赏大厅。",
  targetHref: "/bounties#objective:objective-1",
  createdAt: "2026-05-29T08:00:00.000Z",
  notificationKind: "objective.published",
  tone: "bounty",
};

test("team realtime broadcast skips stale subscribers without blocking healthy clients", () => {
  const teamId = `team-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const received: RealtimeEvent[] = [];
  const unsubscribeStale = subscribeRealtimeEvents({
    id: "stale-client",
    teamId,
    userId: "user-stale",
    send: () => {
      throw new Error("connection closed");
    },
  });
  const unsubscribeHealthy = subscribeRealtimeEvents({
    id: "healthy-client",
    teamId,
    userId: "user-healthy",
    send: (event) => received.push(event),
  });

  assert.doesNotThrow(() => publishRealtimeSystemBroadcast(teamId, baseBroadcast));
  assert.equal(received.length, 1);
  assert.equal(received[0]?.kind, "system.broadcast");

  unsubscribeStale();
  unsubscribeHealthy();
});
