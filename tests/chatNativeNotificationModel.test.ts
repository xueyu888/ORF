import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatNativeNotificationDecision,
  chatNotificationPreviewText,
  stripChatNotificationMarkdown,
} from "../src/features/chat/chatNativeNotificationModel";
import {
  appAttentionStateFromBrowserDocument,
  appAttentionStateFromDesktopWindow,
} from "../src/features/interaction/appAttentionState";
import type { ChatChannel, ChatMessage } from "../src/types/orf";
import type { ChatRealtimeEvent } from "../src/types/realtime";

const currentUserId = "user-current";
const authorUserId = "user-author";

function channel(overrides: Partial<ChatChannel> = {}): ChatChannel {
  return {
    id: "channel-1",
    type: "private",
    name: "private-channel",
    displayName: "项目沟通",
    purpose: "",
    header: "",
    createdBy: authorUserId,
    createdAt: "2026-06-07T09:00:00.000Z",
    updatedAt: "2026-06-07T09:00:00.000Z",
    archivedAt: null,
    memberCount: 2,
    members: [
      {
        userId: currentUserId,
        role: "member",
        favorite: false,
        muted: false,
        manuallyUnread: false,
        joinedAt: "2026-06-07T09:00:00.000Z",
        lastReadAt: null,
        lastReadMessageId: null,
        lastViewedAt: null,
      },
      {
        userId: authorUserId,
        role: "member",
        favorite: false,
        muted: false,
        manuallyUnread: false,
        joinedAt: "2026-06-07T09:00:00.000Z",
        lastReadAt: null,
        lastReadMessageId: null,
        lastViewedAt: null,
      },
    ],
    unreadCount: 1,
    mentionCount: 0,
    threadUnreadCount: 0,
    lastMessageAt: "2026-06-07T09:30:00.000Z",
    lastMessagePreview: "hello",
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    channelId: "channel-1",
    authorUserId,
    authorName: "吴禹志",
    authorAvatarUrl: null,
    body: "请看 **这个方案**",
    rootMessageId: null,
    parentMessageId: null,
    createdAt: "2026-06-07T09:30:00.000Z",
    updatedAt: "2026-06-07T09:30:00.000Z",
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    pinnedAt: null,
    pinnedBy: null,
    replyCount: 0,
    lastReplyAt: null,
    savedByCurrentUser: false,
    attachments: [],
    reactions: [],
    ...overrides,
  };
}

function realtimeEvent(overrides: Partial<ChatRealtimeEvent> = {}): ChatRealtimeEvent {
  const eventMessage = message(overrides.message);
  return {
    id: "event-1",
    kind: "chat.event",
    createdAt: "2026-06-07T09:30:00.000Z",
    eventType: "message.created",
    channelId: eventMessage.channelId,
    actorUserId: eventMessage.authorUserId,
    channel: channel(),
    message: eventMessage,
    messageId: eventMessage.id,
    rootMessageId: eventMessage.rootMessageId,
    ...overrides,
  };
}

test("chat native notification skips own messages", () => {
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent({ message: message({ authorUserId: currentUserId }) }),
    focus: { appFocused: false },
  });
  assert.deepEqual(decision, { action: "skip", reason: "own_message" });
});

test("chat native notification skips muted channels", () => {
  const mutedChannel = channel({
    members: channel().members.map((member) => (
      member.userId === currentUserId ? { ...member, muted: true } : member
    )),
  });
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent({ channel: mutedChannel }),
    focus: { appFocused: false },
  });
  assert.deepEqual(decision, { action: "skip", reason: "channel_muted" });
});

test("chat native notification suppresses active focused channel but not background channel", () => {
  const activeDecision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent(),
    focus: { activeChannelId: "channel-1", appFocused: true },
  });
  assert.deepEqual(activeDecision, { action: "skip", reason: "active_channel" });

  const backgroundDecision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent(),
    focus: { activeChannelId: "channel-1", appFocused: false },
  });
  assert.equal(backgroundDecision.action, "notify");
});

test("app attention state treats only focused visible browser documents as actively viewed", () => {
  assert.deepEqual(
    appAttentionStateFromBrowserDocument({ documentFocused: true, visibilityState: "visible" }),
    { activelyViewed: true, source: "browser-document" },
  );
  assert.deepEqual(
    appAttentionStateFromBrowserDocument({ documentFocused: false, visibilityState: "visible" }),
    { activelyViewed: false, source: "browser-document" },
  );
  assert.deepEqual(
    appAttentionStateFromBrowserDocument({ documentFocused: true, visibilityState: "hidden" }),
    { activelyViewed: false, source: "browser-document" },
  );
});

test("app attention state treats only focused visible desktop windows as actively viewed", () => {
  assert.deepEqual(
    appAttentionStateFromDesktopWindow({ isFocused: true, isMaximized: false, isMinimized: false, isVisible: true }),
    { activelyViewed: true, source: "desktop-window" },
  );
  assert.deepEqual(
    appAttentionStateFromDesktopWindow({ isFocused: true, isMaximized: false, isMinimized: true, isVisible: true }),
    { activelyViewed: false, source: "desktop-window" },
  );
  assert.deepEqual(
    appAttentionStateFromDesktopWindow({ isFocused: true, isMaximized: false, isMinimized: false, isVisible: false }),
    { activelyViewed: false, source: "desktop-window" },
  );
});

test("chat native notification suppresses active thread replies only for the open thread", () => {
  const replyEvent = realtimeEvent({
    message: message({
      id: "reply-1",
      rootMessageId: "root-1",
      parentMessageId: "root-1",
    }),
  });
  const activeThreadDecision = buildChatNativeNotificationDecision({
    currentUserId,
    event: replyEvent,
    focus: { activeChannelId: "channel-1", activeThreadRootMessageId: "root-1", appFocused: true },
  });
  assert.deepEqual(activeThreadDecision, { action: "skip", reason: "active_thread" });

  const otherThreadDecision = buildChatNativeNotificationDecision({
    currentUserId,
    event: replyEvent,
    focus: { activeChannelId: "channel-1", activeThreadRootMessageId: "root-2", appFocused: true },
  });
  assert.equal(otherThreadDecision.action, "notify");
});

test("chat native notification formats direct message title and markdown-stripped body", () => {
  const directEvent = realtimeEvent({
    channel: channel({ type: "direct", displayName: "吴禹志" }),
    message: message({ body: "请看 @[薛雨](orf-user:user-current) 的 `PR`：[链接](https://example.test)" }),
  });
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: directEvent,
    focus: { appFocused: false },
  });
  assert.equal(decision.action, "notify");
  if (decision.action === "notify") {
    assert.equal(decision.notification.title, "吴禹志");
    assert.equal(decision.notification.body, "请看 @薛雨 的 PR：链接");
    assert.equal(decision.notification.targetPath, "/chat/channel-1?message=message-1");
  }
});

test("chat native notification uses attachment fallback preview", () => {
  assert.equal(
    chatNotificationPreviewText(message({
      body: "",
      attachments: [
        {
          id: "file-1",
          fileName: "image.png",
          mimeType: "image/png",
          fileSize: 42,
          contentUrl: "/file",
          createdAt: "2026-06-07T09:30:00.000Z",
        },
      ],
    })),
    "发送了一张图片",
  );
});

test("stripChatNotificationMarkdown removes common formatting without dropping text", () => {
  assert.equal(
    stripChatNotificationMarkdown("> ## 标题\n- **重点**：`code`\n1. [链接](https://example.test)"),
    "标题 重点：code 链接",
  );
});
