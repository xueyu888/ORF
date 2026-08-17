import { feedbackImpactValues, type FeedbackImpact } from "../../contracts";

const feedbackCreateDraftSchemaVersion = 1;
const feedbackCreateDraftStoragePrefix = "orf.feedback.createDraft.v1";
const feedbackPendingAttachmentPattern = /!\[[^\]\n]*\]\(orf-pending-attachment:[A-Za-z0-9_-]+\)/g;

export type FeedbackCreateDraftScope = {
  readonly projectContextId?: string | null;
  readonly userId: string;
};

export type FeedbackCreateDraftInput = {
  readonly assigneeUserId: string;
  readonly body: string;
  readonly cause: string;
  readonly impact: FeedbackImpact;
  readonly pendingAttachmentCount?: number;
  readonly projectId: string;
  readonly title: string;
};

export type StoredFeedbackCreateDraft = {
  readonly assigneeUserId: string;
  readonly body: string;
  readonly cause: string;
  readonly droppedAttachmentCount: number;
  readonly impact: FeedbackImpact;
  readonly projectId: string;
  readonly schemaVersion: typeof feedbackCreateDraftSchemaVersion;
  readonly title: string;
  readonly updatedAt: string;
};

export function feedbackCreateDraftStorageKey(scope: FeedbackCreateDraftScope) {
  const userId = normalizeStorageSegment(scope.userId);
  const projectContextId = normalizeStorageSegment(scope.projectContextId) || "default";
  return `${feedbackCreateDraftStoragePrefix}.${encodeURIComponent(userId)}.${encodeURIComponent(projectContextId)}`;
}

export function readStoredFeedbackCreateDraft(scope: FeedbackCreateDraftScope): StoredFeedbackCreateDraft | null {
  const storage = feedbackCreateDraftBrowserStorage();
  if (!storage) return null;

  try {
    return parseStoredFeedbackCreateDraft(storage.getItem(feedbackCreateDraftStorageKey(scope)));
  } catch {
    return null;
  }
}

export function writeStoredFeedbackCreateDraft(scope: FeedbackCreateDraftScope, draft: FeedbackCreateDraftInput) {
  const storage = feedbackCreateDraftBrowserStorage();
  if (!storage) return;

  const stored = storedFeedbackCreateDraftFromInput(draft);
  const key = feedbackCreateDraftStorageKey(scope);
  try {
    if (!feedbackCreateDraftHasRecoverableContent(stored)) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // 本机草稿是体验兜底；存储不可用时不能阻塞反馈创建。
  }
}

export function clearStoredFeedbackCreateDraft(scope: FeedbackCreateDraftScope) {
  const storage = feedbackCreateDraftBrowserStorage();
  try {
    storage?.removeItem(feedbackCreateDraftStorageKey(scope));
  } catch {
    // 本机草稿清理失败不影响正式反馈状态。
  }
}

function storedFeedbackCreateDraftFromInput(input: FeedbackCreateDraftInput): StoredFeedbackCreateDraft {
  const cleanedBody = stripPendingAttachmentReferences(input.body);
  return {
    assigneeUserId: stringField(input.assigneeUserId),
    body: cleanedBody.body,
    cause: stringField(input.cause),
    droppedAttachmentCount: Math.max(cleanedBody.count, Math.max(0, input.pendingAttachmentCount ?? 0)),
    impact: input.impact,
    projectId: stringField(input.projectId),
    schemaVersion: feedbackCreateDraftSchemaVersion,
    title: stringField(input.title),
    updatedAt: new Date().toISOString(),
  };
}

function feedbackCreateDraftHasRecoverableContent(draft: StoredFeedbackCreateDraft) {
  return Boolean(
    draft.title.trim()
      || draft.body.trim()
      || draft.droppedAttachmentCount > 0
  );
}

function parseStoredFeedbackCreateDraft(raw: string | null): StoredFeedbackCreateDraft | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<StoredFeedbackCreateDraft>;
  if (parsed.schemaVersion !== feedbackCreateDraftSchemaVersion) return null;

  const impact = stringField(parsed.impact);
  if (!feedbackImpactValues.includes(impact as FeedbackImpact)) return null;

  const draft: StoredFeedbackCreateDraft = {
    assigneeUserId: stringField(parsed.assigneeUserId),
    body: stringField(parsed.body),
    cause: stringField(parsed.cause),
    droppedAttachmentCount: Math.max(0, Number(parsed.droppedAttachmentCount) || 0),
    impact: impact as FeedbackImpact,
    projectId: stringField(parsed.projectId),
    schemaVersion: feedbackCreateDraftSchemaVersion,
    title: stringField(parsed.title),
    updatedAt: stringField(parsed.updatedAt),
  };

  return feedbackCreateDraftHasRecoverableContent(draft) ? draft : null;
}

function stripPendingAttachmentReferences(value: string) {
  let count = 0;
  const body = stringField(value)
    .replace(feedbackPendingAttachmentPattern, () => {
      count += 1;
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, count };
}

function feedbackCreateDraftBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeStorageSegment(value: string | null | undefined) {
  return stringField(value).trim();
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
