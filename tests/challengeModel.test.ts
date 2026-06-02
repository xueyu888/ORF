import assert from "node:assert/strict";
import test from "node:test";
import { canDropItem, dropTargetClass } from "../src/features/challenge/model/challengeDragDrop";
import { addDays, bountyUpdatedAt, remainingTime } from "../src/features/challenge/model/challengeDates";
import {
  commentCountFor,
  commentCountsByTarget,
  commentTargetForChallengeTarget,
  submittedLootObjectiveIdsFromComments,
} from "../src/features/challenge/model/challengeComments";
import { canAccessDragItem, canAccessTarget, permissionDeniedMessage } from "../src/features/challenge/model/challengePermissions";
import { bountyStatus, objectiveStatusLabel, objectiveStatusTone, subActionVisualStatus } from "../src/features/challenge/model/challengeStatus";
import { buildChallengeTree, summarizeDashboard } from "../src/features/challenge/model/challengeTreeModel";
import {
  applyTaskCompletionOverlays,
  taskCompletionOverlayMaterialized,
  upsertTaskCompletionOverlay,
  type TaskCompletionOverlay,
} from "../src/features/challenge/model/taskCompletionOverlay";
import {
  canFreezeObjectiveAfterReestimate,
  canMutateObjectiveWorkItems,
  canSubmitObjectiveLoot,
  canSubmitObjectivePeerReview,
  metricCreationActionForObjective,
  metricEditAccessForObjective,
  workItemMutationAccessForObjective,
  workbenchActionForObjective,
} from "../src/features/challenge/model/orfFlowCapabilities";
import {
  canViewObjectiveRecord,
  filterFeedbackForVisibleObjectives,
  filterResultsForVisibleObjectives,
  filterTasksForVisibleObjectives,
  visibleObjectiveIdsForUser,
  visibleObjectivesForUser,
} from "../src/features/challenge/model/objectiveVisibility";
import {
  canCreateFeedbackForObjective,
  canCreateFeedbackFromResults,
  canCreateFeedbackFromVisibleState,
  canManageFeedbackStatus,
} from "../src/features/feedback/model/feedbackCapabilities";
import type { CommentThread, Evidence, Feedback, Objective, OrfState, Result, Task } from "../src/types/orf";

const date = "2026-05-14";

test("buildChallengeTree filters objectives and preserves objective result order", () => {
  const objA = objective({ id: "obj-a", resultIds: ["res-b", "res-a"], taskIds: ["task-a", "task-b"], flowStatus: "reestimating", challengers: ["Kai Wang"] });
  const objB = objective({ id: "obj-b", resultIds: ["res-c"] });
  const tree = buildChallengeTree(
    {
      objectives: [objA, objB],
      results: [
        result({ id: "res-a", objectiveId: "obj-a", uncertaintyLevel: "进阶", current: 10, target: 100 }),
        result({ id: "res-b", objectiveId: "obj-a", uncertaintyLevel: "飞升", current: 30, target: 100 }),
        result({ id: "res-c", objectiveId: "obj-b" }),
      ],
      tasks: [
        task({ id: "task-a", linkedObjectiveId: "obj-a" }),
        task({ id: "task-b", linkedObjectiveId: "obj-a" }),
      ],
      feedback: [],
      evidence: [],
    },
    new Set(["obj-a"]),
  );

  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.objective.id, "obj-a");
  assert.deepEqual(tree[0]?.bounties.map((item) => item.result.id), ["res-b", "res-a"]);
  assert.equal(tree[0]?.bounties[0]?.difficulty, "飞升");
  assert.equal(tree[0]?.bounties[0]?.status, "active");
  assert.equal(tree[0]?.bounties[0]?.progress, 30);
  assert.equal("deadline" in tree[0]!.bounties[0]!, false);
  assert.deepEqual(tree[0]?.actions.map((item) => item.id), ["task-a", "task-b"]);
});

