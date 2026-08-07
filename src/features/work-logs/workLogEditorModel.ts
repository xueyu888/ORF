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
  editingEntryId: string | null;
  objectiveId: string;
  objectiveTitleSnapshot?: string | null;
  preserveExistingClassification?: boolean;
  progressEstimatePercent: number | null;
};

export type WorkLogEditorDraftPatch = Partial<
  Pick<
    WorkLogEditorDraft,
    | "bodyMarkdown"
    | "categoryId"
    | "categoryName"
    | "classificationKind"
    | "objectiveId"
    | "preserveExistingClassification"
    | "progressEstimatePercent"
  >
>;

export type WorkLogEditorSession = {
  draft: WorkLogEditorDraft;
  revision: number;
  userId: string;
  workDate: string;
};

export type WorkLogClassificationSelectValue =
  | "category:new"
  | "historical:category"
  | "historical:objective"
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

export const workLogStatusUpdateTemplateSections = [
  {
    heading: "状态说明",
    key: "status",
    placeholder: "写目标状态和可验证结果",
  },
  {
    heading: "偏差 / 风险 / 阻塞",
    key: "risk",
    placeholder: "无则写“无”；有则写风险或阻塞",
  },
  {
    heading: "下一步",
    key: "next",
    placeholder: "写接下来最重要的一件事",
  },
] as const;

export type WorkLogStatusUpdateTemplateKey =
  (typeof workLogStatusUpdateTemplateSections)[number]["key"];

export type WorkLogStatusUpdateTemplateBody = Record<
  WorkLogStatusUpdateTemplateKey,
  string
>;

const blankWorkLogStatusUpdateTemplateBody = (): WorkLogStatusUpdateTemplateBody => ({
  next: "",
  risk: "",
  status: "",
});

export const workLogStatusUpdateTemplateMarkdown =
  `${workLogStatusUpdateTemplateSections
    .map((section) => `## ${section.heading}`)
    .join("\n\n")}\n`;

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
  bodyMarkdown: workLogStatusUpdateTemplateMarkdown,
  categoryId: "",
  categoryName: "",
  classificationKind: "uncategorized",
  editingEntryId: null,
  objectiveId: "",
  progressEstimatePercent: null,
});

function workLogStatusUpdateHeadingKey(line: string): WorkLogStatusUpdateTemplateKey | null {
  const trimmed = line.trim();
  for (const section of workLogStatusUpdateTemplateSections) {
    if (trimmed === `## ${section.heading}`) return section.key;
  }
  return null;
}

export function parseWorkLogStatusUpdateMarkdown(
  markdown: string,
): WorkLogStatusUpdateTemplateBody | null {
  if (!markdown.trim()) return blankWorkLogStatusUpdateTemplateBody();

  const sections = blankWorkLogStatusUpdateTemplateBody();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let activeKey: WorkLogStatusUpdateTemplateKey | null = null;
  let expectedHeadingIndex = 0;
  const bodyLinesByKey = new Map<WorkLogStatusUpdateTemplateKey, string[]>(
    workLogStatusUpdateTemplateSections.map((section) => [section.key, []]),
  );

  for (const line of lines) {
    const headingKey = workLogStatusUpdateHeadingKey(line);
    if (headingKey) {
      const expectedSection = workLogStatusUpdateTemplateSections[expectedHeadingIndex];
      if (!expectedSection || headingKey !== expectedSection.key) return null;
      activeKey = headingKey;
      expectedHeadingIndex += 1;
      continue;
    }

    if (!activeKey) {
      if (line.trim()) return null;
      continue;
    }
    bodyLinesByKey.get(activeKey)?.push(line);
  }

  if (expectedHeadingIndex !== workLogStatusUpdateTemplateSections.length) {
    return null;
  }

  for (const section of workLogStatusUpdateTemplateSections) {
    sections[section.key] = (bodyLinesByKey.get(section.key) ?? [])
      .join("\n")
      .trim();
  }
  return sections;
}

export function buildWorkLogStatusUpdateMarkdown(
  body: WorkLogStatusUpdateTemplateBody,
) {
  const normalizedBody = workLogStatusUpdateTemplateSections.map((section) => ({
    ...section,
    bodyMarkdown: body[section.key].trim(),
  }));
  if (normalizedBody.every((section) => !section.bodyMarkdown)) {
    return workLogStatusUpdateTemplateMarkdown;
  }

  return normalizedBody
    .map((section) =>
      section.bodyMarkdown
        ? `## ${section.heading}\n\n${section.bodyMarkdown}`
        : `## ${section.heading}`,
    )
    .join("\n\n");
}

export function workLogBodyMarkdownHasUserContent(markdown: string) {
  const templateBody = parseWorkLogStatusUpdateMarkdown(markdown);
  if (templateBody) {
    return workLogStatusUpdateTemplateSections.some((section) =>
      orfRichTextHasMeaningfulContent(templateBody[section.key]),
    );
  }
  return orfRichTextHasMeaningfulContent(markdown);
}

