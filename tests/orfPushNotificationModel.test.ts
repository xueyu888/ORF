import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceivedPushFallbackNotification,
  orfChatPushChannelId,
  orfClientUpdatePushChannelId,
  orfPushFallbackSource,
  targetPathFromPushNotificationExtra,
} from "../src/features/push/orfPushNotificationModel";
import {
  chatMessageNativeNotificationPresentationKey,
  releaseNativeNotificationPresentation,
  reserveNativeNotificationPresentation,
  type NativeNotificationPresentationStorage,
} from "../src/features/notifications/nativeNotificationPresentationDedupe";

class MemoryNotificationPresentationStorage implements NativeNotificationPresentationStorage {
  readonly items = new Map<string, string>();

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

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
  assert.equal(typeof fallback?.extra.presentationKey, "string");
  assert.equal(fallback?.title, "ORF 聊天消息");
  assert.equal(fallback?.body, "你有新的聊天消息。");
  assert.equal(typeof fallback?.id, "number");
});

test("push fallback uses message id as the chat notification presentation key", () => {
  const first = buildReceivedPushFallbackNotification(
    {
      body: "你有新的聊天消息。",
      data: { kind: "chat.message.created", messageId: "message-1", targetPath: "/chat/channel-1?message=message-1" },
      title: "ORF 聊天消息",
    },
    { documentFocused: false, visibilityState: "hidden" },
  );
  const second = buildReceivedPushFallbackNotification(
    {
      body: "不同预览文案",
      data: { kind: "chat.message.created", messageId: "message-1", targetPath: "/chat/channel-1?message=message-1" },
      title: "不同标题",
    },
    { documentFocused: false, visibilityState: "hidden" },
  );

  const key = chatMessageNativeNotificationPresentationKey("message-1");
  assert.equal(first?.presentationKey, key);
  assert.equal(first?.extra.presentationKey, key);
  assert.equal(first?.extra.messageId, "message-1");
  assert.equal(first?.id, second?.id);
});

test("native notification presentation reserves one visible notification per key", () => {
  const storage = new MemoryNotificationPresentationStorage();
  const key = chatMessageNativeNotificationPresentationKey("message-1");

  assert.equal(chatMessageNativeNotificationPresentationKey("bad key"), null);
  assert.deepEqual(reserveNativeNotificationPresentation({ key: null, nowMs: 1000, storage }), {
    reason: "missing_key",
    status: "not_tracked",
  });
  assert.equal(reserveNativeNotificationPresentation({ key, nowMs: 1000, storage }).status, "reserved");
  assert.equal(reserveNativeNotificationPresentation({ key, nowMs: 1001, storage }).status, "duplicate");

  releaseNativeNotificationPresentation({ key, nowMs: 1002, storage });
  assert.equal(reserveNativeNotificationPresentation({ key, nowMs: 1003, storage }).status, "reserved");
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