test("buildChallengeTree keeps resultless ORF objectives visible", () => {
  const candidate = objective({ id: "obj-candidate", title: "Candidate objective", flowStatus: "candidate", resultIds: [] });
  const reestimating = objective({
    id: "obj-reestimating-empty",
    title: "Reestimating objective without results",
    flowStatus: "reestimating",
    challengers: ["Kai Wang"],
    resultIds: [],
  });

  const tree = buildChallengeTree({
    objectives: [candidate, reestimating],
    results: [],
    tasks: [],
    feedback: [],
    evidence: [],
  });

  assert.deepEqual(tree.map((group) => group.objective.id), ["obj-candidate", "obj-reestimating-empty"]);
  assert.deepEqual(tree.map((group) => group.bounties.length), [0, 0]);
  assert.equal(objectiveStatusLabel(tree[0]!.objective), "候选中");
  assert.equal(objectiveStatusLabel(tree[1]!.objective), "重估中");
});

test("summarizeDashboard counts settled, review, unassigned, and average objective progress", () => {
  const groups = buildChallengeTree({
    objectives: [
      objective({ id: "obj-settled", resultIds: ["res-settled"], challengers: ["Kai Wang"], flowStatus: "settled", progress: 100 }),
      objective({ id: "obj-review", resultIds: ["res-review"], challengers: ["Kai Wang"], flowStatus: "submitted", progress: 50 }),
      objective({ id: "obj-open", resultIds: ["res-open"], challengers: [], flowStatus: "open", progress: 0 }),
    ],
    results: [
      result({ id: "res-settled", objectiveId: "obj-settled", acceptedResult: "completed" }),
      result({ id: "res-review", objectiveId: "obj-review" }),
      result({ id: "res-open", objectiveId: "obj-open" }),
    ],
    tasks: [],
    feedback: [],
    evidence: [],
  });

  const summary = summarizeDashboard(groups);

  assert.equal(summary.settled, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.objectiveProgress, 50);
  assertNear(summary.settledProgress, 100 / 3);
  assertNear(summary.reviewProgress, 100 / 3);
  assertNear(summary.unassignedProgress, 100 / 3);
});

test("feedback status controls are limited to admins, creators, and owners", () => {
  const item = feedback({ owner: "Kai Wang", createdBy: "user-kai" });
  const creator = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const assignee = { id: "user-lee", name: "Lee Chen", email: "lee@example.com", role: "member" as const, status: "active" as const };
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const stranger = { id: "user-stranger", name: "Stranger", email: "stranger@example.com", role: "member" as const, status: "active" as const };

  assert.equal(canManageFeedbackStatus(item, creator), true);
  assert.equal(canManageFeedbackStatus(feedback({ owner: assignee.name, createdBy: "user-kai" }), assignee), true);
  assert.equal(canManageFeedbackStatus(item, admin), true);
  assert.equal(canManageFeedbackStatus(item, stranger), false);
});

test("feedback creation entry requires at least one visible result", () => {
  assert.equal(canCreateFeedbackFromResults([]), false);
  assert.equal(canCreateFeedbackFromResults([result({ id: "res-visible" })]), true);
});

test("feedback creation entry is limited to admins and objective challengers", () => {
  const objectiveItem = objective({ id: "obj-feedback-access", challengers: ["Kai Wang"], resultIds: ["res-visible"] });
  const resultItem = result({ id: "res-visible", objectiveId: objectiveItem.id });
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const observer = { id: "user-observer", name: "Observer", email: "observer@example.com", role: "member" as const, status: "active" as const };

  assert.equal(canCreateFeedbackForObjective(objectiveItem, admin, [resultItem]), true);
  assert.equal(canCreateFeedbackForObjective(objectiveItem, challenger, [resultItem]), true);
  assert.equal(canCreateFeedbackForObjective(objectiveItem, observer, [resultItem]), false);
  assert.equal(canCreateFeedbackForObjective(objectiveItem, challenger, []), false);
  assert.equal(canCreateFeedbackFromVisibleState({ objectives: [objectiveItem], results: [resultItem] }, observer), false);
});

