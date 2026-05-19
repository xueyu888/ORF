import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { buildServer } from "../server/app";
import { loginWithPassword } from "../server/auth/ory";
import { closeDb, db } from "../server/db/client";
import { objectives, results as resultRows, taskChecklistItems, tasks as taskRows, teams, teamMembers, users } from "../server/db/schema";
import type { ObjectiveAcceptedResult, Result, UncertaintyLevel } from "../src/types/orf";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canEditObjectiveResultsDuringReestimate,
  createChecklistItem,
  createObjective,
  createResult,
  createTask,
  deleteResult,
  declineObjectiveChallenge,
  freezeObjectiveAfterReestimate,
  getBountyHallData,
  getMyChallengesData,
  getTaskManagementData,
  moveResult,
  publishObjective,
  proposeResultUpdate,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reopenObjectiveReestimate,
  reviewObjectiveLoot,
  submitObjectiveContributionReview,
  submitObjectiveLoot,
  updateResultConfidence,
  updateResultTitle,
} from "../server/repositories/orfRepository";
import { runtimeScope } from "../server/repositories/runtimeScope";

const runId = `test-orf-flow-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const farFutureDueDate = "2999-12-31";
const expiredConfirmationDueAt = "2000-01-01T00:00:00.000Z";

before(async () => {
  await cleanupRun();
});

after(async () => {
  await cleanupRun();
  await closeDb();
});

test("published objective without concrete results is visible in the bounty hall", async () => {
  const fixture = await createFixture("objective-only");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} objective-only bounty`,
      whyItMatters: "Commanders must be able to publish a required Objective before concrete metrics are defined.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);

  const published = await publishObjective(objective.id, fixture.commander.id);
  assert.equal(published.status, "ok");
  assert.equal(published.objective.flowStatus, "open");

  const hall = await getBountyHallData(fixture.challenger.name);
  const item = hall.availableItems.find((item) => item.objective.id === objective.id);
  assert.ok(item, "a published Objective should not require a commander-defined Result to be visible");
  assert.equal(item.result, null);
  assert.deepEqual(item.results, []);
  assert.equal(item.uncertaintyPoints, 0);
});

test("recruited objective without concrete results is visible as a recruitment item", async () => {
  const fixture = await createFixture("objective-only-recruitment");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} objective-only recruitment`,
      whyItMatters: "Recruitment should not require commander-defined metrics before the member accepts.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);

  assert.equal((await publishObjective(objective.id, fixture.commander.id)).status, "ok");
  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id);
  assert.equal(recruited.status, "ok");
  assert.equal(recruited.objective.flowStatus, "recruiting");

  const hall = await getBountyHallData(fixture.challenger.name);
  const item = hall.recruitmentItems.find((item) => item.objective.id === objective.id);
  assert.ok(item, "a recruited Objective should not require a commander-defined Result to be visible");
  assert.equal(item.isRecruitment, true);
  assert.equal(item.result, null);
  assert.deepEqual(item.results, []);
});

test("task management data removes accepted challengers from pending recruitment lists", async () => {
  const fixture = await createFixture("normalize-assigned");
  const objective = await createObjective(
    {
      title: `${fixture.prefix} dirty assigned challengers`,
      whyItMatters: "Legacy data may still list an accepted challenger as pending recruitment.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);

  await db
    .update(objectives)
    .set({
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [fixture.challenger.name],
      assignedChallengers: [fixture.challenger.name, fixture.observer.name],
    })
    .where(eq(objectives.id, objective.id));

  const data = await getTaskManagementData({ scope: fixture.scope });
  const normalized = data.objectives.find((item) => item.id === objective.id);
  assert.deepEqual(normalized?.challengers, [fixture.challenger.name]);
  assert.deepEqual(normalized?.assignedChallengers, [fixture.observer.name]);
});

test("commander and challenger can complete the application-to-settlement ORF backend flow", async () => {
  const fixture = await createFixture("application");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} application objective`,
      whyItMatters: "Backend flow must preserve the ORF objective-result-feedback loop.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);
  assert.equal(objective.flowStatus, "candidate");

  const result = await createResult({
    objectiveId: objective.id,
    title: `${fixture.prefix} application result`,
    metricName: "Flow completion",
    description: "A test-only metric.",
    uncertaintyLevel: "破局",
    baseline: 0,
    current: 0,
    target: 1,
    unit: "case",
    direction: "increase",
    definer: fixture.commander.name,
  });
  assert.ok(result);
  assert.equal(result.uncertaintyScore, 90);

  const published = await publishObjective(objective.id, fixture.commander.id);
  assert.equal(published.status, "ok");
  assert.equal(published.objective.flowStatus, "open");
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);

  const hallBeforeApply = await getBountyHallData(fixture.challenger.name);
  const availableItem = hallBeforeApply.availableItems.find((item) => item.objective.id === objective.id);
  assert.ok(availableItem, "challenger should see the published objective in the bounty hall");
  assert.equal(availableItem.hasCurrentApplication, false);

  const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  assert.equal(applied.status, "applied");
  assert.equal(applied.objective.flowStatus, "applying");
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);
  const applicationId = applied.objective.challengeApplications.find((application) => application.applicant === fixture.challenger.name)?.id;
  assert.ok(applicationId);

  const hallAfterApply = await getBountyHallData(fixture.challenger.name);
  assert.equal(
    hallAfterApply.availableItems.find((item) => item.objective.id === objective.id)?.hasCurrentApplication,
    true,
  );

  const approved = await approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id);
  assert.equal(approved.status, "ok");
  assert.equal(approved.objective.flowStatus, "reestimating");
  assert.ok(approved.objective.confirmationDueAt);
  assert.deepEqual(approved.objective.challengers, [fixture.challenger.name]);
  assert.equal(
    approved.objective.challengeApplications.find((application) => application.id === applicationId)?.status,
    "approved",
  );
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), true);

  const challengerResult = await createResult({
    objectiveId: objective.id,
    title: `${fixture.prefix} challenger-calibrated result`,
    metricName: "Member-defined metric",
    description: "Concrete metric calibrated by the formal challenger during reestimate.",
    uncertaintyLevel: "进阶",
    baseline: 0,
    current: 0,
    target: 1,
    unit: "case",
    direction: "increase",
    source: "memberProposed",
    definer: fixture.challenger.name,
  });
  assert.ok(challengerResult);
  assert.equal(challengerResult.source, "memberProposed");
  assert.equal(challengerResult.definer, fixture.challenger.name);

  const myChallenges = await getMyChallengesData(fixture.challenger.name);
  assert.deepEqual(myChallenges.objectives.map((item) => item.id), [objective.id]);
  assert.deepEqual(myChallenges.results.map((item) => item.id), [result.id, challengerResult.id]);

  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  assert.equal(frozen.objective.flowStatus, "frozen");
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);

  const strangerLoot = await submitObjectiveLoot(
    objective.id,
    {
      body: "A non-challenger should not be allowed to submit loot.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "not allowed" }],
    },
    { id: fixture.observer.id, name: fixture.observer.name, role: "member" },
  );
  assert.equal(strangerLoot.status, "forbidden");

  const loot = await submitObjectiveLoot(
    objective.id,
    {
      body: "Completed the backend flow target.",
      resultClaims: [
        { resultId: result.id, claim: "completed", evidenceText: "Repository flow test passed." },
        { resultId: challengerResult.id, claim: "completed", evidenceText: "Member-defined metric completed." },
      ],
      selfTestReportBody: "All expected backend transitions were observed.",
      selfTestReportUrl: null,
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");
  assert.equal(loot.loot.objectiveId, objective.id);
  assert.equal(loot.loot.resultClaims[0]?.resultId, result.id);

  const submittedChallenges = await getMyChallengesData(fixture.challenger.name);
  assert.equal(submittedChallenges.objectives.find((item) => item.id === objective.id)?.flowStatus, "submitted");
  assert.equal(submittedChallenges.objectiveLoot.find((item) => item.objectiveId === objective.id)?.id, loot.loot.id);

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    {
      lootId: loot.loot.id,
      resultReviews: [
        { resultId: result.id, acceptedResult: "completed" },
        { resultId: challengerResult.id, acceptedResult: "completed" },
      ],
      reason: "Backend ORF flow integration test settlement.",
    },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");
  assert.equal(reviewed.objective.flowStatus, "settled");
  assert.equal(reviewed.objective.acceptedResult, "completed");
  assert.equal(reviewed.objective.objectiveBasePoints, 120);
  assert.equal(reviewed.objective.objectiveSettlementPoints, 120);

  const finalData = await getTaskManagementData();
  assert.equal(finalData.results.find((item) => item.id === result.id)?.acceptedResult, "completed");
  assert.equal(finalData.results.find((item) => item.id === challengerResult.id)?.acceptedResult, "completed");
  const ledger = finalData.pointLedger.find((entry) => entry.objectiveId === objective.id);
  assert.ok(ledger);
  assert.equal(ledger.memberName, fixture.challenger.name);
  assert.equal(ledger.userId, fixture.challenger.id);
  assert.equal(ledger.points, 120);

  const hallAfterSettlement = await getBountyHallData(fixture.challenger.name);
  assert.equal(hallAfterSettlement.availableItems.some((item) => item.objective.id === objective.id), false);
  assert.equal(hallAfterSettlement.recruitmentItems.some((item) => item.objective.id === objective.id), false);
});

test("commander recruitment appears as a recruitment item and the recruited challenger can accept it", async () => {
  const fixture = await createFixture("recruitment");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} recruitment objective`,
      whyItMatters: "Recruited challengers need a direct path into reestimate.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);

  const result = await createResult({
    objectiveId: objective.id,
    title: `${fixture.prefix} recruitment result`,
    metricName: "Recruitment acceptance",
    uncertaintyLevel: "进阶",
    baseline: 0,
    current: 0,
    target: 1,
    unit: "case",
    direction: "increase",
    definer: fixture.commander.name,
  });
  assert.ok(result);

  const published = await publishObjective(objective.id, fixture.commander.id);
  assert.equal(published.status, "ok");
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);

  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id);
  assert.equal(recruited.status, "ok");
  assert.equal(recruited.objective.flowStatus, "recruiting");
  assert.deepEqual(recruited.objective.assignedChallengers, [fixture.challenger.name]);

  const hallForRecruited = await getBountyHallData(fixture.challenger.name);
  const recruitmentItem = hallForRecruited.recruitmentItems.find((item) => item.objective.id === objective.id);
  assert.ok(recruitmentItem, "recruited challenger should see the objective as a recruitment item");
  assert.equal(recruitmentItem.isRecruitment, true);

  const forbiddenAcceptance = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(forbiddenAcceptance.status, "forbidden");

  const accepted = await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.objective.flowStatus, "reestimating");
  assert.ok(accepted.objective.confirmationDueAt);
  assert.deepEqual(accepted.objective.challengers, [fixture.challenger.name]);
  assert.deepEqual(accepted.objective.assignedChallengers, []);
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), true);

  const myChallenges = await getMyChallengesData(fixture.challenger.name);
  assert.deepEqual(myChallenges.objectives.map((item) => item.id), [objective.id]);
  assert.deepEqual(myChallenges.results.map((item) => item.id), [result.id]);

  const hallAfterAcceptance = await getBountyHallData(fixture.challenger.name);
  assert.equal(hallAfterAcceptance.recruitmentItems.some((item) => item.objective.id === objective.id), false);
  assert.equal(hallAfterAcceptance.availableItems.some((item) => item.objective.id === objective.id), false);
});

test("multi-member recruitment remains visible until every assigned challenger responds", async () => {
  const fixture = await createFixture("multi-recruitment");
  const objective = await createPublishedObjective(fixture, "multi recruitment objective");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} multi recruitment result`);

  const recruited = await recruitObjectiveChallengers(
    objective.id,
    [fixture.challenger.name, fixture.observer.name],
    fixture.commander.id,
  );
  assert.equal(recruited.status, "ok");
  assert.equal(recruited.objective.flowStatus, "recruiting");
  assert.deepEqual(recruited.objective.assignedChallengers, [fixture.challenger.name, fixture.observer.name]);

  const accepted = await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.objective.flowStatus, "reestimating");
  assert.deepEqual(accepted.objective.challengers, [fixture.challenger.name]);
  assert.deepEqual(accepted.objective.assignedChallengers, [fixture.observer.name]);

  const observerHall = await getBountyHallData(fixture.observer.name);
  const observerRecruitment = observerHall.recruitmentItems.find((item) => item.objective.id === objective.id);
  assert.ok(observerRecruitment, "remaining assigned challenger should still see the recruitment while the objective is reestimating");
  assert.equal(observerRecruitment.isRecruitment, true);
  assert.equal(observerRecruitment.objective.flowStatus, "reestimating");

  const observerAccepted = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(observerAccepted.status, "accepted");
  assert.deepEqual(observerAccepted.objective.challengers, [fixture.challenger.name, fixture.observer.name]);
  assert.deepEqual(observerAccepted.objective.assignedChallengers, []);

  const hallAfterAllAccepted = await getBountyHallData(fixture.observer.name);
  assert.equal(hallAfterAllAccepted.recruitmentItems.some((item) => item.objective.id === objective.id), false);
  assert.equal(hallAfterAllAccepted.availableItems.some((item) => item.objective.id === objective.id), false);
});

