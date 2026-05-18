import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { buildServer } from "../server/app";
import { closeDb, db } from "../server/db/client";
import { objectives, teams, teamMembers, users } from "../server/db/schema";
import type { ObjectiveAcceptedResult, Result, UncertaintyLevel } from "../src/types/orf";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canEditObjectiveResultsDuringReestimate,
  createObjective,
  createResult,
  declineObjectiveChallenge,
  freezeObjectiveAfterReestimate,
  getBountyHallData,
  getMyChallengesData,
  getTaskManagementData,
  publishObjective,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reopenObjectiveReestimate,
  reviewObjectiveLoot,
  submitObjectiveContributionReview,
  submitObjectiveLoot,
} from "../server/repositories/orfRepository";

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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
  );
  assert.ok(objective);
  assert.equal(objective.flowStatus, "candidate");

  const result = await createResult({
    objectiveId: objective.id,
    title: `${fixture.prefix} application result`,
    metricName: "Flow completion",
    description: "A test-only bounty result.",
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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
    "pending",
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
    "pending",
  );
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

  const openObjective = await createPublishedObjective(fixture, "duplicate application guard");
  const firstApply = await applyForObjectiveChallenge(openObjective.id, fixture.observer.name);
  assert.equal(firstApply.status, "applied");
  const duplicateApply = await applyForObjectiveChallenge(openObjective.id, fixture.observer.name);
  assert.equal(duplicateApply.status, "alreadyApplied");

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

test("API flow commands enforce commander-only permissions and challenge list scope", async () => {
  const fixture = await createFixture("api-flow-permissions");
  const candidate = await createTestObjective(fixture, "api publish permission");
  const objective = await createPublishedObjective(fixture, "api flow permission");
  assert.equal((await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id)).status, "ok");
  const reviewObjective = await createPublishedObjective(fixture, "api review permission");

  await withApiServer(fixture, async (app) => {
    const memberPublish = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}/publish`);
    assert.equal(memberPublish.statusCode, 403);

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
    { id: commander.id, name: commander.name, email: commander.email, status: "active", createdAt: "2999-01-01", lastLoginAt: null },
    { id: challenger.id, name: challenger.name, email: challenger.email, status: "active", createdAt: "2999-01-01", lastLoginAt: null },
    { id: observer.id, name: observer.name, email: observer.email, status: "active", createdAt: "2999-01-01", lastLoginAt: null },
  ]);
  await db.insert(teamMembers).values([
    { teamId, userId: commander.id, role: "admin" },
    { teamId, userId: challenger.id, role: "member" },
    { teamId, userId: observer.id, role: "member" },
  ]);

  return { prefix, teamId, commander, challenger, observer };
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
    { teamId: fixture.teamId, userId: fixture.commander.id },
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

async function withApiServer(fixture: Fixture, run: (app: FastifyInstance) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockOryFetch(fixture, originalFetch);
  const app = await buildServer({ logger: false, registerOptionalIntegrations: false });

  try {
    await run(app);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

function mockOryFetch(fixture: Fixture, fallback: typeof fetch): typeof fetch {
  const usersByToken = new Map([
    [fixture.commander.id, fixture.commander],
    [fixture.challenger.id, fixture.challenger],
    [fixture.observer.id, fixture.observer],
  ]);

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
  method: "GET" | "POST" | "PATCH" | "DELETE",
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
