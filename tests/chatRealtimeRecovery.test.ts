import assert from "node:assert/strict";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import test from "node:test";
import {
  createFeedSnapshot,
  promoteReconciledLatestWindow,
  reconcileFeedLatestWindow,
} from "../src/features/chat/chatModels";
import { chatRealtimeReconciliationScope } from "../src/features/chat/chatRealtimeReconciliation";
import {
  chatFeedViewportModeAfterScroll,
  isChatFeedAtLatest,
  isChatFeedNearLatest,
} from "../src/features/chat/chatFeedScroll";
import {
  buildChatRealtimeRecoveryState,
  createReconciliationCoordinator,
  initialRealtimeConnectionState,
  initialReconciliationState,
  reduceRealtimeConnectionState,
  type ReconciliationState,
} from "../src/features/realtime/realtimeRecoveryModel";
import type { ChatMessage } from "../src/types/orf";
import {
  closeRealtimeConnections,
  realtimeConnectionCount,
  registerRealtimeConnectionCloser,
} from "../server/realtime/realtimeConnectionRegistry";

function message(id: string, createdAt: string): ChatMessage {
  return {
    attachments: [],
    authorName: "发送人",
    authorUserId: "user-1",
    body: id,
    channelId: "channel-1",
    createdAt,
    deletedAt: null,
    deletedBy: null,
    editedAt: null,
    id,
    lastReplyAt: null,
    parentMessageId: null,
    pinnedAt: null,
    pinnedBy: null,
    reactions: [],
    replyCount: 0,
    rootMessageId: null,
    savedByCurrentUser: false,
    source: "user",
    updatedAt: createdAt,
  };
}

test("first realtime open creates an epoch and every reconnect creates a newer epoch", () => {
  const connecting = reduceRealtimeConnectionState(initialRealtimeConnectionState, { type: "connecting" });
  const firstOpen = reduceRealtimeConnectionState(connecting, { at: "2026-07-11T01:00:00.000Z", type: "connected" });
  const disconnected = reduceRealtimeConnectionState(firstOpen, { at: "2026-07-11T01:01:00.000Z", type: "disconnected" });
  const secondOpen = reduceRealtimeConnectionState(disconnected, { at: "2026-07-11T01:02:00.000Z", type: "connected" });

  assert.equal(firstOpen.connectionEpoch, 1);
  assert.equal(firstOpen.status, "connected");
  assert.equal(secondOpen.connectionEpoch, 2);
  assert.equal(secondOpen.status, "connected");
});

test("chat recovery exposes connected, reconciling and ready as one explicit state chain", () => {
  const connected = reduceRealtimeConnectionState(initialRealtimeConnectionState, { type: "connected" });
  assert.deepEqual(buildChatRealtimeRecoveryState(connected, initialReconciliationState), {
    connected: true,
    connectionEpoch: 1,
    error: null,
    reconciledEpoch: 0,
    status: "connected",
  });
  assert.equal(buildChatRealtimeRecoveryState(connected, {
    ...initialReconciliationState,
    reconcilingEpoch: 1,
    status: "reconciling",
  }).status, "reconciling");
  assert.equal(buildChatRealtimeRecoveryState(connected, {
    ...initialReconciliationState,
    reconciledEpoch: 1,
    reconcilingEpoch: 1,
    status: "ready",
  }).status, "ready");
});

test("reconciliation is single-flight and runs one trailing request instead of dropping it", async () => {
  const requests: string[] = [];
  const releases: Array<() => void> = [];
  const coordinator = createReconciliationCoordinator({
    onStateChange: () => undefined,
    reconcile: async (request) => {
      requests.push(`${request.epoch}:${request.reason}`);
      await new Promise<void>((resolve) => releases.push(resolve));
    },
  });

  coordinator.request({ epoch: 1, reason: "connection" });
  await waitForImmediate();
  coordinator.request({ epoch: 1, reason: "focus" });
  coordinator.request({ epoch: 1, reason: "realtime-event" });
  assert.deepEqual(requests, ["1:connection"]);
  releases.shift()?.();
  await waitForImmediate();
  assert.deepEqual(requests, ["1:connection", "1:realtime-event"]);
  releases.shift()?.();
  await waitForImmediate();
  assert.equal(coordinator.snapshot().status, "ready");
  coordinator.dispose();
});

test("failed reconciliation remains retryable and advances to ready after retry", async () => {
  const scheduled: Array<() => void> = [];
  const states: ReconciliationState[] = [];
  let attempts = 0;
  const coordinator = createReconciliationCoordinator({
    cancelSchedule: () => undefined,
    onStateChange: (state) => states.push(state),
    reconcile: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
    },
    retryDelaysMs: [10],
    schedule: (run) => {
      scheduled.push(run);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
  });

  coordinator.request({ epoch: 3, reason: "page-mounted" });
  await waitForImmediate();
  assert.equal(coordinator.snapshot().status, "retrying");
  assert.equal(coordinator.snapshot().error, "temporary failure");
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.();
  await waitForImmediate();
  assert.equal(coordinator.snapshot().status, "ready");
  assert.equal(coordinator.snapshot().reconciledEpoch, 3);
  assert.ok(states.some((state) => state.status === "retrying"));
  coordinator.dispose();
});

