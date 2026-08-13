import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  buildChatRealtimeAttentionIntent,
  buildChatNativeNotificationDecision,
} from "../src/features/chat/chatNativeNotificationModel";
import {
  chatNotificationPreviewText,
  stripChatNotificationMarkdown,
} from "../src/domain/chatNotificationPresentation";
import {
  appAttentionStateFromBrowserDocument,
  appAttentionStateFromDesktopWindow,
} from "../src/features/interaction/appAttentionState";
import {
  attentionToastIntentFromNotification,
  attentionToastIntentFromWorkLogReminder,
  buildAttentionState,
} from "../src/features/attention/attentionModel";
import { chatPresenceBadgeState, chatPresenceState, formatPresence, isChatUserOnline } from "../src/features/chat/chatPresence";
import {
  connectRealtimePresence,
  disconnectRealtimePresence,
  PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS,
  recordRealtimePresenceActivity,
  resolveRealtimeUserPresence,
} from "../server/realtime/presenceRegistry";
import type { AppNotification, ChatMessage, ChatUnreadSummary, ChatUser, WorkLogReminderState } from "../src/types/orf";
import type { ChatRealtimeEvent } from "../src/types/realtime";

const require = createRequire(import.meta.url);
const { windowsNotificationToastXml } = require("../clients/desktop/notification-renderer.cjs") as {
  windowsNotificationToastXml: (input: {
    activationArguments: string;
    avatarAlt?: string;
    avatarImageUri?: string;
    body: string;
    title: string;
  }) => string;
};
const { createTrayIconRgba } = require("../clients/desktop/icon-renderer.cjs") as {
  createTrayIconRgba: (width: number, height: number, options: {
    pulse?: boolean;
    state?: "attention" | "normal" | "unread";
    unreadCount?: number;
  }) => Buffer;
};

const currentUserId = "user-current";
const authorUserId = "user-author";

function changedPixelRatio(first: Buffer, second: Buffer, size: number, insetRatio = 0) {
  let changed = 0;
  let compared = 0;
  const inset = Math.floor(size * insetRatio);
  for (let y = inset; y < size - inset; y += 1) {
    for (let x = inset; x < size - inset; x += 1) {
      const offset = (y * size + x) * 4;
      const difference = Math.abs(first[offset] - second[offset])
        + Math.abs(first[offset + 1] - second[offset + 1])
        + Math.abs(first[offset + 2] - second[offset + 2])
        + Math.abs(first[offset + 3] - second[offset + 3]);
      compared += 1;
      if (difference > 30) changed += 1;
    }
  }
  return changed / compared;
}

