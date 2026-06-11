import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceivedPushFallbackNotification,
  orfChatPushChannelId,
  orfClientUpdatePushChannelId,
  orfPushFallbackSource,
  targetPathFromPushNotificationExtra,
} from "../src/features/push/orfPushNotificationModel";

test("push fallback skips focused visible documents", () => {
  const fallback = buildReceivedPushFallbackNotification(
    {
      body: "你有新的聊天消息。",
      data: { kind: "chat.message.created", targetPath: "/chat/channel-1?message=message-1" },
      title: "ORF 聊天消息",
    },
    { documentFocused: true, visibilityState: "visible" },
  );

  assert.equal(fallback, null);
});

test("push fallback schedules hidden chat notifications on the chat channel", () => {
  const fallback = buildReceivedPushFallbackNotification(
    {
      body: "你有新的聊天消息。",
      data: { kind: "chat.message.created", targetPath: "/chat/channel-1?message=message-1" },
      title: "ORF 聊天消息",
    },
    { documentFocused: false, visibilityState: "hidden" },
  );

  assert.equal(fallback?.channelId, orfChatPushChannelId);
  assert.equal(fallback?.extra.source, orfPushFallbackSource);
  assert.equal(fallback?.extra.targetPath, "/chat/channel-1?message=message-1");
  assert.equal(fallback?.title, "ORF 聊天消息");
  assert.equal(fallback?.body, "你有新的聊天消息。");
  assert.equal(typeof fallback?.id, "number");
});

test("push fallback routes client updates to the update channel", () => {
  const fallback = buildReceivedPushFallbackNotification(
    {
      body: "发现新版 ORF 客户端。",
      data: { kind: "client.update.available", targetPath: "/settings" },
      title: "ORF 客户端更新",
    },
    { documentFocused: false, visibilityState: "hidden" },
  );

  assert.equal(fallback?.channelId, orfClientUpdatePushChannelId);
  assert.equal(fallback?.extra.targetPath, "/settings");
});

test("push fallback normalizes unsafe target paths", () => {
  const fallback = buildReceivedPushFallbackNotification(
    {
      body: "测试通知",
      data: { kind: "diagnostic.push", targetPath: "//evil.test" },
      title: "ORF Push 测试",
    },
    { documentFocused: false, visibilityState: "hidden" },
  );

  assert.equal(fallback?.extra.targetPath, "/");
  assert.equal(targetPathFromPushNotificationExtra(fallback?.extra), "/");
});