test("commander can add recruitment while an objective is already reestimating", async () => {
  const fixture = await createFixture("recruit-during-reestimate");
  const objective = await createPublishedObjective(fixture, "recruit during reestimate objective");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} recruit during reestimate result`);

  assert.equal((await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id)).status, "ok");
  assert.equal((await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id)).status, "accepted");

  const additionalRecruitment = await recruitObjectiveChallengers(objective.id, [fixture.observer.name], fixture.commander.id);
  assert.equal(additionalRecruitment.status, "ok");
  assert.equal(additionalRecruitment.objective.flowStatus, "reestimating");
  assert.deepEqual(additionalRecruitment.objective.challengers, [fixture.challenger.name]);
  assert.deepEqual(additionalRecruitment.objective.assignedChallengers, [fixture.observer.name]);

  const observerHall = await getBountyHallData(fixture.observer.name);
  assert.ok(observerHall.recruitmentItems.some((item) => item.objective.id === objective.id));

  const observerAccepted = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(observerAccepted.status, "accepted");
  assert.deepEqual(observerAccepted.objective.challengers, [fixture.challenger.name, fixture.observer.name]);
});

test("recruitment API only accepts active members in scope", async () => {
  const fixture = await createFixture("recruit-active-member-guard");
  const objective = await createPublishedObjective(fixture, "active member recruitment guard");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} active member recruitment guard result`);
  await db.update(users).set({ status: "disabled" }).where(eq(users.id, fixture.observer.id));

  await withApiServer(fixture, async (app) => {
    const disabledRecruit = await apiInject(app, fixture.commander, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/recruitments`, {
      members: [fixture.observer.name],
    });
    assert.equal(disabledRecruit.statusCode, 409);

    const missingRecruit = await apiInject(app, fixture.commander, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/recruitments`, {
      members: [`${fixture.prefix} Missing Member`],
    });
    assert.equal(missingRecruit.statusCode, 409);

    const activeRecruit = await apiInject(app, fixture.commander, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/recruitments`, {
      members: [fixture.challenger.name],
    });
    assert.equal(activeRecruit.statusCode, 200);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  const refreshed = data.objectives.find((item) => item.id === objective.id);
  assert.deepEqual(refreshed?.assignedChallengers, [fixture.challenger.name]);
});

test("member-proposed result creation requires the API actor to be a challenger inside the reestimate window", async () => {
  const fixture = await createFixture("api-create-result");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} API member result objective`,
      whyItMatters: "API result creation must enforce the challenger reestimate window.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);
  assert.equal((await publishObjective(objective.id, fixture.commander.id)).status, "ok");

  await withApiServer(fixture, async (app) => {
    const beforeChallenge = await postResult(app, fixture.challenger, objective.id, {
      title: `${fixture.prefix} forbidden before challenge`,
      metricName: "Pre-challenge metric",
      source: "memberProposed",
    });
    assert.equal(beforeChallenge.statusCode, 403);

    const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
    assert.equal(applied.status, "applied");
    const applicationId = applied.objective.challengeApplications.find((application) => application.applicant === fixture.challenger.name)?.id;
    assert.ok(applicationId);
    assert.equal((await approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id)).status, "ok");

    const observerAttempt = await postResult(app, fixture.observer, objective.id, {
      title: `${fixture.prefix} observer spoof`,
      metricName: "Observer metric",
      source: "memberProposed",
    });
    assert.equal(observerAttempt.statusCode, 403);

    const allowed = await postResult(app, fixture.challenger, objective.id, {
      title: `${fixture.prefix} allowed challenger metric`,
      metricName: "Challenger metric",
      source: "memberProposed",
      definer: fixture.observer.name,
    });
    assert.equal(allowed.statusCode, 200);
    const allowedPayload = allowed.json() as { result: Result };
    assert.equal(allowedPayload.result.source, "memberProposed");
    assert.equal(allowedPayload.result.definer, fixture.challenger.name);

    await expireReestimateWindow(objective.id);
    assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);

    const expired = await postResult(app, fixture.challenger, objective.id, {
      title: `${fixture.prefix} expired challenger metric`,
      metricName: "Expired metric",
      source: "memberProposed",
    });
    assert.equal(expired.statusCode, 403);
  });
});

test("challenger result edits through the API close after reestimate expiry and freeze", async () => {
  const fixture = await createFixture("api-edit-result");

  const objective = await createObjective(
    {
      title: `${fixture.prefix} API edit objective`,
      whyItMatters: "API result edits must follow the same reestimate window as result creation.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt: farFutureDueDate,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);
  const result = await createResult({
    objectiveId: objective.id,
    title: `${fixture.prefix} editable result`,
    metricName: "Editable metric",
    uncertaintyLevel: "入门",
    definer: fixture.commander.name,
  });
  assert.ok(result);
  assert.equal((await publishObjective(objective.id, fixture.commander.id)).status, "ok");

  await withApiServer(fixture, async (app) => {
    const beforeChallenge = await patchResultTitle(app, fixture.challenger, result.id, `${fixture.prefix} edit before challenge`);
    assert.equal(beforeChallenge.statusCode, 403);

    const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
    assert.equal(applied.status, "applied");
    const applicationId = applied.objective.challengeApplications.find((application) => application.applicant === fixture.challenger.name)?.id;
    assert.ok(applicationId);
    assert.equal((await approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id)).status, "ok");

    const observerAttempt = await patchResultTitle(app, fixture.observer, result.id, `${fixture.prefix} observer edit`);
    assert.equal(observerAttempt.statusCode, 403);

    const edited = await patchResultTitle(app, fixture.challenger, result.id, `${fixture.prefix} edited during reestimate`);
    assert.equal(edited.statusCode, 200);

    await expireReestimateWindow(objective.id);
    const expired = await patchResultTitle(app, fixture.challenger, result.id, `${fixture.prefix} expired edit`);
    assert.equal(expired.statusCode, 403);

    await setFutureReestimateWindow(objective.id);
    const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
    assert.equal(frozen.status, "ok");
    const afterFreeze = await patchResultTitle(app, fixture.challenger, result.id, `${fixture.prefix} frozen edit`);
    assert.equal(afterFreeze.statusCode, 403);
  });
});

test("recruitment is only allowed after an objective is published", async () => {
  const fixture = await createFixture("recruit-before-publish");
  const objective = await createTestObjective(fixture, "candidate recruitment guard");

  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id);
  assert.equal(recruited.status, "invalid");

  const data = await getTaskManagementData();
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "candidate");
  assert.deepEqual(unchanged?.assignedChallengers, []);
});

test("approving stale pending applications cannot mutate a frozen objective", async () => {
  const fixture = await createFixture("approve-after-freeze");
  const { objective, challengerApplicationId, observerApplicationId } = await createFrozenObjectiveWithPendingApplication(fixture);

  assert.ok(challengerApplicationId);
  const approvedAfterFreeze = await approveObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id);
  assert.equal(approvedAfterFreeze.status, "invalid");

  const data = await getTaskManagementData();
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "frozen");
  assert.deepEqual(unchanged?.challengers, [fixture.challenger.name]);
  assert.equal(
    unchanged?.challengeApplications.find((application) => application.id === observerApplicationId)?.status,
    "declined",
  );
});

test("rejecting stale pending applications cannot reopen a frozen objective", async () => {
  const fixture = await createFixture("reject-after-freeze");
  const { objective, observerApplicationId } = await createFrozenObjectiveWithPendingApplication(fixture);

  const rejectedAfterFreeze = await rejectObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id);
  assert.equal(rejectedAfterFreeze.status, "invalid");

  const data = await getTaskManagementData();
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "frozen");
  assert.equal(
    unchanged?.challengeApplications.find((application) => application.id === observerApplicationId)?.status,
    "declined",
  );
});

test("bounty hall excludes frozen objectives even when legacy data keeps pending applications", async () => {
  const fixture = await createFixture("bounty-stale-frozen-pending");
  const { objective, observerApplicationId } = await createFrozenObjectiveWithPendingApplication(fixture);
  const data = await getTaskManagementData({ scope: fixture.scope });
  const frozen = data.objectives.find((item) => item.id === objective.id);
  assert.ok(frozen);

  const staleApplications = frozen.challengeApplications.map((application) =>
    application.id === observerApplicationId
      ? { ...application, status: "pending" as const, decidedAt: null, decidedBy: null }
      : application,
  );
  await db.update(objectives).set({ challengeApplications: staleApplications }).where(eq(objectives.id, objective.id));

  const hall = await getBountyHallData(fixture.observer.name, { scope: fixture.scope });

  assert.equal(hall.availableItems.some((item) => item.objective.id === objective.id), false);
  assert.equal(hall.recruitmentItems.some((item) => item.objective.id === objective.id), false);
  assert.equal((await applyForObjectiveChallenge(objective.id, fixture.observer.name)).status, "closed");
});

test("rejecting remaining pending applications keeps an accepted objective in reestimate", async () => {
  const fixture = await createFixture("reject-pending-after-accept");
  const objective = await createPublishedObjective(fixture, "reject remaining pending guard");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} active reject guard result`);

  const challengerApplication = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(challengerApplication.status, "applied");
  assert.equal(observerApplication.status, "applied");
  const challengerApplicationId = challengerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  const observerApplicationId = observerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.observer.name)?.id;
  assert.ok(challengerApplicationId);
  assert.ok(observerApplicationId);

  const approved = await approveObjectiveChallengeApplication(objective.id, challengerApplicationId, fixture.commander.id);
  assert.equal(approved.status, "ok");
  assert.equal(approved.objective.flowStatus, "reestimating");

  const rejected = await rejectObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id);
  assert.equal(rejected.status, "ok");
  assert.equal(rejected.objective.flowStatus, "reestimating");
  assert.deepEqual(rejected.objective.challengers, [fixture.challenger.name]);
  assert.equal(
    rejected.objective.challengeApplications.find((application) => application.id === observerApplicationId)?.status,
    "declined",
  );
});

test("concurrent application approvals preserve every accepted challenger", async () => {
  const fixture = await createFixture("concurrent-application-approvals");
  const objective = await createPublishedObjective(fixture, "concurrent application approval guard");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} concurrent approval result`);

  const applications = await Promise.all([
    applyForObjectiveChallenge(objective.id, fixture.challenger.name),
    applyForObjectiveChallenge(objective.id, fixture.observer.name),
  ]);
  assert.deepEqual(applications.map((outcome) => outcome.status).sort(), ["applied", "applied"]);

  const pendingData = await getTaskManagementData({ scope: fixture.scope });
  const pendingObjective = pendingData.objectives.find((item) => item.id === objective.id);
  const applicationIds = [fixture.challenger.name, fixture.observer.name].map((applicant) =>
    pendingObjective?.challengeApplications.find((application) => application.applicant === applicant && application.status === "pending")?.id,
  );
  assert.ok(applicationIds[0]);
  assert.ok(applicationIds[1]);

  const approvals = await Promise.all(
    applicationIds.map((applicationId) => approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id)),
  );
  assert.deepEqual(approvals.map((outcome) => outcome.status).sort(), ["ok", "ok"]);

  const finalData = await getTaskManagementData({ scope: fixture.scope });
  const approvedObjective = finalData.objectives.find((item) => item.id === objective.id);
  assert.deepEqual(approvedObjective?.challengers.slice().sort(), [fixture.challenger.name, fixture.observer.name].sort());
  assert.equal(approvedObjective?.flowStatus, "reestimating");
  assert.equal(approvedObjective?.stage, "orfReestimate");
  assert.deepEqual(
    approvedObjective?.challengeApplications
      .filter((application) => applicationIds.includes(application.id))
      .map((application) => application.status)
      .sort(),
    ["approved", "approved"],
  );
});

