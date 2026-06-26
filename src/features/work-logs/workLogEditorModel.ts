import { orfRichTextHasMeaningfulContent } from "../rich-text/OrfRichTextEditor";
import type {
  ObjectiveFlowStatus,
  WorkLogCategoryOption,
  WorkLogClassificationKind,
  WorkLogClassificationSuggestion,
  WorkLogEntry,
  WorkLogObjectiveOption,
} from "../../types/orf";

export type WorkLogEditorDraft = {
  bodyMarkdown: string;
  categoryId: string;
  categoryName: string;
  categoryNameSnapshot?: string | null;
  classificationKind: WorkLogClassificationKind;
  durationMinutes: number | null;
  editingEntryId: string | null;
  objectiveId: string;
  objectiveTitleSnapshot?: string | null;
  progressEstimatePercent: number | null;
};

export type WorkLogEditorDraftPatch = Partial<
  Pick<
    WorkLogEditorDraft,
    | "bodyMarkdown"
    | "categoryId"
    | "categoryName"
    | "classificationKind"
    | "durationMinutes"
    | "objectiveId"
    | "progressEstimatePercent"
  >
>;

export type WorkLogClassificationSelectValue =
  | "category:new"
  | "uncategorized"
  | `category:${string}`
  | `objective:${string}`;

export type WorkLogClassificationChoice = {
  value: WorkLogClassificationSelectValue;
  label: string;
  description?: string;
  disabled?: boolean;
  alwaysVisible?: boolean;
};

export type WorkLogEntryClassification = {
  categoryId: string | null;
  kind: WorkLogClassificationKind;
  objectiveId: string | null;
  title: string;
};

type WorkLogObjectiveOptionLookup = {
  objectives?: WorkLogObjectiveOption[];
};

function normalizeWorkLogEstimatePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function workLogProgressEstimatePercentFromRemaining(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return 100 - normalizeWorkLogEstimatePercent(value);
}

export function workLogRemainingEstimatePercentFromProgress(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return 100 - normalizeWorkLogEstimatePercent(value);
}

export const blankWorkLogEditorDraft = (): WorkLogEditorDraft => ({
  bodyMarkdown: "",
  categoryId: "",
  categoryName: "",
  classificationKind: "uncategorized",
  durationMinutes: null,
  editingEntryId: null,
  objectiveId: "",
  progressEstimatePercent: null,
});

export function applyWorkLogEditorDraftPatch(
  draft: WorkLogEditorDraft,
  patch: WorkLogEditorDraftPatch,
): WorkLogEditorDraft {
  const next = { ...draft, ...patch };
  if (patch.classificationKind === "objective") {
    return {
      ...next,
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
    };
  }
  if (
    patch.classificationKind === "category" ||
    patch.categoryId !== undefined ||
    patch.categoryName !== undefined
  ) {
    return {
      ...next,
      classificationKind: "category",
      objectiveId: "",
      progressEstimatePercent: null,
    };
  }
  if (patch.classificationKind === "uncategorized") {
    return {
      ...next,
      categoryId: "",
      categoryName: "",
      objectiveId: "",
      progressEstimatePercent: null,
    };
  }
  if (patch.objectiveId !== undefined) {
    return {
      ...next,
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
    };
  }
  return next.classificationKind === "objective"
    ? next
    : { ...next, progressEstimatePercent: null };
}

export function workLogEditorDraftFromEntry(entry: WorkLogEntry): WorkLogEditorDraft {
  const classification = workLogEntryClassification(entry);
  return {
    bodyMarkdown: entry.bodyMarkdown,
    categoryId: classification.kind === "category" ? entry.categoryIdSnapshot ?? "" : "",
    categoryName: "",
    categoryNameSnapshot: entry.categoryNameSnapshot,
    classificationKind: classification.kind,
    durationMinutes: entry.durationMinutes ?? null,
    editingEntryId: entry.id,
    objectiveId: classification.kind === "objective" ? entry.objectiveIdSnapshot ?? "" : "",
    objectiveTitleSnapshot: entry.objectiveTitleSnapshot,
    progressEstimatePercent: workLogProgressEstimatePercentFromRemaining(entry.remainingEstimatePercent),
  };
}

export function parseWorkLogProgressEstimateInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return normalizeWorkLogEstimatePercent(parsed);
}

export function parseWorkLogDurationInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(1440, Math.round(parsed)));
}

export function canonicalWorkLogEditorDraft(draft: WorkLogEditorDraft) {
  return {
    bodyMarkdown: draft.bodyMarkdown.trim(),
    categoryId:
      draft.classificationKind === "category"
        ? draft.categoryId.trim() || null
        : null,
    categoryName:
      draft.classificationKind === "category" && !draft.categoryId.trim()
        ? draft.categoryName.trim() || null
        : null,
    durationMinutes: draft.durationMinutes,
    objectiveId:
      draft.classificationKind === "objective"
        ? draft.objectiveId.trim() || null
        : null,
    remainingEstimatePercent:
      draft.classificationKind === "objective" && draft.objectiveId.trim()
        ? workLogRemainingEstimatePercentFromProgress(draft.progressEstimatePercent)
        : null,
  };
}