export function workLogBodyMarkdownUserContent(markdown: string) {
  const templateBody = parseWorkLogStatusUpdateMarkdown(markdown);
  if (!templateBody) return markdown.trim();
  return workLogStatusUpdateTemplateSections
    .map((section) => templateBody[section.key])
    .filter((sectionBody) => sectionBody.trim())
    .join("\n\n")
    .trim();
}

export function workLogEditorDraftHasContent(draft: WorkLogEditorDraft) {
  return Boolean(
    draft.editingEntryId ||
      workLogBodyMarkdownHasUserContent(draft.bodyMarkdown) ||
      draft.categoryId.trim() ||
      draft.categoryName.trim() ||
      draft.objectiveId.trim() ||
      draft.progressEstimatePercent !== null,
  );
}

export function createWorkLogEditorSession(input: {
  draft?: WorkLogEditorDraft;
  previousRevision?: number;
  userId: string;
  workDate: string;
}): WorkLogEditorSession {
  return {
    draft: input.draft ?? blankWorkLogEditorDraft(),
    revision: (input.previousRevision ?? 0) + 1,
    userId: input.userId,
    workDate: input.workDate,
  };
}

export function applyWorkLogEditorSessionDraftPatch(
  session: WorkLogEditorSession,
  patch: WorkLogEditorDraftPatch,
): WorkLogEditorSession {
  return {
    ...session,
    draft: applyWorkLogEditorDraftPatch(session.draft, patch),
  };
}

export function moveWorkLogEditorSession(
  session: WorkLogEditorSession,
  workDate: string,
): WorkLogEditorSession {
  return {
    ...session,
    workDate,
  };
}

export function workLogEditorSessionShouldFollowViewDate(
  session: WorkLogEditorSession | null,
  userId: string,
  viewDate: string,
) {
  if (!session || session.userId !== userId) return true;
  return session.workDate !== viewDate && !workLogEditorDraftHasContent(session.draft);
}

export function applyWorkLogEditorDraftPatch(
  draft: WorkLogEditorDraft,
  patch: WorkLogEditorDraftPatch,
): WorkLogEditorDraft {
  const changesClassification =
    patch.categoryId !== undefined ||
    patch.categoryName !== undefined ||
    patch.classificationKind !== undefined ||
    patch.objectiveId !== undefined;
  const next = {
    ...draft,
    ...patch,
    preserveExistingClassification:
      patch.preserveExistingClassification === true
        ? true
        : changesClassification
          ? false
          : draft.preserveExistingClassification,
  };
  if (patch.classificationKind === "objective") {
    return {
      ...next,
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
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
  const preserveExistingClassification =
    classification.kind === "objective"
      ? !entry.objectiveIdSnapshot && Boolean(entry.objectiveTitleSnapshot)
      : classification.kind === "category"
        ? !entry.categoryIdSnapshot && Boolean(entry.categoryNameSnapshot)
        : false;
  return {
    bodyMarkdown: entry.bodyMarkdown,
    categoryId: classification.kind === "category" ? entry.categoryIdSnapshot ?? "" : "",
    categoryName: "",
    categoryNameSnapshot: entry.categoryNameSnapshot,
    classificationKind: classification.kind,
    editingEntryId: entry.id,
    objectiveId: classification.kind === "objective" ? entry.objectiveIdSnapshot ?? "" : "",
    objectiveTitleSnapshot: entry.objectiveTitleSnapshot,
    preserveExistingClassification,
    progressEstimatePercent: workLogProgressEstimatePercentFromRemaining(entry.remainingEstimatePercent),
  };
}

export function parseWorkLogProgressEstimateInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return normalizeWorkLogEstimatePercent(parsed);
}

export function canonicalWorkLogEditorDraft(draft: WorkLogEditorDraft) {
  const preservesExistingClassification = workLogEditorDraftPreservesExistingClassification(draft);
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
    objectiveId:
      draft.classificationKind === "objective"
        ? draft.objectiveId.trim() || null
        : null,
    remainingEstimatePercent:
      draft.classificationKind === "objective" &&
        (draft.objectiveId.trim() || preservesExistingClassification)
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
    objectiveId:
      classification.kind === "objective" ? entry.objectiveIdSnapshot ?? null : null,
    remainingEstimatePercent: entry.remainingEstimatePercent ?? null,
  };
}

