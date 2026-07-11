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
      durationMinutes: 33.4,
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
  assert.equal(stored?.draft.durationMinutes, 33);
  assert.equal(stored?.draft.progressEstimatePercent, 89);
  assert.equal(stored?.selectedObjective?.title, "工作日志体验");
  assert.equal(parseStoredWorkLogEditorDraft("{bad json"), null);
});
