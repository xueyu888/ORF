import assert from "node:assert/strict";
import test from "node:test";
import { canMutateObjectiveMetricExecutionCompletionForActor } from "../src/domain/orfMetricExecution";
import {
  filterChallengeGroups,
  normalizeChallengeStatusFilterSelection,
} from "../src/features/challenge/model/challengeFilters";
import {
  defaultCollapsedObjectiveIdsForChallengeTree,
  mergeNewDefaultCollapsedObjectiveIds,
} from "../src/features/challenge/model/challengeDefaultCollapse";
import { normalizeFilterPreferenceKey, normalizeUserFilterPreferences } from "../src/domain/settings/filterPreferences";
import {
  challengePlanFilterPreferenceFromRecord,
  challengePlanFilterPreferenceToRecord,
} from "../src/features/challenge/model/challengeFilterPreferences";
import type { ObjectiveNode } from "../src/features/challenge/model/types";
import type { Objective, ObjectiveFlowStatus } from "../src/types/orf";

test("challenge status filter selection keeps all as an empty selection", () => {
  assert.deepEqual(normalizeChallengeStatusFilterSelection("all"), []);
  assert.deepEqual(normalizeChallengeStatusFilterSelection(["review", "all", "review", "settled", "unknown"]), ["review", "settled"]);
});

test("user filter preferences normalize keys and list values", () => {
  assert.equal(normalizeFilterPreferenceKey(" challenge.plan "), "challenge.plan");
  assert.equal(normalizeFilterPreferenceKey("bad key"), null);

  assert.deepEqual(
    normalizeUserFilterPreferences({
      "bad key": { values: { status: ["review"] }, version: 1 },
      "challenge.plan": { values: { empty: " ", status: ["review", "review", " settled "] }, version: 1 },
    }),
    {
      "challenge.plan": {
        values: {
          status: ["review", "settled"],
        },
        version: 1,
      },
    },
  );
});

test("challenge status filter selection matches any selected status", () => {
  const groups = [
    objectiveNode({ challengerUserIds: [], flowStatus: "open", id: "unassigned" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "submitted", id: "review" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "revisionRequired", id: "revision" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "settled", id: "settled" }),
  ];

  assert.deepEqual(
    filterChallengeGroups(groups, { cycle: "all", member: "all", project: "all", status: ["review", "revisionRequired"] })
      .map((group) => group.objective.id),
    ["review", "revision"],
  );
  assert.deepEqual(
    filterChallengeGroups(groups, { cycle: "all", member: "all", project: "all", status: [] })
      .map((group) => group.objective.id),
    ["unassigned", "review", "revision", "settled"],
  );
});

test("challenge filter preference serializes only concrete filter facts", () => {
  const record = challengePlanFilterPreferenceToRecord({
    cycle: "2026 Q3",
    member: "all",
    project: "project-client",
    scope: "all",
    status: ["review", "revisionRequired"],
  });

  assert.deepEqual(record, {
    values: {
      cycle: "2026 Q3",
      project: "project-client",
      scope: "all",
      status: ["review", "revisionRequired"],
    },
    version: 1,
  });

  assert.deepEqual(challengePlanFilterPreferenceFromRecord(record, { defaultScope: "mine" }), {
    cycle: "2026 Q3",
    member: "all",
    project: "project-client",
    scope: "all",
    status: ["review", "revisionRequired"],
  });
});

test("challenge tree defaults ended objectives collapsed without overriding later user toggles", () => {
  const groups = [
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "submitted", id: "submitted" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "revisionRequired", id: "revision" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "accepted", id: "accepted" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "settled", id: "settled" }),
    objectiveNode({ challengerUserIds: ["user-1"], flowStatus: "closed", id: "closed" }),
  ];
  const defaultCollapsedIds = defaultCollapsedObjectiveIdsForChallengeTree(groups);
  const first = mergeNewDefaultCollapsedObjectiveIds({
    appliedDefaultCollapsedIds: new Set(),
    currentCollapsedIds: new Set(["manual"]),
    defaultCollapsedIds,
  });

  assert.deepEqual([...first.collapsedIds].sort(), ["accepted", "closed", "manual", "settled"]);
  assert.deepEqual([...first.appliedDefaultCollapsedIds].sort(), ["accepted", "closed", "settled"]);

  const userExpandedAccepted = new Set(first.collapsedIds);
  userExpandedAccepted.delete("accepted");
  const second = mergeNewDefaultCollapsedObjectiveIds({
    appliedDefaultCollapsedIds: first.appliedDefaultCollapsedIds,
    currentCollapsedIds: userExpandedAccepted,
    defaultCollapsedIds,
  });

  assert.deepEqual([...second.collapsedIds].sort(), ["closed", "manual", "settled"]);
});

test("metric execution completion stays editable until formal acceptance finishes", () => {
  const challenger = { id: "user-1", role: "member" as const };
  const editableBeforeAcceptance: ObjectiveFlowStatus[] = ["reestimating", "frozen", "submitted", "revisionRequired"];
  const lockedOutsideExecutionWindow: ObjectiveFlowStatus[] = ["open", "accepted", "settled", "closed"];

  for (const flowStatus of editableBeforeAcceptance) {
    assert.equal(
      canMutateObjectiveMetricExecutionCompletionForActor({ challengerUserIds: ["user-1"], flowStatus }, challenger),
      true,
      flowStatus,
    );
  }

  for (const flowStatus of lockedOutsideExecutionWindow) {
    assert.equal(
      canMutateObjectiveMetricExecutionCompletionForActor({ challengerUserIds: ["user-1"], flowStatus }, challenger),
      false,
      flowStatus,
    );
  }

  assert.equal(
    canMutateObjectiveMetricExecutionCompletionForActor({ challengerUserIds: ["user-1"], flowStatus: "submitted" }, { id: "user-2", role: "member" }),
    false,
  );
});

function objectiveNode(input: {
  challengerUserIds: string[];
  flowStatus: Objective["flowStatus"];
  id: string;
}): ObjectiveNode {
  return {
    actions: [],
    bounties: [],
    challengers: input.challengerUserIds.map((id) => id),
    deadline: "2026-07-31",
    objective: {
      challengerUserIds: input.challengerUserIds,
      confirmedAt: input.flowStatus === "frozen" ? "2026-07-01T00:00:00.000Z" : null,
      cycle: "2026 Q3",
      finalDueAt: "2026-07-31",
      flowStatus: input.flowStatus,
      id: input.id,
      progress: 0,
      projectId: null,
      title: input.id,
    },
  } as ObjectiveNode;
}
