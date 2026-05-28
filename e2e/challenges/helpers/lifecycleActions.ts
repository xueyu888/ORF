import type { ContributionAllocation, ObjectiveAcceptedResult, ResultAcceptedResult, UncertaintyLevel } from "../../../src/types/orf";
import { expect, type RealSystemHarness, type RealUser } from "./realSystemHarness";
import type { RealScenarioDsl } from "./realScenarioDsl";

export async function rejectPendingApplication(
  real: RealSystemHarness,
  commander: RealUser,
  objectiveId: string,
  applicant: string,
) {
  const objective = (await real.taskData()).objectives.find((item) => item.id === objectiveId);
  const application = objective?.challengeApplications.find((item) => item.applicant === applicant && item.status === "pending");
  expect(application, `pending application should exist for ${applicant}`).toBeTruthy();
  if (!application) return;

  const response = await real.apiAs(commander, `/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(application.id)}/reject`, {
    method: "PATCH",
  });
  expect(response.status).toBe(200);
}

export async function createPublishedLifecycleObjective(
  dsl: RealScenarioDsl,
  commander: RealUser,
  title: string,
  cycle: string,
  uncertaintyLevel: UncertaintyLevel = "进阶",
) {
  return dsl.apiCreatePublishedObjectiveWithMetric(commander, title, `${title} 指标`, { cycle, uncertaintyLevel });
}

export async function createCandidateLifecycleObjective(
  dsl: RealScenarioDsl,
  commander: RealUser,
  title: string,
  cycle: string,
) {
  return dsl.apiCreateCandidateObjective(commander, title, { cycle });
}

export async function addExecutionWork(
  real: RealSystemHarness,
  dsl: RealScenarioDsl,
  actor: RealUser,
  objectiveId: string,
  label: string,
) {
  const taskId = await dsl.addTask(actor, objectiveId, `${label} 任务`);
  await dsl.addSubtask(actor, taskId, `${label} 子任务`);
  const comment = await real.apiAs(actor, "/api/comments", {
    body: JSON.stringify({
      targetType: "task",
      targetId: taskId,
      targetTitle: `${label} 任务`,
      body: `${label} 评论`,
    }),
    method: "POST",
  });
  expect(comment.status).toBe(200);
  return taskId;
}

export async function prepareFrozenObjectiveViaApi(
  dsl: RealScenarioDsl,
  input: {
    commander: RealUser;
    objectiveId: string;
    challengers: RealUser[];
  },
) {
  await dsl.recruitViaApi(input.commander, input.objectiveId, input.challengers.map((user) => user.name));
  for (const challenger of input.challengers) {
    const accepted = await dsl.acceptRecruitmentViaApi(challenger, input.objectiveId);
    expect([200, 409]).toContain(accepted.status);
  }
  await dsl.freezeViaApi(input.commander, input.objectiveId);
}

export async function settlePreparedObjectiveViaApi(
  real: RealSystemHarness,
  dsl: RealScenarioDsl,
  input: {
    acceptedResult?: ObjectiveAcceptedResult;
    commander: RealUser;
    contributionResolution?: ContributionAllocation[];
    objectiveId: string;
    resultReviews?: ResultAcceptedResult[];
    submitter: RealUser;
    title: string;
  },
) {
  const loot = await dsl.submitLootViaApi(input.submitter, input.objectiveId, `${input.title} 战利品`);
  expect(loot.status).toBe(200);

  const data = await real.taskData();
  const results = data.results.filter((result) => result.objectiveId === input.objectiveId);
  const review = await dsl.reviewAndSettleViaApi(input.commander, input.objectiveId, {
    acceptedResult: input.acceptedResult,
    contributionResolution: input.contributionResolution
      ? { ratios: input.contributionResolution, reason: `${input.title} 贡献分配` }
      : undefined,
    resultReviews: input.resultReviews?.map((acceptedResult, index) => ({
      acceptedResult,
      resultId: results[index]?.id ?? results[0]!.id,
    })),
    reason: `${input.title} 结算`,
  });
  expect(review.status).toBe(200);
}