test("accepting stale recruitment cannot reopen a frozen objective", async () => {
  const fixture = await createFixture("accept-after-freeze");
  const objective = await createPublishedObjective(fixture, "accept after freeze guard");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} stale recruitment guard result`);

  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name, fixture.observer.name], fixture.commander.id);
  assert.equal(recruited.status, "ok");

  const accepted = await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(accepted.status, "accepted");
  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");

  const staleAccept = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(staleAccept.status, "closed");

  const data = await getTaskManagementData();
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "frozen");
  assert.deepEqual(unchanged?.challengers, [fixture.challenger.name]);
});

test("concurrent recruitment responses preserve every member transition", async () => {
  const fixture = await createFixture("concurrent-recruitment-responses");
  const acceptedObjective = await createPublishedObjective(fixture, "concurrent recruitment accept guard");
  await createTestResult(acceptedObjective.id, fixture.commander.name, `${fixture.prefix} concurrent accept result`);

  const recruits = await Promise.all([
    recruitObjectiveChallengers(acceptedObjective.id, [fixture.challenger.name], fixture.commander.id),
    recruitObjectiveChallengers(acceptedObjective.id, [fixture.observer.name], fixture.commander.id),
  ]);
  assert.deepEqual(recruits.map((outcome) => outcome.status).sort(), ["ok", "ok"]);

  let data = await getTaskManagementData({ scope: fixture.scope });
  const recruitedObjective = data.objectives.find((item) => item.id === acceptedObjective.id);
  assert.deepEqual(recruitedObjective?.assignedChallengers.slice().sort(), [fixture.challenger.name, fixture.observer.name].sort());

  const acceptances = await Promise.all([
    acceptObjectiveChallenge(acceptedObjective.id, fixture.challenger.name, fixture.challenger.id),
    acceptObjectiveChallenge(acceptedObjective.id, fixture.observer.name, fixture.observer.id),
  ]);
  assert.deepEqual(acceptances.map((outcome) => outcome.status).sort(), ["accepted", "accepted"]);

  data = await getTaskManagementData({ scope: fixture.scope });
  const finalizedAcceptedObjective = data.objectives.find((item) => item.id === acceptedObjective.id);
  assert.deepEqual(finalizedAcceptedObjective?.challengers.slice().sort(), [fixture.challenger.name, fixture.observer.name].sort());
  assert.deepEqual(finalizedAcceptedObjective?.assignedChallengers, []);
  assert.equal(finalizedAcceptedObjective?.flowStatus, "reestimating");

  const declinedObjective = await createPublishedObjective(fixture, "concurrent recruitment decline guard");
  assert.equal(
    (await recruitObjectiveChallengers(declinedObjective.id, [fixture.challenger.name, fixture.observer.name], fixture.commander.id)).status,
    "ok",
  );
  const declines = await Promise.all([
    declineObjectiveChallenge(declinedObjective.id, fixture.challenger.name, fixture.challenger.id),
    declineObjectiveChallenge(declinedObjective.id, fixture.observer.name, fixture.observer.id),
  ]);
  assert.deepEqual(declines.map((outcome) => outcome.status).sort(), ["ok", "ok"]);

  data = await getTaskManagementData({ scope: fixture.scope });
  const finalizedDeclinedObjective = data.objectives.find((item) => item.id === declinedObjective.id);
  assert.deepEqual(finalizedDeclinedObjective?.assignedChallengers, []);
  assert.equal(finalizedDeclinedObjective?.flowStatus, "open");
});

test("unassigned members cannot decline recruitment outside the recruiting state", async () => {
  const fixture = await createFixture("decline-unassigned-guard");
  const objective = await createPublishedObjective(fixture, "decline unassigned guard");

  const unrelatedDecline = await declineObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(unrelatedDecline.status, "invalid");

  const data = await getTaskManagementData();
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "open");
  assert.deepEqual(unchanged?.assignedChallengers, []);
});

test("assigned members can decline recruitment exactly once", async () => {
  const fixture = await createFixture("decline-assigned-guard");
  const objective = await createPublishedObjective(fixture, "decline assigned guard");

  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id);
  assert.equal(recruited.status, "ok");

  const assignedDecline = await declineObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(assignedDecline.status, "ok");
  assert.equal(assignedDecline.objective.flowStatus, "open");
  assert.deepEqual(assignedDecline.objective.assignedChallengers, []);

  const repeatedDecline = await declineObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(repeatedDecline.status, "invalid");
});

test("freezing after reestimate requires at least one concrete result", async () => {
  const fixture = await createFixture("freeze-without-result");
  const objective = await createPublishedObjective(fixture, "no result freeze guard");
  const application = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  assert.equal(application.status, "applied");
  const applicationId = application.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  assert.ok(applicationId);
  const approved = await approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id);
  assert.equal(approved.status, "ok");

  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "invalid");

  const data = await getTaskManagementData();
  assert.equal(data.objectives.find((item) => item.id === objective.id)?.flowStatus, "reestimating");
});

test("challenge application duplicate and closed-state guards are enforced", async () => {
  const fixture = await createFixture("application-guards");
  const { objective, applicationId } = await createApprovedObjectiveWithResult(fixture);

  const alreadyAccepted = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  assert.equal(alreadyAccepted.status, "alreadyAccepted");

  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(observerApplication.status, "closed");

  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  const frozenApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(frozenApplication.status, "closed");

  const openObjective = await createPublishedObjective(fixture, "duplicate application guard");
  const firstApply = await applyForObjectiveChallenge(openObjective.id, fixture.observer.name);
  assert.equal(firstApply.status, "applied");
  const duplicateApply = await applyForObjectiveChallenge(openObjective.id, fixture.observer.name);
  assert.equal(duplicateApply.status, "alreadyApplied");

  const concurrentObjective = await createPublishedObjective(fixture, "concurrent application guard");
  const concurrentApplications = await Promise.all([
    applyForObjectiveChallenge(concurrentObjective.id, fixture.challenger.name),
    applyForObjectiveChallenge(concurrentObjective.id, fixture.observer.name),
  ]);
  assert.deepEqual(concurrentApplications.map((outcome) => outcome.status).sort(), ["applied", "applied"]);
  const data = await getTaskManagementData({ scope: fixture.scope });
  const pendingApplicants = data.objectives
    .find((item) => item.id === concurrentObjective.id)
    ?.challengeApplications.filter((application) => application.status === "pending")
    .map((application) => application.applicant)
    .sort();
  assert.deepEqual(pendingApplicants, [fixture.challenger.name, fixture.observer.name].sort());

  assert.ok(applicationId);
});

test("challenge acceptance guards duplicate, due-date, unauthorized, and closed states", async () => {
  const fixture = await createFixture("acceptance-guards");
  const objective = await createPublishedObjective(fixture, "acceptance guards");
  assert.equal((await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id)).status, "ok");

  const unauthorized = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
  assert.equal(unauthorized.status, "forbidden");

  const accepted = await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(accepted.status, "accepted");

  const repeated = await acceptObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(repeated.status, "alreadyAccepted");

  const dueDateFixture = await createFixture("acceptance-due-date");
  const dueDateObjective = await createPublishedObjective(dueDateFixture, "too-close due date", "2000-01-01");
  assert.equal((await recruitObjectiveChallengers(dueDateObjective.id, [dueDateFixture.challenger.name], dueDateFixture.commander.id)).status, "ok");
  const tooClose = await acceptObjectiveChallenge(dueDateObjective.id, dueDateFixture.challenger.name, dueDateFixture.challenger.id);
  assert.equal(tooClose.status, "invalidDueDate");

  const settledFixture = await createFixture("acceptance-closed");
  const { objective: settledObjective } = await createSettledObjective(settledFixture, "acceptance closed");
  const closed = await acceptObjectiveChallenge(settledObjective.id, settledFixture.observer.name, settledFixture.observer.id);
  assert.equal(closed.status, "closed");
});

test("freeze rejects invalid source states and reopen requests stay disabled", async () => {
  const fixture = await createFixture("freeze-reopen-disabled-guards");
  const candidate = await createTestObjective(fixture, "candidate freeze guard");
  assert.equal((await freezeObjectiveAfterReestimate(candidate.id, fixture.commander.id)).status, "invalid");
  assert.equal((await reopenObjectiveReestimate(candidate.id, fixture.commander.id)).status, "invalid");

  const applying = await createPublishedObjective(fixture, "applying freeze guard");
  assert.equal((await applyForObjectiveChallenge(applying.id, fixture.challenger.name)).status, "applied");
  assert.equal((await freezeObjectiveAfterReestimate(applying.id, fixture.commander.id)).status, "invalid");

  const { objective: approved } = await createApprovedObjectiveWithResult(fixture, "approved freeze guard");
  assert.equal((await reopenObjectiveReestimate(approved.id, fixture.commander.id)).status, "invalid");
  const frozen = await freezeObjectiveAfterReestimate(approved.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  assert.equal((await freezeObjectiveAfterReestimate(approved.id, fixture.commander.id)).status, "invalid");
  assert.equal((await reopenObjectiveReestimate(approved.id, fixture.commander.id)).status, "invalid");
});

test("loot submission rejects incomplete or out-of-state payloads", async () => {
  const fixture = await createFixture("loot-guards");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture);

  const beforeFreeze = await submitObjectiveLoot(
    objective.id,
    { body: "not frozen yet", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "too early" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(beforeFreeze.status, "closed");

  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");

  const emptyBody = await submitObjectiveLoot(
    objective.id,
    { body: " ", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "empty body" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(emptyBody.status, "invalid");

  const emptyEvidence = await submitObjectiveLoot(
    objective.id,
    { body: "missing evidence", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "  " }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(emptyEvidence.status, "invalid");

  const otherObjective = await createPublishedObjective(fixture, "foreign result objective");
  const foreignResult = await createTestResult(otherObjective.id, fixture.commander.name, "foreign result");
  const foreignClaim = await submitObjectiveLoot(
    objective.id,
    { body: "claims a foreign result", resultClaims: [{ resultId: foreignResult.id, claim: "completed", evidenceText: "foreign" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(foreignClaim.status, "invalid");

  const missingClaim = await submitObjectiveLoot(
    objective.id,
    { body: "missing the objective result", resultClaims: [] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(missingClaim.status, "invalid");
});

test("review rejects invalid state and missing loot", async () => {
  const fixture = await createFixture("review-guards");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture);

  const beforeSubmission = await reviewObjectiveLoot(
    objective.id,
    { acceptedResult: "completed", resultReviews: [{ resultId: result.id, acceptedResult: "completed" }] },
    fixture.commander.id,
  );
  assert.equal(beforeSubmission.status, "invalid");

  assert.equal((await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id)).status, "ok");
  const loot = await submitObjectiveLoot(
    objective.id,
    { body: "ready for review", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const missingLoot = await reviewObjectiveLoot(
    objective.id,
    { lootId: "missing-loot", acceptedResult: "completed", resultReviews: [{ resultId: result.id, acceptedResult: "completed" }] },
    fixture.commander.id,
  );
  assert.equal(missingLoot.status, "notFound");
});

test("settlement normalizes multi-challenger contribution ratios and supports overdelivery", async () => {
  const fixture = await createFixture("settlement-ratios");
  const objective = await createPublishedObjective(fixture, "multi challenger settlement");
  const resultA = await createTestResult(objective.id, fixture.commander.name, "ratio result a", "入门");
  const resultB = await createTestResult(objective.id, fixture.commander.name, "ratio result b", "进阶");

  const challengerApplication = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(challengerApplication.status, "applied");
  assert.equal(observerApplication.status, "applied");
  const challengerApplicationId = challengerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  const observerApplicationId = observerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.observer.name)?.id;
  assert.ok(challengerApplicationId);
  assert.ok(observerApplicationId);
  assert.equal((await approveObjectiveChallengeApplication(objective.id, challengerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await approveObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id)).status, "ok");

  const loot = await submitObjectiveLoot(
    objective.id,
    {
      body: "Both challengers delivered beyond the target.",
      resultClaims: [
        { resultId: resultA.id, claim: "completed", evidenceText: "A done" },
        { resultId: resultB.id, claim: "completed", evidenceText: "B done" },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const challengerReview = await submitObjectiveContributionReview(
    objective.id,
    {
      allocations: [
        { member: fixture.challenger.name, ratio: 2 },
        { member: fixture.observer.name, ratio: 1 },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(challengerReview.status, "ok");
  const observerReview = await submitObjectiveContributionReview(
    objective.id,
    {
      allocations: [
        { member: fixture.challenger.name, ratio: 2 },
        { member: fixture.observer.name, ratio: 1 },
      ],
    },
    { id: fixture.observer.id, name: fixture.observer.name, role: "member" },
  );
  assert.equal(observerReview.status, "ok");

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    {
      acceptedResult: "overdelivered",
      resultReviews: [
        { resultId: resultA.id, acceptedResult: "completed" },
        { resultId: resultB.id, acceptedResult: "completed" },
      ],
    },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");
  assert.equal(reviewed.objective.objectiveBasePoints, 40);
  assert.equal(reviewed.objective.completionMultiplier, 1.5);
  assert.equal(reviewed.objective.objectiveSettlementPoints, 60);

  const data = await getTaskManagementData();
  assert.equal(data.objectiveContributionReviews.filter((entry) => entry.objectiveId === objective.id).length, 2);
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => right.points - left.points);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0]?.memberName, fixture.challenger.name);
  assert.equal(ledger[0]?.points, 40);
  assert.equal(ledger[1]?.memberName, fixture.observer.name);
  assert.equal(ledger[1]?.points, 20);
});

test("repeated contribution reviews keep history but settlement uses each reviewer latest record", async () => {
  const fixture = await createFixture("peer-review-latest-record");
  const objective = await createPublishedObjective(fixture, "latest peer review settlement");
  const result = await createTestResult(objective.id, fixture.commander.name, "latest peer review result", "进阶");

  const challengerApplication = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(challengerApplication.status, "applied");
  assert.equal(observerApplication.status, "applied");
  const challengerApplicationId = challengerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  const observerApplicationId = observerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.observer.name)?.id;
  assert.ok(challengerApplicationId);
  assert.ok(observerApplicationId);
  assert.equal((await approveObjectiveChallengeApplication(objective.id, challengerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await approveObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id)).status, "ok");

  const loot = await submitObjectiveLoot(
    objective.id,
    {
      body: "Repeated peer review target loot.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const firstReview = await submitObjectiveContributionReview(
    objective.id,
    {
      allocations: [
        { member: fixture.challenger.name, ratio: 9 },
        { member: fixture.observer.name, ratio: 1 },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(firstReview.status, "ok");

  const latestReview = await submitObjectiveContributionReview(
    objective.id,
    {
      allocations: [
        { member: fixture.challenger.name, ratio: 1 },
        { member: fixture.observer.name, ratio: 1 },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(latestReview.status, "ok");

  const observerReview = await submitObjectiveContributionReview(
    objective.id,
    {
      allocations: [
        { member: fixture.challenger.name, ratio: 1 },
        { member: fixture.observer.name, ratio: 1 },
      ],
    },
    { id: fixture.observer.id, name: fixture.observer.name, role: "member" },
  );
  assert.equal(observerReview.status, "ok");

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    { lootId: loot.loot.id, resultReviews: [{ resultId: result.id, acceptedResult: "completed" }] },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");

  const data = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(data.objectiveContributionReviews.filter((entry) => entry.objectiveId === objective.id).length, 3);
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => left.memberName.localeCompare(right.memberName));
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0]?.points, 15);
  assert.equal(ledger[1]?.points, 15);
});

test("settlement resolves point ledger user ids within the objective runtime scope", async () => {
  const owner = await createFixture("settlement-user-scope-owner");
  const intruder = await createFixture("settlement-user-scope-intruder");
  await db.update(users).set({ name: owner.challenger.name }).where(eq(users.id, intruder.challenger.id));

  const { objective, result } = await createApprovedObjectiveWithResult(owner, "scope ledger objective");
  const frozen = await freezeObjectiveAfterReestimate(objective.id, owner.commander.id);
  assert.equal(frozen.status, "ok");

  const loot = await submitObjectiveLoot(
    objective.id,
    { body: "Completed with a same-name user in another scope.", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }] },
    { id: owner.challenger.id, name: owner.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    { lootId: loot.loot.id, resultReviews: [{ resultId: result.id, acceptedResult: "completed" }] },
    owner.commander.id,
  );
  assert.equal(reviewed.status, "ok");

  const data = await getTaskManagementData({ scope: owner.scope });
  const ledger = data.pointLedger.find((entry) => entry.objectiveId === objective.id && entry.memberName === owner.challenger.name);
  assert.ok(ledger);
  assert.equal(ledger.userId, owner.challenger.id);
  assert.notEqual(ledger.userId, intruder.challenger.id);
});

test("settlement resolution collapses duplicate member ratios before writing point ledger", async () => {
  const fixture = await createFixture("settlement-resolution-duplicates");
  const objective = await createPublishedObjective(fixture, "duplicate resolution ratios");
  const result = await createTestResult(objective.id, fixture.commander.name, "duplicate ratio result", "进阶");

  const challengerApplication = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(challengerApplication.status, "applied");
  assert.equal(observerApplication.status, "applied");
  const challengerApplicationId = challengerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  const observerApplicationId = observerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.observer.name)?.id;
  assert.ok(challengerApplicationId);
  assert.ok(observerApplicationId);
  assert.equal((await approveObjectiveChallengeApplication(objective.id, challengerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await approveObjectiveChallengeApplication(objective.id, observerApplicationId, fixture.commander.id)).status, "ok");
  assert.equal((await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id)).status, "ok");

  const loot = await submitObjectiveLoot(
    objective.id,
    {
      body: "Duplicate resolution ratios should still produce one ledger row per challenger.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    {
      contributionResolution: {
        ratios: [
          { member: fixture.challenger.name, ratio: 1 },
          { member: fixture.challenger.name, ratio: 3 },
          { member: fixture.observer.name, ratio: 1 },
        ],
        reason: "Resolve duplicate contribution input.",
      },
    },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");

  const data = await getTaskManagementData();
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => right.points - left.points);
  assert.equal(ledger.length, 2);
  assert.equal(new Set(ledger.map((entry) => entry.memberName)).size, 2);
  assert.equal(ledger[0]?.memberName, fixture.challenger.name);
  assert.equal(ledger[0]?.points, 24);
  assert.equal(ledger[1]?.memberName, fixture.observer.name);
  assert.equal(ledger[1]?.points, 6);
});

test("API flow commands enforce commander-only permissions and challenge list scope", async () => {
  const fixture = await createFixture("api-flow-permissions");
  const candidate = await createTestObjective(fixture, "api publish permission");
  const objective = await createPublishedObjective(fixture, "api flow permission");
  assert.equal((await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id)).status, "ok");
  const reviewObjective = await createPublishedObjective(fixture, "api review permission");

  await withApiServer(fixture, async (app) => {
    const memberPublish = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}/publish`);
    assert.equal(memberPublish.statusCode, 403);

    const missingPublish = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(`${fixture.prefix}-missing`)}/publish`);
    assert.equal(missingPublish.statusCode, 404);

    const memberRecruit = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/recruitments`, {
      members: [fixture.observer.name],
    });
    assert.equal(memberRecruit.statusCode, 403);

    const application = await applyForObjectiveChallenge(reviewObjective.id, fixture.challenger.name);
    assert.equal(application.status, "applied");
    const applicationId = application.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
    assert.ok(applicationId);
    const memberApprove = await apiInject(
      app,
      fixture.challenger,
      "PATCH",
      `/api/objectives/${encodeURIComponent(reviewObjective.id)}/challenge-applications/${encodeURIComponent(applicationId)}/approve`,
    );
    assert.equal(memberApprove.statusCode, 403);
    const memberReject = await apiInject(
      app,
      fixture.challenger,
      "PATCH",
      `/api/objectives/${encodeURIComponent(reviewObjective.id)}/challenge-applications/${encodeURIComponent(applicationId)}/reject`,
    );
    assert.equal(memberReject.statusCode, 403);

    const memberFreeze = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/freeze`);
    assert.equal(memberFreeze.statusCode, 403);
    const memberReopen = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/reopen-reestimate`);
    assert.equal(memberReopen.statusCode, 403);
    const commanderReopen = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/reopen-reestimate`);
    assert.equal(commanderReopen.statusCode, 409);
    const memberReview = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/review`, {
      acceptedResult: "completed",
    });
    assert.equal(memberReview.statusCode, 403);

    const memberAllScope = await apiInject(app, fixture.challenger, "GET", "/api/my-challenges?scope=all");
    assert.equal(memberAllScope.statusCode, 403);

    const adminAllScope = await apiInject(app, fixture.commander, "GET", "/api/my-challenges?scope=all");
    assert.equal(adminAllScope.statusCode, 200);
  });
});

