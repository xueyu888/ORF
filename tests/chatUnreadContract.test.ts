import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chatThreadReadThroughAt,
  resolveThreadMentionRecipientIds,
} from "../server/repositories/chatRepositoryModel";
import {
  buildUnreadAnchor,
  chatUnreadControlKind,
  hasMainFeedUnread,
  resolveUnreadJumpTarget,
  selectChatFeedPrefetchChannelIds,
  upsertChannel,
} from "../src/features/chat/chatModels";
import { buildChatSidebarNavigation } from "../src/features/chat/chatSidebarModel";
import { resolveChatFeedOpenIntent } from "../src/features/chat/chatFeedOpenIntent";
import { getChatUnreadTarget } from "../src/state/apiClient";
import { chatMessageTargetPath } from "../src/domain/chatNavigation";
import type { ChatChannel, ChatMessage, ChatUser } from "../src/types/orf";

const currentUserId = "00000000-0000-4000-8000-000000000001";
const authorUserId = "00000000-0000-4000-8000-000000000002";
const otherUserId = "00000000-0000-4000-8000-000000000003";

function channel(overrides: Partial<ChatChannel> = {}): ChatChannel {
  return {
    archivedAt: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    createdBy: authorUserId,
    displayName: "回归验证频道",
    header: "",
    id: "channel-1",
    lastMessageAt: "2026-07-11T00:01:00.000Z",
    lastMessagePreview: "消息",
    mainMentionCount: 0,
    memberCount: 3,
    members: [currentUserId, authorUserId, otherUserId].map((userId) => ({
      favorite: false,
      joinedAt: "2026-07-11T00:00:00.000Z",
      lastReadAt: "2026-07-11T00:00:00.000Z",
      lastReadMessageId: "message-0",
      lastViewedAt: "2026-07-11T00:00:00.000Z",
      manuallyUnread: false,
      muted: false,
      role: "member",
      userId,
    })),
    mentionCount: 0,
    name: "regression",
    purpose: "",
    threadMentionCount: 0,
    threadReadAt: null,
    threadUnreadCount: 0,
    type: "private",
    unreadCount: 0,
    updatedAt: "2026-07-11T00:01:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    authorName: "发送人",
    authorUserId,
    body: "消息",
    channelId: "channel-1",
    createdAt: "2026-07-11T00:01:00.000Z",
    deletedAt: null,
    deletedBy: null,
    editedAt: null,
    id: "message-1",
    lastReplyAt: null,
    parentMessageId: null,
    pinnedAt: null,
    pinnedBy: null,
    reactions: [],
    replyCount: 0,
    rootMessageId: null,
    savedByCurrentUser: false,
    source: "user",
    updatedAt: "2026-07-11T00:01:00.000Z",
    ...overrides,
  };
}

function user(overrides: Partial<ChatUser> = {}): ChatUser {
  return {
    avatarUrl: null,
    email: "member@example.com",
    id: authorUserId,
    lastOnlineAt: "2026-07-11T00:00:00.000Z",
    name: "成员",
    presence: {
      active: false,
      connected: false,
      lastActiveAt: "2026-07-11T00:00:00.000Z",
      online: false,
      state: "offline",
    },
    role: "member",
    status: "active",
    ...overrides,
  };
}

test("named thread mentions auto-follow only active channel members other than the author", () => {
  assert.deepEqual(resolveThreadMentionRecipientIds({
    authorUserId,
    body: `请看 @[当前用户](orf-user:${currentUserId}) @[外部用户](orf-user:00000000-0000-4000-8000-999999999999)`,
    channelMemberUserIds: [currentUserId, authorUserId, otherUserId],
  }), [currentUserId]);
});

test("broadcast thread mentions auto-follow every other channel member", () => {
  assert.deepEqual(new Set(resolveThreadMentionRecipientIds({
    authorUserId,
    body: "@所有人 请处理这个话题",
    channelMemberUserIds: [currentUserId, authorUserId, otherUserId],
  })), new Set([currentUserId, otherUserId]));
});

test("all chat message entry points share one thread-aware target path", () => {
  assert.equal(chatMessageTargetPath({ channelId: "channel /一", messageId: "message ?1" }), "/chat/channel%20%2F%E4%B8%80?message=message%20%3F1");
  assert.equal(
    chatMessageTargetPath({ channelId: "channel-1", messageId: "reply-1", threadRootMessageId: "root-1" }),
    "/chat/channel-1?thread=root-1&message=reply-1",
  );
});

