import assert from "node:assert/strict";
import test from "node:test";
import { objectiveFlowStatuses } from "../src/domain/orfLifecycle";
import {
  canAttachObjectiveToWorkLog,
  canSelectObjectiveForWorkLog,
  canShowObjectiveInDefaultWorkLogList,
  canSaveUnscopedWorkLog,
  canUseAllWorkLogObjectiveOptions,
  canUseWorkLogCategories,
  canUseWorkLogCategoryInput,
  doesWorkLogClassificationSuggestionMatch,
  isObjectiveCompletedForWorkLog,
  isWorkLogSearchOnlyObjective,
  listBuiltInWorkLogCategoryOptions,
  workLogObjectiveAlwaysSelectableFlowStatuses,
  workLogObjectiveCompletedSearchFlowStatuses,
  workLogObjectiveDefaultFlowStatuses,
  workLogObjectiveSearchOnlyFlowStatuses,
  workLogObjectiveSelectionCandidateFlowStatuses,
  workLogObjectiveSelectionAvailability,
} from "../src/domain/orfWorkLogs";
import {
  parseStoredWorkLogEditorDraft,
  workLogEditorDraftStorageKey,
} from "../src/features/work-logs/workLogDraftStorage";
import {
  applyWorkLogEditorDraftPatch,
  applyWorkLogEditorSessionDraftPatch,
  blankWorkLogEditorDraft,
  buildWorkLogStatusUpdateMarkdown,
  buildWorkLogClassificationChoices,
  canonicalWorkLogEditorDraft,
  canonicalWorkLogEntryForEdit,
  classificationSelectValueFromDraft,
  createWorkLogEditorSession,
  formatWorkLogProgressEstimate,
  moveWorkLogEditorSession,
  parseWorkLogStatusUpdateMarkdown,
  validateWorkLogEditorDraft,
  workLogBodyMarkdownHasUserContent,
  workLogBodyMarkdownUserContent,
  workLogDraftPatchFromClassificationSelect,
  workLogEditorDraftEditingWorkDate,
  workLogEditorDraftFromEntry,
  workLogEditorDraftPreservesExistingClassification,
  workLogEditorSessionShouldFollowViewDate,
  workLogStatusUpdateTemplateMarkdown,
} from "../src/features/work-logs/workLogEditorModel";
import type { WorkLogEntry } from "../src/types/orf";

test("work log default target list only includes ongoing objectives", () => {
  assert.equal(canShowObjectiveInDefaultWorkLogList("accepted"), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList("settled"), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList({ flowStatus: "closed" }), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList("frozen"), true);
  assert.equal(canShowObjectiveInDefaultWorkLogList("revisionRequired"), true);

  assert.deepEqual(
    objectiveFlowStatuses.filter((flowStatus) => !workLogObjectiveDefaultFlowStatuses.includes(flowStatus)),
    ["accepted", "settled", "closed"],
  );
  assert.deepEqual(workLogObjectiveAlwaysSelectableFlowStatuses, workLogObjectiveDefaultFlowStatuses);
});