test("chat realtime events reconcile only the projections they own without feeding read receipts back into thread reads", () => {
  assert.deepEqual(chatRealtimeReconciliationScope("read.changed"), {
    bootstrap: true,
    feed: false,
    thread: false,
  });
  assert.deepEqual(chatRealtimeReconciliationScope("message.created"), {
    bootstrap: true,
    feed: true,
    thread: true,
  });
  assert.deepEqual(chatRealtimeReconciliationScope("reaction.changed"), {
    bootstrap: false,
    feed: true,
    thread: true,
  });
  assert.deepEqual(chatRealtimeReconciliationScope("channel.updated"), {
    bootstrap: true,
    feed: false,
    thread: false,
  });
  assert.deepEqual(chatRealtimeReconciliationScope("typing"), {
    bootstrap: false,
    feed: false,
    thread: false,
  });
});

test("user scrolling upward leaves latest-following mode even inside the near-latest range", () => {
  assert.equal(chatFeedViewportModeAfterScroll({
    atLatest: true,
    currentMode: "followingLatest",
    previousScrollTop: 1_000,
    programmatic: false,
    scrollTop: 990,
  }), "browsingHistory");
});

test("latest-following uses a strict boundary independent from the near-latest UI range", () => {
  const element = {
    clientHeight: 500,
    scrollHeight: 1_000,
    scrollTop: 450,
  } as HTMLElement;
  assert.equal(isChatFeedNearLatest(element), true);
  assert.equal(isChatFeedAtLatest(element), false);
});

test("programmatic scrolling does not redefine user viewport intent", () => {
  assert.equal(chatFeedViewportModeAfterScroll({
    atLatest: true,
    currentMode: "browsingHistory",
    previousScrollTop: 500,
    programmatic: true,
    scrollTop: 900,
  }), "browsingHistory");
  assert.equal(chatFeedViewportModeAfterScroll({
    atLatest: true,
    currentMode: "browsingHistory",
    previousScrollTop: 900,
    programmatic: false,
    scrollTop: 1_000,
  }), "followingLatest");
});

test("history feed reconciles latest data without replacing the visible reading window", () => {
  const historical = createFeedSnapshot({
    hasNewerMessages: true,
    messages: [message("old-1", "2026-07-11T01:00:00.000Z")],
    windowKind: "context",
  });
  const latest = [
    message("new-1", "2026-07-11T02:00:00.000Z"),
    message("new-2", "2026-07-11T02:01:00.000Z"),
  ];

  const reconciliation = reconcileFeedLatestWindow(historical, latest);
  assert.equal(reconciliation.visibleMessagesChanged, false);
  assert.equal(reconciliation.newMessageCount, 2);
  assert.deepEqual(reconciliation.snapshot.messages.map((item) => item.id), ["old-1"]);
  assert.deepEqual(reconciliation.snapshot.latestWindowMessages.map((item) => item.id), ["new-1", "new-2"]);

  const promoted = promoteReconciledLatestWindow(reconciliation.snapshot);
  assert.deepEqual(promoted?.messages.map((item) => item.id), ["new-1", "new-2"]);
  assert.equal(promoted?.hasNewerMessages, false);
});

test("latest feed merges recovered messages by message id without duplicates", () => {
  const current = createFeedSnapshot({
    messages: [message("message-1", "2026-07-11T01:00:00.000Z")],
    windowKind: "latest",
  });
  const reconciliation = reconcileFeedLatestWindow(current, [
    message("message-1", "2026-07-11T01:00:00.000Z"),
    message("message-2", "2026-07-11T01:01:00.000Z"),
  ]);

  assert.equal(reconciliation.visibleMessagesChanged, true);
  assert.equal(reconciliation.newMessageCount, 1);
  assert.deepEqual(reconciliation.snapshot.messages.map((item) => item.id), ["message-1", "message-2"]);
  assert.equal(reconciliation.snapshot.hasNewerMessages, false);
});

test("backend shutdown closes every registered realtime stream exactly once", () => {
  const closed: string[] = [];
  const unregisterFirst = registerRealtimeConnectionCloser(() => closed.push("first"));
  registerRealtimeConnectionCloser(() => closed.push("second"));
  assert.equal(realtimeConnectionCount(), 2);
  assert.equal(closeRealtimeConnections(), 2);
  assert.deepEqual(closed.sort(), ["first", "second"]);
  assert.equal(realtimeConnectionCount(), 0);
  assert.equal(closeRealtimeConnections(), 0);
  assert.equal(unregisterFirst(), false);
});