test("API objective creation rejects malformed final due dates", async () => {
  const fixture = await createFixture("api-objective-date-validation");

  await withApiServer(fixture, async (app) => {
    for (const finalDueAt of ["", "not-a-date", "2999-02-31"]) {
      const response = await apiInject(app, fixture.commander, "POST", "/api/objectives", {
        title: `${fixture.prefix} invalid due date ${finalDueAt || "empty"}`,
        whyItMatters: "Invalid dates must not reach the database date column.",
        cycle: "2999-Q4",
        boundary: "Test-only objective.",
        finalDueAt,
      });
      assert.equal(response.statusCode, 400);
    }
  });
});

test("API work item creation trims labels and prevents blank persisted titles", async () => {
  const fixture = await createFixture("api-work-item-input");
  const publishedObjective = await createPublishedObjective(fixture, "input validation objective");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, "input validation work item objective");

  await withApiServer(fixture, async (app) => {
    const blankResultTitle = await apiInject(app, fixture.commander, "POST", "/api/results", {
      objectiveId: publishedObjective.id,
      title: "   ",
      metricName: "valid metric",
    });
    assert.equal(blankResultTitle.statusCode, 400);

    const blankResultMetric = await apiInject(app, fixture.commander, "POST", "/api/results", {
      objectiveId: publishedObjective.id,
      title: "valid title",
      metricName: "   ",
    });
    assert.equal(blankResultMetric.statusCode, 400);

    const trimmedResult = await apiInject(app, fixture.commander, "POST", "/api/results", {
      objectiveId: publishedObjective.id,
      title: "  trimmed result title  ",
      metricName: "  trimmed metric name  ",
      description: "   ",
      unit: "   ",
    });
    assert.equal(trimmedResult.statusCode, 200, trimmedResult.body);
    const trimmedResultPayload = trimmedResult.json() as { result: Result };
    assert.equal(trimmedResultPayload.result.title, "trimmed result title");
    assert.equal(trimmedResultPayload.result.metricName, "trimmed metric name");
    assert.equal(trimmedResultPayload.result.description, "由 ORF Flow 规划创建的指标。");
    assert.equal(trimmedResultPayload.result.unit, "%");

    const blankTaskTitle = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "   ",
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    });
    assert.equal(blankTaskTitle.statusCode, 400);

    const invalidTaskDueDate = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "valid task title",
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
      dueDate: "2999-02-31",
    });
    assert.equal(invalidTaskDueDate.statusCode, 400);

    const trimmedTask = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "  trimmed action title  ",
      description: "   ",
      assignee: "   ",
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
      dueDate: "2999-02-28",
    });
    assert.equal(trimmedTask.statusCode, 200);
    const trimmedTaskPayload = trimmedTask.json() as { task: { id: string; title: string; description: string; assignee: string; dueDate: string } };
    assert.equal(trimmedTaskPayload.task.title, "trimmed action title");
    assert.equal(trimmedTaskPayload.task.description, "执行支撑关联指标的下一步动作。");
    assert.equal(trimmedTaskPayload.task.assignee, "User");
    assert.equal(trimmedTaskPayload.task.dueDate, "2999-02-28");

    const defaultLabel = await apiInject(app, fixture.challenger, "POST", `/api/tasks/${encodeURIComponent(trimmedTaskPayload.task.id)}/checklist`, {
      label: "   ",
    });
    assert.equal(defaultLabel.statusCode, 200);

    const data = await getTaskManagementData({ scope: fixture.scope });
    const storedTask = data.tasks.find((item) => item.id === trimmedTaskPayload.task.id);
    assert.equal(storedTask?.checklist[0]?.label, "新子任务");
  });
});

test("task creation generates collision-resistant ids under concurrent writes", async () => {
  const fixture = await createFixture("task-id-collision");
  const { result } = await createApprovedObjectiveWithResult(fixture, "concurrent task id objective");
  const fixedNow = Date.now();
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => fixedNow;
  Math.random = () => 0.123456;

  try {
    const [firstTask, secondTask] = await Promise.all([
      createTask({
        title: `${fixture.prefix} concurrent task A`,
        linkedResultId: result.id,
        linkedObjectiveId: result.objectiveId,
        assignee: fixture.challenger.name,
      }),
      createTask({
        title: `${fixture.prefix} concurrent task B`,
        linkedResultId: result.id,
        linkedObjectiveId: result.objectiveId,
        assignee: fixture.challenger.name,
      }),
    ]);

    assert.ok(firstTask);
    assert.ok(secondTask);
    assert.notEqual(firstTask.id, secondTask.id);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }

  const data = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(data.tasks.filter((task) => task.linkedResultId === result.id).length, 2);
});

test("concurrent result, task, and checklist creation reserve stable sort orders", async () => {
  const fixture = await createFixture("concurrent-sort-orders");
  const objective = await createPublishedObjective(fixture, "concurrent sort order objective");
  const expectedSortOrders = Array.from({ length: 8 }, (_item, index) => index);

  const createdResults = await Promise.all(
    expectedSortOrders.map((index) =>
      createResult({
        objectiveId: objective.id,
        title: `${fixture.prefix} concurrent result ${index}`,
        metricName: `Concurrent metric ${index}`,
        uncertaintyLevel: "入门",
        definer: fixture.commander.name,
      }),
    ),
  );
  assert.equal(createdResults.every(Boolean), true);
  const storedResults = await db
    .select({ id: resultRows.id, sortOrder: resultRows.sortOrder })
    .from(resultRows)
    .where(eq(resultRows.objectiveId, objective.id));
  assert.deepEqual(storedResults.map((row) => row.sortOrder).sort((left, right) => left - right), expectedSortOrders);

  const workResult = createdResults[0];
  assert.ok(workResult);
  const createdTasks = await Promise.all(
    expectedSortOrders.map((index) =>
      createTask({
        title: `${fixture.prefix} concurrent task ${index}`,
        linkedResultId: workResult.id,
        linkedObjectiveId: objective.id,
        assignee: fixture.challenger.name,
      }),
    ),
  );
  assert.equal(createdTasks.every(Boolean), true);
  const storedTasks = await db
    .select({ id: taskRows.id, sortOrder: taskRows.sortOrder })
    .from(taskRows)
    .where(eq(taskRows.linkedResultId, workResult.id));
  assert.deepEqual(storedTasks.map((row) => row.sortOrder).sort((left, right) => left - right), expectedSortOrders);

  const checklistTask = createdTasks[0];
  assert.ok(checklistTask);
  const checklistCreates = await Promise.all(
    expectedSortOrders.map((index) => createChecklistItem(checklistTask.id, { label: `${fixture.prefix} concurrent checklist ${index}` })),
  );
  assert.deepEqual(checklistCreates, expectedSortOrders.map(() => true));
  const storedChecklist = await db
    .select({ id: taskChecklistItems.id, sortOrder: taskChecklistItems.sortOrder })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, checklistTask.id));
  assert.deepEqual(storedChecklist.map((row) => row.sortOrder).sort((left, right) => left - right), expectedSortOrders);
});

