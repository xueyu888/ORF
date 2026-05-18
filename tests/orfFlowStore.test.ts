import assert from "node:assert/strict";
import test from "node:test";
import { initialOrfState } from "../src/data/initialOrfState";
import { normalizeState, OrfFlowStore } from "../src/state/OrfFlowStore";
import type {
  Decision,
  EvalRun,
  Evidence,
  FailureSample,
  Feedback,
  Objective,
  OrfState,
  Result,
  Scenario,
  Task,
} from "../src/types/orf";

const store = new OrfFlowStore();
const date = "2026-05-14";

test("load starts from empty business data instead of bundled seed records", () => {
  const state = store.load();

  assert.deepEqual(state.objectives, []);
  assert.deepEqual(state.results, []);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.feedback, []);
  assert.deepEqual(state.comments, []);
  assert.deepEqual(state.objectiveLoot, []);
  assert.deepEqual(state.objectiveContributionReviews, []);
  assert.deepEqual(state.pointLedger, []);
  assert.ok(state.users.length > 0);
});

test("normalizeState migrates legacy challenge fields and result defaults", () => {
  const legacyObjective = {
    ...objective({ id: "obj-legacy", resultIds: ["res-legacy"], taskIds: ["task-legacy"] }),
    flowStatus: undefined,
    stage: undefined,
    finalDueAt: "",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: undefined,
  } as unknown as Objective;
  const legacyResult = {
    ...result({
      id: "res-legacy",
      objectiveId: "obj-legacy",
      uncertaintyLevel: "飞升",
      uncertaintyScore: undefined,
      acceptedResult: undefined,
    }),
    owner: "Kai Wang",
    finalDueAt: "2026-06-10",
    assignedChallenger: "Kai Wang",
    challengeApplications: [{ id: "app-1", applicant: "Nora Li", status: "pending", createdAt: date }],
  } as unknown as Result;
  const legacyTask = task({ id: "task-legacy", linkedObjectiveId: "obj-legacy", linkedResultId: "res-legacy", dueDate: "2026-06-20" });

  const normalized = normalizeState(
    state({
      objectives: [legacyObjective],
      results: [legacyResult],
      tasks: [legacyTask],
    }),
  );

  assert.equal(normalized.objectives[0]?.stage, "orfReestimate");
  assert.equal(normalized.objectives[0]?.flowStatus, "reestimating");
  assert.equal(normalized.objectives[0]?.finalDueAt, "2026-06-10");
  assert.deepEqual(normalized.objectives[0]?.challengers, ["Kai Wang"]);
  assert.deepEqual(normalized.objectives[0]?.assignedChallengers, []);
  assert.equal(normalized.objectives[0]?.challengeApplications[0]?.applicant, "Nora Li");
  assert.equal(normalized.results[0]?.source, "managerDefined");
  assert.equal(normalized.results[0]?.uncertaintyScore, 810);
  assert.equal(normalized.results[0]?.acceptedResult, "unreviewed");
});

test("normalizeState adds fallback due dates in calendar days", () => {
  const normalized = normalizeState(
    state({
      objectives: [objective({ id: "obj-date", finalDueAt: "", updatedAt: "2026-05-14" })],
      results: [],
      tasks: [],
    }),
  );

  assert.equal(normalized.objectives[0]?.finalDueAt, "2026-05-28");
});

