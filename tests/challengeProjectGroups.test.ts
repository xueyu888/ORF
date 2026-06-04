import assert from "node:assert/strict";
import test from "node:test";
import { defaultObjectiveProjectName, groupChallengeGroupsByProject } from "../src/features/challenge/model/projectGroups";
import type { ObjectiveNode } from "../src/features/challenge/model/types";
import type { Objective, Task } from "../src/types/orf";

test("groupChallengeGroupsByProject groups objectives by explicit project ownership", () => {
  const groups = [
    group(objective({ id: "objective-api-a", projectId: "project-api", projectName: "AI 平台" })),
    group(objective({ id: "objective-growth", projectId: "project-growth", projectName: "增长实验" })),
    group(objective({ id: "objective-api-b", projectId: "project-api", projectName: "AI 平台" }), [task("task-api")]),
  ];

  const projects = groupChallengeGroupsByProject(groups);

  assert.deepEqual(projects.map((project) => project.name), ["AI 平台", "增长实验"]);
  assert.deepEqual(projects[0]?.objectives.map((item) => item.objective.id), ["objective-api-a", "objective-api-b"]);
  assert.equal(projects[0]?.objectiveCount, 2);
  assert.equal(projects[0]?.actionCount, 1);
});

test("groupChallengeGroupsByProject keeps legacy objectives in the default project bucket", () => {
  const projects = groupChallengeGroupsByProject([
    group(objective({ id: "objective-legacy-a" })),
    group(objective({ id: "objective-legacy-b", projectName: " " })),
  ]);

  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.name, defaultObjectiveProjectName);
  assert.deepEqual(projects[0]?.objectives.map((item) => item.objective.id), ["objective-legacy-a", "objective-legacy-b"]);
});

test("groupChallengeGroupsByProject uses project id as display fallback when name is missing", () => {
  const projects = groupChallengeGroupsByProject([
    group(objective({ id: "objective-project-id-only", projectId: "project-id-only" })),
  ]);

  assert.equal(projects[0]?.id, "project-id-only");
  assert.equal(projects[0]?.name, "project-id-only");
});

function group(objectiveItem: Objective, actions: Task[] = []): ObjectiveNode {
  return {
    actions,
    bounties: [],
    challengers: objectiveItem.challengers,
    deadline: objectiveItem.finalDueAt,
    objective: objectiveItem,
  };
}

function objective(input: Partial<Objective> = {}): Objective {
  return {
    id: "objective",
    title: "Objective",
    description: "",
    whyItMatters: "",
    cycle: "2999 Q1",
    stage: "goalSetting",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 0,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2999-03-31T00:00:00.000Z",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    objectiveBasePoints: 0,
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}

function task(id: string): Task {
  return {
    id,
    title: "Task",
    description: "",
    status: "Todo",
    priority: "Medium",
    assignee: "",
    linkedObjectiveId: "objective",
    dueDate: "2999-01-01",
    tags: [],
    checklist: [],
    createdAt: "2999-01-01",
    updatedAt: "2999-01-01",
  };
}