test("objective visibility scopes member-facing records to current challengers", () => {
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const mine = objective({ id: "obj-mine", challengers: [challenger.name] });
  const other = objective({ id: "obj-other", challengers: ["Other Member"] });
  const memberVisibleIds = visibleObjectiveIdsForUser([mine, other], challenger);

  assert.equal(canViewObjectiveRecord(mine, challenger), true);
  assert.equal(canViewObjectiveRecord(other, challenger), false);
  assert.equal(canViewObjectiveRecord(undefined, admin), true);
  assert.deepEqual(visibleObjectivesForUser([mine, other], challenger).map((item) => item.id), ["obj-mine"]);
  assert.deepEqual([...visibleObjectiveIdsForUser([mine, other], admin)].sort(), ["obj-mine", "obj-other"]);
  assert.deepEqual(filterFeedbackForVisibleObjectives([feedback({ id: "fb-orphan", linkedObjectiveId: "obj-missing" })], memberVisibleIds, admin).map((item) => item.id), ["fb-orphan"]);
  assert.deepEqual(
    filterResultsForVisibleObjectives([result({ id: "res-mine", objectiveId: "obj-mine" }), result({ id: "res-other", objectiveId: "obj-other" })], memberVisibleIds).map((item) => item.id),
    ["res-mine"],
  );
  assert.deepEqual(
    filterTasksForVisibleObjectives([task({ id: "task-mine", linkedObjectiveId: "obj-mine" }), task({ id: "task-other", linkedObjectiveId: "obj-other" })], memberVisibleIds).map((item) => item.id),
    ["task-mine"],
  );
  assert.deepEqual(
    filterFeedbackForVisibleObjectives([feedback({ id: "fb-mine", linkedObjectiveId: "obj-mine" }), feedback({ id: "fb-other", linkedObjectiveId: "obj-other" })], memberVisibleIds).map((item) => item.id),
    ["fb-mine"],
  );
});

test("drag and drop rules block cross-objective bounty moves and self drops", () => {
  assert.equal(
    canDropItem({ type: "bounty", id: "res-a", objectiveId: "obj-a" }, { type: "bounty", bountyId: "res-b", objectiveId: "obj-b", placement: "after" }),
    false,
  );
  assert.equal(
    canDropItem({ type: "bounty", id: "res-a", objectiveId: "obj-a" }, { type: "bounty", bountyId: "res-b", objectiveId: "obj-a", placement: "after" }),
    true,
  );
  assert.equal(
    canDropItem({ type: "action", id: "task-a", bountyId: "res-a", objectiveId: "obj-a" }, { type: "action", actionId: "task-a", bountyId: "res-a", objectiveId: "obj-a", placement: "before" }),
    false,
  );
  assert.equal(
    canDropItem({ type: "subAction", id: "ck-a", actionId: "task-a" }, { type: "subAction", actionId: "task-a", itemId: "ck-a", placement: "after" }),
    false,
  );
  assert.equal(
    canDropItem({ type: "subAction", id: "ck-a", actionId: "task-a" }, { type: "actionSubActions", actionId: "task-b" }),
    true,
  );

  assert.equal(
    dropTargetClass({ type: "bounty", bountyId: "res-b", objectiveId: "obj-a", placement: "before" }, [{ type: "bounty", bountyId: "res-b" }]),
    "orf-drop-target-before",
  );
  assert.equal(
    dropTargetClass({ type: "actionSubActions", actionId: "task-b" }, [{ type: "actionSubActions", actionId: "task-b" }]),
    "orf-drop-target-inside",
  );
});

test("comment helpers map challenge targets, count only messages, and detect objective loot comments", () => {
  const threads: CommentThread[] = [
    comment("thread-result", "result", "res-a", ["one", "two"]),
    comment("thread-result-empty", "result", "res-b", []),
    comment("thread-result-legacy-loot", "result", "res-legacy-loot", ["战利品提交：old"]),
    comment("thread-loot", "objective", "obj-loot", ["战利品提交：done"]),
    comment("thread-task", "task", "task-a", ["task comment"]),
  ];
  const counts = commentCountsByTarget(threads);

  assert.deepEqual(commentTargetForChallengeTarget({ type: "bounty", id: "res-a", title: "Bounty", objectiveId: "obj-a" }), {
    type: "result",
    id: "res-a",
    title: "Bounty",
  });
  assert.equal(commentCountFor(counts, "result", "res-a"), 2);
  assert.equal(commentCountFor(counts, "result", "res-b"), 0);
  assert.equal(commentCountFor(counts, "task", "task-a"), 1);
  assert.deepEqual([...submittedLootObjectiveIdsFromComments(threads)], ["obj-loot"]);
});