export function canonicalWorkLogEntryForEdit(entry: WorkLogEntry) {
  const classification = workLogEntryClassification(entry);
  return {
    bodyMarkdown: entry.bodyMarkdown.trim(),
    categoryId:
      classification.kind === "category" ? entry.categoryIdSnapshot ?? null : null,
    categoryName: null,
    durationMinutes: entry.durationMinutes ?? null,
    objectiveId:
      classification.kind === "objective" ? entry.objectiveIdSnapshot ?? null : null,
    remainingEstimatePercent: entry.remainingEstimatePercent ?? null,
  };
}

export function validateWorkLogEditorDraft(
  draft: WorkLogEditorDraft,
  options: {
    allowCategories: boolean;
    allowUncategorized: boolean;
    requireObjectiveProgressEstimate?: boolean;
  },
) {
  const entry = canonicalWorkLogEditorDraft(draft);
  if (draft.classificationKind === "objective" && !entry.objectiveId) {
    return "请选择目标";
  }
  if (draft.classificationKind === "uncategorized" && !options.allowUncategorized) {
    return "请选择目标";
  }
  if (draft.classificationKind === "category" && !options.allowCategories) {
    return "只有管理员可以使用工作日志分类";
  }
  if (draft.classificationKind === "category" && !entry.categoryId && !entry.categoryName) {
    return "请填写分类名称";
  }
  if (
    draft.classificationKind === "objective" &&
    options.requireObjectiveProgressEstimate &&
    draft.progressEstimatePercent === null
  ) {
    return "请填写目标进度估计";
  }
  if (!orfRichTextHasMeaningfulContent(entry.bodyMarkdown)) {
    return "工作日志内容不能为空";
  }
  return "";
}

export function classificationSelectValueFromDraft(
  draft: WorkLogEditorDraft,
): WorkLogClassificationSelectValue {
  if (draft.classificationKind === "objective" && draft.objectiveId) {
    return `objective:${draft.objectiveId}`;
  }
  if (draft.classificationKind === "category") {
    return draft.categoryId ? `category:${draft.categoryId}` : "category:new";
  }
  return "uncategorized";
}

export function workLogDraftPatchFromClassificationSelect(
  value: WorkLogClassificationSelectValue,
  options: WorkLogObjectiveOptionLookup = {},
): WorkLogEditorDraftPatch {
  if (value.startsWith("objective:")) {
    const objectiveId = value.slice("objective:".length);
    const objective = options.objectives?.find((item) => item.id === objectiveId);
    return {
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
      objectiveId,
      progressEstimatePercent: workLogProgressEstimatePercentFromRemaining(objective?.latestRemainingEstimatePercent),
    };
  }
  if (value.startsWith("category:") && value !== "category:new") {
    return {
      categoryId: value.slice("category:".length),
      categoryName: "",
      classificationKind: "category",
      objectiveId: "",
      progressEstimatePercent: null,
    };
  }
  if (value === "category:new") {
    return {
      categoryId: "",
      classificationKind: "category",
      objectiveId: "",
      progressEstimatePercent: null,
    };
  }
  return {
    categoryId: "",
    categoryName: "",
    classificationKind: "uncategorized",
    objectiveId: "",
    progressEstimatePercent: null,
  };
}

export function workLogDraftPatchFromSuggestion(
  suggestion: WorkLogClassificationSuggestion,
  options: WorkLogObjectiveOptionLookup = {},
): WorkLogEditorDraftPatch {
  if (suggestion.kind === "objective" && suggestion.objectiveId) {
    return workLogDraftPatchFromClassificationSelect(`objective:${suggestion.objectiveId}`, options);
  }
  if (suggestion.kind === "category" && suggestion.categoryId) {
    return workLogDraftPatchFromClassificationSelect(`category:${suggestion.categoryId}`);
  }
  if (suggestion.kind === "newCategory" && suggestion.categoryName) {
    return {
      categoryId: "",
      categoryName: suggestion.categoryName,
      classificationKind: "category",
      objectiveId: "",
      progressEstimatePercent: null,
    };
  }
  return workLogDraftPatchFromClassificationSelect("uncategorized");
}

