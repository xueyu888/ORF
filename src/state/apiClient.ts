import type {
  AppNotification,
  ChatAttachment,
  ChatBootstrap,
  ChatChannel,
  ChatChannelType,
  ChatMessage,
  ChatSearchResult,
  ChatThread,
  ChatThreadSummary,
  ChatUser,
  CommentAttachment,
  CommentTargetType,
  OrfState,
  OrfUser,
} from "../types/orf";
import type { BountyHallData, CurrentUserAccessData, MyChallengesScope, TaskManagementData } from "../domain/orfReadModel";
import type { VisualBackgroundScene } from "../domain/settings/visualBackgrounds";
export type { VisualBackgroundScene } from "../domain/settings/visualBackgrounds";
export type { BountyHallData, BountyHallItem, CurrentUserAccessData, MyChallengesScope, TaskManagementData } from "../domain/orfReadModel";
export type AuthSession = { authenticated: false; user: null } | { authenticated: true; user: OrfUser };
export type PermissionRulesResponse = Pick<OrfState, "permissionRules">;
export type UsersResponse = Pick<OrfState, "users">;
export type CurrentUserResponse = { user: OrfUser };
export type RegistrationRequestsResponse = { users: OrfUser[] };
export type NotificationsResponse = {
  notifications: AppNotification[];
  unreadCount: number;
};
export type NotificationReadResponse = {
  notification: AppNotification;
  unreadCount: number;
};
export type NotificationsReadAllResponse = {
  updated: number;
  unreadCount: number;
};
export type NotificationsDeleteResponse = {
  deleted: number;
  unreadCount: number;
};
export type CommentMentionableUsersResponse = Pick<OrfState, "users">;
export type CommentAttachmentUploadResponse = {
  ok: true;
  attachment: CommentAttachment;
  markdown: string;
};
export type ChatBootstrapResponse = ChatBootstrap;
export type ChatMessagesResponse = { status?: "ok"; messages: ChatMessage[] };
export type ChatChannelResponse = { status?: "ok"; channel: ChatChannel };
export type ChatNullableChannelResponse = { status?: "ok"; channel: ChatChannel | null };
export type ChatMessageResponse = { status?: "ok"; message: ChatMessage };
export type ChatThreadResponse = { status?: "ok"; thread: ChatThread };
export type ChatThreadsResponse = { status?: "ok"; threads: ChatThreadSummary[] };
export type ChatAttachmentUploadResponse = { status?: "ok"; attachment: ChatAttachment };
export type ChatMentionableUsersResponse = { status?: "ok"; users: ChatUser[] };
export type ChatSearchResponse = { status?: "ok"; results: ChatSearchResult[] };
export type VisualBackgroundMode = "fixed" | "switchable";
export type VisualBackgroundSwitchTrigger = "on_open" | "interval";
export type VisualBackgroundSwitchOrder = "sequential" | "random";
export type VisualBackgroundConfig = {
  mode: VisualBackgroundMode;
  fixedBackgroundId: string | null;
  switchTrigger: VisualBackgroundSwitchTrigger;
  switchOrder: VisualBackgroundSwitchOrder;
  switchIntervalMinutes: number;
};
export type VisualBackgroundImage = {
  id: string;
  scene: VisualBackgroundScene;
  fileName: string;
  url: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isDefault: boolean;
  createdAt?: string;
};
export type VisualBackgroundsData = {
  scene: VisualBackgroundScene;
  config: VisualBackgroundConfig;
  list: VisualBackgroundImage[];
};
export type UserPreferences = {
  userId: string;
  defaultLandingPath: string | null;
  sidebarCollapsed: boolean | null;
  appBackground: VisualBackgroundConfig | null;
  notificationDisplay: {
    toastEnabled: boolean;
  };
};
export type UserPreferencesPatch = Partial<Pick<UserPreferences, "defaultLandingPath" | "sidebarCollapsed" | "appBackground">> & {
  notificationDisplay?: Partial<UserPreferences["notificationDisplay"]>;
};
export type PersonalBackgroundsData = VisualBackgroundsData & {
  preferences: UserPreferences;
};
type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export const API_AUTHENTICATION_EXPIRED_EVENT = "orf:api-authentication-expired";

export class ApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

function apiErrorMessage(payload: unknown, status: number, path: string) {
  if (status === 401 && !path.startsWith("/api/auth/")) {
    return "登录已失效，请重新登录";
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return `API ${status}: ${path}`;
}

function emitAuthenticationExpired(path: string, status: number) {
  if (status !== 401 || path.startsWith("/api/auth/") || typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(API_AUTHENTICATION_EXPIRED_EVENT, { detail: { path } }));
}

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    return contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    return "";
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    emitAuthenticationExpired(path, response.status);
    throw new ApiError(response.status, path, apiErrorMessage(payload, response.status, path));
  }

  return response.json() as Promise<T>;
}