test("date and status helpers keep challenge display boundaries stable", () => {
  const action = task({
    status: "In Progress",
    checklist: [
      { id: "ck-a", label: "done", done: true, updatedAt: "2026-05-15" },
      { id: "ck-b", label: "next", done: false, updatedAt: "2026-05-16" },
    ],
  });
  const feedbackItem = feedback({ linkedResultId: "res-a", updatedAt: "2026-05-17" });
  const evidenceItem = evidence({ linkedResultId: "res-a", date: "2026-05-18" });

  assert.equal(addDays("2026-05-14", 3), "2026-05-17");
  assert.equal(remainingTime("2026-05-16", new Date("2026-05-16T23:00:00")), "剩余 59 分钟");
  assert.equal(remainingTime("2026-05-15", new Date("2026-05-16T00:30:00")), "已超时 31 分钟");
  assert.equal(bountyUpdatedAt(result({ id: "res-a", trend: [], updatedAt: "2026-05-13" }), [], []), "2026-05-13");
  assert.equal(bountyUpdatedAt(result({ id: "res-a", trend: [{ date: "2026-05-12", value: 1 }] }), [feedbackItem], [evidenceItem]), "2026-05-18");
  assert.equal(bountyStatus(result(), objective({ flowStatus: "submitted" })), "review");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "recruiting" })), "征召中");
  assert.equal(objectiveStatusTone(objective({ flowStatus: "frozen" })), "active");
  assert.equal(subActionVisualStatus(action, action.checklist[1]!, 1), "active");
});

test("task completion overlays update display state without touching settlement truth", () => {
  const current = state({
    objectives: [objective({ id: "obj-a", acceptedResult: null, taskIds: ["task-a"] })],
    results: [result({ id: "res-a", objectiveId: "obj-a", acceptedResult: "unreviewed" })],
    tasks: [
      task({
        id: "task-a",
        linkedObjectiveId: "obj-a",
        status: "Todo",
        checklist: [
          { id: "ck-a", label: "first", done: false, updatedAt: date },
          { id: "ck-b", label: "second", done: false, updatedAt: date },
        ],
      }),
    ],
  });
  const overlay: TaskCompletionOverlay = { id: "overlay-task", type: "task", taskId: "task-a", done: true };

  const optimistic = applyTaskCompletionOverlays(current, [overlay]);

  assert.equal(optimistic.tasks[0]?.status, "Done");
  assert.deepEqual(optimistic.tasks[0]?.checklist.map((item) => item.done), [true, true]);
  assert.equal(optimistic.objectives[0]?.acceptedResult, null);
  assert.equal(optimistic.results[0]?.acceptedResult, "unreviewed");
  assert.equal(taskCompletionOverlayMaterialized(current, overlay), false);
  assert.equal(taskCompletionOverlayMaterialized(optimistic, overlay), true);
});

test("subtask completion overlays reuse task status inference and replace same-target intents", () => {
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
  });
  const firstOverlay: TaskCompletionOverlay = { id: "overlay-first", type: "subtask", taskId: "task-a", itemId: "ck-a", done: true };
  const replacementOverlay: TaskCompletionOverlay = { id: "overlay-replacement", type: "subtask", taskId: "task-a", itemId: "ck-a", done: false };
  const overlays = upsertTaskCompletionOverlay(upsertTaskCompletionOverlay([], firstOverlay), replacementOverlay);
  const optimistic = applyTaskCompletionOverlays(current, [firstOverlay]);

  assert.deepEqual(overlays, [replacementOverlay]);
  assert.equal(optimistic.tasks[0]?.status, "In Progress");
  assert.deepEqual(optimistic.tasks[0]?.checklist.map((item) => item.done), [true, false]);
  assert.equal(taskCompletionOverlayMaterialized(current, firstOverlay), false);
  assert.equal(taskCompletionOverlayMaterialized(optimistic, firstOverlay), true);
});

test("bounty and objective statuses follow the ORF frontend flow", () => {
  assert.equal(bountyStatus(result(), objective({ flowStatus: "open" })), "open");
  assert.equal(bountyStatus(result(), objective({ flowStatus: "reestimating", challengers: ["Kai Wang"] })), "active");
  assert.equal(bountyStatus(result(), objective({ flowStatus: "frozen", challengers: ["Kai Wang"] })), "active");
  assert.equal(bountyStatus(result(), objective({ flowStatus: "submitted", challengers: ["Kai Wang"] })), "review");
  assert.equal(bountyStatus(result({ acceptedResult: "completed" }), objective({ flowStatus: "settled", challengers: ["Kai Wang"] })), "settled");

  assert.equal(objectiveStatusLabel(objective({ flowStatus: "candidate" })), "候选中");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "applying" })), "申请中");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "recruiting" })), "征召中");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "frozen" })), "已冻结");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "submitted" })), "待验收");
  assert.equal(objectiveStatusLabel(objective({ flowStatus: "settled" })), "已结算");
});