function opaquePixelBounds(buffer: Buffer, size: number) {
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (buffer[(y * size + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    height: maxY >= minY ? maxY - minY + 1 : 0,
    width: maxX >= minX ? maxX - minX + 1 : 0,
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

function chatUser(overrides: Partial<ChatUser> = {}): ChatUser {
  return {
    id: "user-presence",
    name: "在线测试",
    email: "presence@example.test",
    role: "member",
    status: "active",
    lastOnlineAt: null,
    presence: {
      active: false,
      connected: false,
      lastActiveAt: null,
      online: false,
      source: "unknown",
      state: "offline",
    },
    ...overrides,
  };
}

function chatUnreadSummary(overrides: Partial<ChatUnreadSummary> = {}): ChatUnreadSummary {
  return {
    actionableMessageUnreadCount: 0,
    ackRequiredCount: 0,
    directMessageUnreadCount: 0,
    mainMentionCount: 0,
    mentionCount: 0,
    messageUnreadCount: 0,
    nextTarget: null,
    threadMentionCount: 0,
    threadUnreadCount: 0,
    totalUnreadCount: 0,
    unreadChannelCount: 0,
    ...overrides,
  };
}

function attentionNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    actorAvatarUrl: `/api/users/${authorUserId}/avatar`,
    actorName: "系统",
    actorUserId: authorUserId,
    body: "请处理这条反馈",
    createdAt: "2026-06-07T09:30:00.000Z",
    attentionLevel: "action_required",
    deliveryClass: "direct",
    id: "notification-1",
    kind: "feedback.assignee.changed",
    metadata: {},
    readAt: null,
    recipientReasons: ["action_required"],
    recipientUserId: currentUserId,
    replyTargetId: "feedback-1",
    replyTargetType: "feedback",
    stream: "personalNotification",
    targetHref: "/feedback/feedback-1",
    targetId: "feedback-1",
    targetType: "feedback",
    title: "反馈指派给你",
    ...overrides,
  };
}

function attentionInput(overrides: Partial<Parameters<typeof buildAttentionState>[0]> = {}): Parameters<typeof buildAttentionState>[0] {
  return {
    appAttentionState: { activelyViewed: false, source: "browser-document" },
    authenticated: true,
    chatRealtimeAttentionIntents: [],
    chatUnreadSummary: chatUnreadSummary(),
    currentPath: "/tasks",
    currentUserId,
    notifications: [],
    workLogReminderState: null,
    ...overrides,
  };
}

function workLogReminderState(overrides: Partial<WorkLogReminderState> = {}): WorkLogReminderState {
  return {
    id: "worklog-reminder-1",
    lastRemindedAt: null,
    missingDates: ["2026-08-03", "2026-08-04"],
    nextRemindAt: null,
    requiredDates: ["2026-08-03", "2026-08-04"],
    resolvedAt: null,
    shouldRemindNow: true,
    snoozeCount: 0,
    status: "active",
    updatedAt: "2026-08-04T09:30:00.000Z",
    windowEndDate: "2026-08-04",
    windowStartDate: "2026-08-03",
    ...overrides,
  };
}

function realtimeEvent(overrides: Partial<ChatRealtimeEvent> = {}): ChatRealtimeEvent {
  return {
    id: "event-1",
    kind: "chat.event",
    createdAt: "2026-06-07T09:30:00.000Z",
    eventType: "message.created",
    channelId: "channel-1",
    actorUserId: authorUserId,
    attention: {
      reason: "direct",
      targetPath: "/chat/channel-1?message=message-1",
    },
    messageId: "message-1",
    notification: {
      body: "吴禹志: 请看这个方案",
      sender: {
        avatarUrl: `/api/users/${authorUserId}/avatar`,
        name: "吴禹志",
        userId: authorUserId,
      },
      targetPath: "/chat/channel-1?message=message-1",
      title: "项目沟通",
    },
    rootMessageId: null,
    ...overrides,
  };
}

test("chat native notification skips own messages", () => {
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent({ actorUserId: currentUserId }),
    focus: { appFocused: false },
  });
  assert.deepEqual(decision, { action: "skip", reason: "own_message" });
});

test("chat native notification skips recipients whose server event has no notification intent", () => {
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent({ notification: undefined }),
    focus: { appFocused: false },
  });
  assert.deepEqual(decision, { action: "skip", reason: "missing_notification" });
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

test("chat realtime direct-message intent flashes immediately before durable unread reconciliation", () => {
  const intent = buildChatRealtimeAttentionIntent({
    currentUserId,
    event: realtimeEvent(),
    focus: { appFocused: false },
  });
  assert.ok(intent);

  const state = buildAttentionState(attentionInput({
    chatRealtimeAttentionIntents: [intent],
  }));
  assert.equal(state.level, "flash");
  assert.equal(state.count, 1);
  assert.equal(state.badgeCount, 1);
  assert.equal(state.items[0]?.kind, "chat.direct");
  assert.equal(state.latestTargetPath, "/chat/channel-1?message=message-1");
});

test("chat realtime intent hands over to durable unread without double counting", () => {
  const intent = buildChatRealtimeAttentionIntent({
    currentUserId,
    event: realtimeEvent(),
    focus: { appFocused: false },
  });
  assert.ok(intent);

  const state = buildAttentionState(attentionInput({
    chatRealtimeAttentionIntents: [intent],
    chatUnreadSummary: chatUnreadSummary({
      actionableMessageUnreadCount: 1,
      directMessageUnreadCount: 1,
      messageUnreadCount: 1,
      nextTarget: {
        channelId: "channel-1",
        messageId: "message-1",
        reason: "direct",
        surface: "main",
        targetPath: "/chat/channel-1?message=message-1",
      },
      totalUnreadCount: 1,
      unreadChannelCount: 1,
    }),
  }));
  assert.equal(state.count, 1);
  assert.equal(state.badgeCount, 1);
  assert.equal(state.items.filter((item) => item.kind === "chat.direct").length, 1);
});

