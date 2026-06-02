import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTitleEditOverlays,
  titleEditOverlayForTarget,
  titleEditOverlayResolved,
  upsertTitleEditOverlay,
  type TitleEditOverlay,
} from "../src/features/challenge/model/titleEditOverlay";
import type { Objective, OrfState, Result, Task, TaskChecklistItem } from "../src/types/orf";

test("title edit overlays keep persisted row edits visible until backend snapshot materializes", () => {
  const current = state({
    objectives: [objective({ id: "obj-a", title: "旧目标" })],
    results: [metric({ id: "res-a", objectiveId: "obj-a", title: "旧指标" })],
    tasks: [
      task({
        id: "task-a",
        title: "旧行动项",
        checklist: [checklistItem({ id: "ck-a", label: "旧子行动项" })],
      }),
    ],
  });
  const overlays: TitleEditOverlay[] = [
    { id: "title-objective", type: "objective", objectiveId: "obj-a", title: "新目标" },
    { id: "title-metric", type: "metric", resultId: "res-a", title: "新指标" },
    { id: "title-action", type: "action", taskId: "task-a", title: "新行动项" },
    { id: "title-subtask", type: "subtask", taskId: "task-a", itemId: "ck-a", title: "新子行动项" },
  ];

  const optimistic = applyTitleEditOverlays(current, overlays);

  assert.equal(optimistic.objectives[0]?.title, "新目标");
  assert.equal(optimistic.results[0]?.title, "新指标");
  assert.equal(optimistic.results[0]?.metricName, "新指标");
  assert.equal(optimistic.tasks[0]?.title, "新行动项");
  assert.equal(optimistic.tasks[0]?.checklist[0]?.label, "新子行动项");
  assert.equal(titleEditOverlayResolved(current, overlays[0]!), false);
  assert.equal(titleEditOverlayResolved(optimistic, overlays[0]!), true);
});

test("title edit overlays replace only the latest edit for the same target", () => {
  const first = { id: "first", type: "action", taskId: "task-a", title: "第一次" } satisfies TitleEditOverlay;
  const second = { id: "second", type: "action", taskId: "task-a", title: "第二次" } satisfies TitleEditOverlay;
  const metricInput = titleEditOverlayForTarget({ type: "bounty", id: "res-a", objectiveId: "obj-a", title: "旧指标" }, "新指标");

  const overlays = upsertTitleEditOverlay(upsertTitleEditOverlay([], first), second);

  assert.deepEqual(overlays, [second]);
  assert.deepEqual(metricInput, { type: "metric", resultId: "res-a", title: "新指标" });
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
    feedbackIds: [],
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
    feedbackIds: [],
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
