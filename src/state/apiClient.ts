import type { AppNotification, BountySource, ChallengeApplication, CommentAttachment, CommentTargetType, Objective, OrfState, OrfUser, Result } from "../types/orf";
import type { VisualBackgroundScene } from "../domain/settings/visualBackgrounds";
export type { VisualBackgroundScene } from "../domain/settings/visualBackgrounds";

export type TaskManagementData = Pick<
  OrfState,
  | "objectives"
  | "results"
  | "tasks"
  | "evidence"
  | "feedback"
  | "comments"
  | "objectiveLoot"
  | "objectiveTrialReviews"
  | "objectiveAlignmentRequests"
  | "pointLedger"
  | "permissionRules"
>;
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
export type BountyHallItem = {
  applications: ChallengeApplication[];
  approvedApplicants: string[];
  challengers: string[];
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isCurrentChallenger: boolean;
  isRecruitment: boolean;
  objective: Objective;
  pendingApplications: ChallengeApplication[];
  result: Result | null;
  results: Result[];
  source: BountySource;
};
export type BountyHallData = {
  publicItems: BountyHallItem[];
  recruitmentItems: BountyHallItem[];
  availableItems: BountyHallItem[];
  objectiveOptions: Objective[];
  contribution: { points: number };
};
export type MyChallengesScope = "mine" | "all";
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
