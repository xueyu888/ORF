import { createHash, randomUUID } from "node:crypto";
import type {
  ChatAttachment,
  ChatChannelMember,
  ChatChannelType,
  ChatMemberRole,
  ChatUser,
  UserRole,
  UserStatus,
} from "../../src/types/orf";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export type ChatActor = {
  canCreatePrivateChannel: boolean;
  canCreatePublicChannel: boolean;
  canManageAnyChannel: boolean;
  canManageAnyMembers: boolean;
  canRead: boolean;
  canWrite: boolean;
  id: string;
  name: string;
  role: UserRole;
  scope: RuntimeScope;
};

export type Outcome<T> =
  | ({ status: "ok" } & T)
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "conflict" }
  | { status: "tooLarge" };

export type ChannelRow = {
  archived_at: Date | string | null;
  archived_by: string | null;
  created_at: Date | string;
  created_by: string | null;
  display_name: string;
  header: string;
  id: string;
  name: string | null;
  purpose: string;
  type: ChatChannelType;
  updated_at: Date | string;
};

export type ChannelMemberRow = {
  channel_id: string;
  favorite: boolean;
  joined_at: Date | string;
  last_read_at: Date | string | null;
  last_read_message_id: string | null;
  last_viewed_at: Date | string | null;
  manually_unread: boolean;
  muted: boolean;
  role: ChatMemberRole;
  user_id: string;
};

export type MessageRow = {
  author_avatar_object_key: string | null;
  author_avatar_updated_at: Date | string | null;
  author_name: string;
  author_user_id: string;
  body: string;
  channel_id: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
  deleted_by: string | null;
  edited_at: Date | string | null;
  id: string;
  parent_message_id: string | null;
  root_message_id: string | null;
  updated_at: Date | string;
};

export type AttachmentRow = {
  created_at: Date | string;
  file_name: string;
  file_size: number;
  height: number | null;
  id: string;
  message_id: string | null;
  mime_type: string;
  object_key: string;
  width: number | null;
};

export type ReactionRow = {
  emoji_name: string;
  message_id: string;
  user_id: string;
};

export type MessageCollectionRow = {
  message_id: string;
  pinned_at: Date | string | null;
  pinned_by: string | null;
  saved_at: Date | string | null;
};

export type UserRow = {
  avatar_object_key: string | null;
  avatar_updated_at: Date | string | null;
  email: string | null;
  id: string;
  last_online_at: Date | string | null;
  name: string;
  role: string;
  status: UserStatus | null;
};

export const DEFAULT_PUBLIC_CHANNEL_NAME = "orf-town-square";
export const DEFAULT_PUBLIC_CHANNEL_DISPLAY_NAME = "ORF 全员频道";
export const CHAT_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

const CHAT_MENTION_TOKEN_PATTERN = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;

let idCounter = 0;
let lastNowMs = 0;

export function nowIso() {
  const nextNowMs = Math.max(Date.now(), lastNowMs + 1);
  lastNowMs = nextNowMs;
  return new Date(nextNowMs).toISOString();
}

export function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function nextCounter() {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

export function makeChatAttachmentId() {
  return `chatt_${Date.now()}_${nextCounter()}_${randomUUID()}`;
}

export function storageTeamId(actor: ChatActor) {
  return runtimeScopeStorageId(actor.scope);
}

export function normalizeTeamRole(role: string): UserRole {
  return role === "admin" ? "admin" : "member";
}

export function toChatUser(row: UserRow): ChatUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role: normalizeTeamRole(row.role),
    status: row.status ?? "active",
    avatarUrl: avatarUrlForUser({
      id: row.id,
      avatarObjectKey: row.avatar_object_key,
      avatarUpdatedAt: iso(row.avatar_updated_at),
    }),
    lastOnlineAt: iso(row.last_online_at),
  };
}

export function safePathSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

export function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

export function normalizeChannelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function stableConversationName(prefix: string, userIds: string[]) {
  const digest = createHash("sha1").update(userIds.slice().sort().join(":")).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

export function chatAttachmentContentUrl(id: string) {
  return `/api/chat/attachments/${encodeURIComponent(id)}/content`;
}

export function toChatAttachment(row: AttachmentRow): ChatAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    contentUrl: chatAttachmentContentUrl(row.id),
    width: row.width,
    height: row.height,
    createdAt: iso(row.created_at) ?? nowIso(),
  };
}

export function toChannelMember(row: ChannelMemberRow): ChatChannelMember {
  return {
    userId: row.user_id,
    role: row.role,
    favorite: row.favorite,
    muted: row.muted,
    manuallyUnread: row.manually_unread,
    joinedAt: iso(row.joined_at) ?? nowIso(),
    lastViewedAt: iso(row.last_viewed_at),
    lastReadAt: iso(row.last_read_at),
    lastReadMessageId: row.last_read_message_id,
  };
}

export function displayNameForChannel(row: ChannelRow, members: ChatChannelMember[], usersById: Map<string, ChatUser>, actor: ChatActor) {
  if (row.type !== "direct" && row.type !== "group") {
    return row.display_name;
  }

  const others = members
    .map((member) => usersById.get(member.userId))
    .filter((user): user is ChatUser => user !== undefined && user.id !== actor.id)
    .map((user) => user.name);
  if (others.length > 0) {
    return others.join(", ");
  }
  return row.type === "direct" ? `${actor.name} 的私聊` : row.display_name;
}

export function extractMentionUserIds(body: string) {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  CHAT_MENTION_TOKEN_PATTERN.lastIndex = 0;
  while ((match = CHAT_MENTION_TOKEN_PATTERN.exec(body)) !== null) {
    const rawUserId = match[2] ? decodeURIComponent(match[2]) : "";
    if (rawUserId.trim()) ids.add(rawUserId.trim());
  }
  return Array.from(ids);
}

export function previewText(body: string) {
  return body
    .replace(CHAT_MENTION_TOKEN_PATTERN, (_match, label) => `@${String(label).trim() || "成员"}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function ok<T>(payload: T): Outcome<T> {
  return { status: "ok", ...payload };
}
