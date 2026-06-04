import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChildCreationOverlay,
  beginChildCreationSession,
  cancelChildCreationSession,
  childCreationDraftId,
  childCreationOverlayMaterialized,
  childCreationSubmittedOverlay,
  childCreationTarget,
  childCreationTemporaryRow,
  clearChildCreationSession,
  completeChildCreationDraft,
  failChildCreationDraft,
  idleChildCreationSession,
  isChildCreationTarget,
  materializeSubmittedChildCreation,
  submitChildCreationDraft,
  updateChildCreationDraftTitle,
  type ChildCreationDraft,
} from "../src/features/challenge/model/childCreationSession";
import type { Objective, OrfState, Result, Task, TaskChecklistItem } from "../src/types/orf";

test("child creation session has one draft to overlay to snapshot handoff chain", () => {
  const draft: ChildCreationDraft = {
    id: childCreationDraftId("metric", "obj-a"),
    kind: "metric",
    objectiveId: "obj-a",
    source: "managerDefined",
    title: "",
  };
  const editing = updateChildCreationDraftTitle(beginChildCreationSession(idleChildCreationSession, draft), "新增指标");
  const submitting = submitChildCreationDraft(editing, "新增指标", "submission-a");
  const result = metric({ id: "res-a", objectiveId: "obj-a", title: "新增指标" });
  const submitted = completeChildCreationDraft(submitting, submitting, { kind: "metric", result });
  const editingRow = childCreationTemporaryRow(editing)!;

  assert.deepEqual(editingRow, { ...draft, title: "新增指标", persistence: "temporary", status: "editing" });
  assert.equal(childCreationTemporaryRow(submitting)?.status, "submitting");
  assert.equal(childCreationTemporaryRow(submitted), null);
  assert.equal(childCreationSubmittedOverlay(submitted)?.kind, "metric");
  assert.deepEqual(childCreationTarget(editingRow), { type: "bounty", id: draft.id, title: "新增指标", objectiveId: "obj-a" });
  assert.equal(isChildCreationTarget({ type: "bounty", id: draft.id, title: "新增指标", objectiveId: "obj-a" }), true);

  const base = state({ objectives: [objective({ id: "obj-a" })] });
  const optimistic = applyChildCreationOverlay(base, childCreationSubmittedOverlay(submitted));
  assert.deepEqual(optimistic.objectives[0]?.resultIds, ["res-a"]);
  assert.deepEqual(optimistic.results.map((item) => item.id), ["res-a"]);
  assert.equal(materializeSubmittedChildCreation(submitted, optimistic).status, "idle");
});

test("child creation overlay inserts action and subtask once until backend snapshot owns them", () => {
  const taskItem = task({ id: "task-a", linkedObjectiveId: "obj-a" });
  const item = checklistItem({ id: "ck-new", label: "新增子行动项" });
  const base = state({
    objectives: [objective({ id: "obj-a" })],
    tasks: [task({ id: "task-parent", linkedObjectiveId: "obj-a", checklist: [checklistItem({ id: "ck-before" })] })],
  });

  const withTask = applyChildCreationOverlay(base, { kind: "action", task: taskItem });
  assert.deepEqual(withTask.objectives[0]?.taskIds, ["task-a"]);
  assert.deepEqual(withTask.tasks.map((current) => current.id).sort(), ["task-a", "task-parent"]);
  assert.equal(applyChildCreationOverlay(withTask, { kind: "action", task: taskItem }), withTask);
  assert.equal(childCreationOverlayMaterialized(withTask, { kind: "action", task: taskItem }), true);

  const withSubtask = applyChildCreationOverlay(base, { kind: "subtask", taskId: "task-parent", item, afterItemId: "ck-before" });
  assert.deepEqual(withSubtask.tasks.find((current) => current.id === "task-parent")?.checklist.map((current) => current.id), ["ck-before", "ck-new"]);
  assert.equal(applyChildCreationOverlay(withSubtask, { kind: "subtask", taskId: "task-parent", item, afterItemId: "ck-before" }), withSubtask);
  assert.equal(childCreationOverlayMaterialized(withSubtask, { kind: "subtask", taskId: "task-parent", item }), true);
});

