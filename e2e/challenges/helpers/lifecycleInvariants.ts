import type { Objective, ObjectiveFlowStatus, Result, Task } from "../../../src/types/orf";
import { expect, type RealSystemHarness, type RealUser } from "./realSystemHarness";

type TaskPageResponse = {
  objectives: Objective[];
  results: Result[];
  tasks: Task[];
  objectiveLoot: Array<{ objectiveId: string }>;
  pointLedger: Array<{ objectiveId: string; memberName: string; points: number }>;
};

export type LifecycleInvariantContext = {
  members: RealUser[];
  observer: RealUser;
  objectiveIds: string[];
  remainingRecruitment?: { objectiveTitle: string; user: RealUser };
  settledObjectiveIds: string[];
};

export type LifecycleSecurityTargets = {
  frozenObjectiveId: string;
  reestimatingObjectiveId: string;
  taskId: string;
};

export async function assertLifecycleInvariants(real: RealSystemHarness, context: LifecycleInvariantContext, options: { includeApiVisibility?: boolean } = {}) {
  const data = await real.taskData();
  const trackedIds = new Set(context.objectiveIds);

  for (const objectiveId of context.objectiveIds) {
    const objective = data.objectives.find((item) => item.id === objectiveId);
    expect(objective, `tracked objective should exist: ${objectiveId}`).toBeTruthy();
    if (!objective) continue;
    assertObjectiveShape(data, objective);
  }

  if (options.includeApiVisibility) {
    await assertMemberVisibility(real, context.members, trackedIds);
    await assertObserverIsolation(real, context.observer, trackedIds);
    await assertSettledObjectivesAreHiddenFromBounties(real, context.members, context.settledObjectiveIds);
    if (context.remainingRecruitment) {
      await assertRemainingRecruitmentVisible(real, context.remainingRecruitment);
    }
  }
}

export async function assertLifecycleSecurityBoundaries(
  real: RealSystemHarness,
  observer: RealUser,
  targets: LifecycleSecurityTargets,
) {
  const createMetric = await real.apiAs(observer, "/api/results", {
    body: JSON.stringify({
      objectiveId: targets.reestimatingObjectiveId,
      title: "非挑战者不应新增指标",
      metricName: "非挑战者指标",
      source: "memberProposed",
    }),
    method: "POST",
  });
  expect(createMetric.status).toBe(403);

  const createTask = await real.apiAs(observer, "/api/tasks", {
    body: JSON.stringify({
      title: "非挑战者不应新增任务",
      linkedObjectiveId: targets.reestimatingObjectiveId,
    }),
    method: "POST",
  });
  expect(createTask.status).toBe(403);

  const createSubtask = await real.apiAs(observer, `/api/tasks/${encodeURIComponent(targets.taskId)}/checklist`, {
    body: JSON.stringify({ label: "非挑战者不应新增子任务" }),
    method: "POST",
  });
  expect(createSubtask.status).toBe(403);

  const createComment = await real.apiAs(observer, "/api/comments", {
    body: JSON.stringify({
      targetType: "objective",
      targetId: targets.reestimatingObjectiveId,
      targetTitle: "非挑战者不应评论",
      body: "非挑战者不应新增评论",
    }),
    method: "POST",
  });
  expect(createComment.status).toBe(403);

  const data = await real.taskData();
  const frozenResultClaims = data.results
    .filter((result) => result.objectiveId === targets.frozenObjectiveId)
    .map((result) => ({ resultId: result.id, claim: "completed", evidenceText: "non challenger evidence" }));
  const submitLoot = await real.apiAs(observer, `/api/objectives/${encodeURIComponent(targets.frozenObjectiveId)}/loot`, {
    body: JSON.stringify({
      body: "非挑战者不应提交战利品",
      resultClaims: frozenResultClaims,
      selfTestReportBody: "非挑战者不应提交自测报告",
    }),
    method: "POST",
  });
  expect(submitLoot.status).toBe(403);
}

export async function assertStatusCoverage(real: RealSystemHarness, objectiveIds: string[], expectedStatuses: ObjectiveFlowStatus[]) {
  const data = await real.taskData();
  const statuses = new Set(
    data.objectives
      .filter((objective) => objectiveIds.includes(objective.id))
      .map((objective) => objective.flowStatus),
  );
  for (const status of expectedStatuses) {
    expect(statuses.has(status), `lifecycle should include ${status}`).toBe(true);
  }
}

export async function assertAcceptedResultCoverage(real: RealSystemHarness, objectiveIds: string[], expectedResults: Array<NonNullable<Objective["acceptedResult"]>>) {
  const data = await real.taskData();
  const results = new Set(
    data.objectives
      .filter((objective) => objectiveIds.includes(objective.id))
      .map((objective) => objective.acceptedResult)
      .filter(Boolean),
  );
  for (const result of expectedResults) {
    expect(results.has(result), `lifecycle should include acceptedResult=${result}`).toBe(true);
  }
}