test("work log target search and save include search-only objectives", () => {
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("accepted"));
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("settled"));
  assert.deepEqual(workLogObjectiveCompletedSearchFlowStatuses, ["accepted", "settled"]);
  assert.deepEqual(workLogObjectiveSearchOnlyFlowStatuses, ["accepted", "settled", "closed"]);

  assert.equal(canAttachObjectiveToWorkLog("accepted"), true);
  assert.equal(canAttachObjectiveToWorkLog("settled"), true);
  assert.equal(canAttachObjectiveToWorkLog("closed"), true);
  assert.equal(canSelectObjectiveForWorkLog("accepted"), true);
  assert.equal(canSelectObjectiveForWorkLog("settled"), true);
  assert.equal(canSelectObjectiveForWorkLog("closed"), true);
  assert.equal(isWorkLogSearchOnlyObjective("accepted"), true);
  assert.equal(isWorkLogSearchOnlyObjective("settled"), true);
  assert.equal(isWorkLogSearchOnlyObjective("closed"), true);
  assert.equal(isWorkLogSearchOnlyObjective("frozen"), false);
  assert.equal(workLogObjectiveSelectionAvailability("accepted"), "searchOnly");
  assert.equal(workLogObjectiveSelectionAvailability("settled"), "searchOnly");
  assert.equal(workLogObjectiveSelectionAvailability("frozen"), "default");
  assert.equal(workLogObjectiveSelectionAvailability("closed"), "searchOnly");
  assert.equal(isObjectiveCompletedForWorkLog("accepted"), true);
  assert.equal(isObjectiveCompletedForWorkLog("settled"), true);
  assert.equal(isObjectiveCompletedForWorkLog("closed"), true);
  assert.equal(isObjectiveCompletedForWorkLog("frozen"), false);
});

test("work log built-in category policies keep leave open without granting managed categories", () => {
  const member = { email: "member@sdr.com", name: "普通成员", role: "member", status: "active" };
  const zhuRuixuan = { email: "zrx@sdr.com", name: "朱锐轩", role: "member", status: "active" };
  const faeMember = { email: "fae@sdr.com", name: "邓滨虎", role: "member", status: "active" };
  const admin = { email: "admin@sdr.com", name: "指挥官", role: "admin", status: "active" };

  assert.deepEqual(listBuiltInWorkLogCategoryOptions(member).map((category) => category.name), ["请假"]);
  assert.equal(canUseWorkLogCategoryInput(member, { categoryId: "builtin:leave" }), true);
  assert.equal(canUseWorkLogCategoryInput(member, { categoryName: "请假" }), true);
  assert.equal(canUseWorkLogCategoryInput(member, { categoryName: "管理事务" }), false);
  assert.equal(canUseWorkLogCategoryInput(zhuRuixuan, { categoryName: "管理事务" }), false);
  assert.equal(canUseWorkLogCategories(zhuRuixuan), false);

  assert.equal(canUseWorkLogCategories(admin), true);
  assert.equal(canUseAllWorkLogObjectiveOptions(admin), true);
  assert.equal(canUseAllWorkLogObjectiveOptions(member), false);
  assert.equal(canUseAllWorkLogObjectiveOptions(faeMember), false);
  assert.equal(canUseWorkLogCategoryInput(admin, { categoryName: "管理事务" }), true);
  assert.equal(canSaveUnscopedWorkLog(faeMember), true);
  assert.equal(canSaveUnscopedWorkLog(member), false);
});

test("work log local draft storage parses only the editor draft contract", () => {
  assert.equal(
    workLogEditorDraftStorageKey({ userId: "user-1", workDate: "2026-07-09" }),
    "orf.workLogs.editorDraft.v1.user-1.2026-07-09",
  );

  const stored = parseStoredWorkLogEditorDraft(JSON.stringify({
    version: 1,
    savedAt: "2026-07-09T10:00:00.000Z",
    draft: {
      bodyMarkdown: "今天完成了工作日志草稿恢复。",
      classificationKind: "objective",
      editingEntryId: null,
      objectiveId: "obj-1",
      progressEstimatePercent: 88.7,
    },
    selectedObjective: {
      finalDueAt: "2026-07-31",
      flowStatus: "frozen",
      id: "obj-1",
      isUserChallenger: true,
      latestRemainingEstimatePercent: 12,
      title: "工作日志体验",
    },
  }));

  assert.equal(stored?.draft.bodyMarkdown, "今天完成了工作日志草稿恢复。");
  assert.equal(stored?.draft.classificationKind, "objective");
  assert.equal("durationMinutes" in (stored?.draft ?? {}), false);
  assert.equal(stored?.draft.progressEstimatePercent, 89);
  assert.equal(stored?.selectedObjective?.title, "工作日志体验");
  assert.equal(parseStoredWorkLogEditorDraft("{bad json"), null);
});