test("API objective stage updates cannot violate lifecycle compatibility", async () => {
  const fixture = await createFixture("api-stage-compatibility");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "stage compatibility objective");

  await withApiServer(fixture, async (app) => {
    const frozenStageOnReestimating = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/stage`, {
      stage: "goalFrozen",
    });
    assert.equal(frozenStageOnReestimating.statusCode, 409);

    let data = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(data.objectives.find((item) => item.id === objective.id)?.stage, "orfReestimate");

    const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
    assert.equal(frozen.status, "ok");

    const reestimateStageOnFrozen = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/stage`, {
      stage: "orfReestimate",
    });
    assert.equal(reestimateStageOnFrozen.statusCode, 409);

    const currentStageOnFrozen = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/stage`, {
      stage: "goalFrozen",
    });
    assert.equal(currentStageOnFrozen.statusCode, 200);

    data = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(data.objectives.find((item) => item.id === objective.id)?.stage, "goalFrozen");
  });
});

test("API user deletion reports missing members instead of a successful no-op", async () => {
  const fixture = await createFixture("api-user-delete-missing");

  await withApiServer(fixture, async (app) => {
    const missingDelete = await apiInject(app, fixture.commander, "DELETE", `/api/users/${encodeURIComponent(`${fixture.prefix}-missing-user`)}`);
    assert.equal(missingDelete.statusCode, 404);

    const existingDelete = await apiInject(app, fixture.commander, "DELETE", `/api/users/${encodeURIComponent(fixture.observer.id)}`);
    assert.equal(existingDelete.statusCode, 200);
  });
});

test("API user management rejects duplicate display names inside the default scope", async () => {
  const fixture = await createFixture("api-user-duplicate-name");

  await withApiServer(fixture, async (app) => {
    const duplicateCreate = await apiInject(app, fixture.commander, "POST", "/api/users", {
      name: ` ${fixture.challenger.name} `,
      email: `${fixture.prefix}-duplicate-name@orf.test`,
      role: "member",
    });
    assert.equal(duplicateCreate.statusCode, 409);

    const duplicateUpdate = await apiInject(app, fixture.commander, "PATCH", `/api/users/${encodeURIComponent(fixture.observer.id)}`, {
      name: fixture.challenger.name,
      email: fixture.observer.email,
      role: "member",
    });
    assert.equal(duplicateUpdate.statusCode, 409);

    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const names = (userList.json() as { users: Array<{ name: string }> }).users.map((user) => user.name);
    assert.equal(names.filter((name) => name === fixture.challenger.name).length, 1);
    assert.equal(names.includes(fixture.observer.name), true);
  });
});

test("API user management normalizes email whitespace before validation", async () => {
  const fixture = await createFixture("api-user-normalize-email");
  const email = `${fixture.prefix}-trimmed-member@orf.test`;
  const name = `${fixture.prefix} Trimmed Member`;

  await withApiServer(fixture, async (app) => {
    const created = await apiInject(app, fixture.commander, "POST", "/api/users", {
      name: ` ${name} `,
      email: ` ${email.toUpperCase()} `,
      role: "member",
    });
    assert.equal(created.statusCode, 200);

    const userList = created.json() as { users: Array<{ name: string; email: string }> };
    const stored = userList.users.find((user) => user.email === email);
    assert.ok(stored);
    assert.equal(stored.name, name);
  });
});

test("API users expose recent online timestamps", async () => {
  const fixture = await createFixture("api-user-recent-online-field");

  await withApiServer(fixture, async (app) => {
    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);

    const payload = userList.json() as { users: Array<Record<string, unknown>> };
    const commander = payload.users.find((user) => user.id === fixture.commander.id);
    assert.ok(commander);
    assert.equal(Object.hasOwn(commander, "lastOnlineAt"), true);
  });
});

test("recent online activity endpoint updates the current user with server time and throttles repeats", async () => {
  const fixture = await createFixture("api-user-recent-online-activity");

  await withApiServer(fixture, async (app) => {
    const startedAt = Date.now();
    const activity = await apiInject(app, fixture.challenger, "POST", "/api/users/me/activity");
    const finishedAt = Date.now();
    assert.equal(activity.statusCode, 200);

    const afterFirst = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(afterFirst.statusCode, 200);

    const firstPayload = afterFirst.json() as { users: Array<Record<string, unknown>> };
    const challenger = firstPayload.users.find((user) => user.id === fixture.challenger.id);
    const commander = firstPayload.users.find((user) => user.id === fixture.commander.id);
    assert.ok(challenger);
    assert.ok(commander);
    assert.equal(commander.lastOnlineAt, null);

    const firstOnlineAt = challenger.lastOnlineAt;
    assert.equal(typeof firstOnlineAt, "string");
    if (typeof firstOnlineAt !== "string") {
      throw new Error("lastOnlineAt should be a server timestamp");
    }
    const onlineAtMs = Date.parse(firstOnlineAt);
    assert.equal(Number.isNaN(onlineAtMs), false);
    assert.ok(onlineAtMs >= startedAt - 1000);
    assert.ok(onlineAtMs <= finishedAt + 1000);

    const duplicate = await apiInject(app, fixture.challenger, "POST", "/api/users/me/activity");
    assert.equal(duplicate.statusCode, 200);

    const afterDuplicate = await apiInject(app, fixture.commander, "GET", "/api/users");
    const duplicatePayload = afterDuplicate.json() as { users: Array<Record<string, unknown>> };
    const challengerAfterDuplicate = duplicatePayload.users.find((user) => user.id === fixture.challenger.id);
    assert.equal(challengerAfterDuplicate?.lastOnlineAt, firstOnlineAt);
  });
});

test("auth API normalizes login credentials at the route boundary", async () => {
  const fixture = await createFixture("auth-route-login-normalize");
  const email = `${fixture.prefix}-external-login@orf.test`;
  const identity = {
    id: `${fixture.prefix}-external-identity`,
    traits: { email, name: "External Login User" },
  };

  await withMockOryPasswordFlow("login", identity, async (bodies) => {
    const app = await buildServer({ logger: false, registerOptionalIntegrations: false });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: ` ${email.toUpperCase()} `, password: "password" },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await app.close();
    }

    const loginBody = bodies.at(-1) as { identifier?: string; password?: string };
    assert.equal(loginBody.identifier, email);
    assert.equal(loginBody.password, "password");
  });
});

test("auth API normalizes registration traits at the route boundary", async () => {
  const fixture = await createFixture("auth-route-registration-normalize");
  const email = `${fixture.prefix}-registration@orf.test`;
  const name = "External Registration User";
  const identity = {
    id: `${fixture.prefix}-registration-identity`,
    traits: { email, name },
  };

  await withMockOryPasswordFlow("registration", identity, async (bodies) => {
    const app = await buildServer({ logger: false, registerOptionalIntegrations: false });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/registration",
        payload: { name: ` ${name} `, email: ` ${email.toUpperCase()} `, password: "password123" },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await app.close();
    }

    const registrationBody = bodies.at(-1) as { traits?: { email?: string; name?: { first?: string } }; password?: string };
    assert.equal(registrationBody.traits?.email, email);
    assert.equal(registrationBody.traits?.name?.first, name);
    assert.equal(registrationBody.password, "password123");
  });
});

test("password login does not auto-approve first-time ORF users", async () => {
  const fixture = await createFixture("auth-login-new-user-pending");
  const email = `${fixture.prefix}-external-login@orf.test`;
  const identity = {
    id: `${fixture.prefix}-external-identity`,
    traits: { email, name: "External Login User" },
  };

  await withMockOryLogin(identity, async () => {
    const auth = await loginWithPassword(email, "password");
    assert.equal(auth.user.status, "pending");
    assert.equal(auth.user.role, "member");
  });

  const [created] = await db.select({ status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  assert.equal(created?.status, "pending");
});

test("password login preserves existing ORF display names", async () => {
  const fixture = await createFixture("auth-login-name-preserve");
  const identity = {
    id: fixture.challenger.id,
    traits: {
      email: fixture.challenger.email,
      name: `${fixture.prefix} Ory Renamed Challenger`,
    },
  };

  await withMockOryLogin(identity, async () => {
    const auth = await loginWithPassword(fixture.challenger.email, "password");
    assert.equal(auth.user.name, fixture.challenger.name);
    assert.equal(auth.user.status, "active");
  });

  const [stored] = await db.select({ name: users.name }).from(users).where(eq(users.id, fixture.challenger.id)).limit(1);
  assert.equal(stored?.name, fixture.challenger.name);
});

test("API user management prevents renaming members referenced by ORF records", async () => {
  const fixture = await createFixture("api-user-rename-reference");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "rename referenced challenger objective");

  await withApiServer(fixture, async (app) => {
    const rename = await apiInject(app, fixture.commander, "PATCH", `/api/users/${encodeURIComponent(fixture.challenger.id)}`, {
      name: `${fixture.prefix} Renamed Challenger`,
      email: fixture.challenger.email,
      role: "member",
    });
    assert.equal(rename.statusCode, 409);

    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const renamedUser = (userList.json() as { users: Array<{ id: string; name: string }> }).users.find((user) => user.id === fixture.challenger.id);
    assert.equal(renamedUser?.name, fixture.challenger.name);

    const myChallenges = await getMyChallengesData(fixture.challenger.name);
    assert.equal(myChallenges.objectives.some((item) => item.id === objective.id), true);
  });
});

test("API user upsert cannot bypass referenced member rename guards", async () => {
  const fixture = await createFixture("api-user-upsert-rename-reference");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "upsert rename referenced challenger objective");

  await withApiServer(fixture, async (app) => {
    const upsertRename = await apiInject(app, fixture.commander, "POST", "/api/users", {
      name: `${fixture.prefix} Upsert Renamed Challenger`,
      email: fixture.challenger.email,
      role: "member",
    });
    assert.equal(upsertRename.statusCode, 409);

    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const renamedUser = (userList.json() as { users: Array<{ id: string; name: string }> }).users.find((user) => user.id === fixture.challenger.id);
    assert.equal(renamedUser?.name, fixture.challenger.name);

    const myChallenges = await getMyChallengesData(fixture.challenger.name);
    assert.equal(myChallenges.objectives.some((item) => item.id === objective.id), true);
  });
});

test("API user deletion rejects members referenced by ORF records", async () => {
  const fixture = await createFixture("api-user-delete-reference");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "delete referenced challenger objective");

  await withApiServer(fixture, async (app) => {
    const deletion = await apiInject(app, fixture.commander, "DELETE", `/api/users/${encodeURIComponent(fixture.challenger.id)}`);
    assert.equal(deletion.statusCode, 409);

    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const userIds = (userList.json() as { users: Array<{ id: string }> }).users.map((user) => user.id);
    assert.equal(userIds.includes(fixture.challenger.id), true);

    const myChallenges = await getMyChallengesData(fixture.challenger.name);
    assert.equal(myChallenges.objectives.some((item) => item.id === objective.id), true);
  });
});

test("API user creation rejects names already reserved by ORF records", async () => {
  const fixture = await createFixture("api-user-create-reserved-name");
  await createApprovedObjectiveWithResult(fixture, "reserved historical challenger objective");
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, fixture.teamId), eq(teamMembers.userId, fixture.challenger.id)));

  await withApiServer(fixture, async (app) => {
    const replacement = await apiInject(app, fixture.commander, "POST", "/api/users", {
      name: fixture.challenger.name,
      email: `${fixture.prefix}-replacement@orf.test`,
      role: "member",
    });
    assert.equal(replacement.statusCode, 409);

    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const emails = (userList.json() as { users: Array<{ email: string }> }).users.map((user) => user.email);
    assert.equal(emails.includes(`${fixture.prefix}-replacement@orf.test`), false);
  });
});

test("task-page and state snapshot APIs do not leak full data to ordinary members", async () => {
  const fixture = await createFixture("api-read-boundary");
  const { objective } = await createSettledObjective(fixture, "scoped settled objective");

  await withApiServer(fixture, async (app) => {
    const observerTasks = await apiInject(app, fixture.observer, "GET", "/api/tasks-page");
    assert.equal(observerTasks.statusCode, 200);
    const observerData = observerTasks.json() as {
      objectives: Array<{ id: string }>;
      results: Array<{ objectiveId: string }>;
      objectiveLoot: Array<{ objectiveId: string }>;
      pointLedger: Array<{ objectiveId: string }>;
    };
    assert.equal(observerData.objectives.some((item) => item.id === objective.id), false);
    assert.equal(observerData.results.some((item) => item.objectiveId === objective.id), false);
    assert.equal(observerData.objectiveLoot.some((item) => item.objectiveId === objective.id), false);
    assert.equal(observerData.pointLedger.some((item) => item.objectiveId === objective.id), false);

    const challengerTasks = await apiInject(app, fixture.challenger, "GET", "/api/tasks-page");
    assert.equal(challengerTasks.statusCode, 200);
    assert.equal((challengerTasks.json() as { objectives: Array<{ id: string }> }).objectives.some((item) => item.id === objective.id), true);

    const adminTasks = await apiInject(app, fixture.commander, "GET", "/api/tasks-page");
    assert.equal(adminTasks.statusCode, 200);
    assert.equal((adminTasks.json() as { objectives: Array<{ id: string }> }).objectives.some((item) => item.id === objective.id), true);

    const memberSnapshot = await apiInject(app, fixture.challenger, "GET", "/api/orf-state");
    assert.equal(memberSnapshot.statusCode, 403);

    const adminSnapshot = await apiInject(app, fixture.commander, "GET", "/api/orf-state");
    assert.equal(adminSnapshot.statusCode, 200);
    assert.equal((adminSnapshot.json() as { objectives: Array<{ id: string }> }).objectives.some((item) => item.id === objective.id), true);
  });
});

test("API mutations enforce runtime scope boundaries even for administrators", async () => {
  const owner = await createFixture("api-scope-owner");
  const intruder = await createFixture("api-scope-intruder");
  const candidate = await createTestObjective(owner, "cross-scope candidate");
  const objective = await createPublishedObjective(owner, "cross-scope published objective");
  const result = await createTestResult(objective.id, owner.commander.name, `${owner.prefix} cross-scope result`);
  const intruderObjective = await createPublishedObjective(intruder, "intruder update proposal objective");
  const intruderOwnedResult = await createTestResult(intruderObjective.id, intruder.commander.name, `${intruder.prefix} update proposal result`);
  const { result: intruderWorkResult } = await createApprovedObjectiveWithResult(intruder, "intruder feedback-origin task objective");

  await withApiServerForFixtures([owner, intruder], async (app) => {
    const intruderPublish = await apiInject(app, intruder.commander, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}/publish`);
    assert.equal(intruderPublish.statusCode, 404);

    const intruderResult = await postResult(app, intruder.commander, objective.id, {
      title: `${intruder.prefix} should not create metric`,
      metricName: "Cross-scope metric",
      source: "managerDefined",
    });
    assert.equal(intruderResult.statusCode, 404);

    const intruderApplication = await apiInject(
      app,
      intruder.challenger,
      "POST",
      `/api/objectives/${encodeURIComponent(objective.id)}/challenge-applications`,
    );
    assert.equal(intruderApplication.statusCode, 404);

    const intruderConfidence = await apiInject(app, intruder.commander, "PATCH", `/api/results/${encodeURIComponent(result.id)}/confidence`, {
      confidence: 95,
    });
    assert.equal(intruderConfidence.statusCode, 404);

    const intruderComment = await apiInject(app, intruder.commander, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: "cross-scope admin should not comment",
    });
    assert.equal(intruderComment.statusCode, 404);

    const ownerFeedback = await apiInject(app, owner.commander, "POST", "/api/feedback", {
      phenomenon: `${owner.prefix} cross-scope feedback target`,
      causeCategories: ["Quality"],
      impact: "High",
      linkedResultId: result.id,
      suggestedAdjustment: "Cross-scope update proposals must not mutate this feedback.",
      source: "Team review",
      owner: owner.commander.name,
    });
    assert.equal(ownerFeedback.statusCode, 200);
    const ownerFeedbackId = (ownerFeedback.json() as { feedback: { id: string } }).feedback.id;

    const intruderUpdateProposal = await apiInject(app, intruder.commander, "POST", `/api/results/${encodeURIComponent(intruderOwnedResult.id)}/update-proposal`, {
      title: `${intruder.prefix} scoped proposal`,
      reason: "Attempt to update another scope's feedback status.",
      feedbackId: ownerFeedbackId,
    });
    assert.equal(intruderUpdateProposal.statusCode, 404);
    const ownerData = await getTaskManagementData({ scope: owner.scope });
    assert.equal(ownerData.feedback.find((item) => item.id === ownerFeedbackId)?.status, "New");

    const intruderTaskWithOwnerFeedback = await apiInject(app, intruder.commander, "POST", "/api/tasks", {
      title: `${intruder.prefix} cross-scope feedback origin task`,
      linkedResultId: intruderWorkResult.id,
      feedbackOriginId: ownerFeedbackId,
    });
    assert.equal(intruderTaskWithOwnerFeedback.statusCode, 404);
    const intruderData = await getTaskManagementData({ scope: intruder.scope });
    assert.equal(intruderData.tasks.some((item) => item.feedbackOriginId === ownerFeedbackId), false);

    const ownerPublish = await apiInject(app, owner.commander, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}/publish`);
    assert.equal(ownerPublish.statusCode, 200);
  });
});

test("task and comment API writes require objective participation", async () => {
  const fixture = await createFixture("api-work-item-boundary");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture);

  await withApiServer(fixture, async (app) => {
    const taskPayload = {
      title: `${fixture.prefix} scoped task`,
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    };

    const observerTask = await apiInject(app, fixture.observer, "POST", "/api/tasks", taskPayload);
    assert.equal(observerTask.statusCode, 403);

    const challengerTask = await apiInject(app, fixture.challenger, "POST", "/api/tasks", taskPayload);
    assert.equal(challengerTask.statusCode, 200);
    const taskId = (challengerTask.json() as { task: { id: string } }).task.id;

    const observerChecklist = await apiInject(app, fixture.observer, "POST", `/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
      label: "observer should not add",
    });
    assert.equal(observerChecklist.statusCode, 403);

    const challengerChecklist = await apiInject(app, fixture.challenger, "POST", `/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
      label: "challenger can add",
    });
    assert.equal(challengerChecklist.statusCode, 200);

    const observerPatch = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(taskId)}`, {
      title: "observer should not edit",
    });
    assert.equal(observerPatch.statusCode, 403);

    const observerComment = await apiInject(app, fixture.observer, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: "observer should not comment",
    });
    assert.equal(observerComment.statusCode, 403);

    const challengerComment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: "spoofed objective title",
      body: "challenger can comment",
    });
    assert.equal(challengerComment.statusCode, 200);
    const challengerCommentPayload = challengerComment.json() as {
      commentThread: { id: string; targetTitle: string; messages: Array<{ id: string; author: string; body: string; replyToMessageId?: string; replyToAuthor?: string }> };
    };
    const rootMessageId = challengerCommentPayload.commentThread.messages[0]?.id;
    assert.ok(rootMessageId);
    assert.equal(challengerCommentPayload.commentThread.targetTitle, objective.title);

    const replyComment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: "spoofed reply title",
      body: "reply keeps server title",
      parentMessageId: rootMessageId,
      replyToMessageId: rootMessageId,
      replyToAuthor: "spoofed author",
    });
    assert.equal(replyComment.statusCode, 200);
    const replyPayload = replyComment.json() as {
      commentThread: { targetTitle: string; messages: Array<{ id: string; body: string; replyToMessageId?: string; replyToAuthor?: string }> };
    };
    assert.equal(replyPayload.commentThread.targetTitle, objective.title);
    const replyMessage = replyPayload.commentThread.messages.find((message) => message.body === "reply keeps server title");
    assert.ok(replyMessage?.id);
    assert.equal(replyMessage?.replyToMessageId, rootMessageId);
    assert.equal(replyMessage?.replyToAuthor, fixture.challenger.name);

    const nestedReply = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: "nested reply survives without dangling pointer",
      parentMessageId: rootMessageId,
      replyToMessageId: replyMessage.id,
      replyToAuthor: "spoofed nested author",
    });
    assert.equal(nestedReply.statusCode, 200);

    const deleteReply = await apiInject(
      app,
      fixture.challenger,
      "DELETE",
      `/api/comments/${encodeURIComponent(challengerCommentPayload.commentThread.id)}/messages/${encodeURIComponent(replyMessage.id)}`,
    );
    assert.equal(deleteReply.statusCode, 200);
    const deleteReplyPayload = deleteReply.json() as {
      commentThread: { messages: Array<{ body: string; replyToMessageId?: string; replyToAuthor?: string }> };
    };
    const nestedAfterDelete = deleteReplyPayload.commentThread.messages.find((message) => message.body === "nested reply survives without dangling pointer");
    assert.equal(nestedAfterDelete?.replyToMessageId, undefined);
    assert.equal(nestedAfterDelete?.replyToAuthor, undefined);

    const brokenReply = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: "broken reply target should fail",
      parentMessageId: rootMessageId,
      replyToMessageId: `${fixture.prefix}-missing-message`,
      replyToAuthor: "Ghost",
    });
    assert.equal(brokenReply.statusCode, 404);
  });
});