test("required chat acknowledgement keeps ORF flashing until explicitly answered", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      ackRequiredCount: 1,
      nextTarget: {
        channelId: "channel-1",
        messageId: "message-1",
        reason: "ack_required",
        surface: "main",
        targetPath: "/chat/channel-1?message=message-1",
      },
    }),
  }));

  assert.equal(state.level, "flash");
  assert.equal(state.count, 1);
  assert.equal(state.badgeCount, 1);
  assert.equal(state.items[0]?.kind, "chat.ack");
  assert.equal(state.latestTargetPath, "/chat/channel-1?message=message-1");
});

test("chat realtime strong attention respects an actively viewed direct conversation", () => {
  const intent = buildChatRealtimeAttentionIntent({
    currentUserId,
    event: realtimeEvent(),
    focus: { activeChannelId: "channel-1", appFocused: true },
  });
  assert.equal(intent, null);
});

test("muted direct messages suppress Toast but retain realtime tray attention", () => {
  const event = realtimeEvent({ notification: undefined });
  const nativeDecision = buildChatNativeNotificationDecision({
    currentUserId,
    event,
    focus: { appFocused: false },
  });
  assert.deepEqual(nativeDecision, { action: "skip", reason: "missing_notification" });

  const intent = buildChatRealtimeAttentionIntent({
    currentUserId,
    event,
    focus: { appFocused: false },
  });
  assert.equal(intent?.kind, "chat.direct");
  assert.equal(intent?.body, "你有一条新的私聊消息");
});

test("lightweight realtime wakeup can notify without carrying a second chat projection", () => {
  const decision = buildChatNativeNotificationDecision({
    currentUserId,
    event: realtimeEvent({
      notification: {
        body: "吴禹志: 请看这个方案",
        sender: {
          avatarUrl: `/api/users/${authorUserId}/avatar`,
          name: "吴禹志",
          userId: authorUserId,
        },
        targetPath: "/chat/channel-1?message=message-1",
        title: "项目沟通",
      },
    }),
    focus: { appFocused: false },
  });
  assert.equal(decision.action, "notify");
  if (decision.action === "notify") {
    assert.equal(decision.notification.messageId, "message-1");
    assert.equal(decision.notification.targetPath, "/chat/channel-1?message=message-1");
    assert.deepEqual(decision.notification.sender, {
      avatarUrl: `/api/users/${authorUserId}/avatar`,
      name: "吴禹志",
      userId: authorUserId,
    });
  }
});

test("system attention Toast carries the actor avatar projection", () => {
  const notification = attentionNotification();
  const intent = attentionToastIntentFromNotification({
    appAttentionState: { activelyViewed: false, source: "browser-document" },
    currentPath: "/tasks",
    currentUserId,
    notification,
  });
  assert.deepEqual(intent?.sender, {
    avatarUrl: `/api/users/${authorUserId}/avatar`,
    name: "系统",
    userId: authorUserId,
  });
});

test("Windows Toast renderer uses one escaped circular sender-avatar contract", () => {
  const xml = windowsNotificationToastXml({
    activationArguments: "orf-chat-notification?targetPath=%2Fchat%2F1&message=2",
    avatarAlt: '吴<&"',
    avatarImageUri: "file:///C:/Temp/avatar&1.png",
    body: "正文 <待处理>",
    title: "项目 & 沟通",
  });
  assert.match(xml, /placement="appLogoOverride"/);
  assert.match(xml, /hint-crop="circle"/);
  assert.match(xml, /src="file:\/\/\/C:\/Temp\/avatar&amp;1\.png"/);
  assert.match(xml, /alt="吴&lt;&amp;&quot;"/);
  assert.match(xml, /项目 &amp; 沟通/);
  assert.match(xml, /正文 &lt;待处理&gt;/);
  assert.match(xml, /launch="orf-chat-notification\?targetPath=%2Fchat%2F1&amp;message=2"/);

  const withoutAvatar = windowsNotificationToastXml({
    activationArguments: "orf-attention-notification?targetPath=%2Ftasks",
    body: "提醒",
    title: "ORF",
  });
  assert.doesNotMatch(withoutAvatar, /<image /);
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

test("attention state keeps ordinary chat unread out of workbar while retaining badge count", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      messageUnreadCount: 43,
      nextTarget: {
        channelId: "channel-normal",
        messageId: "message-normal",
        reason: "normal",
        surface: "main",
        targetPath: "/chat/channel-normal?message=message-normal",
      },
      totalUnreadCount: 43,
      unreadChannelCount: 1,
    }),
  }));

  assert.equal(state.count, 0);
  assert.equal(state.badgeCount, 43);
  assert.equal(state.level, "badge");
  assert.equal(state.items.length, 0);
  assert.equal(state.latestTargetPath, "/chat/channel-normal?message=message-normal");
  assert.equal(state.reason, "chat.unread");
});