test("work log status update template owns bold markdown labels and user body", () => {
  assert.deepEqual(parseWorkLogStatusUpdateMarkdown(""), {
    next: "",
    risk: "",
    status: "",
    target: "",
  });
  assert.equal(workLogStatusUpdateTemplateMarkdown.endsWith("\n"), true);
  assert.equal(blankWorkLogEditorDraft().bodyMarkdown, workLogStatusUpdateTemplateMarkdown);
  assert.equal(workLogBodyMarkdownHasUserContent(workLogStatusUpdateTemplateMarkdown), false);
  assert.equal(buildWorkLogStatusUpdateMarkdown({
    next: "",
    risk: "",
    status: "",
    target: "",
  }), workLogStatusUpdateTemplateMarkdown);

  const markdown = buildWorkLogStatusUpdateMarkdown({
    next: "明天先验证演示路径的数据初始化。",
    risk: "无",
    status: "核心流程已完成第一轮验证。",
    target: "完成竞标演示版本的测试闭环。",
  });

  assert.equal(markdown, [
    "**当前目标**",
    "完成竞标演示版本的测试闭环。",
    "**状态说明**",
    "核心流程已完成第一轮验证。",
    "**偏差 / 风险 / 阻塞**",
    "无",
    "**下一步**",
    "明天先验证演示路径的数据初始化。",
  ].join("\n"));
  assert.deepEqual(parseWorkLogStatusUpdateMarkdown(markdown), {
    next: "明天先验证演示路径的数据初始化。",
    risk: "无",
    status: "核心流程已完成第一轮验证。",
    target: "完成竞标演示版本的测试闭环。",
  });
  assert.equal(workLogBodyMarkdownHasUserContent(markdown), true);
  assert.equal(
    workLogBodyMarkdownUserContent(markdown),
    "完成竞标演示版本的测试闭环。\n\n核心流程已完成第一轮验证。\n\n无\n\n明天先验证演示路径的数据初始化。",
  );
  assert.equal(
    workLogBodyMarkdownHasUserContent([
      "**当前目标**",
      "",
      "**状态说明**",
      "",
      "**偏差 / 风险 / 阻塞**",
      "",
      "**下一步**",
    ].join("\n")),
    false,
  );
  assert.equal(parseWorkLogStatusUpdateMarkdown("历史自由正文"), null);
});

test("work log progress estimate label is shared by page and chat card", () => {
  assert.equal(formatWorkLogProgressEstimate(null), "");
  assert.equal(formatWorkLogProgressEstimate(72), "进 28%");
  assert.equal(formatWorkLogProgressEstimate(72, { compact: true }), "进28%");
});