test("opening a thread advances only through messages returned to the reader", () => {
  const returnedMessages = [
    { createdAt: "2026-07-11T00:01:00.000Z" },
    { createdAt: "2026-07-11T00:03:00.000Z" },
    { createdAt: "2026-07-11T00:02:00.000Z" },
  ];

  const readThroughAt = chatThreadReadThroughAt(returnedMessages);
  assert.equal(readThroughAt, "2026-07-11T00:03:00.000Z");
  assert.ok("2026-07-11T00:04:00.000Z" > (readThroughAt ?? ""));
});

test("thread mentions remain outside the main feed unread contract", () => {
  const anchor = buildUnreadAnchor(channel({
    mentionCount: 2,
    threadMentionCount: 2,
    threadUnreadCount: 1,
  }), currentUserId);

  assert.ok(anchor);
  assert.equal(hasMainFeedUnread(anchor), false);
  assert.equal(resolveUnreadJumpTarget({
    currentUserId,
    hasOlderMessages: false,
    messages: [message()],
    unreadAnchor: anchor,
  }), null);
});

test("unread controls keep main, thread mention and ordinary thread entry points mutually exclusive", () => {
  assert.equal(chatUnreadControlKind({ hasMainTarget: true, threadMentionCount: 3, threadUnreadCount: 4 }), "main");
  assert.equal(chatUnreadControlKind({ hasMainTarget: false, threadMentionCount: 3, threadUnreadCount: 4 }), "threadMention");
  assert.equal(chatUnreadControlKind({ hasMainTarget: false, threadMentionCount: 0, threadUnreadCount: 4 }), "threadInbox");
  assert.equal(chatUnreadControlKind({ hasMainTarget: false, threadMentionCount: 0, threadUnreadCount: 0 }), null);
});

test("main feed unread resolves only to a named main-surface jump target", () => {
  const anchor = buildUnreadAnchor(channel({ mainMentionCount: 1, mentionCount: 1, unreadCount: 1 }), currentUserId);
  const target = resolveUnreadJumpTarget({
    currentUserId,
    hasOlderMessages: false,
    messages: [message()],
    unreadAnchor: anchor,
  });

  assert.equal(target?.messageId, "message-1");
  assert.deepEqual(target?.jumpTarget, {
    contextRequired: false,
    messageId: "message-1",
    surface: "main",
  });
});

test("chat feed open intent prioritizes message links, main unread, local restore and latest", () => {
  const readingPosition = {
    capturedAt: "2026-07-11T00:02:00.000Z",
    channelId: "channel-1",
    messageId: "message-restore",
    offsetTop: 24,
    scrollTop: 480,
  };
  const anchor = buildUnreadAnchor(channel({ unreadCount: 2 }), currentUserId);

  assert.deepEqual(resolveChatFeedOpenIntent({
    readingPosition,
    requestedMessageId: "message-linked",
    unreadAnchor: anchor,
  }), { kind: "message", messageId: "message-linked" });
  assert.equal(resolveChatFeedOpenIntent({
    readingPosition,
    requestedMessageId: null,
    unreadAnchor: anchor,
  }).kind, "unread");
  assert.deepEqual(resolveChatFeedOpenIntent({
    readingPosition,
    requestedMessageId: null,
    unreadAnchor: null,
  }), { kind: "restore", position: readingPosition });
  assert.deepEqual(resolveChatFeedOpenIntent({
    readingPosition: null,
    requestedMessageId: null,
    unreadAnchor: null,
  }), { kind: "latest" });
});

test("chat feed latest prefetch skips channels whose opening target is first main unread", () => {
  const channelRead = channel({ id: "channel-read", unreadCount: 0 });
  const channelMainUnread = channel({ id: "channel-main-unread", unreadCount: 3 });
  const channelThreadUnread = channel({ id: "channel-thread-unread", threadUnreadCount: 2 });

  assert.deepEqual(selectChatFeedPrefetchChannelIds({
    activeChannelId: null,
    channels: [channelMainUnread, channelThreadUnread, channelRead],
    currentUserId,
    limit: 4,
  }), ["channel-thread-unread", "channel-read"]);
});