export async function apiRequest(path: string, init?: RequestInit): Promise<void> {
  await apiJson<unknown>(path, init);
}

export async function getBountyHallData() {
  return apiJson<BountyHallData>("/api/bounties");
}

export async function getCurrentUserAccess() {
  return apiJson<CurrentUserAccessData>("/api/me/access");
}

export async function getMyChallengesData(scope: MyChallengesScope) {
  const query = new URLSearchParams({ scope });
  return apiJson<TaskManagementData>(`/api/my-challenges?${query.toString()}`);
}

export async function getNotifications() {
  return apiJson<NotificationsResponse>("/api/notifications");
}

export async function markNotificationReadRequest(notificationId: string) {
  return apiJson<NotificationReadResponse>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" });
}

export async function markAllNotificationsReadRequest() {
  return apiJson<NotificationsReadAllResponse>("/api/notifications/read-all", { method: "PATCH" });
}

export async function deleteNotificationsRequest(notificationIds: string[]) {
  return apiJson<NotificationsDeleteResponse>("/api/notifications/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ notificationIds }),
  });
}

export async function clearAllNotificationsRequest() {
  return apiJson<NotificationsDeleteResponse>("/api/notifications", { method: "DELETE" });
}

export async function uploadCommentAttachment(input: { file: File; targetId: string; targetType: CommentTargetType }) {
  const formData = new FormData();
  formData.set("targetType", input.targetType);
  formData.set("targetId", input.targetId);
  formData.set("file", input.file);

  return apiJson<CommentAttachmentUploadResponse>("/api/comments/attachments", {
    method: "POST",
    body: formData,
  });
}

export async function getCommentMentionableUsers(input: { targetId: string; targetType: CommentTargetType }) {
  const query = new URLSearchParams({ targetId: input.targetId, targetType: input.targetType });
  return apiJson<CommentMentionableUsersResponse>(`/api/comments/mentionable-users?${query.toString()}`);
}

export async function getChatBootstrap() {
  return apiJson<ChatBootstrapResponse>("/api/chat/bootstrap");
}

export async function getChatMessages(input: { before?: string; channelId: string; limit?: number }) {
  const query = new URLSearchParams();
  if (input.before) query.set("before", input.before);
  if (input.limit) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<ChatMessagesResponse>(`/api/chat/channels/${encodeURIComponent(input.channelId)}/messages${suffix}`);
}

export async function createChatChannel(input: {
  displayName: string;
  header?: string;
  memberUserIds?: string[];
  name?: string;
  purpose?: string;
  type: "public" | "private";
}) {
  return apiJson<ChatChannelResponse>("/api/chat/channels", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function openChatConversation(userIds: string[]) {
  return apiJson<ChatChannelResponse>("/api/chat/direct", {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export async function updateChatChannelRequest(
  channelId: string,
  input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">> & {
    favorite?: boolean;
    muted?: boolean;
    name?: string;
  },
) {
  return apiJson<ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveChatChannelRequest(channelId: string) {
  return apiJson<{ status?: "ok"; channelId: string }>(`/api/chat/channels/${encodeURIComponent(channelId)}`, { method: "DELETE" });
}

export async function addChatChannelMembersRequest(channelId: string, userIds: string[]) {
  return apiJson<ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/members`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export async function removeChatChannelMemberRequest(channelId: string, userId: string) {
  return apiJson<ChatNullableChannelResponse>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function sendChatMessageRequest(input: {
  attachmentIds?: string[];
  body: string;
  channelId: string;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
}) {
  return apiJson<ChatMessageResponse & ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(input.channelId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: input.body,
      attachmentIds: input.attachmentIds ?? [],
      parentMessageId: input.parentMessageId ?? null,
      rootMessageId: input.rootMessageId ?? null,
    }),
  });
}

export async function updateChatMessageRequest(input: { body: string; channelId: string; messageId: string }) {
  return apiJson<ChatMessageResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body: input.body }),
    },
  );
}

export async function deleteChatMessageRequest(input: { channelId: string; messageId: string }) {
  return apiJson<ChatMessageResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`,
    { method: "DELETE" },
  );
}

export async function setChatReactionRequest(input: { channelId: string; emojiName: string; messageId: string; reacting: boolean }) {
  const path = `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}/reactions`;
  if (input.reacting) {
    return apiJson<ChatMessageResponse>(path, {
      method: "POST",
      body: JSON.stringify({ emojiName: input.emojiName }),
    });
  }
  return apiJson<ChatMessageResponse>(`${path}/${encodeURIComponent(input.emojiName)}`, { method: "DELETE" });
}

export async function setChatMessagePinRequest(input: { channelId: string; messageId: string; pinned: boolean }) {
  return apiJson<ChatMessageResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}/pin`,
    {
      method: "PATCH",
      body: JSON.stringify({ pinned: input.pinned }),
    },
  );
}

export async function setChatMessageSavedRequest(input: { channelId: string; messageId: string; saved: boolean }) {
  return apiJson<ChatMessageResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}/save`,
    {
      method: "PATCH",
      body: JSON.stringify({ saved: input.saved }),
    },
  );
}

export async function markChatChannelReadRequest(channelId: string) {
  return apiJson<ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/read`, { method: "PATCH" });
}

export async function setChatChannelUnreadRequest(input: { channelId: string; messageId?: string }) {
  return apiJson<ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(input.channelId)}/unread`, {
    method: "PATCH",
    body: JSON.stringify({ messageId: input.messageId ?? null }),
  });
}

export async function publishChatTypingRequest(channelId: string) {
  return apiJson<{ status?: "ok"; ok: true }>(`/api/chat/channels/${encodeURIComponent(channelId)}/typing`, { method: "POST" });
}

export async function getChatThread(rootMessageId: string) {
  return apiJson<ChatThreadResponse>(`/api/chat/threads/${encodeURIComponent(rootMessageId)}`);
}

export async function getChatThreads() {
  return apiJson<ChatThreadsResponse>("/api/chat/threads");
}

export async function setChatThreadFollowRequest(rootMessageId: string, following: boolean) {
  return apiJson<ChatThreadResponse>(`/api/chat/threads/${encodeURIComponent(rootMessageId)}/follow`, {
    method: "PATCH",
    body: JSON.stringify({ following }),
  });
}

export async function uploadChatAttachment(input: { channelId: string; file: File }) {
  const formData = new FormData();
  formData.set("channelId", input.channelId);
  formData.set("file", input.file);
  return apiJson<ChatAttachmentUploadResponse>("/api/chat/attachments", {
    method: "POST",
    body: formData,
  });
}

export async function getChatMentionableUsers(channelId: string) {
  return apiJson<ChatMentionableUsersResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/mentionable-users`);
}

export async function searchChat(input: { channelId?: string; q: string; type?: ChatChannelType }) {
  const query = new URLSearchParams({ q: input.q });
  if (input.channelId) query.set("channelId", input.channelId);
  if (input.type) query.set("type", input.type);
  return apiJson<ChatSearchResponse>(`/api/chat/search?${query.toString()}`);
}

export async function getPinnedChatMessages(channelId: string) {
  return apiJson<ChatSearchResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/pins`);
}

