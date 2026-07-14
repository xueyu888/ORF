import { objectiveFlowStatuses } from "../../domain/orfLifecycle";
import type { WorkLogObjectiveOption } from "../../types/orf";
import {
  blankWorkLogEditorDraft,
  type WorkLogEditorDraft,
} from "./workLogEditorModel";

export type StoredWorkLogEditorDraft = {
  draft: WorkLogEditorDraft;
  savedAt: string;
  selectedObjective: WorkLogObjectiveOption | null;
};

const workLogEditorDraftStorageVersion = 1;
const workLogEditorDraftStoragePrefix = "orf.workLogs.editorDraft.v1";
const objectiveFlowStatusSet = new Set<string>(objectiveFlowStatuses);

export type WorkLogEditorDraftMoveResult = "moved" | "targetOccupied" | "unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function cleanNullableString(value: unknown, maxLength: number) {
  const cleaned = cleanString(value, maxLength).trim();
  return cleaned || null;
}

function cleanNullableInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cleanClassificationKind(value: unknown): WorkLogEditorDraft["classificationKind"] {
  if (value === "category" || value === "objective" || value === "uncategorized") {
    return value;
  }
  return "uncategorized";
}

function parseStoredDraft(value: unknown): WorkLogEditorDraft {
  const fallback = blankWorkLogEditorDraft();
  if (!isRecord(value)) return fallback;

  const draft: WorkLogEditorDraft = {
    bodyMarkdown: cleanString(value.bodyMarkdown, 12000),
    categoryId: cleanString(value.categoryId, 200).trim(),
    categoryName: cleanString(value.categoryName, 48),
    categoryNameSnapshot: cleanNullableString(value.categoryNameSnapshot, 120),
    classificationKind: cleanClassificationKind(value.classificationKind),
    editingEntryId: cleanNullableString(value.editingEntryId, 200),
    objectiveId: cleanString(value.objectiveId, 200).trim(),
    objectiveTitleSnapshot: cleanNullableString(value.objectiveTitleSnapshot, 200),
    progressEstimatePercent: cleanNullableInteger(value.progressEstimatePercent, 0, 100),
  };
  if (draft.classificationKind === "objective") {
    return { ...draft, categoryId: "", categoryName: "" };
  }
  if (draft.classificationKind === "category") {
    return { ...draft, objectiveId: "", progressEstimatePercent: null };
  }
  return {
    ...draft,
    categoryId: "",
    categoryName: "",
    objectiveId: "",
    progressEstimatePercent: null,
  };
}

function parseStoredObjective(value: unknown): WorkLogObjectiveOption | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 200).trim();
  const title = cleanString(value.title, 200).trim();
  const flowStatus = cleanString(value.flowStatus, 40);
  const finalDueAt = cleanString(value.finalDueAt, 32).trim();
  if (!id || !title || !objectiveFlowStatusSet.has(flowStatus) || !finalDueAt) {
    return null;
  }
  return {
    id,
    title,
    flowStatus: flowStatus as WorkLogObjectiveOption["flowStatus"],
    finalDueAt,
    isUserChallenger: value.isUserChallenger === true,
    latestRemainingEstimatePercent: cleanNullableInteger(value.latestRemainingEstimatePercent, 0, 100),
  };
}

export function workLogEditorDraftStorageKey(input: { userId: string; workDate: string }) {
  return `${workLogEditorDraftStoragePrefix}.${input.userId}.${input.workDate}`;
}

export function workLogEditorDraftHasAutosaveContent(draft: WorkLogEditorDraft) {
  return Boolean(
    draft.editingEntryId ||
      draft.bodyMarkdown.trim() ||
      draft.categoryId.trim() ||
      draft.categoryName.trim() ||
      draft.objectiveId.trim() ||
      draft.progressEstimatePercent !== null,
  );
}

export function parseStoredWorkLogEditorDraft(raw: string | null): StoredWorkLogEditorDraft | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as unknown;
    if (!isRecord(payload) || payload.version !== workLogEditorDraftStorageVersion) {
      return null;
    }
    const draft = parseStoredDraft(payload.draft);
    if (!workLogEditorDraftHasAutosaveContent(draft)) return null;
    return {
      draft,
      savedAt: cleanString(payload.savedAt, 64),
      selectedObjective: parseStoredObjective(payload.selectedObjective),
    };
  } catch {
    return null;
  }
}

export function readStoredWorkLogEditorDraft(input: { userId: string; workDate: string }) {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredWorkLogEditorDraft(window.localStorage.getItem(workLogEditorDraftStorageKey(input)));
  } catch {
    return null;
  }
}

export function writeStoredWorkLogEditorDraft(input: {
  draft: WorkLogEditorDraft;
  selectedObjective?: WorkLogObjectiveOption | null;
  userId: string;
  workDate: string;
}) {
  if (typeof window === "undefined") return;
  const key = workLogEditorDraftStorageKey(input);
  try {
    if (!workLogEditorDraftHasAutosaveContent(input.draft)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      serializeStoredWorkLogEditorDraft(input.draft, input.selectedObjective),
    );
  } catch {
    // Local draft recovery is best-effort and must never block the editor.
  }
}

function serializeStoredWorkLogEditorDraft(
  draft: WorkLogEditorDraft,
  selectedObjective?: WorkLogObjectiveOption | null,
) {
  return JSON.stringify({
    version: workLogEditorDraftStorageVersion,
    savedAt: new Date().toISOString(),
    draft,
    selectedObjective: selectedObjective ?? null,
  });
}

export function moveStoredWorkLogEditorDraft(input: {
  draft: WorkLogEditorDraft;
  fromWorkDate: string;
  selectedObjective?: WorkLogObjectiveOption | null;
  toWorkDate: string;
  userId: string;
}): WorkLogEditorDraftMoveResult {
  if (typeof window === "undefined") return "unavailable";
  if (input.fromWorkDate === input.toWorkDate) return "moved";
  const fromKey = workLogEditorDraftStorageKey({ userId: input.userId, workDate: input.fromWorkDate });
  const toKey = workLogEditorDraftStorageKey({ userId: input.userId, workDate: input.toWorkDate });
  try {
    const targetDraft = parseStoredWorkLogEditorDraft(window.localStorage.getItem(toKey));
    if (targetDraft) return "targetOccupied";
    if (workLogEditorDraftHasAutosaveContent(input.draft)) {
      window.localStorage.setItem(
        toKey,
        serializeStoredWorkLogEditorDraft(input.draft, input.selectedObjective),
      );
    } else {
      window.localStorage.removeItem(toKey);
    }
    window.localStorage.removeItem(fromKey);
    return "moved";
  } catch {
    return "unavailable";
  }
}

export function clearStoredWorkLogEditorDraft(input: { userId: string; workDate: string }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(workLogEditorDraftStorageKey(input));
  } catch {
    // Ignore localStorage failures in private or restricted browser contexts.
  }
}