test("child creation session rejects stale API responses after state changes", () => {
  const draft = beginChildCreationSession(idleChildCreationSession, {
    id: childCreationDraftId("action", "obj-a"),
    kind: "action",
    objectiveId: "obj-a",
    title: "行动项",
  });
  const firstSubmitting = submitChildCreationDraft(draft, "行动项", "submission-a");
  const cleared = clearChildCreationSession();
  const secondSubmitting = submitChildCreationDraft(beginChildCreationSession(cleared, childCreationTemporaryRow(firstSubmitting)!), "行动项", "submission-b");
  const staleTask = task({ id: "task-stale", linkedObjectiveId: "obj-a", title: "行动项" });
  const freshTask = task({ id: "task-fresh", linkedObjectiveId: "obj-a", title: "行动项" });

  assert.equal(completeChildCreationDraft(cleared, firstSubmitting, { kind: "action", task: staleTask }).status, "idle");
  assert.equal(completeChildCreationDraft(secondSubmitting, firstSubmitting, { kind: "action", task: staleTask }), secondSubmitting);
  assert.equal(failChildCreationDraft(secondSubmitting, firstSubmitting), secondSubmitting);
  assert.deepEqual(completeChildCreationDraft(secondSubmitting, secondSubmitting, { kind: "action", task: freshTask }), {
    status: "submittedOverlay",
    overlay: { kind: "action", task: freshTask },
  });
});

test("child creation draft can be cancelled before submission", () => {
  const draft = beginChildCreationSession(idleChildCreationSession, {
    id: childCreationDraftId("action", "obj-a"),
    kind: "action",
    objectiveId: "obj-a",
    title: "   ",
  });

  assert.equal(cancelChildCreationSession(draft).status, "idle");
});

function state(overrides: Partial<OrfState> = {}): OrfState {
  return {
    users: [],
    currentUserId: "",
    permissionRules: [],
    objectives: [],
    results: [],
    feedback: [],
    tasks: [],
    evidence: [],
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    comments: [],
    objectiveLoot: [],
    objectiveTrialReviews: [],
    pointLedger: [],
    causeCategories: [],
    rules: {
      autoCreateReviewSummary: false,
      requireEvidenceForFeedback: false,
      requireResultForTask: false,
      weeklyFeedbackCadence: false,
    },
    ...overrides,
  };
}

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "obj-a",
    title: "目标",
    description: "",
    whyItMatters: "",
    cycle: "2999 Q1",
    stage: "goalSetting",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    taskIds: [],
    finalDueAt: "2999-12-31",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: "2999-01-01",
    updatedAt: "2999-01-01",
    ...overrides,
  };
}

function metric(overrides: Partial<Result> = {}): Result {
  return {
    id: "res-a",
    objectiveId: "obj-a",
    title: "指标",
    description: "",
    metricName: "指标",
    baseline: 0,
    current: 0,
    target: 100,
    unit: "%",
    direction: "increase",
    status: "Draft",
    confidence: 50,
    uncertaintyScore: 0,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    trend: [],
    reviewCadence: "weekly",
    createdAt: "2999-01-01",
    updatedAt: "2999-01-01",
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-a",
    title: "行动项",
    description: "",
    status: "Todo",
    priority: "High",
    assignee: "Kai",
    linkedObjectiveId: "obj-a",
    dueDate: "2999-12-31",
    tags: [],
    checklist: [],
    createdAt: "2999-01-01",
    updatedAt: "2999-01-01",
    ...overrides,
  };
}

function checklistItem(overrides: Partial<TaskChecklistItem> = {}): TaskChecklistItem {
  return {
    id: "ck-a",
    label: "子行动项",
    done: false,
    updatedAt: "2999-01-01",
    ...overrides,
  };
}
