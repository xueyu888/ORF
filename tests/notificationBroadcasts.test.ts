import assert from "node:assert/strict";
import { test } from "node:test";
import { enqueueSystemBroadcast } from "../src/features/notifications/notificationBroadcasts";
import type { SystemBroadcast } from "../src/types/realtime";

const baseBroadcast: SystemBroadcast = {
  id: "objective-published:objective-1",
  title: "新悬赏发布",
  body: "新的悬赏目标「目标 A」已发布到悬赏大厅。",
  targetHref: "/bounties#objective:objective-1",
  createdAt: "2026-05-29T08:00:00.000Z",
  notificationKind: "objective.published",
  tone: "bounty",
};

test("system broadcast queue is deduplicated by broadcast id", () => {
  const updated = enqueueSystemBroadcast(
    [
      { ...baseBroadcast, id: "objective-published:objective-2", title: "旧悬赏发布" },
      { ...baseBroadcast, body: "旧内容" },
    ],
    baseBroadcast,
  );

  assert.equal(updated.length, 2);
  assert.equal(updated[0]?.id, baseBroadcast.id);
  assert.equal(updated[0]?.body, baseBroadcast.body);
});

test("system broadcast queue keeps the configured visible limit", () => {
  const updated = enqueueSystemBroadcast(
    [
      { ...baseBroadcast, id: "objective-published:objective-1" },
      { ...baseBroadcast, id: "objective-published:objective-2" },
      { ...baseBroadcast, id: "objective-published:objective-3" },
    ],
    { ...baseBroadcast, id: "objective-published:objective-4" },
    2,
  );

  assert.deepEqual(updated.map((item) => item.id), ["objective-published:objective-4", "objective-published:objective-1"]);
});