export async function getSavedChatMessages() {
  return apiJson<ChatSearchResponse>("/api/chat/saved");
}

export async function getVisualBackgrounds(scene: VisualBackgroundScene) {
  const response = await apiJson<ApiEnvelope<VisualBackgroundsData>>(`/api/settings/visual/backgrounds?scene=${encodeURIComponent(scene)}`);
  return response.data;
}

export async function uploadVisualBackground(scene: VisualBackgroundScene, file: File) {
  const formData = new FormData();
  formData.set("scene", scene);
  formData.set("file", file);

  const response = await apiJson<ApiEnvelope<VisualBackgroundImage>>("/api/settings/visual/backgrounds", {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function setDefaultVisualBackground(id: string) {
  const response = await apiJson<ApiEnvelope<{ id: string; scene: VisualBackgroundScene; config: VisualBackgroundConfig; isDefault: boolean }>>(
    `/api/settings/visual/backgrounds/${encodeURIComponent(id)}/default`,
    { method: "PUT" },
  );
  return response.data;
}

export async function saveVisualBackgroundConfig(scene: VisualBackgroundScene, config: VisualBackgroundConfig) {
  const response = await apiJson<ApiEnvelope<{ scene: VisualBackgroundScene; config: VisualBackgroundConfig }>>("/api/settings/visual/background-config", {
    method: "PUT",
    body: JSON.stringify({ scene, config }),
  });
  return response.data;
}

export async function getUserPreferences() {
  const response = await apiJson<ApiEnvelope<UserPreferences>>("/api/settings/personal/preferences");
  return response.data;
}

export async function saveUserPreferences(input: UserPreferencesPatch) {
  const response = await apiJson<ApiEnvelope<UserPreferences>>("/api/settings/personal/preferences", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function getPersonalBackgrounds() {
  const response = await apiJson<ApiEnvelope<PersonalBackgroundsData>>("/api/settings/personal/backgrounds");
  return response.data;
}

export async function uploadPersonalBackground(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await apiJson<ApiEnvelope<VisualBackgroundImage>>("/api/settings/personal/backgrounds", {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function deletePersonalBackground(id: string) {
  const response = await apiJson<ApiEnvelope<{ id: string }>>(`/api/settings/personal/backgrounds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return response.data;
}

export async function uploadCurrentUserAvatarRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  return apiJson<CurrentUserResponse>("/api/users/me/avatar", {
    method: "POST",
    body: formData,
  });
}

export async function deleteCurrentUserAvatarRequest() {
  return apiJson<CurrentUserResponse>("/api/users/me/avatar", {
    method: "DELETE",
  });
}