test("concurrent comments on the same target share one open thread", async () => {
  const fixture = await createFixture("api-comment-thread-race");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "concurrent comment target");

  await withApiServer(fixture, async (app) => {
    const [firstComment, secondComment] = await Promise.all([
      apiInject(app, fixture.challenger, "POST", "/api/comments", {
        targetType: "objective",
        targetId: objective.id,
        targetTitle: "spoofed concurrent title",
        body: "concurrent root comment A",
      }),
      apiInject(app, fixture.commander, "POST", "/api/comments", {
        targetType: "objective",
        targetId: objective.id,
        targetTitle: "spoofed concurrent title",
        body: "concurrent root comment B",
      }),
    ]);

    assert.equal(firstComment.statusCode, 200);
    assert.equal(secondComment.statusCode, 200);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  const threads = data.comments.filter((thread) => thread.targetType === "objective" && thread.targetId === objective.id && thread.status === "open");
  assert.equal(threads.length, 1);
  assert.equal(threads[0]?.targetTitle, objective.title);
  assert.deepEqual(
    threads[0]?.messages.map((message) => message.body).sort(),
    ["concurrent root comment A", "concurrent root comment B"],
  );
});

test("feedback creation is scoped to administrators and objective challengers", async () => {
  const fixture = await createFixture("api-feedback-create-boundary");
  const { result } = await createApprovedObjectiveWithResult(fixture);

  await withApiServer(fixture, async (app) => {
    const feedbackPayload = {
      phenomenon: `${fixture.prefix} scoped feedback creation`,
      causeCategories: ["Quality"],
      impact: "High",
      linkedResultId: result.id,
      suggestedAdjustment: "Keep feedback creation scoped to visible challenge data.",
      source: "Team review",
      owner: fixture.challenger.name,
    };

    const observerAttempt = await apiInject(app, fixture.observer, "POST", "/api/feedback", feedbackPayload);
    assert.equal(observerAttempt.statusCode, 403);

    const challengerAttempt = await apiInject(app, fixture.challenger, "POST", "/api/feedback", feedbackPayload);
    assert.equal(challengerAttempt.statusCode, 200);

    const adminAttempt = await apiInject(app, fixture.commander, "POST", "/api/feedback", {
      ...feedbackPayload,
      phenomenon: `${fixture.prefix} admin feedback creation`,
      owner: fixture.commander.name,
    });
    assert.equal(adminAttempt.statusCode, 200);

    const data = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(data.feedback.filter((item) => item.linkedResultId === result.id).length, 2);
  });
});

test("feedback creation only accepts active members in scope as owners", async () => {
  const fixture = await createFixture("api-feedback-owner-boundary");
  const { result } = await createApprovedObjectiveWithResult(fixture);
  await db.update(users).set({ status: "disabled" }).where(eq(users.id, fixture.observer.id));

  await withApiServer(fixture, async (app) => {
    const feedbackPayload = {
      phenomenon: `${fixture.prefix} active owner feedback creation`,
      causeCategories: ["Quality"],
      impact: "High",
      linkedResultId: result.id,
      suggestedAdjustment: "Keep feedback ownership bound to active members in scope.",
      source: "Team review",
      owner: fixture.challenger.name,
    };

    const disabledOwnerAttempt = await apiInject(app, fixture.commander, "POST", "/api/feedback", {
      ...feedbackPayload,
      owner: fixture.observer.name,
    });
    assert.equal(disabledOwnerAttempt.statusCode, 409);

    const missingOwnerAttempt = await apiInject(app, fixture.commander, "POST", "/api/feedback", {
      ...feedbackPayload,
      owner: `${fixture.prefix} Missing Owner`,
    });
    assert.equal(missingOwnerAttempt.statusCode, 409);

    const activeOwnerAttempt = await apiInject(app, fixture.commander, "POST", "/api/feedback", feedbackPayload);
    assert.equal(activeOwnerAttempt.statusCode, 200);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  assert.deepEqual(data.feedback.filter((item) => item.linkedResultId === result.id).map((item) => item.owner), [fixture.challenger.name]);
});

test("feedback status API writes require an administrator, creator, or owner", async () => {
  const fixture = await createFixture("api-feedback-status-boundary");
  const { result } = await createApprovedObjectiveWithResult(fixture);

  await withApiServer(fixture, async (app) => {
    const created = await apiInject(app, fixture.challenger, "POST", "/api/feedback", {
      phenomenon: `${fixture.prefix} scoped feedback status`,
      causeCategories: ["Quality"],
      impact: "High",
      linkedResultId: result.id,
      suggestedAdjustment: "Keep feedback status changes scoped to responsible users.",
      source: "Team review",
      owner: fixture.challenger.name,
    });
    assert.equal(created.statusCode, 200);
    const createdPayload = created.json() as { feedback: { id: string; status: string; createdBy?: string | null; owner: string } };
    assert.equal(createdPayload.feedback.createdBy, fixture.challenger.id);
    assert.equal(createdPayload.feedback.owner, fixture.challenger.name);

    const observerAttempt = await apiInject(app, fixture.observer, "PATCH", `/api/feedback/${encodeURIComponent(createdPayload.feedback.id)}/status`, {
      status: "Closed",
    });
    assert.equal(observerAttempt.statusCode, 403);
    const afterForbidden = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(afterForbidden.feedback.find((item) => item.id === createdPayload.feedback.id)?.status, "New");

    const creatorAttempt = await apiInject(app, fixture.challenger, "PATCH", `/api/feedback/${encodeURIComponent(createdPayload.feedback.id)}/status`, {
      status: "Reviewing",
    });
    assert.equal(creatorAttempt.statusCode, 200);

    const adminAttempt = await apiInject(app, fixture.commander, "PATCH", `/api/feedback/${encodeURIComponent(createdPayload.feedback.id)}/status`, {
      status: "Closed",
    });
    assert.equal(adminAttempt.statusCode, 200);

    const afterAllowed = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(afterAllowed.feedback.find((item) => item.id === createdPayload.feedback.id)?.status, "Closed");
  });
});

test("loot submission and settlement are safe under concurrent duplicate requests", async () => {
  const fixture = await createFixture("concurrent-loot-review");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture);
  assert.equal((await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id)).status, "ok");

  const [firstLoot, secondLoot] = await Promise.all([
    submitObjectiveLoot(
      objective.id,
      { body: "concurrent loot A", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done A" }] },
      { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
    ),
    submitObjectiveLoot(
      objective.id,
      { body: "concurrent loot B", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done B" }] },
      { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
    ),
  ]);
  assert.deepEqual([firstLoot.status, secondLoot.status].sort(), ["closed", "ok"]);

  const submittedData = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(submittedData.objectiveLoot.filter((item) => item.objectiveId === objective.id).length, 1);

  const [firstReview, secondReview] = await Promise.all([
    reviewObjectiveLoot(
      objective.id,
      { resultReviews: [{ resultId: result.id, acceptedResult: "completed" }], reason: "concurrent review A" },
      fixture.commander.id,
    ),
    reviewObjectiveLoot(
      objective.id,
      { resultReviews: [{ resultId: result.id, acceptedResult: "completed" }], reason: "concurrent review B" },
      fixture.commander.id,
    ),
  ]);
  assert.deepEqual([firstReview.status, secondReview.status].sort(), ["invalid", "ok"]);

  const settledData = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(settledData.pointLedger.filter((item) => item.objectiveId === objective.id).length, 1);
  assert.equal(settledData.objectives.find((item) => item.id === objective.id)?.flowStatus, "settled");
});

test("API result management routes keep privileged operations behind role permissions", async () => {
  const fixture = await createFixture("api-result-permissions");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture);

  await withApiServer(fixture, async (app) => {
    const memberManagerDefined = await postResult(app, fixture.challenger, objective.id, {
      title: `${fixture.prefix} member manager-defined metric`,
      metricName: "Manager-defined attempt",
      source: "managerDefined",
    });
    assert.equal(memberManagerDefined.statusCode, 403);

    const adminManagerDefined = await postResult(app, fixture.commander, objective.id, {
      title: `${fixture.prefix} admin manager-defined metric`,
      metricName: "Admin metric",
      source: "managerDefined",
    });
    assert.equal(adminManagerDefined.statusCode, 200);

    const memberConfidence = await apiInject(app, fixture.challenger, "PATCH", `/api/results/${encodeURIComponent(result.id)}/confidence`, {
      confidence: 80,
    });
    assert.equal(memberConfidence.statusCode, 403);

    const memberUpdateProposal = await apiInject(app, fixture.challenger, "POST", `/api/results/${encodeURIComponent(result.id)}/update-proposal`, {
      title: "unauthorized proposal",
      reason: "member lacks result.edit",
    });
    assert.equal(memberUpdateProposal.statusCode, 403);

    const memberOrder = await apiInject(app, fixture.challenger, "PATCH", `/api/results/${encodeURIComponent(result.id)}/order`, {
      referenceResultId: result.id,
      placement: "after",
    });
    assert.equal(memberOrder.statusCode, 403);

    const memberDelete = await apiInject(app, fixture.challenger, "DELETE", `/api/results/${encodeURIComponent(result.id)}`);
    assert.equal(memberDelete.statusCode, 403);
  });
});

test("API visual settings write routes are administrator-only", async () => {
  const fixture = await createFixture("api-settings-permissions");

  await withApiServer(fixture, async (app) => {
    const memberList = await apiInject(app, fixture.challenger, "GET", "/api/settings/visual/backgrounds?scene=login_background");
    assert.equal(memberList.statusCode, 200);

    const memberUpload = await apiInject(app, fixture.challenger, "POST", "/api/settings/visual/backgrounds");
    assert.equal(memberUpload.statusCode, 403);

    const backgroundId = encodeURIComponent("login_background/default/orf-login-sky-adventure.png");
    const memberDefault = await apiInject(app, fixture.challenger, "PUT", `/api/settings/visual/backgrounds/${backgroundId}/default`);
    assert.equal(memberDefault.statusCode, 403);

    const memberConfig = await apiInject(app, fixture.challenger, "PUT", "/api/settings/visual/background-config", {
      scene: "login_background",
      config: {
        mode: "switchable",
        fixedBackgroundId: null,
        switchTrigger: "on_open",
        switchOrder: "sequential",
        switchIntervalMinutes: 1,
      },
    });
    assert.equal(memberConfig.statusCode, 403);
  });
});

test("visual background read routes only expose login assets publicly", async () => {
  const fixture = await createFixture("visual-background-read-scope");

  await withApiServer(fixture, async (app) => {
    const publicLoginList = await app.inject({
      method: "GET",
      url: "/api/settings/visual/backgrounds?scene=login_background",
    });
    assert.equal(publicLoginList.statusCode, 200);

    const publicSidebarList = await app.inject({
      method: "GET",
      url: "/api/settings/visual/backgrounds?scene=sidebar_background",
    });
    assert.equal(publicSidebarList.statusCode, 401);

    const memberSidebarList = await apiInject(app, fixture.challenger, "GET", "/api/settings/visual/backgrounds?scene=sidebar_background");
    assert.equal(memberSidebarList.statusCode, 200);

    const publicLoginFile = await app.inject({
      method: "GET",
      url: "/settings/backgrounds/login_background/default/orf-login-sky-adventure.png",
    });
    assert.equal(publicLoginFile.statusCode, 200);

    const publicSidebarFile = await app.inject({
      method: "GET",
      url: "/settings/backgrounds/sidebar_background/default/sidebar-character-guide-bg.png",
    });
    assert.equal(publicSidebarFile.statusCode, 401);

    const memberSidebarFile = await apiInject(
      app,
      fixture.challenger,
      "GET",
      "/settings/backgrounds/sidebar_background/default/sidebar-character-guide-bg.png",
    );
    assert.equal(memberSidebarFile.statusCode, 200);
  });
});

test("repository result mutations are locked by objective lifecycle state", async () => {
  const fixture = await createFixture("repository-result-lifecycle-locks");

  for (const flowStatus of ["frozen", "submitted", "settled"] as const) {
    const { objective, result, referenceResult } = await createObjectiveWithLockedResults(fixture, flowStatus);

    const createdAfterLock = await createResult({
      objectiveId: objective.id,
      title: `${fixture.prefix} ${flowStatus} direct create should fail`,
      metricName: `${flowStatus} direct create metric`,
      uncertaintyLevel: "入门",
      definer: fixture.commander.name,
    });
    assert.equal(createdAfterLock, null);

    assert.equal(await updateResultTitle(result.id, `${fixture.prefix} ${flowStatus} direct title should fail`), false);
    assert.equal(await updateResultConfidence(result.id, 99, fixture.commander.id), false);
    assert.equal(
      await proposeResultUpdate(
        {
          resultId: result.id,
          title: `${fixture.prefix} ${flowStatus} proposal should fail`,
          reason: "Repository-level lifecycle lock should reject direct calls.",
        },
        { id: fixture.commander.id, name: fixture.commander.name },
      ),
      false,
    );
    assert.equal(await moveResult(result.id, referenceResult.id, "after"), false);
    assert.equal(await deleteResult(result.id), false);

    const data = await getTaskManagementData({ scope: fixture.scope });
    const unchangedObjective = data.objectives.find((item) => item.id === objective.id);
    assert.equal(unchangedObjective?.flowStatus, flowStatus);
    assert.equal(data.results.find((item) => item.id === result.id)?.title, result.title);
    assert.equal(data.results.find((item) => item.id === result.id)?.confidence, result.confidence);
    assert.deepEqual(
      data.results.filter((item) => item.objectiveId === objective.id).map((item) => item.id),
      [result.id, referenceResult.id],
    );
  }
});

test("concurrent freezing and deleting the last result cannot leave a frozen objective without metrics", async () => {
  const fixture = await createFixture("freeze-delete-last-result-race");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, "freeze delete last result race");

  const [freezeOutcome, deleted] = await Promise.all([
    freezeObjectiveAfterReestimate(objective.id, fixture.commander.id),
    deleteResult(result.id),
  ]);

  assert.equal(freezeOutcome.status === "ok", !deleted);
  const data = await getTaskManagementData({ scope: fixture.scope });
  const refreshedObjective = data.objectives.find((item) => item.id === objective.id);
  const remainingResults = data.results.filter((item) => item.objectiveId === objective.id);
  assert.ok(refreshedObjective);
  assert.equal(refreshedObjective.flowStatus === "frozen" && remainingResults.length === 0, false);
  if (refreshedObjective.flowStatus === "frozen") {
    assert.equal(remainingResults.length, 1);
  }
});

test("API result and submitted objective mutations are locked by lifecycle state", async () => {
  const fixture = await createFixture("api-lifecycle-locks");

  const { objective: frozenObjective, result: frozenResult } = await createApprovedObjectiveWithResult(fixture, "locked frozen objective");
  await createTestResult(frozenObjective.id, fixture.commander.name, `${fixture.prefix} locked frozen reference result`);
  assert.equal((await freezeObjectiveAfterReestimate(frozenObjective.id, fixture.commander.id)).status, "ok");

  const { objective: submittedObjective, result: submittedResult } = await createApprovedObjectiveWithResult(fixture, "locked submitted objective");
  assert.equal((await freezeObjectiveAfterReestimate(submittedObjective.id, fixture.commander.id)).status, "ok");
  const submittedLoot = await submitObjectiveLoot(
    submittedObjective.id,
    { body: "Submitted lock loot.", resultClaims: [{ resultId: submittedResult.id, claim: "completed", evidenceText: "done" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(submittedLoot.status, "ok");

  const { objective: settlementObjective, result: settledResult } = await createApprovedObjectiveWithResult(fixture, "locked settled objective");
  const settledReferenceResult = await createTestResult(settlementObjective.id, fixture.commander.name, `${fixture.prefix} locked settled reference result`);
  assert.equal((await freezeObjectiveAfterReestimate(settlementObjective.id, fixture.commander.id)).status, "ok");
  const settledLoot = await submitObjectiveLoot(
    settlementObjective.id,
    {
      body: "Settlement lock loot.",
      resultClaims: [
        { resultId: settledResult.id, claim: "completed", evidenceText: "done" },
        { resultId: settledReferenceResult.id, claim: "completed", evidenceText: "done" },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(settledLoot.status, "ok");
  const settled = await reviewObjectiveLoot(
    settlementObjective.id,
    {
      lootId: settledLoot.loot.id,
      resultReviews: [
        { resultId: settledResult.id, acceptedResult: "completed" },
        { resultId: settledReferenceResult.id, acceptedResult: "completed" },
      ],
      reason: "Settlement lock review.",
    },
    fixture.commander.id,
  );
  assert.equal(settled.status, "ok");

  await withApiServer(fixture, async (app) => {
    const frozenCreate = await postResult(app, fixture.commander, frozenObjective.id, {
      title: `${fixture.prefix} should not create after freeze`,
      metricName: "Locked metric",
      source: "managerDefined",
    });
    assert.equal(frozenCreate.statusCode, 409);

    const frozenPatch = await patchResultTitle(app, fixture.commander, frozenResult.id, `${fixture.prefix} should not patch after freeze`);
    assert.equal(frozenPatch.statusCode, 409);

    const frozenConfidence = await apiInject(app, fixture.commander, "PATCH", `/api/results/${encodeURIComponent(frozenResult.id)}/confidence`, {
      confidence: 90,
    });
    assert.equal(frozenConfidence.statusCode, 409);

    const frozenProposal = await apiInject(app, fixture.commander, "POST", `/api/results/${encodeURIComponent(frozenResult.id)}/update-proposal`, {
      title: "locked proposal",
      reason: "frozen metrics are immutable",
    });
    assert.equal(frozenProposal.statusCode, 409);

    const frozenDelete = await apiInject(app, fixture.commander, "DELETE", `/api/results/${encodeURIComponent(frozenResult.id)}`);
    assert.equal(frozenDelete.statusCode, 409);

    const submittedDeleteResult = await apiInject(app, fixture.commander, "DELETE", `/api/results/${encodeURIComponent(submittedResult.id)}`);
    assert.equal(submittedDeleteResult.statusCode, 409);

    const submittedDeleteObjective = await apiInject(app, fixture.commander, "DELETE", `/api/objectives/${encodeURIComponent(submittedObjective.id)}`);
    assert.equal(submittedDeleteObjective.statusCode, 409);

    const submittedTask = await apiInject(app, fixture.commander, "POST", "/api/tasks", {
      title: "submitted should not accept new tasks",
      linkedObjectiveId: submittedObjective.id,
      linkedResultId: submittedResult.id,
    });
    assert.equal(submittedTask.statusCode, 403);

    const submittedComment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: submittedObjective.id,
      targetTitle: submittedObjective.title,
      body: "submitted comments remain open",
    });
    assert.equal(submittedComment.statusCode, 200);

    const settledReorder = await apiInject(app, fixture.commander, "PATCH", `/api/results/${encodeURIComponent(settledResult.id)}/order`, {
      referenceResultId: settledReferenceResult.id,
      placement: "after",
    });
    assert.equal(settledReorder.statusCode, 409);

    const settledComment = await apiInject(app, fixture.commander, "POST", "/api/comments", {
      targetType: "objective",
      targetId: settlementObjective.id,
      targetTitle: settlementObjective.title,
      body: "settled should be read only",
    });
    assert.equal(settledComment.statusCode, 403);

    const settledDeleteObjective = await apiInject(app, fixture.commander, "DELETE", `/api/objectives/${encodeURIComponent(settlementObjective.id)}`);
    assert.equal(settledDeleteObjective.statusCode, 409);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  assert.ok(data.results.some((result) => result.id === submittedResult.id), "submitted result should survive rejected delete");
  assert.ok(data.results.some((result) => result.id === settledResult.id), "settled result should survive rejected reorder/delete attempts");
  assert.ok(data.pointLedger.some((entry) => entry.objectiveId === settlementObjective.id), "settlement ledger should survive locked mutations");
  assert.equal(data.objectives.find((objective) => objective.id === submittedObjective.id)?.flowStatus, "submitted");
  assert.equal(data.objectives.find((objective) => objective.id === settlementObjective.id)?.flowStatus, "settled");
});

async function createFixture(label: string) {
  const prefix = `${runId}-${label}`;
  const teamId = `${prefix}-team`;
  const commander = {
    id: `${prefix}-commander`,
    name: `${prefix} Commander`,
    email: `${prefix}-commander@orf.test`,
  };
  const challenger = {
    id: `${prefix}-challenger`,
    name: `${prefix} Challenger`,
    email: `${prefix}-challenger@orf.test`,
  };
  const observer = {
    id: `${prefix}-observer`,
    name: `${prefix} Observer`,
    email: `${prefix}-observer@orf.test`,
  };

  await db.insert(teams).values({ id: teamId, name: `${prefix} Team`, createdAt: "2999-01-01" });
  await db.insert(users).values([
    { id: commander.id, name: commander.name, email: commander.email, status: "active", createdAt: "2999-01-01", lastOnlineAt: null },
    { id: challenger.id, name: challenger.name, email: challenger.email, status: "active", createdAt: "2999-01-01", lastOnlineAt: null },
    { id: observer.id, name: observer.name, email: observer.email, status: "active", createdAt: "2999-01-01", lastOnlineAt: null },
  ]);
  await db.insert(teamMembers).values([
    { teamId, userId: commander.id, role: "admin" },
    { teamId, userId: challenger.id, role: "member" },
    { teamId, userId: observer.id, role: "member" },
  ]);

  return { prefix, teamId, scope: runtimeScope(teamId), commander, challenger, observer };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type FixtureUser = Fixture["commander"];

async function createTestObjective(fixture: Fixture, title: string, finalDueAt = farFutureDueDate) {
  const objective = await createObjective(
    {
      title: `${fixture.prefix} ${title}`,
      whyItMatters: "Test-only ORF backend flow objective.",
      cycle: "2999-Q4",
      boundary: "Test-only objective.",
      finalDueAt,
    },
    { scope: fixture.scope, userId: fixture.commander.id },
  );
  assert.ok(objective);
  return objective;
}

async function createPublishedObjective(fixture: Fixture, title: string, finalDueAt = farFutureDueDate) {
  const objective = await createTestObjective(fixture, title, finalDueAt);
  const published = await publishObjective(objective.id, fixture.commander.id);
  assert.equal(published.status, "ok");
  return published.objective;
}

async function createTestResult(
  objectiveId: string,
  definer: string,
  title: string,
  uncertaintyLevel: UncertaintyLevel = "进阶",
) {
  const result = await createResult({
    objectiveId,
    title,
    metricName: `${title} metric`,
    uncertaintyLevel,
    baseline: 0,
    current: 0,
    target: 1,
    unit: "case",
    direction: "increase",
    definer,
  });
  assert.ok(result);
  return result;
}

async function createApprovedObjectiveWithResult(fixture: Fixture, title = "approved objective") {
  const objective = await createPublishedObjective(fixture, title);
  const result = await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} ${title} result`);
  const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  assert.equal(applied.status, "applied");
  const applicationId = applied.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  assert.ok(applicationId);
  const approved = await approveObjectiveChallengeApplication(objective.id, applicationId, fixture.commander.id);
  assert.equal(approved.status, "ok");
  return { objective: approved.objective, result, applicationId };
}

async function createFrozenObjectiveWithPendingApplication(fixture: Fixture) {
  const objective = await createPublishedObjective(fixture, "frozen with pending application");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} frozen guard result`);

  const challengerApplication = await applyForObjectiveChallenge(objective.id, fixture.challenger.name);
  const observerApplication = await applyForObjectiveChallenge(objective.id, fixture.observer.name);
  assert.equal(challengerApplication.status, "applied");
  assert.equal(observerApplication.status, "applied");
  const challengerApplicationId = challengerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name)?.id;
  const observerApplicationId = observerApplication.objective.challengeApplications.find((item) => item.applicant === fixture.observer.name)?.id;
  assert.ok(challengerApplicationId);
  assert.ok(observerApplicationId);

  const approved = await approveObjectiveChallengeApplication(objective.id, challengerApplicationId, fixture.commander.id);
  assert.equal(approved.status, "ok");
  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");

  return { objective: frozen.objective, challengerApplicationId, observerApplicationId };
}

async function createSettledObjective(
  fixture: Fixture,
  title: string,
  acceptedResult: ObjectiveAcceptedResult = "completed",
) {
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, title);
  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  const loot = await submitObjectiveLoot(
    objective.id,
    { body: "Settled objective loot.", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }] },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");
  const reviewed = await reviewObjectiveLoot(
    objective.id,
    { lootId: loot.loot.id, acceptedResult, resultReviews: [{ resultId: result.id, acceptedResult: "completed" }] },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");
  return { objective: reviewed.objective, result, loot: loot.loot };
}

async function createObjectiveWithLockedResults(
  fixture: Fixture,
  flowStatus: "frozen" | "submitted" | "settled",
) {
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, `${flowStatus} repository result lock objective`);
  const referenceResult = await createTestResult(
    objective.id,
    fixture.commander.name,
    `${fixture.prefix} ${flowStatus} repository result lock reference`,
    "入门",
  );
  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  if (flowStatus === "frozen") {
    return { objective: frozen.objective, result, referenceResult };
  }

  const loot = await submitObjectiveLoot(
    objective.id,
    {
      body: `${flowStatus} repository result lock loot.`,
      resultClaims: [
        { resultId: result.id, claim: "completed", evidenceText: "done" },
        { resultId: referenceResult.id, claim: "completed", evidenceText: "done" },
      ],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");
  if (flowStatus === "submitted") {
    const data = await getTaskManagementData({ scope: fixture.scope });
    const submittedObjective = data.objectives.find((item) => item.id === objective.id);
    assert.ok(submittedObjective);
    return { objective: submittedObjective, result, referenceResult };
  }

  const settled = await reviewObjectiveLoot(
    objective.id,
    {
      lootId: loot.loot.id,
      resultReviews: [
        { resultId: result.id, acceptedResult: "completed" },
        { resultId: referenceResult.id, acceptedResult: "completed" },
      ],
      reason: `${flowStatus} repository result lock settlement.`,
    },
    fixture.commander.id,
  );
  assert.equal(settled.status, "ok");
  return { objective: settled.objective, result, referenceResult };
}

async function withApiServer(fixture: Fixture, run: (app: FastifyInstance) => Promise<void>) {
  return withApiServerForFixtures([fixture], run);
}

async function withApiServerForFixtures(fixtures: Fixture[], run: (app: FastifyInstance) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockOryFetch(fixtures, originalFetch);
  const app = await buildServer({ logger: false, registerOptionalIntegrations: false });

  try {
    await run(app);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

async function withMockOryLogin(identity: { id: string; traits: Record<string, unknown> }, run: () => Promise<void>) {
  await withMockOryPasswordFlow("login", identity, async () => {
    await run();
  });
}

async function withMockOryPasswordFlow(
  flowType: "login" | "registration",
  identity: { id: string; traits: Record<string, unknown> },
  run: (submittedBodies: unknown[]) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const actionUrl = `https://ory.test/self-service/${flowType}?flow=test`;
  const submittedBodies: unknown[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(`/self-service/${flowType}/api`)) {
      return new Response(JSON.stringify({ ui: { action: actionUrl } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === actionUrl && init?.method === "POST") {
      submittedBodies.push(init.body ? JSON.parse(String(init.body)) : null);
      return new Response(
        JSON.stringify({
          session_token: `session-${identity.id}`,
          session: {
            active: true,
            identity,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return originalFetch(input, init);
  }) satisfies typeof fetch;

  try {
    await run(submittedBodies);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function mockOryFetch(fixtures: Fixture[], fallback: typeof fetch): typeof fetch {
  const usersByToken = new Map(
    fixtures.flatMap((fixture) => [
      [fixture.commander.id, fixture.commander] as const,
      [fixture.challenger.id, fixture.challenger] as const,
      [fixture.observer.id, fixture.observer] as const,
    ]),
  );

  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/sessions/whoami")) {
      return fallback(input, init);
    }

    const sessionToken = headerValue(init?.headers, "x-session-token");
    const user = sessionToken ? usersByToken.get(sessionToken) : undefined;
    if (!user) {
      return new Response(JSON.stringify({ active: false }), { status: 401, headers: { "content-type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        active: true,
        identity: {
          id: user.id,
          traits: {
            email: user.email,
            name: user.name,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

function headerValue(headers: HeadersInit | undefined, name: string) {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;

  const normalizedName = name.toLowerCase();
  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === normalizedName)?.[1];
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
  return entry ? String(entry[1]) : undefined;
}

function apiCookie(user: FixtureUser) {
  return `orf_ory_session=${encodeURIComponent(user.id)}`;
}

async function apiInject(
  app: FastifyInstance,
  user: FixtureUser,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { cookie: apiCookie(user) },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function postResult(
  app: FastifyInstance,
  user: FixtureUser,
  objectiveId: string,
  input: Partial<Pick<Result, "title" | "metricName" | "source" | "definer">>,
) {
  return app.inject({
    method: "POST",
    url: "/api/results",
    headers: { cookie: apiCookie(user) },
    payload: {
      objectiveId,
      title: input.title ?? "API-created result",
      metricName: input.metricName ?? "API metric",
      baseline: 0,
      current: 0,
      target: 1,
      unit: "case",
      direction: "increase",
      source: input.source,
      definer: input.definer,
    },
  });
}

async function patchResultTitle(app: FastifyInstance, user: FixtureUser, resultId: string, title: string) {
  return app.inject({
    method: "PATCH",
    url: `/api/results/${encodeURIComponent(resultId)}`,
    headers: { cookie: apiCookie(user) },
    payload: { title },
  });
}

async function expireReestimateWindow(objectiveId: string) {
  await db.update(objectives).set({ confirmationDueAt: expiredConfirmationDueAt }).where(sql`${objectives.id} = ${objectiveId}`);
}

async function setFutureReestimateWindow(objectiveId: string) {
  await db.update(objectives).set({ confirmationDueAt: "2999-01-01T00:00:00.000Z" }).where(sql`${objectives.id} = ${objectiveId}`);
}

async function cleanupRun() {
  await db.delete(teams).where(sql`${teams.id} like ${`${runId}%`}`);
  await db.delete(users).where(sql`${users.id} like ${`${runId}%`}`);
}