test("local store generated ids stay unique within one millisecond", () => {
  const current = state({
    objectives: [objective({ id: "obj-base", resultIds: ["res-base"], taskIds: ["task-base"] })],
    results: [result({ id: "res-base", objectiveId: "obj-base" })],
    tasks: [task({ id: "task-base", linkedObjectiveId: "obj-base", linkedResultId: "res-base" })],
  });
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 4102444800000;
  Math.random = () => 0.123456;

  try {
    const withObjectives = store.createObjective(
      store.createObjective(current, { title: "Objective A", whyItMatters: "A", cycle: "2999-Q1", boundary: "Boundary" }),
      { title: "Objective B", whyItMatters: "B", cycle: "2999-Q1", boundary: "Boundary" },
    );
    assert.equal(new Set(withObjectives.objectives.slice(0, 2).map((item) => item.id)).size, 2);

    const withResults = store.createResult(
      store.createResult(current, { objectiveId: "obj-base", title: "Result A", metricName: "Metric A" }),
      { objectiveId: "obj-base", title: "Result B", metricName: "Metric B" },
    );
    assert.equal(new Set(withResults.results.slice(0, 2).map((item) => item.id)).size, 2);

    const feedbackInput = {
      phenomenon: "Signal",
      causeCategories: ["Quality"],
      impact: "High" as const,
      linkedObjectiveId: "obj-base",
      linkedResultId: "res-base",
      suggestedAdjustment: "Adjust",
      source: "Team review" as const,
      owner: "Kai Wang",
    };
    const withFeedback = store.createFeedback(store.createFeedback(current, feedbackInput), feedbackInput);
    assert.equal(new Set(withFeedback.feedback.slice(0, 2).map((item) => item.id)).size, 2);
    assert.equal(new Set(withFeedback.feedback.slice(0, 2).flatMap((item) => item.activity.map((entry) => entry.id))).size, 2);

    const withChecklist = store.createTaskChecklistItem(store.createTaskChecklistItem(current, "task-base"), "task-base");
    assert.equal(new Set(withChecklist.tasks[0]?.checklist.map((item) => item.id)).size, 2);

    const withDecisions = store.proposeResultUpdate(
      store.proposeResultUpdate(current, "res-base", "Title A", "Reason A"),
      "res-base",
      "Title B",
      "Reason B",
    );
    assert.equal(new Set(withDecisions.decisions.slice(0, 2).map((item) => item.id)).size, 2);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test("deleteObjective cascades all linked records and keeps unrelated records", () => {
  const current = state({
    objectives: [
      objective({ id: "obj-delete", resultIds: ["res-delete"], taskIds: ["task-delete"], feedbackIds: ["fb-delete"] }),
      objective({ id: "obj-keep", resultIds: ["res-keep"], taskIds: ["task-keep"], feedbackIds: [] }),
    ],
    results: [
      result({ id: "res-delete", objectiveId: "obj-delete", taskIds: ["task-delete"], feedbackIds: ["fb-delete"], evidenceIds: ["ev-delete"] }),
      result({ id: "res-keep", objectiveId: "obj-keep", taskIds: ["task-keep"] }),
    ],
    tasks: [
      task({
        id: "task-delete",
        linkedObjectiveId: "obj-delete",
        linkedResultId: "res-delete",
        checklist: [{ id: "ck-delete", label: "remove me", done: false, updatedAt: date }],
      }),
      task({ id: "task-keep", linkedObjectiveId: "obj-keep", linkedResultId: "res-keep" }),
    ],
    feedback: [feedback({ id: "fb-delete", linkedObjectiveId: "obj-delete", linkedResultId: "res-delete" })],
    evidence: [evidence({ id: "ev-delete", linkedResultId: "res-delete", linkedFeedbackId: "fb-delete" })],
    decisions: [decision({ id: "dec-delete", linkedObjectiveId: "obj-delete", linkedResultId: "res-delete", linkedFeedbackId: "fb-delete" })],
    evalRuns: [evalRun({ id: "eval-delete", linkedResultId: "res-delete" })],
    scenarios: [scenario({ id: "scenario-delete", linkedObjectiveId: "obj-delete" })],
    failureSamples: [failureSample({ id: "sample-delete", linkedResultId: "res-delete" })],
    objectiveLoot: [{ id: "loot-delete", objectiveId: "obj-delete", submittedBy: "Kai Wang", body: "done", resultClaims: [], submittedAt: date }],
    objectiveContributionReviews: [{ id: "review-delete", objectiveId: "obj-delete", reviewer: "Kai Wang", allocations: [{ member: "Kai Wang", ratio: 1 }], submittedAt: date }],
    pointLedger: [{ id: "points-delete", objectiveId: "obj-delete", memberName: "Kai Wang", points: 10, reason: "settlement", createdAt: date }],
    comments: [
      comment("comment-objective", "objective", "obj-delete"),
      comment("comment-result", "result", "res-delete"),
      comment("comment-task", "task", "task-delete"),
      comment("comment-subtask", "subtask", "ck-delete"),
      comment("comment-keep", "result", "res-keep"),
    ],
  });

  const next = store.deleteObjective(current, "obj-delete");

  assert.deepEqual(next.objectives.map((item) => item.id), ["obj-keep"]);
  assert.deepEqual(next.results.map((item) => item.id), ["res-keep"]);
  assert.deepEqual(next.tasks.map((item) => item.id), ["task-keep"]);
  assert.deepEqual(next.feedback, []);
  assert.deepEqual(next.evidence, []);
  assert.deepEqual(next.decisions, []);
  assert.deepEqual(next.evalRuns, []);
  assert.deepEqual(next.scenarios, []);
  assert.deepEqual(next.failureSamples, []);
  assert.deepEqual(next.objectiveLoot, []);
  assert.deepEqual(next.objectiveContributionReviews, []);
  assert.deepEqual(next.pointLedger, []);
  assert.deepEqual(next.comments.map((item) => item.id), ["comment-keep"]);
});

test("moveTask moves across results and refreshes objective/result task indexes", () => {
  const current = state({
    objectives: [
      objective({ id: "obj-a", resultIds: ["res-a"], taskIds: ["task-a"] }),
      objective({ id: "obj-b", resultIds: ["res-b"], taskIds: ["task-b"] }),
    ],
    results: [
      result({ id: "res-a", objectiveId: "obj-a", taskIds: ["task-a"] }),
      result({ id: "res-b", objectiveId: "obj-b", taskIds: ["task-b"] }),
    ],
    tasks: [
      task({ id: "task-a", linkedObjectiveId: "obj-a", linkedResultId: "res-a" }),
      task({ id: "task-b", linkedObjectiveId: "obj-b", linkedResultId: "res-b" }),
    ],
  });

  const next = store.moveTask(current, { taskId: "task-a", toResultId: "res-b", referenceTaskId: "task-b", placement: "after" });

  assert.deepEqual(next.tasks.map((item) => item.id), ["task-b", "task-a"]);
  assert.equal(next.tasks.find((item) => item.id === "task-a")?.linkedObjectiveId, "obj-b");
  assert.equal(next.tasks.find((item) => item.id === "task-a")?.linkedResultId, "res-b");
  assert.deepEqual(next.objectives.find((item) => item.id === "obj-a")?.taskIds, []);
  assert.deepEqual(next.objectives.find((item) => item.id === "obj-b")?.taskIds, ["task-b", "task-a"]);
  assert.deepEqual(next.results.find((item) => item.id === "res-a")?.taskIds, []);
  assert.deepEqual(next.results.find((item) => item.id === "res-b")?.taskIds, ["task-b", "task-a"]);
});

test("moveResult refuses to move a result outside its objective", () => {
  const current = state({
    objectives: [
      objective({ id: "obj-a", resultIds: ["res-a"] }),
      objective({ id: "obj-b", resultIds: ["res-b"] }),
    ],
    results: [
      result({ id: "res-a", objectiveId: "obj-a" }),
      result({ id: "res-b", objectiveId: "obj-b" }),
    ],
  });

  assert.equal(store.moveResult(current, { resultId: "res-a", objectiveId: "obj-a", referenceResultId: "res-b", placement: "after" }), current);
});

test("checklist mutations keep task status and subtask comments consistent", () => {
  const current = state({
    tasks: [
      task({
        id: "task-a",
        status: "Todo",
        checklist: [
          { id: "ck-a", label: "first", done: false, updatedAt: date },
          { id: "ck-b", label: "second", done: false, updatedAt: date },
        ],
      }),
    ],
    comments: [comment("comment-subtask", "subtask", "ck-a")],
  });

  const partlyDone = store.updateTaskChecklistItem(current, "task-a", "ck-a", true);
  assert.equal(partlyDone.tasks[0]?.status, "In Progress");

  const renamed = store.updateTaskChecklistItemLabel(partlyDone, "task-a", "ck-a", "renamed");
  assert.equal(renamed.comments[0]?.targetTitle, "renamed");

  const deleted = store.deleteTaskChecklistItem(renamed, "task-a", "ck-a");
  assert.deepEqual(deleted.tasks[0]?.checklist.map((item) => item.id), ["ck-b"]);
  assert.deepEqual(deleted.comments, []);
  assert.equal(deleted.tasks[0]?.status, "Todo");
});

test("deleteCommentMessage clears reply references to deleted messages", () => {
  const current = state({
    comments: [
      {
        id: "thread-a",
        targetType: "objective",
        targetId: "obj-a",
        targetTitle: "Objective A",
        status: "open",
        createdBy: "user-kai",
        createdAt: date,
        updatedAt: date,
        messages: [
          { id: "msg-root", author: "Kai Wang", body: "Root", createdAt: date },
          { id: "msg-reply", author: "Kai Wang", body: "Reply", createdAt: date, parentMessageId: "msg-root" },
          {
            id: "msg-nested",
            author: "Nora Li",
            body: "Nested",
            createdAt: date,
            parentMessageId: "msg-root",
            replyToMessageId: "msg-reply",
            replyToAuthor: "Kai Wang",
          },
        ],
      },
    ],
  });

  const next = store.deleteCommentMessage(current, "thread-a", "msg-reply");
  const messages = next.comments[0]?.messages ?? [];

  assert.deepEqual(messages.map((message) => message.id), ["msg-root", "msg-nested"]);
  assert.equal(messages.find((message) => message.id === "msg-nested")?.replyToMessageId, undefined);
  assert.equal(messages.find((message) => message.id === "msg-nested")?.replyToAuthor, undefined);
});

test("acceptBountyChallenge confirms a recruited member and approves their pending application", () => {
  const current = state({
    objectives: [
      objective({
        id: "obj-recruiting",
        flowStatus: "recruiting",
        finalDueAt: "2999-12-31",
        assignedChallengers: ["Kai Wang"],
        challengeApplications: [{ id: "app-kai", applicant: "Kai Wang", status: "pending", createdAt: date, decidedAt: null }],
      }),
    ],
  });

  const next = store.acceptBountyChallenge(current, "obj-recruiting", " Kai Wang ");

  assert.deepEqual(next.objectives[0]?.challengers, ["Kai Wang"]);
  assert.deepEqual(next.objectives[0]?.assignedChallengers, []);
  assert.equal(next.objectives[0]?.flowStatus, "reestimating");
  assert.equal(next.objectives[0]?.stage, "orfReestimate");
  assert.equal(next.objectives[0]?.challengeApplications[0]?.status, "approved");
  assert.ok(next.objectives[0]?.acceptedAt);
  assert.ok(next.objectives[0]?.confirmationDueAt);
});

test("updateObjectiveStage refuses stages that contradict lifecycle status", () => {
  const current = state({
    objectives: [
      objective({ id: "obj-reestimating", flowStatus: "reestimating", stage: "orfReestimate" }),
      objective({ id: "obj-frozen", flowStatus: "frozen", stage: "goalFrozen" }),
    ],
  });

  const invalidReestimating = store.updateObjectiveStage(current, "obj-reestimating", "goalFrozen");
  assert.equal(invalidReestimating.objectives.find((item) => item.id === "obj-reestimating")?.stage, "orfReestimate");

  const invalidFrozen = store.updateObjectiveStage(current, "obj-frozen", "orfReestimate");
  assert.equal(invalidFrozen.objectives.find((item) => item.id === "obj-frozen")?.stage, "goalFrozen");

  const compatibleOpenStage = store.updateObjectiveStage(
    state({ objectives: [objective({ id: "obj-open", flowStatus: "open", stage: "resultClaiming" })] }),
    "obj-open",
    "orfReestimate",
  );
  assert.equal(compatibleOpenStage.objectives[0]?.stage, "orfReestimate");
});

function state(overrides: Partial<OrfState> = {}): OrfState {
  return {
    users: initialOrfState.users,
    currentUserId: initialOrfState.currentUserId,
    permissionRules: initialOrfState.permissionRules,
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
    objectiveContributionReviews: [],
    pointLedger: [],
    causeCategories: [],
    rules: {
      requireResultForTask: true,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: true,
    },
    ...overrides,
  };
}

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "obj-a",
    title: "Objective",
    description: "Objective description",
    whyItMatters: "It matters",
    cycle: "2026-Q2",
    stage: "orfReestimate",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "Boundary",
    successDefinition: "Success",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2026-06-30",
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
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function result(overrides: Partial<Result> = {}): Result {
  return {
    id: "res-a",
    objectiveId: "obj-a",
    title: "Result",
    description: "Result description",
    metricName: "Accuracy",
    metricRequirement: "Accuracy reaches target",
    statisticalObject: "Dataset",
    completionStandard: "Completed evidence",
    sampleSet: "Sample",
    measurementScope: "Fixed test",
    uncertaintyLevel: "进阶",
    baseline: 0,
    current: 0,
    target: 100,
    unit: "%",
    direction: "increase",
    status: "Draft",
    confidence: 50,
    source: "managerDefined",
    definer: "Alex Chen",
    uncertaintyScore: 30,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    taskIds: [],
    feedbackIds: [],
    trend: [{ date, value: 0 }],
    reviewCadence: "Weekly",
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-a",
    title: "Task",
    description: "Task description",
    status: "Todo",
    priority: "Medium",
    assignee: "Kai Wang",
    linkedObjectiveId: "obj-a",
    linkedResultId: "res-a",
    dueDate: date,
    tags: ["ORF"],
    checklist: [],
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function feedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: "fb-a",
    phenomenon: "Unexpected output",
    evidenceIds: [],
    causeCategories: ["Quality"],
    impact: "High",
    linkedObjectiveId: "obj-a",
    linkedResultId: "res-a",
    suggestedAdjustment: "Adjust metric",
    source: "Team review",
    status: "New",
    owner: "Kai Wang",
    createdAt: date,
    updatedAt: date,
    activity: [],
    ...overrides,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-a",
    type: "Dashboard snapshot",
    title: "Evidence",
    summary: "Evidence summary",
    source: "Dashboard",
    date,
    owner: "Kai Wang",
    linkedResultId: "res-a",
    ...overrides,
  };
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "dec-a",
    title: "Decision",
    reason: "Reason",
    evidence: "Evidence",
    owner: "Alex Chen",
    date,
    linkedObjectiveId: "obj-a",
    ...overrides,
  };
}

function evalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "eval-a",
    scenario: "Scenario",
    dataset: "Dataset",
    model: "Model",
    promptVersion: "v1",
    ragVersion: "v1",
    accuracy: 0.8,
    hallucination: 0.1,
    latency: 100,
    cost: 1,
    status: "On Track",
    linkedResultId: "res-a",
    ...overrides,
  };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "scenario-a",
    title: "Scenario",
    qualityScore: 80,
    lastRun: date,
    topFailureCause: "None",
    linkedObjectiveId: "obj-a",
    openFeedbackCount: 0,
    ...overrides,
  };
}

function failureSample(overrides: Partial<FailureSample> = {}): FailureSample {
  return {
    id: "sample-a",
    question: "Question",
    modelAnswer: "Model answer",
    expectedAnswer: "Expected answer",
    reason: "Reason",
    linkedResultId: "res-a",
    ...overrides,
  };
}

function comment(
  id: string,
  targetType: OrfState["comments"][number]["targetType"],
  targetId: string,
): OrfState["comments"][number] {
  return {
    id,
    targetType,
    targetId,
    targetTitle: targetId,
    status: "open",
    createdBy: "user-kai",
    createdAt: date,
    updatedAt: date,
    messages: [{ id: `${id}-message`, author: "Kai Wang", body: "Comment", createdAt: date }],
  };
}
