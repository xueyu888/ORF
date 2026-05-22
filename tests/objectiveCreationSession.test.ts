import assert from "node:assert/strict";
import test from "node:test";
import {
  applyObjectiveOrderAnchor,
  beginObjectiveCreationSession,
  cancelObjectiveCreationSession,
  clearSubmittedObjectiveCreation,
  completeObjectiveCreationDraft,
  draftObjectiveId,
  draftOrderAnchor,
  failObjectiveCreationDraft,
  idleObjectiveCreationSession,
  materializeSubmittedObjectiveCreation,
  objectiveCreationDraftTitle,
  objectiveCreationIsDraftEditing,
  objectiveCreationSubmittedObjective,
  submitObjectiveCreationDraft,
  updateObjectiveCreationDraftTitle,
} from "../src/features/challenge/model/objectiveCreationSession";
import type { Objective } from "../src/types/orf";

const returnContext = { cycle: "all" as const, scope: "all" as const, status: "all" as const };

test("objective creation session has one explicit draft to submitted overlay transition", () => {
  const editing = beginObjectiveCreationSession(idleObjectiveCreationSession, returnContext);
  const titled = updateObjectiveCreationDraftTitle(editing, "目标模型");
  const draftGroups = [
    objectiveNode(objective({ id: "before", title: "Before" })),
    objectiveNode(objective({ id: draftObjectiveId, title: "目标模型" })),
    objectiveNode(objective({ id: "after", title: "After" })),
  ];
  const anchor = draftOrderAnchor(draftGroups);
  const submitting = submitObjectiveCreationDraft(titled, "目标模型", anchor);
  const created = objective({ id: "created", title: "目标模型" });
  const submitted = completeObjectiveCreationDraft(submitting, created);
  const anchored = materializeSubmittedObjectiveCreation(submitted);

  assert.equal(objectiveCreationDraftTitle(submitted), null);
  assert.equal(objectiveCreationSubmittedObjective(submitted)?.id, "created");
  assert.deepEqual(
    applyObjectiveOrderAnchor(
      [objectiveNode(objective({ id: "before" })), objectiveNode(objective({ id: "after" })), objectiveNode(created)],
      anchored.status === "anchoredCreated" ? anchored.orderAnchor : null,
    ).map((group) => group.objective.id),
    ["before", "created", "after"],
  );
});

test("objective creation failure returns to an editing draft with the user input", () => {
  const editing = updateObjectiveCreationDraftTitle(beginObjectiveCreationSession(idleObjectiveCreationSession, returnContext), "失败后保留");
  const submitting = submitObjectiveCreationDraft(editing, "失败后保留", null);
  const failed = failObjectiveCreationDraft(submitting, "失败后保留");

  assert.equal(objectiveCreationIsDraftEditing(failed), true);
  assert.equal(objectiveCreationDraftTitle(failed), "失败后保留");
  assert.deepEqual(cancelObjectiveCreationSession(failed), {
    returnContext,
    session: idleObjectiveCreationSession,
  });
});

test("submitted objective overlay is the only creation state cleared by manual filter changes", () => {
  const editing = beginObjectiveCreationSession(idleObjectiveCreationSession, returnContext);
  const submitting = submitObjectiveCreationDraft(updateObjectiveCreationDraftTitle(editing, "目标"), "目标", null);
  const submitted = completeObjectiveCreationDraft(submitting, objective({ id: "created" }));

  assert.equal(clearSubmittedObjectiveCreation(editing).status, "editingDraft");
  assert.equal(clearSubmittedObjectiveCreation(submitting).status, "submittingDraft");
  assert.equal(clearSubmittedObjectiveCreation(submitted).status, "idle");
});

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "objective",
    title: "Objective",
    description: "",
    whyItMatters: "",
    cycle: "2999 Q4",
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

function objectiveNode(item: Objective) {
  return {
    actions: [],
    bounties: [],
    challengers: item.challengers,
    deadline: item.finalDueAt,
    objective: item,
  };
}
