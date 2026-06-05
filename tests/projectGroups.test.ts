import assert from "node:assert/strict";
import test from "node:test";
import {
  groupChallengeGroupsByProject,
  objectiveProjectOptions,
  unassignedObjectiveProjectId,
  unassignedObjectiveProjectName,
} from "../src/features/challenge/model/projectGroups";
import type { ObjectiveNode } from "../src/features/challenge/model/types";
import type { OrfProject, TaskStatus, WorkStatus } from "../src/types/orf";

const today = "2026-06-04";

const projects: OrfProject[] = [
  { id: "project-alpha", name: "Alpha 项目", createdAt: today, updatedAt: today },
  { id: "project-beta", name: "Beta 项目", createdAt: today, updatedAt: today },
];

test("groups objectives by registered project and keeps empty projects visible", () => {
  const groups = groupChallengeGroupsByProject(
    [
      objectiveNode({
        id: "objective-alpha",
        title: "Alpha 目标",
        projectId: "project-alpha",
        progress: 60,
        bounties: 2,
        actions: ["In Progress", "Done"],
        finalDueAt: "2026-06-20",
      }),
      objectiveNode({
        id: "objective-unassigned",
        title: "未归属目标",
        projectId: null,
        status: "Blocked",
        progress: 10,
      }),
      objectiveNode({
        id: "objective-stale",
        title: "失效项目目标",
        projectId: "deleted-project",
        progress: 30,
      }),
    ],
    projects,
  );

  assert.deepEqual(
    groups.map((group) => group.id),
    ["project-alpha", "project-beta", unassignedObjectiveProjectId],
  );

  const alpha = groups[0];
  assert.equal(alpha.projectId, "project-alpha");
  assert.equal(alpha.isUnassigned, false);
  assert.equal(alpha.objectiveCount, 1);
  assert.equal(alpha.bountyCount, 2);
  assert.equal(alpha.actionCount, 2);
  assert.equal(alpha.activeActionCount, 1);
  assert.equal(alpha.averageProgress, 60);
  assert.equal(alpha.nextDeadline, "2026-06-20");

  const beta = groups[1];
  assert.equal(beta.projectId, "project-beta");
  assert.equal(beta.objectiveCount, 0);
  assert.equal(beta.statusLabel, "暂无目标");

  const unassigned = groups[2];
  assert.equal(unassigned.id, unassignedObjectiveProjectId);
  assert.equal(unassigned.name, unassignedObjectiveProjectName);
  assert.equal(unassigned.projectId, null);
  assert.equal(unassigned.isUnassigned, true);
  assert.equal(unassigned.objectiveCount, 2);
  assert.deepEqual(
    unassigned.objectives.map((group) => group.objective.id),
    ["objective-unassigned", "objective-stale"],
  );
  assert.equal(unassigned.statusLabel, "1 个目标阻塞");
});

test("does not create a synthetic unassigned bucket when every objective has a valid project", () => {
  const groups = groupChallengeGroupsByProject(
    [
      objectiveNode({ id: "objective-alpha", title: "Alpha 目标", projectId: "project-alpha" }),
      objectiveNode({ id: "objective-beta", title: "Beta 目标", projectId: "project-beta" }),
    ],
    projects,
  );

  assert.deepEqual(
    groups.map((group) => group.id),
    ["project-alpha", "project-beta"],
  );
  assert.equal(groups.some((group) => group.id === unassignedObjectiveProjectId), false);
});

test("exposes only registered projects as selectable project options", () => {
  assert.deepEqual(objectiveProjectOptions(projects), [
    { id: "project-alpha", name: "Alpha 项目" },
    { id: "project-beta", name: "Beta 项目" },
  ]);
});

function objectiveNode(input: {
  actions?: TaskStatus[];
  bounties?: number;
  finalDueAt?: string;
  id: string;
  projectId?: string | null;
  progress?: number;
  status?: WorkStatus;
  title: string;
}): ObjectiveNode {
  const finalDueAt = input.finalDueAt ?? "2026-06-30";
  return {
    actions: (input.actions ?? []).map((status, index) => ({ id: `${input.id}-task-${index}`, status })),
    bounties: Array.from({ length: input.bounties ?? 0 }, (_, index) => ({ result: { id: `${input.id}-result-${index}` } })),
    challengers: [],
    deadline: finalDueAt,
    objective: {
      acceptedResult: null,
      finalDueAt,
      flowStatus: "open",
      id: input.id,
      lootSubmittedAt: null,
      progress: input.progress ?? 0,
      projectId: input.projectId ?? null,
      status: input.status ?? "On Track",
      title: input.title,
    },
  } as ObjectiveNode;
}