test("message deep links revalidate cached feed and thread targets before location is consumed", () => {
  const pageSource = readFileSync(new URL("../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  const feedStateSource = readFileSync(new URL("../src/features/chat/useChatFeedState.ts", import.meta.url), "utf8");
  const threadStateSource = readFileSync(new URL("../src/features/chat/useChatThreadState.ts", import.meta.url), "utf8");

  assert.match(feedStateSource, /validatedRequestedMessageKeyRef/);
  assert.match(feedStateSource, /openIntent\.kind === "message"/);
  assert.doesNotMatch(feedStateSource, /cachedHasRequestedMessage/);
  assert.match(feedStateSource, /getChatMessageContext\(\{ channelId: activeChannelId, messageId: requestedMessageId, limit: chatMessagePageSize \}\)/);
  assert.match(feedStateSource, /messagesLoading\s+\|\|\s+!messages\.some/);
  assert.match(threadStateSource, /revalidate\?: boolean/);
  assert.match(threadStateSource, /!options\.revalidate &&\s+currentThread\?\.rootMessage\.id === rootMessageId/);
  assert.match(pageSource, /openThread\(requestedThreadRootMessageId, \{ focusMessageId, revalidate: Boolean\(focusMessageId\) \}\)/);
});

test("late realtime snapshots cannot resurrect unread counts behind newer read-state versions", () => {
  const read = channel({
    mainMentionCount: 0,
    mentionCount: 0,
    threadMentionCount: 0,
    threadReadAt: "2026-07-11T00:03:00.000Z",
    threadUnreadCount: 0,
    unreadCount: 0,
    members: channel().members.map((member) => member.userId === currentUserId ? {
      ...member,
      lastReadAt: "2026-07-11T00:03:00.000Z",
      lastReadMessageId: "message-3",
      lastViewedAt: "2026-07-11T00:03:00.000Z",
    } : member),
  });
  const stale = channel({
    mainMentionCount: 1,
    mentionCount: 2,
    threadMentionCount: 1,
    threadReadAt: "2026-07-11T00:01:00.000Z",
    threadUnreadCount: 1,
    unreadCount: 1,
  });

  const [merged] = upsertChannel([read], stale, currentUserId);
  assert.equal(merged?.unreadCount, 0);
  assert.equal(merged?.mentionCount, 0);
  assert.equal(merged?.threadUnreadCount, 0);
  assert.equal(merged?.members.find((member) => member.userId === currentUserId)?.lastReadMessageId, "message-3");
});

test("new unread counts with the current cursor are still accepted", () => {
  const current = channel({
    threadReadAt: "2026-07-11T00:03:00.000Z",
    threadUnreadCount: 0,
  });
  const incoming = channel({
    threadReadAt: "2026-07-11T00:03:00.000Z",
    threadUnreadCount: 1,
  });

  const [merged] = upsertChannel([current], incoming, currentUserId);
  assert.equal(merged?.threadUnreadCount, 1);
});

test("chat sidebar recent sessions are ordered by latest message instead of unread or favorite state", () => {
  const olderFavoriteUnread = channel({
    id: "channel-older-favorite-unread",
    lastMessageAt: "2026-07-11T00:02:00.000Z",
    members: channel().members.map((member) => member.userId === currentUserId ? {
      ...member,
      favorite: true,
    } : member),
    unreadCount: 4,
  });
  const newerRead = channel({
    id: "channel-newer-read",
    lastMessageAt: "2026-07-11T00:03:00.000Z",
    unreadCount: 0,
  });
  const newestMention = channel({
    id: "channel-newest-mention",
    lastMessageAt: "2026-07-11T00:04:00.000Z",
    mainMentionCount: 1,
    mentionCount: 1,
    unreadCount: 1,
  });

  const navigation = buildChatSidebarNavigation({
    channels: [olderFavoriteUnread, newestMention, newerRead],
    currentUserId,
    users: [],
  });

  assert.deepEqual(navigation.recent.channels.map((item) => item.id), [
    "channel-newest-mention",
    "channel-newer-read",
    "channel-older-favorite-unread",
  ]);
});

test("chat sidebar read changes only clear badges and do not move sessions out of recent conversations", () => {
  const unreadSession = channel({
    id: "channel-stable-session",
    lastMessageAt: "2026-07-11T00:03:00.000Z",
    type: "public",
    unreadCount: 3,
  });
  const unreadNavigation = buildChatSidebarNavigation({
    channels: [unreadSession],
    currentUserId,
    users: [],
  });
  const readNavigation = buildChatSidebarNavigation({
    channels: [{
      ...unreadSession,
      mainMentionCount: 0,
      mentionCount: 0,
      threadMentionCount: 0,
      threadUnreadCount: 0,
      unreadCount: 0,
    }],
    currentUserId,
    users: [],
  });

  assert.deepEqual(unreadNavigation.recent.channels.map((item) => item.id), ["channel-stable-session"]);
  assert.deepEqual(readNavigation.recent.channels.map((item) => item.id), ["channel-stable-session"]);
  assert.deepEqual(readNavigation.addressBook.channelSections.find((section) => section.id === "public")?.channels.map((item) => item.id), []);
});

test("chat sidebar address book keeps only channels without recent message activity", () => {
  const recentPublicChannel = channel({
    id: "channel-recent-public",
    lastMessageAt: "2026-07-11T00:03:00.000Z",
    type: "public",
  });
  const discoverablePublicChannel = channel({
    id: "channel-discoverable-public",
    lastMessageAt: null,
    lastMessagePreview: null,
    type: "public",
  });
  const discoverableFavoriteChannel = channel({
    id: "channel-discoverable-favorite",
    lastMessageAt: null,
    lastMessagePreview: null,
    members: channel().members.map((member) => member.userId === currentUserId ? {
      ...member,
      favorite: true,
    } : member),
    type: "private",
  });

  const navigation = buildChatSidebarNavigation({
    channels: [
      recentPublicChannel,
      discoverableFavoriteChannel,
      discoverablePublicChannel,
    ],
    currentUserId,
    users: [],
  });

  assert.deepEqual(navigation.recent.channels.map((item) => item.id), ["channel-recent-public"]);
  assert.deepEqual(navigation.addressBook.channelSections.find((section) => section.id === "favorites")?.channels.map((item) => item.id), ["channel-discoverable-favorite"]);
  assert.deepEqual(navigation.addressBook.channelSections.find((section) => section.id === "public")?.channels.map((item) => item.id), ["channel-discoverable-public"]);
  assert.deepEqual(navigation.addressBook.channelSections.find((section) => section.id === "private")?.channels.map((item) => item.id), []);
});

test("chat sidebar address book exposes visible members without requiring a search query", () => {
  const navigation = buildChatSidebarNavigation({
    channels: [],
    currentUserId,
    users: [
      user({ id: currentUserId, email: "self@example.com", name: "当前用户" }),
      user({ id: otherUserId, email: "z@example.com", name: "赵成员" }),
      user({ id: authorUserId, email: "a@example.com", name: "阿成员" }),
    ],
  });

  assert.deepEqual(navigation.addressBook.users.map((item) => item.id), [authorUserId, otherUserId]);
  assert.equal(navigation.hasResults, true);
});

test("chat sidebar search filters system, recent, address book channels and members from one projection", () => {
  const navigation = buildChatSidebarNavigation({
    channels: [
      channel({ displayName: "系统公告", id: "system", lastMessageAt: null, systemKind: "teamAnnouncement", type: "public" }),
      channel({ displayName: "发布讨论", id: "recent-release", lastMessageAt: "2026-07-11T00:04:00.000Z", type: "public" }),
      channel({ displayName: "归档资料", id: "directory-docs", lastMessageAt: null, type: "private" }),
    ],
    currentUserId,
    query: "发布",
    users: [
      user({ id: currentUserId, email: "self@example.com", name: "当前用户" }),
      user({ id: authorUserId, email: "release@example.com", name: "发布负责人" }),
      user({ id: otherUserId, email: "other@example.com", name: "旁观者" }),
    ],
  });

  assert.deepEqual(navigation.systemChannels.map((item) => item.id), []);
  assert.deepEqual(navigation.recent.channels.map((item) => item.id), ["recent-release"]);
  assert.deepEqual(navigation.addressBook.channelSections.flatMap((section) => section.channels.map((item) => item.id)), []);
  assert.deepEqual(navigation.addressBook.users.map((item) => item.id), [authorUserId]);
});

test("an explicit mark-unread action may move the read cursor backwards under a newer read-state version", () => {
  const current = channel({
    members: channel().members.map((member) => member.userId === currentUserId ? {
      ...member,
      lastReadAt: "2026-07-11T00:03:00.000Z",
      lastReadMessageId: "message-3",
      lastViewedAt: "2026-07-11T00:03:00.000Z",
    } : member),
  });
  const markedUnread = channel({
    members: channel().members.map((member) => member.userId === currentUserId ? {
      ...member,
      lastReadAt: "2026-07-11T00:01:00.000Z",
      lastReadMessageId: "message-1",
      lastViewedAt: "2026-07-11T00:04:00.000Z",
      manuallyUnread: true,
    } : member),
    unreadCount: 2,
  });

  const [merged] = upsertChannel([current], markedUnread, currentUserId);
  const membership = merged?.members.find((member) => member.userId === currentUserId);
  assert.equal(membership?.lastReadMessageId, "message-1");
  assert.equal(membership?.manuallyUnread, true);
  assert.equal(merged?.unreadCount, 2);
});

test("thread mention target request uses the explicit surface contract", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      target: {
        kind: "threadMention",
        rootMessageId: "root-1",
        targetMessageId: "reply-1",
      },
    }), { headers: { "content-type": "application/json" }, status: 200 });
  }) as typeof fetch;

  const response = await getChatUnreadTarget({
    channelId: "channel-1",
    surface: "threadMention",
  });

  assert.equal(requestedUrl, "/api/chat/channels/channel-1/unread-target?surface=threadMention");
  assert.deepEqual(response.target, {
    kind: "threadMention",
    rootMessageId: "root-1",
    targetMessageId: "reply-1",
  });
});