export function suggestionMatchesWorkLogDraft(
  suggestion: WorkLogClassificationSuggestion,
  draft: WorkLogEditorDraft,
) {
  if (suggestion.kind === "objective") {
    return (
      draft.classificationKind === "objective" &&
      draft.objectiveId === suggestion.objectiveId
    );
  }
  if (suggestion.kind === "category") {
    return (
      draft.classificationKind === "category" &&
      draft.categoryId === suggestion.categoryId
    );
  }
  if (suggestion.kind === "newCategory") {
    return (
      draft.classificationKind === "category" &&
      draft.categoryName.trim().toLocaleLowerCase() ===
        (suggestion.categoryName ?? "").trim().toLocaleLowerCase()
    );
  }
  return draft.classificationKind === "uncategorized";
}

export function workLogSuggestionLabel(
  suggestion: WorkLogClassificationSuggestion,
  options: {
    categories: WorkLogCategoryOption[];
    objectives: WorkLogObjectiveOption[];
  },
) {
  if (suggestion.kind === "objective" && suggestion.objectiveId) {
    return (
      options.objectives.find((objective) => objective.id === suggestion.objectiveId)
        ?.title ?? "匹配目标"
    );
  }
  if (suggestion.kind === "category" && suggestion.categoryId) {
    return (
      options.categories.find((category) => category.id === suggestion.categoryId)
        ?.name ?? "匹配分类"
    );
  }
  if (suggestion.kind === "newCategory" && suggestion.categoryName) {
    return `新分类：${suggestion.categoryName}`;
  }
  if (suggestion.kind === "uncategorized") {
    return "暂不指定目标或分类";
  }
  return "";
}

export function workLogEntryClassification(entry: WorkLogEntry): WorkLogEntryClassification {
  if (entry.objectiveIdSnapshot || entry.objectiveTitleSnapshot) {
    return {
      categoryId: null,
      kind: "objective",
      objectiveId: entry.objectiveIdSnapshot ?? null,
      title: entry.objectiveTitleSnapshot ?? entry.objectiveIdSnapshot ?? "历史目标",
    };
  }
  if (entry.categoryIdSnapshot || entry.categoryNameSnapshot) {
    return {
      categoryId: entry.categoryIdSnapshot ?? null,
      kind: "category",
      objectiveId: null,
      title: entry.categoryNameSnapshot ?? entry.categoryIdSnapshot ?? "历史分类",
    };
  }
  return {
    categoryId: null,
    kind: "uncategorized",
    objectiveId: null,
    title: "未归类",
  };
}

export function formatWorkLogDurationMinutes(value: number | null | undefined) {
  if (!value || value <= 0) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function buildWorkLogClassificationChoices(
  draft: WorkLogEditorDraft,
  objectives: WorkLogObjectiveOption[],
  options: {
    allowCategories: boolean;
    allowUncategorized: boolean;
  },
  categories: WorkLogCategoryOption[],
): WorkLogClassificationChoice[] {
  const choices: WorkLogClassificationChoice[] = [
    options.allowUncategorized
      ? {
          value: "uncategorized",
          label: "未归类",
          description: "临时记录",
          alwaysVisible: true,
        }
      : {
          value: "uncategorized",
          label: "选择目标",
          disabled: true,
          alwaysVisible: true,
        },
  ];
  if (options.allowCategories) {
    choices.push(
      {
        value: "category:new",
        label: draft.categoryName ? `新分类：${draft.categoryName}` : "新建分类",
        description: "仅管理员可用",
        alwaysVisible: true,
      },
      ...categories.map((category) => ({
        value: `category:${category.id}` as const,
        label: category.name,
        description: "日志分类",
      })),
    );
  }
  choices.push(
    ...objectives.map((objective) => ({
      value: `objective:${objective.id}` as const,
      label: objective.title,
      description: `目标 · ${flowStatusLabel(objective.flowStatus)} · 截止 ${objective.finalDueAt}`,
    })),
  );
  if (
    draft.objectiveId &&
    !objectives.some((objective) => objective.id === draft.objectiveId)
  ) {
    choices.push({
      value: `objective:${draft.objectiveId}` as const,
      label: draft.objectiveTitleSnapshot ?? draft.objectiveId,
      description: "历史目标快照",
    });
  }
  if (
    draft.categoryId &&
    !categories.some((category) => category.id === draft.categoryId)
  ) {
    choices.push({
      value: `category:${draft.categoryId}` as const,
      label: draft.categoryNameSnapshot ?? draft.categoryId,
      description: "历史分类快照",
    });
  }
  return choices;
}

export function workLogEntryTargetLabel(entry: WorkLogEntry) {
  return workLogEntryClassification(entry).title;
}

function flowStatusLabel(status: ObjectiveFlowStatus) {
  const labels: Record<ObjectiveFlowStatus, string> = {
    accepted: "已验收",
    applying: "申请中",
    candidate: "候选",
    closed: "关闭",
    frozen: "实施",
    open: "开放",
    recruiting: "征召",
    reestimating: "重估",
    revisionRequired: "待返工",
    settled: "已结算",
    submitted: "待验收",
  };
  return labels[status];
}
