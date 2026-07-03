import type {
  AppNotification,
  ChatAttachment,
  ChatBootstrap,
  ChatChannel,
  ChatChannelType,
  ChatMessageContext,
  ChatMessage,
  ChatSearchResult,
  ChatThread,
  ChatThreadSummary,
  ChatUnreadSummary,
  ChatUser,
  ChatDriveLink,
  DriveContextType,
  DriveFileVersion,
  DriveNodeDetails,
  DrivePreviewKind,
  DriveSearchContextFilter,
  DriveSearchScope,
  DriveSearchSource,
  DriveSearchStatus,
  DriveSearchType,
  DriveSearchUpdatedRange,
  CommentThread,
  CommentAttachmentUploadResult,
  CommentTargetType,
  OrfState,
  DriveBootstrap,
  DriveNode,
  OrfUser,
  SystemConversationId,
  SystemConversationMessage,
  SystemConversationSummary,
  WorkLogActivityItem,
  WorkLogCategoryOption,
  WorkLogClassificationSuggestion,
  WorkLogEntry,
  WorkLogObjectiveOption,
  WorkLogReminderState,
  WorkLogReport,
  WorkLogReportScope,
} from "../types/orf";
import type { BountyHallData, CurrentUserAccessData, MyChallengesScope, ReportsPageData, TaskManagementData } from "../domain/orfReadModel";
import type { ChatTheme, UserDisplayPreferences } from "../domain/settings/personalPreferences";
import type {
  VisualBackgroundConfig,
  VisualBackgroundCrop,
  VisualBackgroundFitMode,
  VisualBackgroundMode,
  VisualBackgroundScene,
  VisualBackgroundSwitchOrder,
  VisualBackgroundSwitchTrigger,
} from "../domain/settings/visualBackgrounds";
import type { ClientReleaseInfo } from "../features/client-updates/clientUpdateModel";
export type {
  VisualBackgroundConfig,
  VisualBackgroundCrop,
  VisualBackgroundFitMode,
  VisualBackgroundMode,
  VisualBackgroundScene,
  VisualBackgroundSwitchOrder,
  VisualBackgroundSwitchTrigger,
} from "../domain/settings/visualBackgrounds";
export type { BountyHallData, BountyHallItem, CurrentUserAccessData, MyChallengesScope, ReportsPageData, TaskManagementData } from "../domain/orfReadModel";
export type AuthSession = { authenticated: false; user: null } | { authenticated: true; user: OrfUser };
export type PermissionRulesResponse = Pick<OrfState, "permissionRules">;
export type UsersResponse = Pick<OrfState, "users">;
export type CurrentUserResponse = { user: OrfUser };
export type RegistrationRequestsResponse = { users: OrfUser[] };
export type NotificationsResponse = {
  notifications: AppNotification[];
  unreadCount: number;
};
export type SystemConversationsResponse = {
  conversations: SystemConversationSummary[];
};
export type SystemConversationMessagesResponse = {
  conversation: SystemConversationSummary;
  messages: SystemConversationMessage[];
};
export type SystemConversationMessageStateResponse = {
  conversations: SystemConversationSummary[];
  notification: AppNotification;
};
export type SystemConversationReadAllResponse = {
  conversations: SystemConversationSummary[];
  updated: number;
};
export type SystemConversationReplyResponse = {
  commentThread: CommentThread | null;
  ok: true;
};
export type ClientUpdateReleaseResponse = {
  release: ClientReleaseInfo;
};
export type PushDeviceRegistrationInput = {
  appBuild?: string | null;
  appVersion?: string | null;
  deviceLabel?: string | null;
  deviceManufacturer?: string | null;
  deviceModel?: string | null;
  googlePlayServicesAvailable?: boolean | null;
  notificationPermission?: string | null;
  osVersion?: string | null;
  platform: "android";
  sdkInt?: number | null;
  token: string;
};
export type PushVendorDeviceRegistrationInput = Omit<PushDeviceRegistrationInput, "googlePlayServicesAvailable"> & {
  vendor: "vivo";
};
export type PushVendorRegistrationStatusInput = Omit<PushVendorDeviceRegistrationInput, "token"> & {
  detail?: string | null;
  reason?: string | null;
  status: "starting" | "unavailable" | "registering" | "token_registered" | "registration_error";
};
export type PushRegistrationStatusInput = Omit<PushDeviceRegistrationInput, "token"> & {
  detail?: string | null;
  reason?: string | null;
  status: "starting" | "unavailable" | "permission_denied" | "registering" | "token_registered" | "registration_error";
};
export type PushDeviceRegistrationResponse = {
  deviceId: string;
  ok: true;
  pushEnabled: boolean;
};
export type CommentMentionableUsersResponse = Pick<OrfState, "users">;
export type FeedbackReferencesResponse = {
  feedback: Array<Pick<OrfState["feedback"][number], "id" | "phenomenon">>;
};
export type CommentAttachmentUploadResponse = CommentAttachmentUploadResult & {
  ok: true;
};
export type ChatBootstrapResponse = ChatBootstrap;
export type ChatUnreadSummaryResponse = ChatUnreadSummary;
export type ChatMessagesResponse = { status?: "ok"; messages: ChatMessage[] };
export type ChatMessageContextResponse = { status?: "ok" } & ChatMessageContext;
export type ChatChannelResponse = { status?: "ok"; channel: ChatChannel };
export type ChatNullableChannelResponse = { status?: "ok"; channel: ChatChannel | null };
export type ChatMessageResponse = { status?: "ok"; channel?: ChatChannel; message: ChatMessage };
export type ChatThreadResponse = { status?: "ok"; channel?: ChatChannel; thread: ChatThread };
export type ChatThreadsResponse = { status?: "ok"; threads: ChatThreadSummary[] };
export type ChatAttachmentUploadResponse = { status?: "ok"; attachment: ChatAttachment };
export type ChatMentionableUsersResponse = { status?: "ok"; users: ChatUser[] };
export type ChatSearchResponse = { status?: "ok"; results: ChatSearchResult[] };
export type DriveBootstrapResponse = {
  status?: "ok";
  drive: DriveBootstrap;
};
export type ChatDriveBootstrapResponse = {
  status?: "ok";
  drive: DriveBootstrap;
  links: ChatDriveLink[];
};
export type DriveChildrenResponse = {
  status?: "ok";
  children: DriveNode[];
  parentNodeId: string;
};
export type DriveSearchResponse = {
  status?: "ok";
  nodes: DriveNode[];
};
export type DriveNodeResponse = {
  status?: "ok";
  announcementMessage?: ChatMessage | null;
  node: DriveNode;
};
export type DriveNodeDetailsResponse = {
  status?: "ok";
  details: DriveNodeDetails;
};
export type DriveNodeRestoreResponse = {
  status?: "ok";
  node: DriveNode;
  restoredNodeIds: string[];
};
export type DriveFileVersionsResponse = {
  status?: "ok";
  versions: DriveFileVersion[];
};
export type DriveVersionMutationResponse = {
  status?: "ok";
  node: DriveNode;
  versions: DriveFileVersion[];
};
export type ApiUploadProgress = {
  lengthComputable: boolean;
  loadedBytes: number;
  percent: number | null;
  timestampMs: number;
  totalBytes: number | null;
};
export type GitLabOrfChatConfigStatus = {
  accessTokenConfigured: boolean;
  enabled: boolean;
  gitlabUrlConfigured: boolean;
  groupPath: string;
  hookMode: "group" | "project" | "both";
  signingTokenConfigured: boolean;
  webhookConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrlConfigured: boolean;
};
export type GitLabOrfChatEventType = "push" | "tag_push" | "merge_request" | "issue" | "pipeline";
export type GitLabOrfChatChannelOption = {
  displayName: string;
  id: string;
  memberCount: number;
  name: string | null;
  type: "public" | "private";
};
export type GitLabOrfChatProjectOption = {
  id: string;
  path: string;
  url: string;
};
export type GitLabOrfChatSubscription = {
  channelDisplayName: string;
  channelId: string;
  channelType: "public" | "private";
  createdAt: string;
  enabled: boolean;
  eventTypes: GitLabOrfChatEventType[];
  gitlabGroupPath: string;
  gitlabProjectId: string | null;
  gitlabProjectPath: string | null;
  gitlabProjectUrl: string;
  id: string;
  scope: "group" | "project";
  updatedAt: string;
};
export type GitLabOrfChatSettingsData = {
  channels: GitLabOrfChatChannelOption[];
  config: GitLabOrfChatConfigStatus;
  eventTypes: GitLabOrfChatEventType[];
  gitlabProjectListError: string | null;
  projects: GitLabOrfChatProjectOption[];
  subscriptions: GitLabOrfChatSubscription[];
};
export type WorkLogObjectivesResponse = {
  categories: WorkLogCategoryOption[];
  classificationSuggestionEnabled: boolean;
  objectives: WorkLogObjectiveOption[];
};
export type WorkLogDayResponse = { entries: WorkLogEntry[] };
export type WorkLogActivityResponse = { entries: WorkLogActivityItem[] };
export type WorkLogReportResponse = { report: WorkLogReport };
export type WorkLogReminderStateResponse = { reminder: WorkLogReminderState };
export type WorkLogClassificationSuggestionResponse = {
  suggestion: WorkLogClassificationSuggestion | null;
};
export type WorkLogEntrySaveInput = {
  bodyMarkdown: string;
  categoryId?: string | null;
  categoryName?: string | null;
  durationMinutes?: number | null;
  objectiveId?: string | null;
  remainingEstimatePercent?: number | null;
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
export type ChatSettingsData = {
  attachmentMaxBytes: number;
  infrastructureMaxBytes: number;
};
export type UserPreferences = {
  userId: string;
  defaultLandingPath: string | null;
  sidebarCollapsed: boolean | null;
  chatTheme: ChatTheme;
  display: UserDisplayPreferences;
  /** Compatibility projection for legacy clients. New writes must use backgrounds[scene]. */
  appBackground: VisualBackgroundConfig | null;
  backgrounds: Partial<Record<VisualBackgroundScene, VisualBackgroundConfig | null>>;
  notificationDisplay: {
    toastEnabled: boolean;
  };
};
export type UserPreferencesPatch = Partial<Pick<UserPreferences, "defaultLandingPath" | "sidebarCollapsed" | "chatTheme" | "display" | "backgrounds">> & {
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

function defaultApiErrorMessage(status: number, path: string) {
  if (status === 502 || status === 503 || status === 504) {
    return "服务暂时不可用，请稍后重试";
  }
  if (status >= 500) {
    return "服务端暂时出错，请稍后重试";
  }
  return `API ${status}: ${path}`;
}

function textPayloadLooksLikeHtmlErrorPage(payload: string) {
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<\/html>/i.test(payload);
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
    if (textPayloadLooksLikeHtmlErrorPage(payload) || status >= 500) {
      return defaultApiErrorMessage(status, path);
    }
    return payload.trim();
  }

  return defaultApiErrorMessage(status, path);
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

function parseXhrPayload(xhr: XMLHttpRequest) {
  const contentType = xhr.getResponseHeader("content-type") ?? "";
  const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
  if (!contentType.includes("application/json")) return text;

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
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

function uploadFormDataJson<T>(
  path: string,
  formData: FormData,
  options: { method?: "POST" | "PUT" | "PATCH"; onProgress?: (progress: ApiUploadProgress) => void } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? "POST", path);
    xhr.withCredentials = true;

    if (options.onProgress) {
      xhr.upload.onprogress = (event) => {
        const totalBytes = event.lengthComputable && event.total > 0 ? event.total : null;
        options.onProgress?.({
          lengthComputable: event.lengthComputable,
          loadedBytes: event.loaded,
          percent: totalBytes ? Math.max(0, Math.min(100, (event.loaded / totalBytes) * 100)) : null,
          timestampMs: globalThis.performance?.now?.() ?? Date.now(),
          totalBytes,
        });
      };
    }

    xhr.onload = () => {
      const payload = parseXhrPayload(xhr);
      if (xhr.status < 200 || xhr.status >= 300) {
        emitAuthenticationExpired(path, xhr.status);
        reject(new ApiError(xhr.status, path, apiErrorMessage(payload, xhr.status, path)));
        return;
      }
      resolve(payload as T);
    };
    xhr.onerror = () => reject(new ApiError(0, path, "网络请求失败"));
    xhr.onabort = () => reject(new ApiError(0, path, "上传已取消"));
    xhr.send(formData);
  });
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

export async function getSystemConversations() {
  return apiJson<SystemConversationsResponse>("/api/chat/system-conversations");
}

export async function getSystemConversationMessages(input: { conversationId: SystemConversationId; limit?: number }) {
  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<SystemConversationMessagesResponse>(
    `/api/chat/system-conversations/${encodeURIComponent(input.conversationId)}/messages${suffix}`,
  );
}

export async function markSystemConversationMessageReadRequest(input: { conversationId: SystemConversationId; messageId: string }) {
  return apiJson<SystemConversationMessageStateResponse>(
    `/api/chat/system-conversations/${encodeURIComponent(input.conversationId)}/messages/${encodeURIComponent(input.messageId)}/read`,
    { method: "PATCH" },
  );
}

export async function markSystemConversationMessageUnreadRequest(input: { conversationId: SystemConversationId; messageId: string }) {
  return apiJson<SystemConversationMessageStateResponse>(
    `/api/chat/system-conversations/${encodeURIComponent(input.conversationId)}/messages/${encodeURIComponent(input.messageId)}/unread`,
    { method: "PATCH" },
  );
}

export async function markSystemConversationReadRequest(conversationId: SystemConversationId) {
  return apiJson<SystemConversationReadAllResponse>(
    `/api/chat/system-conversations/${encodeURIComponent(conversationId)}/read-all`,
    { method: "PATCH" },
  );
}

export async function replyToSystemConversationMessageRequest(input: { body: string; conversationId: SystemConversationId; messageId: string }) {
  return apiJson<SystemConversationReplyResponse>(
    `/api/chat/system-conversations/${encodeURIComponent(input.conversationId)}/messages/${encodeURIComponent(input.messageId)}/replies`,
    {
      method: "POST",
      body: JSON.stringify({ body: input.body }),
    },
  );
}

export async function getLatestClientUpdateRelease(signal?: AbortSignal) {
  return apiJson<ClientUpdateReleaseResponse>("/api/client-updates/latest", { signal });
}

export async function getClientUpdateRelease(version: string, signal?: AbortSignal) {
  return apiJson<ClientUpdateReleaseResponse>(`/api/client-updates/releases/${encodeURIComponent(version)}`, { signal });
}

export async function registerPushDeviceRequest(input: PushDeviceRegistrationInput) {
  return apiJson<PushDeviceRegistrationResponse>("/api/push/devices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function registerPushVendorDeviceRequest(input: PushVendorDeviceRegistrationInput) {
  return apiJson<PushDeviceRegistrationResponse>("/api/push/vendor-devices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reportPushVendorRegistrationStatusRequest(input: PushVendorRegistrationStatusInput) {
  return apiJson<{ ok: true; pushEnabled: boolean }>("/api/push/vendor-registration-status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reportPushRegistrationStatusRequest(input: PushRegistrationStatusInput) {
  return apiJson<{ ok: true; pushEnabled: boolean }>("/api/push/registration-status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokePushDeviceRequest(input: Pick<PushDeviceRegistrationInput, "platform" | "token">) {
  return apiJson<{ revoked: number }>("/api/push/devices/revoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokePushVendorDeviceRequest(input: Pick<PushVendorDeviceRegistrationInput, "platform" | "token" | "vendor">) {
  return apiJson<{ revoked: number }>("/api/push/vendor-devices/revoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function getFeedbackReferences(feedbackIds: string[]) {
  const query = new URLSearchParams();
  for (const feedbackId of feedbackIds.slice(0, 100)) {
    query.append("id", feedbackId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<FeedbackReferencesResponse>(`/api/feedback/references${suffix}`);
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

export async function getChatMessageContext(input: { channelId: string; limit?: number; messageId: string }) {
  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<ChatMessageContextResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}/context${suffix}`,
  );
}

export async function getChatUnreadContext(input: {
  anchor?: { lastReadAt?: string | null; manuallyUnread: boolean } | null;
  channelId: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.anchor) {
    query.set("lastReadAt", input.anchor.lastReadAt ?? "");
    query.set("manuallyUnread", input.anchor.manuallyUnread ? "true" : "false");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<ChatMessageContextResponse>(`/api/chat/channels/${encodeURIComponent(input.channelId)}/unread-context${suffix}`);
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
    projectId?: string | null;
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

export async function markChatChannelReadRequest(channelId: string, input: { includeThreads?: boolean; messageId?: string | null } = {}) {
  return apiJson<ChatChannelResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/read`, {
    method: "PATCH",
    body: JSON.stringify({
      includeThreads: input.includeThreads ?? false,
      messageId: input.messageId ?? null,
    }),
  });
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

export async function uploadChatAttachment(input: { channelId: string; file: File; onProgress?: (progress: ApiUploadProgress) => void }) {
  const formData = new FormData();
  formData.set("file", input.file);
  return uploadFormDataJson<ChatAttachmentUploadResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/attachments`,
    formData,
    { onProgress: input.onProgress },
  );
}

export async function getDriveBootstrap() {
  return apiJson<DriveBootstrapResponse>("/api/drive");
}

export async function getChatDriveBootstrap(channelId: string) {
  return apiJson<ChatDriveBootstrapResponse>(`/api/chat/channels/${encodeURIComponent(channelId)}/drive`);
}

export async function getDriveChildren(input: { parentNodeId: string }) {
  return apiJson<DriveChildrenResponse>(
    `/api/drive/nodes/${encodeURIComponent(input.parentNodeId)}/children`,
  );
}

export async function searchDriveRequest(input: {
  contextId?: string;
  contextType?: DriveSearchContextFilter;
  limit?: number;
  previewKind?: DrivePreviewKind | "all";
  query?: string;
  scope?: DriveSearchScope;
  source?: DriveSearchSource;
  status?: DriveSearchStatus;
  type?: DriveSearchType;
  updated?: DriveSearchUpdatedRange;
  uploaderId?: string;
}) {
  const query = new URLSearchParams();
  if (input.query?.trim()) query.set("q", input.query.trim());
  if (input.type) query.set("type", input.type);
  if (input.scope) query.set("scope", input.scope);
  if (input.status) query.set("status", input.status);
  if (input.previewKind) query.set("previewKind", input.previewKind);
  if (input.source) query.set("source", input.source);
  if (input.uploaderId) query.set("uploaderId", input.uploaderId);
  if (input.updated) query.set("updated", input.updated);
  if (input.contextId) query.set("contextId", input.contextId);
  if (input.contextType) query.set("contextType", input.contextType);
  if (input.limit) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<DriveSearchResponse>(`/api/drive/search${suffix}`);
}

export async function getDriveTrashRequest() {
  return apiJson<DriveSearchResponse>("/api/drive/trash");
}

export async function getDriveNodeDetailsRequest(input: { nodeId: string }) {
  return apiJson<DriveNodeDetailsResponse>(
    `/api/drive/nodes/${encodeURIComponent(input.nodeId)}/details`,
  );
}

export async function createDriveFolderRequest(input: { name: string; parentNodeId: string }) {
  return apiJson<DriveNodeResponse>("/api/drive/folders", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      parentNodeId: input.parentNodeId,
    }),
  });
}

export async function uploadDriveRequest(input: {
  file: File;
  onProgress?: (progress: ApiUploadProgress) => void;
  parentNodeId: string;
}) {
  const formData = new FormData();
  formData.set("parentNodeId", input.parentNodeId);
  formData.set("file", input.file);
  return uploadFormDataJson<DriveNodeResponse>(
    "/api/drive/upload",
    formData,
    { onProgress: input.onProgress },
  );
}

export async function uploadChatDriveFileRequest(input: {
  channelId: string;
  file: File;
  onProgress?: (progress: ApiUploadProgress) => void;
  parentNodeId: string;
}) {
  const formData = new FormData();
  formData.set("parentNodeId", input.parentNodeId);
  formData.set("file", input.file);
  return uploadFormDataJson<DriveNodeResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/drive/upload`,
    formData,
    { onProgress: input.onProgress },
  );
}

export async function deleteDriveNodeRequest(input: { nodeId: string }) {
  return apiJson<{ status?: "ok"; deletedNodeIds: string[] }>(
    `/api/drive/nodes/${encodeURIComponent(input.nodeId)}`,
    { method: "DELETE" },
  );
}

export async function restoreDriveNodeRequest(input: { nodeId: string }) {
  return apiJson<DriveNodeRestoreResponse>(
    `/api/drive/nodes/${encodeURIComponent(input.nodeId)}/restore`,
    { method: "POST" },
  );
}

export async function getDriveFileVersionsRequest(input: { fileId: string }) {
  return apiJson<DriveFileVersionsResponse>(
    `/api/drive/files/${encodeURIComponent(input.fileId)}/versions`,
  );
}

export async function uploadDriveFileVersionRequest(input: {
  file: File;
  fileId: string;
  onProgress?: (progress: ApiUploadProgress) => void;
}) {
  const formData = new FormData();
  formData.set("file", input.file);
  return uploadFormDataJson<DriveVersionMutationResponse>(
    `/api/drive/files/${encodeURIComponent(input.fileId)}/versions`,
    formData,
    { onProgress: input.onProgress },
  );
}

export async function restoreDriveFileVersionRequest(input: { fileId: string; versionId: string }) {
  return apiJson<DriveVersionMutationResponse>(
    `/api/drive/files/${encodeURIComponent(input.fileId)}/versions/${encodeURIComponent(input.versionId)}/restore`,
    { method: "POST" },
  );
}

export async function addDriveContextLinkRequest(input: {
  contextId: string;
  contextType: DriveContextType;
  label?: string | null;
  nodeId: string;
}) {
  return apiJson<DriveNodeDetailsResponse>(
    `/api/drive/nodes/${encodeURIComponent(input.nodeId)}/context-links`,
    {
      method: "POST",
      body: JSON.stringify({
        contextId: input.contextId,
        contextType: input.contextType,
        label: input.label ?? null,
      }),
    },
  );
}

export async function deleteDriveContextLinkRequest(input: { linkId: string; nodeId: string }) {
  return apiJson<DriveNodeDetailsResponse>(
    `/api/drive/nodes/${encodeURIComponent(input.nodeId)}/context-links/${encodeURIComponent(input.linkId)}`,
    { method: "DELETE" },
  );
}

export async function addChatDriveLinkRequest(input: {
  channelId: string;
  isDefaultUploadTarget?: boolean;
  label?: string | null;
  nodeId: string;
}) {
  return apiJson<ChatDriveBootstrapResponse>(`/api/chat/channels/${encodeURIComponent(input.channelId)}/drive/links`, {
    method: "POST",
    body: JSON.stringify({
      isDefaultUploadTarget: input.isDefaultUploadTarget,
      label: input.label,
      nodeId: input.nodeId,
    }),
  });
}

export async function updateChatDriveLinkRequest(input: {
  channelId: string;
  isDefaultUploadTarget?: boolean;
  label?: string | null;
  linkId: string;
}) {
  return apiJson<ChatDriveBootstrapResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/drive/links/${encodeURIComponent(input.linkId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        isDefaultUploadTarget: input.isDefaultUploadTarget,
        label: input.label,
      }),
    },
  );
}

export async function deleteChatDriveLinkRequest(input: { channelId: string; linkId: string }) {
  return apiJson<ChatDriveBootstrapResponse>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/drive/links/${encodeURIComponent(input.linkId)}`,
    { method: "DELETE" },
  );
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

export async function getChatUnreadSummary() {
  return apiJson<ChatUnreadSummaryResponse>("/api/chat/unread-summary");
}

export async function getWorkLogObjectives(input: { mode?: "default" | "search"; q?: string } = {}) {
  const params = new URLSearchParams();
  if (input.mode) params.set("mode", input.mode);
  if (input.q?.trim()) params.set("q", input.q.trim());
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiJson<WorkLogObjectivesResponse>(`/api/work-logs/objectives${query}`);
}

export async function getWorkLogReminderState() {
  return apiJson<WorkLogReminderStateResponse>("/api/work-logs/reminder-state");
}

export async function snoozeWorkLogReminder() {
  return apiJson<WorkLogReminderStateResponse>("/api/work-logs/reminder-state/snooze", {
    method: "POST",
  });
}

export async function suggestWorkLogClassification(input: { bodyMarkdown: string }) {
  return apiJson<WorkLogClassificationSuggestionResponse>("/api/work-logs/classification-suggestion", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getMyWorkLogDay(date: string) {
  const query = new URLSearchParams({ date });
  return apiJson<WorkLogDayResponse>(`/api/work-logs/my-day?${query.toString()}`);
}

export async function createMyWorkLogEntry(date: string, input: WorkLogEntrySaveInput) {
  return apiJson<WorkLogDayResponse>(`/api/work-logs/my-day/${encodeURIComponent(date)}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMyWorkLogEntry(entryId: string, input: WorkLogEntrySaveInput) {
  return apiJson<WorkLogDayResponse>(`/api/work-logs/entries/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMyWorkLogEntry(entryId: string) {
  return apiJson<WorkLogDayResponse>(`/api/work-logs/entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

export async function getWorkLogActivity(input: {
  from?: string;
  limit?: number;
  objectiveId?: string;
  to?: string;
  userId?: string;
} = {}) {
  const query = new URLSearchParams();
  if (input.from) query.set("from", input.from);
  if (input.to) query.set("to", input.to);
  if (input.userId) query.set("userId", input.userId);
  if (input.objectiveId) query.set("objectiveId", input.objectiveId);
  if (input.limit) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<WorkLogActivityResponse>(`/api/work-logs/activity${suffix}`);
}

export async function getWorkLogReport(input: {
  from: string;
  scope: WorkLogReportScope;
  to: string;
}) {
  const query = new URLSearchParams({
    from: input.from,
    scope: input.scope,
    to: input.to,
  });
  return apiJson<WorkLogReportResponse>(`/api/work-logs/report?${query.toString()}`);
}

export async function getVisualBackgrounds(scene: VisualBackgroundScene) {
  const response = await apiJson<ApiEnvelope<VisualBackgroundsData>>(`/api/settings/visual/backgrounds?scene=${encodeURIComponent(scene)}`);
  return response.data;
}

export async function getChatSettings() {
  const response = await apiJson<ApiEnvelope<ChatSettingsData>>("/api/settings/chat");
  return response.data;
}

export async function saveChatSettings(input: Pick<ChatSettingsData, "attachmentMaxBytes">) {
  const response = await apiJson<ApiEnvelope<ChatSettingsData>>("/api/settings/chat", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function getGitLabOrfChatSettings() {
  const response = await apiJson<ApiEnvelope<GitLabOrfChatSettingsData>>("/api/settings/gitlab-orf-chat");
  return response.data;
}

export async function getGitLabOrfChatChannelSubscriptions(channelId: string) {
  const response = await apiJson<ApiEnvelope<GitLabOrfChatSettingsData>>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/gitlab-subscriptions`,
  );
  return response.data;
}

export async function createGitLabOrfChatChannelSubscription(input: {
  channelId: string;
  enabled?: boolean;
  eventTypes?: GitLabOrfChatEventType[];
  projectId?: string;
  projectPath?: string;
  projectUrl?: string;
  scope: "group" | "project";
}) {
  const response = await apiJson<ApiEnvelope<GitLabOrfChatSettingsData>>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/gitlab-subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        enabled: input.enabled,
        eventTypes: input.eventTypes,
        projectId: input.projectId,
        projectPath: input.projectPath,
        projectUrl: input.projectUrl ?? "",
        scope: input.scope,
      }),
    },
  );
  return response.data;
}

export async function updateGitLabOrfChatChannelSubscription(input: {
  channelId: string;
  enabled?: boolean;
  eventTypes?: GitLabOrfChatEventType[];
  subscriptionId: string;
}) {
  const response = await apiJson<ApiEnvelope<GitLabOrfChatSettingsData>>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/gitlab-subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        enabled: input.enabled,
        eventTypes: input.eventTypes,
      }),
    },
  );
  return response.data;
}

export async function deleteGitLabOrfChatChannelSubscription(input: {
  channelId: string;
  subscriptionId: string;
}) {
  const response = await apiJson<ApiEnvelope<GitLabOrfChatSettingsData>>(
    `/api/chat/channels/${encodeURIComponent(input.channelId)}/gitlab-subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    { method: "DELETE" },
  );
  return response.data;
}

export async function reconcileGitLabOrfChatSettings() {
  const response = await apiJson<ApiEnvelope<{ settings: GitLabOrfChatSettingsData }>>("/api/settings/gitlab-orf-chat/reconcile", {
    method: "POST",
  });
  return response.data.settings;
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

export async function getPersonalBackgrounds(scene: VisualBackgroundScene = "sidebar_background") {
  const response = await apiJson<ApiEnvelope<PersonalBackgroundsData>>(`/api/settings/personal/backgrounds?scene=${encodeURIComponent(scene)}`);
  return response.data;
}

export async function uploadPersonalBackground(scene: VisualBackgroundScene, file: File) {
  const formData = new FormData();
  formData.set("scene", scene);
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
