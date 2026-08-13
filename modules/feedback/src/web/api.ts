import type {
  FeedbackImpact,
  FeedbackFollowUpInput,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackSubscriptionMutationMode,
} from "../contracts";
import type {
  FeedbackIssueReadModelData,
  FeedbackDashboardSummary,
  FeedbackReferenceSummary,
  FeedbackReferenceCardData,
  FeedbackReferenceCardQuery,
  FeedbackSubscription,
  FeedbackWebProject,
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
  expectedVersion: number;
  impact?: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title?: string;
};

export type UpdateFeedbackReportInput = {
  description: string;
  expectedVersion: number;
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
  fieldMappings?: Array<{ field: string; label: string; required: boolean; sourceColumn: string | null }>;
  fileName: string;
  referenceIssues?: Array<{
    canClear: boolean;
    field: "assignee_user_id" | "project_id";
    kind: "assignee" | "project";
    rows: number[];
    sourceValue: string;
  }>;
  sourceKind: "csv";
  summary: {
    attachmentBytes: number;
    errors: number;
    newRecords: number;
    skippedRecords: number;
    totalRecords: number;
    updateRecords: number;
  };
  updateDiffs?: Array<{
    externalId: string;
    feedbackId: string;
    fields: Array<{ currentValue: string; field: string; incomingValue: string; label: string }>;
    row?: number;
  }>;
  warnings: Array<{ field?: string; message: string; row?: number }>;
};

export type FeedbackImportCommitResult = {
  batchId: string;
  createdFeedbackIds: string[];
  report: { content: string; fileName: string; mimeType: string };
  skippedRecords: number;
};

export type FeedbackImportReferenceMappings = {
  assigneeUserIds?: Record<string, string | null>;
  projectIds?: Record<string, string | null>;
};

export type FeedbackImportReferenceOptions = {
  assignees: FeedbackWebUserSummary[];
  projects: FeedbackWebProject[];
};

export type FeedbackAttachmentSettings = {
  attachmentMaxBytes: number;
  infrastructureMaxBytes: number;
};

export async function getFeedbackIssueReadModel(query = "") {
  const normalizedQuery = query.trim().replace(/^\?/, "");
  const suffix = normalizedQuery ? `?${normalizedQuery}` : "";
  return apiJson<FeedbackIssueReadModelData>(`/api/feedback${suffix}`);
}

export async function getFeedbackDashboardSummary() {
  return apiJson<FeedbackDashboardSummary>("/api/feedback/summary");
}

export async function getFeedbackIssueDetailReadModel(feedbackId: string) {
  return apiJson<FeedbackIssueReadModelData>(`/api/feedback/${encodeURIComponent(feedbackId)}`);
}

export async function getFeedbackReferenceCard(input: FeedbackReferenceCardQuery, options: { signal?: AbortSignal } = {}) {
  const feedbackId = input.feedbackId.trim();
  const query = new URLSearchParams();
  const activityId = input.activityId?.trim();
  const commentMessageId = input.commentMessageId?.trim();
  if (activityId) query.set("activity", activityId);
  if (commentMessageId) query.set("comment", commentMessageId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<{ reference: FeedbackReferenceCardData }>(
    `/api/feedback/${encodeURIComponent(feedbackId)}/reference${suffix}`,
    { signal: options.signal },
  );
}

export async function getFeedbackReferences(input: {
  ids?: readonly string[];
  limit?: number;
  query?: string;
  signal?: AbortSignal;
} = {}) {
  const query = new URLSearchParams();
  for (const id of input.ids ?? []) {
    const normalizedId = id.trim();
    if (normalizedId) query.append("id", normalizedId);
  }
  const searchText = input.query?.trim();
  if (searchText) query.set("q", searchText);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiJson<{ feedback: FeedbackReferenceSummary[] }>(`/api/feedback/references${suffix}`, {
    signal: input.signal,
  });
  return response.feedback;
}

export async function getFeedbackAssignees() {
  return apiJson<{ users: FeedbackWebUserSummary[] }>("/api/feedback/assignees");
}

export async function getFeedbackAttachmentSettings() {
  const response = await apiJson<{ data: FeedbackAttachmentSettings }>("/api/settings/feedback");
  return response.data;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<string> {
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

  const response = await apiJson<{ feedbackId: string }>("/api/feedback", {
    method: "POST",
    body: formData,
  });
  return response.feedbackId;
}

export async function submitFeedbackFollowUp(feedbackId: string, input: FeedbackFollowUpInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/follow-ups`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFeedbackMetadata(feedbackId: string, input: UpdateFeedbackMetadataInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateFeedbackReport(feedbackId: string, input: UpdateFeedbackReportInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/report`, {
    method: "PATCH",
    body: JSON.stringify(input),
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

export async function preflightFeedbackImport(file: File, referenceMappings?: FeedbackImportReferenceMappings) {
  const formData = new FormData();
  formData.set("file", file);
  if (referenceMappings) {
    formData.set("referenceMappings", JSON.stringify(referenceMappings));
  }
  return apiJson<{ preflight: FeedbackImportPreflight; referenceOptions: FeedbackImportReferenceOptions }>("/api/feedback/imports/preflight", {
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
    if (error.status === 413) return "附件总大小超过系统配置上限";
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