test("attention state promotes only actionable chat unread into workbar count", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      actionableMessageUnreadCount: 2,
      mainMentionCount: 2,
      mentionCount: 2,
      messageUnreadCount: 5,
      nextTarget: {
        channelId: "channel-mention",
        messageId: "message-mention",
        reason: "mention_me",
        surface: "main",
        targetPath: "/chat/channel-mention?message=message-mention",
      },
      totalUnreadCount: 5,
      unreadChannelCount: 1,
    }),
  }));

  assert.equal(state.count, 2);
  assert.equal(state.badgeCount, 5);
  assert.equal(state.level, "flash");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "chat.mention");
  assert.equal(state.items[0]?.targetPath, "/chat/channel-mention?message=message-mention");
});

test("attention state does not double count a thread mention as both a mention and a followed thread", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      mentionCount: 1,
      nextTarget: {
        channelId: "channel-thread",
        messageId: "reply-mention",
        reason: "mention_me",
        surface: "threadMention",
        targetPath: "/chat/channel-thread?thread=root-1&message=reply-mention",
        threadRootMessageId: "root-1",
      },
      threadMentionCount: 1,
      threadUnreadCount: 1,
      totalUnreadCount: 1,
      unreadChannelCount: 1,
    }),
  }));

  assert.equal(state.count, 1);
  assert.equal(state.badgeCount, 1);
  assert.equal(state.level, "flash");
  assert.equal(state.items.length, 1);
  assert.equal(state.items.some((item) => item.kind === "chat.mention"), true);
});

test("attention state retains one ordinary thread item when there is no thread mention", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      threadUnreadCount: 2,
      nextTarget: {
        channelId: "channel-thread",
        messageId: "reply-normal",
        reason: "normal",
        surface: "threadMention",
        targetPath: "/chat/channel-thread?thread=root-1&message=reply-normal",
        threadRootMessageId: "root-1",
      },
      totalUnreadCount: 2,
      unreadChannelCount: 1,
    }),
  }));

  assert.equal(state.count, 2);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "chat.thread");
});

test("attention state keeps direct messages as actionable chat unread", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      actionableMessageUnreadCount: 3,
      directMessageUnreadCount: 3,
      messageUnreadCount: 4,
      nextTarget: {
        channelId: "channel-direct",
        messageId: "message-direct",
        reason: "direct",
        surface: "main",
        targetPath: "/chat/channel-direct?message=message-direct",
      },
      totalUnreadCount: 4,
      unreadChannelCount: 2,
    }),
  }));

  assert.equal(state.count, 3);
  assert.equal(state.badgeCount, 4);
  assert.equal(state.level, "flash");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "chat.direct");
});

test("attention copy and navigation both follow the same highest-priority unread target", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      actionableMessageUnreadCount: 3,
      directMessageUnreadCount: 1,
      mainMentionCount: 2,
      mentionCount: 2,
      messageUnreadCount: 3,
      nextTarget: {
        channelId: "channel-direct",
        messageId: "message-direct",
        reason: "direct",
        surface: "main",
        targetPath: "/chat/channel-direct?message=message-direct",
      },
      totalUnreadCount: 3,
      unreadChannelCount: 2,
    }),
  }));

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "chat.direct");
  assert.equal(state.items[0]?.body, "1 条私聊消息未读");
  assert.equal(state.items[0]?.targetPath, "/chat/channel-direct?message=message-direct");
  assert.equal(state.latestTargetPath, "/chat/channel-direct?message=message-direct");
});

test("attention state separates notification work items from ordinary chat badge", () => {
  const state = buildAttentionState(attentionInput({
    chatUnreadSummary: chatUnreadSummary({
      messageUnreadCount: 43,
      totalUnreadCount: 43,
      unreadChannelCount: 1,
    }),
    notifications: [attentionNotification()],
  }));

  assert.equal(state.count, 1);
  assert.equal(state.badgeCount, 43);
  assert.equal(state.level, "urgent");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "feedback.assignee.changed");
});