test("work log editor session follows the active date while preserving draft ownership", () => {
  const initial = createWorkLogEditorSession({
    userId: "user-1",
    workDate: "2026-07-14",
  });
  const editing = applyWorkLogEditorSessionDraftPatch(initial, {
    bodyMarkdown: "第一条日志",
  });

  assert.equal(editing.revision, initial.revision);
  assert.equal(
    workLogEditorSessionShouldFollowViewDate(
      editing,
      "user-1",
      "2026-07-14",
    ),
    false,
  );
  assert.equal(
    workLogEditorSessionShouldFollowViewDate(
      editing,
      "user-1",
      "2026-07-13",
    ),
    true,
  );

  const moved = moveWorkLogEditorSession(editing, "2026-07-13");
  assert.equal(moved.revision, editing.revision);
  assert.equal(moved.draft.bodyMarkdown, "第一条日志");

  const nextEntry = createWorkLogEditorSession({
    draft: blankWorkLogEditorDraft(),
    previousRevision: moved.revision,
    userId: moved.userId,
    workDate: moved.workDate,
  });
  assert.equal(nextEntry.revision, moved.revision + 1);
  assert.equal(nextEntry.draft.bodyMarkdown, workLogStatusUpdateTemplateMarkdown);
  assert.equal(nextEntry.draft.editingEntryId, null);
  assert.equal(
    workLogEditorSessionShouldFollowViewDate(
      nextEntry,
      "user-1",
      "2026-07-14",
    ),
    true,
  );

  const historicalEdit = createWorkLogEditorSession({
    draft: {
      ...blankWorkLogEditorDraft(),
      bodyMarkdown: "历史日志",
      editingEntryId: "entry-1",
    },
    previousRevision: nextEntry.revision,
    userId: "user-1",
    workDate: "2026-07-14",
  });
  const movedHistoricalEdit = moveWorkLogEditorSession(historicalEdit, "2026-07-13");
  assert.equal(movedHistoricalEdit.draft.editingEntryId, "entry-1");
  assert.equal(movedHistoricalEdit.workDate, "2026-07-13");
  assert.equal(movedHistoricalEdit.revision, historicalEdit.revision);

  const cancelledEdit = createWorkLogEditorSession({
    previousRevision: historicalEdit.revision,
    userId: historicalEdit.userId,
    workDate: historicalEdit.workDate,
  });
  assert.equal(cancelledEdit.draft.editingEntryId, null);
  assert.equal(cancelledEdit.draft.bodyMarkdown, workLogStatusUpdateTemplateMarkdown);
  assert.equal(cancelledEdit.revision, historicalEdit.revision + 1);
});

test("work log editor preserves id-less historical classification while editing", () => {
  const historicalObjectiveEntry: WorkLogEntry = {
    id: "entry-legacy-objective",
    authorUserId: "user-1",
    authorNameSnapshot: "成员",
    workDate: "2026-07-15",
    objectiveId: null,
    objectiveIdSnapshot: null,
    objectiveTitleSnapshot: "Jira 历史目标",
    categoryId: null,
    categoryIdSnapshot: null,
    categoryNameSnapshot: null,
    bodyMarkdown: "历史目标日志",
    remainingEstimatePercent: 40,
    durationMinutes: null,
    sortOrder: 0,
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
  };
  const draft = workLogEditorDraftFromEntry(historicalObjectiveEntry);

  assert.equal(workLogEditorDraftPreservesExistingClassification(draft), true);
  assert.equal(classificationSelectValueFromDraft(draft), "historical:objective");
  assert.equal(validateWorkLogEditorDraft(draft, {
    allowCategories: false,
    allowUncategorized: false,
    requireObjectiveProgressEstimate: true,
  }), "");
  assert.deepEqual(canonicalWorkLogEditorDraft(draft), {
    bodyMarkdown: "历史目标日志",
    categoryId: null,
    categoryName: null,
    objectiveId: null,
    remainingEstimatePercent: 40,
  });
  assert.ok(buildWorkLogClassificationChoices(draft, [], {
    allowCategories: false,
    allowUncategorized: false,
  }, []).some((choice) => choice.value === "historical:objective"));

  const changedBody = applyWorkLogEditorDraftPatch(draft, {
    bodyMarkdown: "第二次修改历史目标日志",
  });
  assert.equal(workLogEditorDraftPreservesExistingClassification(changedBody), true);

  const changedClassification = applyWorkLogEditorDraftPatch(
    draft,
    workLogDraftPatchFromClassificationSelect("uncategorized"),
  );
  assert.equal(workLogEditorDraftPreservesExistingClassification(changedClassification), false);
  assert.equal(classificationSelectValueFromDraft(changedClassification), "uncategorized");

  const historicalCategoryEntry: WorkLogEntry = {
    ...historicalObjectiveEntry,
    id: "entry-legacy-category",
    objectiveTitleSnapshot: null,
    categoryNameSnapshot: "Tempo 历史分类",
    remainingEstimatePercent: null,
  };
  const categoryDraft = workLogEditorDraftFromEntry(historicalCategoryEntry);
  assert.equal(workLogEditorDraftPreservesExistingClassification(categoryDraft), true);
  assert.equal(classificationSelectValueFromDraft(categoryDraft), "historical:category");
  assert.equal(validateWorkLogEditorDraft(categoryDraft, {
    allowCategories: false,
    allowUncategorized: false,
    requireObjectiveProgressEstimate: true,
  }), "");
  assert.ok(buildWorkLogClassificationChoices(categoryDraft, [], {
    allowCategories: false,
    allowUncategorized: false,
  }, []).some((choice) => choice.value === "historical:category"));
});