test("repository guard keeps thread read, delivery and named unread target contracts", () => {
  const repositorySource = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  assert.match(repositorySource, /SELECT DISTINCT m\.root_message_id, \$2::uuid, true, \$3::timestamptz, \$3::timestamptz/);
  assert.match(repositorySource, /FROM unnest\(\$2::uuid\[\]\) AS mentioned\(mentioned_user_id\)/);
  assert.match(repositorySource, /SELECT \$1, mentioned\.mentioned_user_id, true, null, \$3::timestamptz/);
  assert.match(repositorySource, /current_membership\.channel_id = \$4 AND current_membership\.user_id = mentioned\.mentioned_user_id/);
  assert.match(repositorySource, /const readThroughAt = chatThreadReadThroughAt\(messages\)/);
  assert.doesNotMatch(repositorySource, /VALUES \(\$1, \$2, true, \$3, \$3\)\s+ON CONFLICT \(root_message_id, user_id\)\s+DO UPDATE SET last_viewed_at/);
  assert.match(repositorySource, /WHERE chat_thread_follows\.last_viewed_at IS NULL\s+OR chat_thread_follows\.last_viewed_at < EXCLUDED\.last_viewed_at/);
  assert.match(repositorySource, /RETURNING following, true AS read_state_changed/);
  assert.match(repositorySource, /if \(followRows\[0\]\?\.read_state_changed\) \{\s+publishChatChannelRealtime/);
  assert.match(repositorySource, /if \(input\.surface === "main"\)/);
  assert.match(repositorySource, /const target = await findFirstUnreadThreadMention\(input\.channelId, actor\)/);

  const sendStart = repositorySource.indexOf("export async function sendChatMessage(");
  const followWrite = repositorySource.indexOf("await followMentionedThreadRecipients(client", sendStart);
  const deliveryEnqueue = repositorySource.indexOf("await enqueueChatPushDeliveries(client", sendStart);
  assert.ok(sendStart >= 0 && followWrite > sendStart && deliveryEnqueue > followWrite);
});

test("global unread target uses the shared read cursor, visibility and fixed priority contract", () => {
  const repositorySource = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  const unreadSqlSource = readFileSync(new URL("../server/chat/chatUnreadSql.ts", import.meta.url), "utf8");
  assert.match(repositorySource, /unread_message_facts AS/);
  assert.match(repositorySource, /unread_by_channel AS/);
  assert.match(repositorySource, /FROM unread_message_facts/);
  assert.doesNotMatch(repositorySource, /message_unread AS|mention_unread AS|direct_message_unread AS|thread_unread AS/);
  assert.match(repositorySource, /chatUnreadMessageFactsSql/);
  assert.match(unreadSqlSource, /WHEN dc\.type = 'direct' AND dc\.system_kind IS NULL THEN 1/);
  assert.match(unreadSqlSource, /WHEN m\.body LIKE \$\{input\.currentUserMentionParam\} THEN 2/);
  assert.match(unreadSqlSource, /WHEN m\.body ~\* \$\{input\.broadcastMentionParam\} THEN 3/);
  assert.match(unreadSqlSource, /WHEN dc\.system_kind IS NOT NULL OR m\.source = 'system' THEN 4/);
  assert.match(repositorySource, /ORDER BY priority ASC, created_at ASC, message_id ASC/);
  assert.match(repositorySource, /surface: row\.target_root_message_id \? "threadMention" as const : "main" as const/);
  assert.match(repositorySource, /targetPath: chatMessageTargetPath\(\{/);

  const pageSource = readFileSync(new URL("../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /const requestedThreadRootMessageId = searchParams\.get\("thread"\)/);
  assert.match(pageSource, /requestedMessageId: requestedThreadRootMessageId \? null : focusMessageId/);
  assert.match(pageSource, /openThread\(requestedThreadRootMessageId, \{ focusMessageId, revalidate: Boolean\(focusMessageId\) \}\)/);
  assert.match(pageSource, /readChatLastChannelId/);

  const apiClientSource = readFileSync(new URL("../src/state/apiClient.ts", import.meta.url), "utf8");
  const feedStateSource = readFileSync(new URL("../src/features/chat/useChatFeedState.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../server/routes/chatRoutes.ts", import.meta.url), "utf8");
  const repositorySourceForLegacy = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
  const mobileSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
  assert.match(feedStateSource, /resolveChatFeedOpenIntent/);
  assert.match(feedStateSource, /readChatFeedReadingPosition/);
  assert.match(feedStateSource, /pendingReadingPositionScrollRef/);
  assert.doesNotMatch(feedStateSource, /getChatUnreadContext/);
  assert.doesNotMatch(apiClientSource, /getChatUnreadContext/);
  assert.doesNotMatch(routeSource, /unread-context/);
  assert.doesNotMatch(repositorySourceForLegacy, /export async function getChatUnreadContext/);
  assert.doesNotMatch(sidebarSource, /useChatUnreadNavigation/);
  assert.doesNotMatch(mobileSource, /useChatUnreadNavigation/);
});

test("required acknowledgement is derived only from explicit reaction or thread reply facts", () => {
  const repositorySource = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../drizzle/0094_chat_message_acknowledgements.sql", import.meta.url), "utf8");

  assert.match(repositorySource, /chat_message_ack_requests/);
  assert.match(repositorySource, /chat_message_ack_recipients/);
  assert.doesNotMatch(migrationSource, /acknowledged_at/);
  assert.match(repositorySource, /FROM chat_message_reactions reaction[\s\S]+reaction\.message_id = request\.message_id[\s\S]+reaction\.user_id = recipient\.user_id/);
  assert.match(repositorySource, /FROM chat_messages reply[\s\S]+reply\.root_message_id = request\.message_id[\s\S]+reply\.author_user_id = recipient\.user_id/);
  assert.match(repositorySource, /if \(message\.source === "system" \|\| message\.root_message_id !== null\) return \{ status: "invalid" \}/);
});

test("main feed read receipts reschedule after message layout changes", () => {
  const feedStateSource = readFileSync(new URL("../src/features/chat/useChatFeedState.ts", import.meta.url), "utf8");
  const layoutSource = readFileSync(new URL("../src/features/chat/chatViewportLayout.ts", import.meta.url), "utf8");
  const stickinessSource = readFileSync(new URL("../src/features/chat/useChatLatestScrollStickiness.ts", import.meta.url), "utf8");
  assert.match(layoutSource, /ResizeObserver/);
  assert.match(layoutSource, /MutationObserver/);
  assert.match(stickinessSource, /subscribeLayoutChanges/);
  assert.match(feedStateSource, /subscribeLayoutChanges\(scheduleAfterLayout\)/);
  assert.doesNotMatch(feedStateSource, /new ResizeObserver|new MutationObserver/);
  assert.match(feedStateSource, /scheduleVisibleReadReceipt/);
});