test("work log reminder attention opens the first missing date", () => {
  const reminder = workLogReminderState();
  const state = buildAttentionState(attentionInput({
    workLogReminderState: reminder,
  }));
  const toast = attentionToastIntentFromWorkLogReminder(reminder, {
    appAttentionState: { activelyViewed: false, source: "browser-document" },
    currentPath: "/tasks",
  });

  assert.equal(state.items[0]?.kind, "worklog.reminder");
  assert.equal(state.items[0]?.targetPath, "/work-logs?date=2026-08-03&view=today");
  assert.equal(state.latestTargetPath, "/work-logs?date=2026-08-03&view=today");
  assert.equal(toast?.targetPath, "/work-logs?date=2026-08-03&view=today");
});

test("attention state keeps badge-only system notifications out of workbar", () => {
  const state = buildAttentionState(attentionInput({
    notifications: [attentionNotification({
      id: "notification-badge-1",
      kind: "objective.published",
      stream: "teamAnnouncement",
      targetHref: "/tasks#objective:objective-1",
      targetId: "objective-1",
      targetType: "objective",
      title: "新目标已发布",
    })],
  }));

  assert.equal(state.count, 0);
  assert.equal(state.badgeCount, 1);
  assert.equal(state.level, "badge");
  assert.equal(state.items.length, 0);
  assert.equal(state.latestTargetPath, "/chat/system/personalNotifications");
  assert.equal(state.reason, "notification.unread");
});

test("chat presence display treats only active presence as green online", () => {
  const now = new Date().toISOString();
  const activeUser = chatUser({
    presence: {
      active: true,
      connected: true,
      lastActiveAt: now,
      online: true,
      source: "desktop",
      state: "active",
    },
  });
  assert.equal(chatPresenceState(activeUser), "active");
  assert.equal(chatPresenceBadgeState(chatPresenceState(activeUser)), "online");
  assert.equal(isChatUserOnline(activeUser), true);

  const idleUser = chatUser({
    presence: {
      active: false,
      connected: true,
      lastActiveAt: now,
      online: false,
      source: "desktop",
      state: "idle",
    },
  });
  assert.equal(chatPresenceState(idleUser), "idle");
  assert.equal(chatPresenceBadgeState(chatPresenceState(idleUser)), "away");
  assert.equal(isChatUserOnline(idleUser), false);
  assert.match(formatPresence(idleUser), /^已连接，/);
});

test("realtime presence uses desktop system idle to separate active and idle connected users", () => {
  const teamId = `team-presence-${Date.now()}`;
  const userId = `user-presence-${Date.now()}`;
  const clientId = `client-presence-${Date.now()}`;
  const sessionId = `session-presence-${Date.now()}`;

  connectRealtimePresence({ clientId, sessionId, teamId, userId });
  assert.equal(resolveRealtimeUserPresence({ teamId, userId }).state, "active");

  recordRealtimePresenceActivity({
    activity: {
      clientId,
      source: "desktop",
      systemIdleSeconds: PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS + 1,
      systemIdleState: "idle",
    },
    clientId,
    teamId,
    userId,
  });
  const idlePresence = resolveRealtimeUserPresence({ teamId, userId });
  assert.equal(idlePresence.connected, true);
  assert.equal(idlePresence.active, false);
  assert.equal(idlePresence.state, "idle");

  recordRealtimePresenceActivity({
    activity: {
      clientId,
      source: "desktop",
      systemIdleSeconds: 0,
      systemIdleState: "active",
    },
    clientId,
    teamId,
    userId,
  });
  assert.equal(resolveRealtimeUserPresence({ teamId, userId }).state, "active");

  disconnectRealtimePresence(sessionId);
  const activityBackedPresence = resolveRealtimeUserPresence({ lastOnlineAt: new Date().toISOString(), teamId, userId });
  assert.equal(activityBackedPresence.connected, true);
  assert.equal(activityBackedPresence.state, "active");
});

test("realtime presence uses recent activity heartbeat when event stream session is missing", () => {
  const teamId = `team-activity-presence-${Date.now()}`;
  const userId = `user-activity-presence-${Date.now()}`;
  const clientId = `client-activity-presence-${Date.now()}`;

  const activeActivity = recordRealtimePresenceActivity({
    activity: {
      clientId,
      source: "desktop",
      systemIdleSeconds: 0,
      systemIdleState: "active",
      windowFocused: true,
      windowMinimized: false,
      windowVisible: true,
    },
    clientId,
    teamId,
    userId,
  });
  assert.equal(activeActivity.active, true);
  assert.equal(activeActivity.changed, true);

  const activePresence = resolveRealtimeUserPresence({ teamId, userId });
  assert.equal(activePresence.connected, true);
  assert.equal(activePresence.active, true);
  assert.equal(activePresence.state, "active");
  assert.equal(activePresence.source, "desktop");

  const idleActivity = recordRealtimePresenceActivity({
    activity: {
      clientId,
      source: "desktop",
      systemIdleSeconds: PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS + 1,
      systemIdleState: "idle",
      windowFocused: true,
      windowMinimized: false,
      windowVisible: true,
    },
    clientId,
    teamId,
    userId,
  });
  assert.equal(idleActivity.active, false);
  assert.equal(idleActivity.changed, true);

  const idlePresence = resolveRealtimeUserPresence({ teamId, userId });
  assert.equal(idlePresence.connected, true);
  assert.equal(idlePresence.active, false);
  assert.equal(idlePresence.state, "idle");
});

