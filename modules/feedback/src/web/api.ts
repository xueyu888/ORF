import type {
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackSubscriptionMutationMode,
  FeedbackTransitionInput,
} from "../contracts";
import type {
  FeedbackIssueReadModelData,
  FeedbackSubscription,
  FeedbackWebIssue,
  FeedbackWebProjectChatChannel,
  FeedbackWebUserPreferences,
  FeedbackWebUserSummary,
} from "./types";

export class FeedbackWebApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = "FeedbackWebApiError";
    this.status = status;
    this.url = url;
  }
}

export type CreateFeedbackInput = {
  assigneeUserId?: string | null;
  attachments?: Array<{ file: File; id: string }>;
  causeCategories: string[];
  description: string;
  impact: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title: string;
};

export type UpdateFeedbackMetadataInput = {
  causeCategories?: string[];
  description?: string;
  expectedVersion: number;
  impact?: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title?: string;
};

export type AddFeedbackRelationInput = {
  expectedVersion: number;
  targetFeedbackId: string;
  type: FeedbackRelationType;
};

export type FeedbackImportPreflight = {
  batchId: string;
  commitAvailable: boolean;
  commitBlockedReason?: string;
  errors: Array<{ field?: string; message: string; row?: number }>;
  fileName: string;
  sourceKind: "csv" | "zip";
  summary: {
    attachmentBytes: number;
    errors: number;
    newRecords: number;
    skippedRecords: number;
    totalRecords: number;
    updateRecords: number;
  };
  warnings: Array<{ field?: string; message: string; row?: number }>;
};

export type FeedbackImportCommitResult = {
  batchId: string;
  createdFeedbackIds: string[];
  skippedRecords: number;
};

export async function getFeedbackIssueReadModel() {
  return apiJson<FeedbackIssueReadModelData>("/api/feedback");
}

export async function getFeedbackIssueDetailReadModel(feedbackId: string) {
  return apiJson<FeedbackIssueReadModelData>(`/api/feedback/${encodeURIComponent(feedbackId)}`);
}

export async function getFeedbackAssignees() {
  return apiJson<{ users: FeedbackWebUserSummary[] }>("/api/feedback/assignees");
}

export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackWebIssue> {
  const formData = new FormData();
  formData.set("title", input.title);
  formData.set("causeCategories", JSON.stringify(input.causeCategories));
  formData.set("impact", input.impact);
  formData.set("description", input.description);
  formData.set("priority", input.priority ?? "");
  formData.set("assigneeUserId", input.assigneeUserId ?? "");
  formData.set("projectId", input.projectId ?? "");
  for (const attachment of input.attachments ?? []) {
    formData.set(`attachment:${attachment.id}`, attachment.file);
  }

  const response = await apiJson<{ feedback: FeedbackWebIssue }>("/api/feedback", {
    method: "POST",
    body: formData,
  });
  return response.feedback;
}

export async function transitionFeedback(feedbackId: string, command: FeedbackTransitionInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/transitions`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export async function updateFeedbackMetadata(feedbackId: string, input: UpdateFeedbackMetadataInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateFeedbackAssignee(feedbackId: string, assigneeUserId: string | null, expectedVersion: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/assignee`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeUserId, expectedVersion }),
  });
}

export async function addFeedbackRelation(feedbackId: string, input: AddFeedbackRelationInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeFeedbackRelation(feedbackId: string, relationId: string, expectedVersion: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function markFeedbackViewed(feedbackId: string, seenThroughSequence: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/view`, {
    method: "PUT",
    body: JSON.stringify({ seenThroughSequence }),
  });
}

export async function getFeedbackSubscription(feedbackId: string) {
  return apiJson<{ subscription: FeedbackSubscription }>(`/api/feedback/${encodeURIComponent(feedbackId)}/subscription`);
}

export async function updateFeedbackSubscription(feedbackId: string, mode: FeedbackSubscriptionMutationMode) {
  return apiJson<{ subscription: FeedbackSubscription }>(`/api/feedback/${encodeURIComponent(feedbackId)}/subscription`, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

export async function getProjectChatChannels(projectId: string) {
  const query = new URLSearchParams({ projectId });
  return apiJson<{ channels: FeedbackWebProjectChatChannel[] }>(`/api/chat/project-channels?${query.toString()}`);
}

export async function getUserPreferences(options: { userId?: string | null } = {}) {
  const response = await apiJson<{ data: FeedbackWebUserPreferences }>("/api/settings/personal/preferences");
  if (options.userId && response.data.userId !== options.userId) {
    throw new FeedbackWebApiError(409, "/api/settings/personal/preferences", "个人设置用户不一致，请刷新后重试");
  }
  return response.data;
}

export async function saveUserPreferences(input: {
  filterPreferences: Record<string, unknown>;
}) {
  const response = await apiJson<{ data: FeedbackWebUserPreferences }>("/api/settings/personal/preferences", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function preflightFeedbackImport(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return apiJson<{ preflight: FeedbackImportPreflight }>("/api/feedback/imports/preflight", {
    method: "POST",
    body: formData,
  });
}

export async function commitFeedbackImport(batchId: string) {
  return apiJson<{ result: FeedbackImportCommitResult }>(`/api/feedback/imports/${encodeURIComponent(batchId)}/commit`, {
    method: "POST",
  });
}

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(url, init);
  return response.json() as Promise<T>;
}

export async function apiRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new FeedbackWebApiError(response.status, url, await apiErrorMessage(response));
  }
  return response;
}

export function feedbackMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof FeedbackWebApiError) {
    if (error.status === 403) return "当前账号没有权限执行这个反馈操作";
    if (error.status === 404) return "反馈不存在或当前账号不可见";
    if (error.status === 409) return "反馈已被其他人更新，请刷新后重试";
    if (error.status === 413) return "附件过大";
    return error.message || fallback;
  }
  return fallback;
}

async function apiErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
    return message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