test("freeze action requires reestimating objectives with concrete metrics", () => {
  const reestimating = objective({ flowStatus: "reestimating" });
  const frozen = objective({ flowStatus: "frozen" });

  assert.equal(canFreezeObjectiveAfterReestimate(reestimating, []), false);
  assert.equal(canFreezeObjectiveAfterReestimate(reestimating, [result({ objectiveId: reestimating.id, uncertaintyLevel: undefined, uncertaintyScore: 0 })]), false);
  assert.equal(canFreezeObjectiveAfterReestimate(reestimating, [result({ objectiveId: reestimating.id })]), true);
  assert.equal(canFreezeObjectiveAfterReestimate(frozen, [result({ objectiveId: frozen.id })]), false);
  assert.equal(canFreezeObjectiveAfterReestimate(undefined, [result()]), false);
});

test("metric creation action separates commander definition from challenger proposal", () => {
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const rules = [{ role: "member" as const, permissions: [] }];
  const dueAt = "2999-05-30T00:00:00.000Z";

  assert.deepEqual(
    metricCreationActionForObjective({
      objective: objective({ flowStatus: "candidate", challengers: [] }),
      currentUser: admin,
      permissionRules: rules,
      now: new Date("2026-05-22T00:00:00.000Z"),
    }),
    { label: "新增指标", source: "managerDefined" },
  );
  assert.deepEqual(
    metricCreationActionForObjective({
      objective: objective({ flowStatus: "reestimating", challengers: [challenger.name], confirmationDueAt: dueAt }),
      currentUser: challenger,
      permissionRules: rules,
      now: new Date("2026-05-22T00:00:00.000Z"),
    }),
    { label: "提出指标", source: "memberProposed" },
  );
  assert.equal(
    metricCreationActionForObjective({
      objective: objective({ flowStatus: "frozen", challengers: [] }),
      currentUser: admin,
      permissionRules: rules,
      now: new Date("2026-05-22T00:00:00.000Z"),
    }),
    null,
  );
});

test("metric edit access centralizes role, reestimate, and lifecycle gates", () => {
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const rules = [{ role: "member" as const, permissions: [] }];
  const now = new Date("2026-05-22T00:00:00.000Z");
  const dueAt = "2999-05-30T00:00:00.000Z";

  assert.deepEqual(
    metricEditAccessForObjective({
      objective: objective({ flowStatus: "candidate", challengers: [] }),
      currentUser: admin,
      permissionRules: rules,
      now,
    }),
    { status: "allowed" },
  );
  assert.deepEqual(
    metricEditAccessForObjective({
      objective: objective({ flowStatus: "reestimating", challengers: [challenger.name], confirmationDueAt: dueAt }),
      currentUser: challenger,
      permissionRules: rules,
      now,
    }),
    { status: "allowed" },
  );
  assert.deepEqual(
    metricEditAccessForObjective({
      objective: objective({ flowStatus: "reestimating", challengers: [], confirmationDueAt: dueAt }),
      currentUser: challenger,
      permissionRules: rules,
      now,
    }),
    { status: "blocked", reason: "forbidden" },
  );
  assert.deepEqual(
    metricEditAccessForObjective({
      objective: objective({ flowStatus: "frozen", challengers: [] }),
      currentUser: admin,
      permissionRules: rules,
      now,
    }),
    { status: "blocked", reason: "lifecycleLocked" },
  );
});