test("chat native notification suppresses active thread replies only for the open thread", () => {
  const replyEvent = realtimeEvent({
    messageId: "reply-1",
    rootMessageId: "root-1",
    notification: {
      body: "吴禹志: 回复内容",
      targetPath: "/chat/channel-1?thread=root-1&message=reply-1",
      title: "回复：项目沟通",
    },
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
    notification: {
      body: chatNotificationPreviewText(message({ body: "请看 @[薛雨](orf-user:user-current) 的 `PR`：[链接](https://example.test)" })),
      targetPath: "/chat/channel-1?message=message-1",
      title: "吴禹志",
    },
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

test("Win11 attention frames flash the whole high-resolution icon without numeric badges", () => {
  const size = 128;
  const normalFrame = createTrayIconRgba(size, size, { state: "attention", pulse: false });
  const highlightedFrame = createTrayIconRgba(size, size, { state: "attention", pulse: true });
  const legacyCountFrame = createTrayIconRgba(size, size, { state: "attention", pulse: false, unreadCount: 88 });
  const bounds = opaquePixelBounds(normalFrame, size);

  assert.equal(normalFrame.length, size * size * 4);
  assert.equal(highlightedFrame.length, size * size * 4);
  assert.ok(bounds.width >= size * 0.8);
  assert.ok(bounds.height >= size * 0.8);
  assert.equal(normalFrame[3], 0);
  assert.equal(normalFrame[(size - 1) * 4 + 3], 0);
  assert.ok(changedPixelRatio(normalFrame, highlightedFrame, size) > 0.85);
  assert.ok(changedPixelRatio(normalFrame, highlightedFrame, size, 0.15) > 0.95);
  assert.deepEqual(legacyCountFrame, normalFrame);
});

test("Win11 desktop shell uses separate crisp taskbar and tray sizes with no numeric overlay", () => {
  const source = readFileSync(new URL("../clients/desktop/main.cjs", import.meta.url), "utf8");

  assert.match(source, /DESKTOP_TASKBAR_ICON_BITMAP_SIZE = 32/);
  assert.match(source, /DESKTOP_TRAY_ICON_BITMAP_SIZE = 16/);
  assert.match(source, /targetWindow\.setIcon\(createDesktopTaskbarIconImage\(state, pulse\)\)/);
  assert.match(source, /tray\.setImage\(createDesktopTrayIconImage\(state, pulse\)\)/);
  assert.match(source, /targetWindow\.setOverlayIcon\(null, ""\)/);
  assert.doesNotMatch(source, /createUnreadBadgeRgba/);
});

test("Win11 desktop windows wait for their first rendered frame before becoming visible", () => {
  const source = readFileSync(new URL("../clients/desktop/main.cjs", import.meta.url), "utf8");

  assert.match(source, /function createMainWindow[\s\S]*?show: false,[\s\S]*?mainWindow\.once\("ready-to-show", \(\) => revealDesktopWindow\(mainWindow\)\)/);
  assert.match(source, /function driveFilePreviewPopoutBrowserWindowOptions[\s\S]*?show: false,/);
  assert.match(source, /isDriveFilePreviewPopoutUrl\(childUrl\)[\s\S]*?revealDesktopWindowWhenReady\(childWindow\)/);
});

test("Win11 desktop shutdown stops the attention icon timer through its lifecycle owner", () => {
  const source = readFileSync(new URL("../clients/desktop/main.cjs", import.meta.url), "utf8");

  assert.match(source, /app\.on\("before-quit", \(\) => \{[\s\S]*?stopDesktopAttentionIconFlash\(\);/);
  assert.doesNotMatch(source, /stopTrayAttentionFlash/);
});