test("work log edit save returns to the same entry baseline for continued editing", () => {
  const entry: WorkLogEntry = {
    id: "entry-1",
    authorUserId: "user-1",
    authorNameSnapshot: "成员",
    workDate: "2026-07-16",
    objectiveId: "obj-1",
    objectiveIdSnapshot: "obj-1",
    objectiveTitleSnapshot: "目标一",
    categoryId: null,
    categoryIdSnapshot: null,
    categoryNameSnapshot: null,
    bodyMarkdown: "第一次内容",
    remainingEstimatePercent: 50,
    durationMinutes: null,
    sortOrder: 0,
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-16T08:00:00.000Z",
  };
  const editingSession = createWorkLogEditorSession({
    draft: workLogEditorDraftFromEntry(entry),
    userId: "user-1",
    workDate: entry.workDate,
  });
  assert.equal(workLogEditorDraftEditingWorkDate(editingSession.draft, editingSession.workDate), entry.workDate);
  const movedEditingSession = moveWorkLogEditorSession(editingSession, "2026-07-15");
  assert.equal(movedEditingSession.workDate, "2026-07-15");
  assert.equal(workLogEditorDraftEditingWorkDate(movedEditingSession.draft, movedEditingSession.workDate), entry.workDate);

  const savedEntry: WorkLogEntry = {
    ...entry,
    bodyMarkdown: "第一次内容，已更新",
    remainingEstimatePercent: 35,
    updatedAt: "2026-07-15T09:00:00.000Z",
    workDate: "2026-07-15",
  };
  const afterSave = createWorkLogEditorSession({
    draft: workLogEditorDraftFromEntry(savedEntry),
    previousRevision: editingSession.revision,
    userId: editingSession.userId,
    workDate: savedEntry.workDate,
  });

  assert.equal(afterSave.draft.editingEntryId, entry.id);
  assert.equal(workLogEditorDraftEditingWorkDate(afterSave.draft, afterSave.workDate), savedEntry.workDate);
  assert.equal(afterSave.revision, editingSession.revision + 1);
  assert.equal(afterSave.workDate, savedEntry.workDate);
  assert.deepEqual(
    canonicalWorkLogEditorDraft(afterSave.draft),
    canonicalWorkLogEntryForEdit(savedEntry),
  );
});

test("work log AI classification correctness compares canonical user selection", () => {
  assert.equal(
    doesWorkLogClassificationSuggestionMatch(
      { kind: "objective", objectiveId: "obj-1", confidence: 0.9 },
      { kind: "objective", targetId: "obj-1", targetName: "目标一" },
    ),
    true,
  );
  assert.equal(
    doesWorkLogClassificationSuggestionMatch(
      { kind: "category", categoryId: "category-1", confidence: 0.8 },
      { kind: "category", targetId: "category-2", targetName: "管理事务" },
    ),
    false,
  );
  assert.equal(
    doesWorkLogClassificationSuggestionMatch(
      { kind: "newCategory", categoryName: " 客户   沟通 ", confidence: 0.7 },
      { kind: "category", targetId: "category-3", targetName: "客户 沟通" },
    ),
    true,
  );
  assert.equal(
    doesWorkLogClassificationSuggestionMatch(
      { kind: "uncategorized", confidence: 0.5 },
      { kind: "uncategorized", targetId: null, targetName: "未归类" },
    ),
    true,
  );
});