test("objective work item mutation uses objective participation and lifecycle", () => {
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const observer = { id: "user-mia", name: "Mia Chen", email: "mia@example.com", role: "member" as const, status: "active" as const };

  assert.equal(canMutateObjectiveWorkItems(objective({ flowStatus: "candidate" }), admin), true);
  assert.equal(canMutateObjectiveWorkItems(objective({ flowStatus: "reestimating", challengers: [challenger.name] }), challenger), true);
  assert.equal(canMutateObjectiveWorkItems(objective({ flowStatus: "frozen", challengers: [challenger.name] }), challenger), true);
  assert.equal(canMutateObjectiveWorkItems(objective({ flowStatus: "reestimating", challengers: [challenger.name] }), observer), false);
  assert.equal(canMutateObjectiveWorkItems(objective({ flowStatus: "submitted", challengers: [challenger.name] }), admin), false);
  assert.equal(canMutateObjectiveWorkItems(undefined, admin), false);
  assert.deepEqual(
    workItemMutationAccessForObjective({
      objective: objective({ flowStatus: "reestimating", challengers: [challenger.name] }),
      currentUser: observer,
    }),
    { status: "blocked", reason: "forbidden" },
  );
});

test("loot workbench actions keep commander review separate from member challenge actions", () => {
  const admin = { id: "user-admin", name: "Admin", email: "admin@example.com", role: "admin" as const, status: "active" as const };
  const challenger = { id: "user-kai", name: "Kai Wang", email: "kai@example.com", role: "member" as const, status: "active" as const };
  const pollutedFrozen = objective({ flowStatus: "frozen", challengers: [admin.name, challenger.name] });
  const pollutedSubmitted = objective({ flowStatus: "submitted", challengers: [admin.name, challenger.name] });

  assert.equal(canSubmitObjectiveLoot(pollutedFrozen, admin), false);
  assert.equal(canSubmitObjectiveLoot(pollutedFrozen, challenger), true);
  assert.equal(canSubmitObjectivePeerReview(pollutedSubmitted, admin), false);
  assert.equal(canSubmitObjectivePeerReview(pollutedSubmitted, challenger), true);
  assert.deepEqual(workbenchActionForObjective({ objective: pollutedSubmitted, currentUser: admin }), {
    kind: "reviewLoot",
    label: "验收战利品",
    to: `/objectives/${pollutedSubmitted.id}/loot`,
  });
  assert.deepEqual(
    workbenchActionForObjective({
      objective: pollutedFrozen,
      currentUser: admin,
      trialReviews: [
        {
          id: "trial-review-a",
          objectiveId: pollutedFrozen.id,
          requestedBy: challenger.name,
          body: "Ready for a trial review.",
          resultClaims: [],
          status: "requested",
          requestedAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    }),
    {
      kind: "reviewTrial",
      label: "处理试验收",
      to: `/objectives/${pollutedFrozen.id}/loot`,
    },
  );
});

test("challenge permission helpers map target resources to configured permissions", () => {
  const current = state({
    permissionRules: [{ role: "member", permissions: ["result.edit"] }],
  });

  assert.equal(canAccessTarget(current, "member", { type: "bounty", id: "res-a", title: "Bounty", objectiveId: "obj-a" }, "edit"), true);
  assert.equal(canAccessTarget(current, "member", { type: "bounty", id: "res-a", title: "Bounty", objectiveId: "obj-a" }, "delete"), false);
  assert.equal(canAccessTarget(current, "admin", { type: "objective", id: "obj-a", title: "Objective" }, "delete"), true);
  assert.equal(canAccessTarget(current, "member", { type: "action", id: "task-a", title: "Task", objectiveId: "obj-a", hasSubActions: false }, "delete"), true);
  assert.equal(canAccessDragItem(current, "member", { type: "action", id: "task-a", bountyId: "res-a", objectiveId: "obj-a" }), true);
  assert.equal(permissionDeniedMessage("result.delete"), "没有删除指标权限");
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
    objectiveAlignmentRequests: [],
    pointLedger: [],
    causeCategories: [],
    rules: {
      requireResultForTask: false,
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
    feedbackIds: [],
    trend: [{ date, value: 0 }],
    reviewCadence: "Weekly",
    createdAt: date,
    updatedAt: date,
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

function comment(id: string, targetType: CommentThread["targetType"], targetId: string, bodies: string[]): CommentThread {
  return {
    id,
    targetType,
    targetId,
    targetTitle: targetId,
    status: "open",
    createdBy: "user-kai",
    createdAt: date,
    updatedAt: date,
    messages: bodies.map((body, index) => ({ id: `${id}-${index}`, author: "Kai Wang", body, createdAt: date })),
  };
}

function assertNear(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be close to ${expected}`);
}