function assertObjectiveShape(data: Awaited<ReturnType<RealSystemHarness["taskData"]>>, objective: Objective) {
  expect(new Set(objective.challengers).size, `${objective.title} challengers should be unique`).toBe(objective.challengers.length);
  expect(new Set(objective.assignedChallengers).size, `${objective.title} assignedChallengers should be unique`).toBe(objective.assignedChallengers.length);
  for (const member of objective.challengers) {
    expect(objective.assignedChallengers, `${objective.title} assignedChallengers should not include accepted challenger`).not.toContain(member);
  }

  const pendingApplicants = objective.challengeApplications
    .filter((application) => application.status === "pending")
    .map((application) => application.applicant);
  expect(new Set(pendingApplicants).size, `${objective.title} should not have duplicate pending applications`).toBe(pendingApplicants.length);

  if (objective.flowStatus === "reestimating") {
    expect(objective.stage, `${objective.title} reestimating stage`).toBe("orfReestimate");
  }
  if (["frozen", "submitted", "settled"].includes(objective.flowStatus)) {
    expect(objective.stage, `${objective.title} frozen/submitted/settled stage`).toBe("goalFrozen");
  }

  const results = data.results.filter((result) => result.objectiveId === objective.id);
  const basePoints = results.reduce((sum, result) => sum + result.uncertaintyScore, 0);
  expect(objective.objectiveBasePoints, `${objective.title} objectiveBasePoints`).toBe(basePoints);

  const loot = data.objectiveLoot.filter((item) => item.objectiveId === objective.id);
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objective.id);
  if (objective.flowStatus === "submitted") {
    expect(loot.length, `${objective.title} submitted objectiveLoot`).toBe(1);
  }
  if (objective.flowStatus === "settled") {
    expect(loot.length, `${objective.title} settled objectiveLoot`).toBe(1);
    expect(ledger.length, `${objective.title} settled pointLedger`).toBeGreaterThan(0);
    expect(new Set(ledger.map((entry) => entry.memberName)).size, `${objective.title} pointLedger members should be unique`).toBe(ledger.length);
    const ledgerTotal = Number(ledger.reduce((sum, entry) => sum + entry.points, 0).toFixed(2));
    expect(ledgerTotal, `${objective.title} pointLedger total`).toBe(objective.objectiveSettlementPoints ?? 0);
    for (const entry of ledger) {
      expect(objective.challengers, `${objective.title} pointLedger member`).toContain(entry.memberName);
    }
  }
}

async function assertMemberVisibility(real: RealSystemHarness, members: RealUser[], trackedIds: Set<string>) {
  for (const member of members) {
    const tasksPage = await real.apiAs<TaskPageResponse>(member, "/api/tasks-page");
    expect(tasksPage.status, `${member.name} /api/tasks-page status`).toBe(200);

    const visibleObjectiveIds = new Set(tasksPage.body.objectives.map((objective) => objective.id));
    for (const objective of tasksPage.body.objectives) {
      if (!trackedIds.has(objective.id)) continue;
      expect(objective.challengers, `${member.name} should only see own challenge objectives`).toContain(member.name);
    }
    for (const result of tasksPage.body.results) {
      if (trackedIds.has(result.objectiveId)) {
        expect(visibleObjectiveIds.has(result.objectiveId), `${member.name} should not receive hidden objective results`).toBe(true);
      }
    }
    for (const task of tasksPage.body.tasks) {
      if (trackedIds.has(task.linkedObjectiveId)) {
        expect(visibleObjectiveIds.has(task.linkedObjectiveId), `${member.name} should not receive hidden objective tasks`).toBe(true);
      }
    }
    for (const loot of tasksPage.body.objectiveLoot) {
      if (trackedIds.has(loot.objectiveId)) {
        expect(visibleObjectiveIds.has(loot.objectiveId), `${member.name} should not receive hidden objective loot`).toBe(true);
      }
    }
    for (const ledger of tasksPage.body.pointLedger) {
      if (trackedIds.has(ledger.objectiveId)) {
        expect(visibleObjectiveIds.has(ledger.objectiveId), `${member.name} should not receive hidden objective point ledger`).toBe(true);
      }
    }

    const allScope = await real.apiAs(member, "/api/my-challenges?scope=all");
    expect(allScope.status, `${member.name} member cannot access scope=all`).toBe(403);

    const orfState = await real.apiAs(member, "/api/orf-state");
    expect(orfState.status, `${member.name} member cannot access /api/orf-state`).toBe(403);
  }
}

async function assertObserverIsolation(real: RealSystemHarness, observer: RealUser, trackedIds: Set<string>) {
  const tasksPage = await real.apiAs<TaskPageResponse>(observer, "/api/tasks-page");
  expect(tasksPage.status, `${observer.name} /api/tasks-page status`).toBe(200);
  const leaked = tasksPage.body.objectives.filter((objective) => trackedIds.has(objective.id));
  expect(leaked, `${observer.name} should not see non-owned lifecycle challenges`).toEqual([]);
}

async function assertSettledObjectivesAreHiddenFromBounties(real: RealSystemHarness, members: RealUser[], settledObjectiveIds: string[]) {
  if (settledObjectiveIds.length === 0) return;

  const data = await real.taskData();
  const settledTitles = new Set(
    data.objectives
      .filter((objective) => settledObjectiveIds.includes(objective.id))
      .map((objective) => objective.title),
  );
  for (const member of members) {
    const bounties = await real.apiAs<{
      availableItems: Array<{ objective: { title: string } }>;
      recruitmentItems: Array<{ objective: { title: string } }>;
    }>(member, "/api/bounties");
    expect(bounties.status, `${member.name} /api/bounties status`).toBe(200);
    const titles = [...bounties.body.availableItems, ...bounties.body.recruitmentItems].map((item) => item.objective.title);
    for (const title of settledTitles) {
      expect(titles, `${member.name} bounty hall should hide settled objective ${title}`).not.toContain(title);
    }
  }
}

async function assertRemainingRecruitmentVisible(real: RealSystemHarness, recruitment: { objectiveTitle: string; user: RealUser }) {
  const bounties = await real.apiAs<{
    recruitmentItems: Array<{ objective: { title: string } }>;
  }>(recruitment.user, "/api/bounties");
  expect(bounties.status).toBe(200);
  expect(
    bounties.body.recruitmentItems.some((item) => item.objective.title === recruitment.objectiveTitle),
    `${recruitment.user.name} should still see the remaining recruitment`,
  ).toBe(true);
}