export function validateWorkLogEditorDraft(
  draft: WorkLogEditorDraft,
  options: {
    allowCategories: boolean;
    allowNewCategory?: boolean;
    allowUncategorized: boolean;
    requireObjectiveProgressEstimate?: boolean;
  },
) {
  const entry = canonicalWorkLogEditorDraft(draft);
  const preservesExistingClassification = workLogEditorDraftPreservesExistingClassification(draft);
  if (
    draft.classificationKind === "objective" &&
    !entry.objectiveId &&
    !preservesExistingClassification
  ) {
    return "请选择目标";
  }
  if (draft.classificationKind === "uncategorized" && !options.allowUncategorized) {
    return "请选择目标";
  }
  if (
    draft.classificationKind === "category" &&
    !preservesExistingClassification &&
    !options.allowCategories
  ) {
    return "当前账号不能使用工作日志分类";
  }
  if (
    draft.classificationKind === "category" &&
    !preservesExistingClassification &&
    !draft.categoryId &&
    !options.allowNewCategory
  ) {
    return "当前账号不能新建工作日志分类";
  }
  if (
    draft.classificationKind === "category" &&
    !preservesExistingClassification &&
    !entry.categoryId &&
    !entry.categoryName
  ) {
    return "请填写分类名称";
  }
  if (
    draft.classificationKind === "objective" &&
    !preservesExistingClassification &&
    options.requireObjectiveProgressEstimate &&
    draft.progressEstimatePercent === null
  ) {
    return "请填写目标进度估计";
  }
  if (!workLogBodyMarkdownHasUserContent(entry.bodyMarkdown)) {
    return "工作日志内容不能为空";
  }
  return "";
}

export function classificationSelectValueFromDraft(
  draft: WorkLogEditorDraft,
): WorkLogClassificationSelectValue {
  if (workLogEditorDraftPreservesExistingClassification(draft)) {
    return draft.classificationKind === "category"
      ? "historical:category"
      : "historical:objective";
  }
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
  if (value === "historical:objective") {
    return {
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
      objectiveId: "",
      preserveExistingClassification: true,
    };
  }
  if (value === "historical:category") {
    return {
      categoryId: "",
      categoryName: "",
      classificationKind: "category",
      objectiveId: "",
      preserveExistingClassification: true,
      progressEstimatePercent: null,
    };
  }
  if (value.startsWith("objective:")) {
    const objectiveId = value.slice("objective:".length);
    const objective = options.objectives?.find((item) => item.id === objectiveId);
    return {
      categoryId: "",
      categoryName: "",
      classificationKind: "objective",
      objectiveId,
      preserveExistingClassification: false,
      progressEstimatePercent: workLogProgressEstimatePercentFromRemaining(objective?.latestRemainingEstimatePercent),
    };
  }
  if (value.startsWith("category:") && value !== "category:new") {
    return {
      categoryId: value.slice("category:".length),
      categoryName: "",
      classificationKind: "category",
      objectiveId: "",
      preserveExistingClassification: false,
      progressEstimatePercent: null,
    };
  }
  if (value === "category:new") {
    return {
      categoryId: "",
      classificationKind: "category",
      objectiveId: "",
      preserveExistingClassification: false,
      progressEstimatePercent: null,
    };
  }
  return {
    categoryId: "",
    categoryName: "",
    classificationKind: "uncategorized",
    objectiveId: "",
    preserveExistingClassification: false,
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

export function formatWorkLogProgressEstimate(value: number | null | undefined, options?: { compact?: boolean }) {
  const progressEstimate = workLogProgressEstimatePercentFromRemaining(value);
  if (progressEstimate === null) return "";
  return `${options?.compact ? "进" : "进 "}${progressEstimate}%`;
}

export function buildWorkLogClassificationChoices(
  draft: WorkLogEditorDraft,
  objectives: WorkLogObjectiveOption[],
  options: {
    allowCategories: boolean;
    allowNewCategory?: boolean;
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
  if (
    workLogEditorDraftPreservesExistingClassification(draft) &&
    draft.classificationKind === "category"
  ) {
    choices.push({
      value: "historical:category",
      label: draft.categoryNameSnapshot ?? "历史分类",
      description: "保留历史分类快照",
      alwaysVisible: true,
    });
  }
  if (options.allowCategories) {
    if (options.allowNewCategory) {
      choices.push({
        value: "category:new",
        label: draft.categoryName ? `新分类：${draft.categoryName}` : "新建分类",
        description: "仅管理员可用",
        alwaysVisible: true,
      });
    }
    choices.push(
      ...categories.map((category) => ({
        value: `category:${category.id}` as const,
        label: category.name,
        description: category.source === "builtIn" ? "内置归类" : "日志分类",
      })),
    );
  }
  if (
    workLogEditorDraftPreservesExistingClassification(draft) &&
    draft.classificationKind === "objective"
  ) {
    choices.push({
      value: "historical:objective",
      label: draft.objectiveTitleSnapshot ?? "历史目标",
      description: "保留历史目标快照",
      alwaysVisible: true,
    });
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

export function workLogEditorDraftPreservesExistingClassification(draft: WorkLogEditorDraft) {
  if (!draft.editingEntryId || draft.preserveExistingClassification !== true) return false;
  if (draft.classificationKind === "objective") {
    return Boolean(draft.objectiveTitleSnapshot && !draft.objectiveId.trim());
  }
  if (draft.classificationKind === "category") {
    return Boolean(
      draft.categoryNameSnapshot &&
        !draft.categoryId.trim() &&
        !draft.categoryName.trim(),
    );
  }
  return false;
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
