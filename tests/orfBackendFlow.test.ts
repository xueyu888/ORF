import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { buildServer } from "../server/app";
import { loginWithPassword } from "../server/auth/ory";
import { closeDb, db } from "../server/db/client";
import { objectives, results as resultRows, taskChecklistItems, tasks as taskRows, teams, teamMembers, users } from "../server/db/schema";
import { subscribeRealtimeEvents } from "../server/realtime/realtimeEventBus";
import type { ObjectiveAcceptedResult, Result, Task, UncertaintyLevel } from "../src/types/orf";
import type { RealtimeEvent } from "../src/types/realtime";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge as applyForObjectiveChallengeRepository,
  approveObjectiveChallengeApplication,
  canEditObjectiveResultsDuringReestimate,
  createChecklistItem,
  createObjective,
  createResult,
  createTask,
  deleteResult,
  freezeObjectiveAfterReestimate,
  getBountyHallData,
  getMyChallengesData,
  getTaskManagementData,
  moveResult,
  publishObjective,
  proposeResultUpdate,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reviewObjectiveLoot,
  submitObjectiveLoot,
  reviewObjectiveTrialReview,
  submitObjectiveTrialReview,
  updateObjectiveDetails,
  updateResultConfidence,
  updateResultTitle,
} from "../server/repositories/orfRepository";
import { listNotificationsForUser } from "../server/repositories/notificationRepository";
import { runtimeScope } from "../server/repositories/runtimeScope";

const runId = `test-orf-flow-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const farFutureDueDate = "2999-12-31";
const expiredConfirmationDueAt = "2000-01-01T00:00:00.000Z";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0p8WQAAAABJRU5ErkJggg==",
  "base64",
);

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

  const challengerRealtimeEvents: RealtimeEvent[] = [];
  const unsubscribeChallenger = subscribeRealtimeEvents({
    teamId: fixture.teamId,
    userId: fixture.challenger.id,
    send: (event) => challengerRealtimeEvents.push(event),
  });
  const commanderRealtimeEvents: RealtimeEvent[] = [];
  const unsubscribeCommander = subscribeRealtimeEvents({
    teamId: fixture.teamId,
    userId: fixture.commander.id,
    send: (event) => commanderRealtimeEvents.push(event),
  });
  const published = await publishObjective(objective.id, fixture.commander.id);
  unsubscribeChallenger();
  unsubscribeCommander();
  assert.equal(published.status, "ok");
  assert.equal(published.objective.flowStatus, "open");
  assert.ok(published.objective.publishedAt, "publishing should stamp the bounty-hall publication date");
  const challengerNotificationEvent = challengerRealtimeEvents.filter((event) => event.kind === "notification.created")[0];
  const challengerBroadcastEvent = challengerRealtimeEvents.filter((event) => event.kind === "system.broadcast")[0];
  const commanderBroadcastEvent = commanderRealtimeEvents.filter((event) => event.kind === "system.broadcast")[0];
  assert.equal(challengerNotificationEvent?.notification.kind, "objective.published");
  assert.equal(challengerNotificationEvent?.notification.targetHref, `/bounties#objective:${encodeURIComponent(objective.id)}`);
  assert.equal(challengerBroadcastEvent?.broadcast.notificationKind, "objective.published");
  assert.equal(challengerBroadcastEvent?.broadcast.targetHref, `/bounties#objective:${encodeURIComponent(objective.id)}`);
  assert.equal(commanderBroadcastEvent?.broadcast.notificationKind, "objective.published");
  assert.equal(commanderBroadcastEvent?.broadcast.targetHref, `/bounties#objective:${encodeURIComponent(objective.id)}`);
  assert.equal(commanderRealtimeEvents.some((event) => event.kind === "notification.created"), false);

  const challengerNotifications = await listNotificationsForUser(fixture.challenger.id, fixture.scope);
  assert.equal(challengerNotifications[0]?.kind, "objective.published");
  assert.equal(challengerNotifications[0]?.targetId, objective.id);
  assert.equal(challengerNotifications[0]?.readAt, null);
  const commanderNotifications = await listNotificationsForUser(fixture.commander.id, fixture.scope);
  assert.equal(commanderNotifications.some((notification) => notification.kind === "objective.published"), false);

  const hall = await getBountyHallData(fixture.challenger.name);
  const item = hall.availableItems.find((item) => item.objective.id === objective.id);
  assert.ok(item, "a published Objective should not require a commander-defined Result to be visible");
  assert.equal(item.objective.publishedAt, published.objective.publishedAt);
  assert.equal(item.result, null);
  assert.deepEqual(item.results, []);
  assert.equal(item.uncertaintyPoints, 0);

  const commanderHall = await getBountyHallData(fixture.commander.name, { scope: fixture.scope }, "admin");
  const commanderItem = commanderHall.availableItems.find((item) => item.objective.id === objective.id);
  assert.ok(commanderItem, "commanders should see the same published Objective in the bounty hall");
  assert.equal(commanderItem.hasCurrentApplication, false);
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

  const commanderHall = await getBountyHallData(fixture.commander.name, { scope: fixture.scope }, "admin");
  assert.ok(
    commanderHall.availableItems.find((item) => item.objective.id === objective.id),
    "commanders should see recruiting Objectives without becoming the recruited actor",
  );
  assert.equal(commanderHall.recruitmentItems.some((item) => item.objective.id === objective.id), false);
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

  const commanderApplicationEvents: RealtimeEvent[] = [];
  const unsubscribeCommanderApplication = subscribeRealtimeEvents({
    teamId: fixture.teamId,
    userId: fixture.commander.id,
    send: (event) => commanderApplicationEvents.push(event),
  });
  const challengerApplicationEvents: RealtimeEvent[] = [];
  const unsubscribeChallengerApplication = subscribeRealtimeEvents({
    teamId: fixture.teamId,
    userId: fixture.challenger.id,
    send: (event) => challengerApplicationEvents.push(event),
  });
  const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id, "我来承接这个测试目标。");
  unsubscribeCommanderApplication();
  unsubscribeChallengerApplication();
  assert.equal(applied.status, "applied");
  assert.equal(applied.objective.flowStatus, "applying");
  assert.equal(await canEditObjectiveResultsDuringReestimate(objective.id, fixture.challenger.name), false);
  const applicationId = applied.objective.challengeApplications.find((application) => application.applicant === fixture.challenger.name)?.id;
  assert.ok(applicationId);
  const commanderApplicationInvalidation = commanderApplicationEvents.find(
    (event) => event.kind === "orf.read-model.invalidated" && event.invalidation.reason === "objective.challenge.application.changed",
  );
  assert.equal(commanderApplicationInvalidation?.invalidation.reason, "objective.challenge.application.changed");
  assert.deepEqual(commanderApplicationInvalidation?.invalidation.models, ["taskManagement", "bountyHall"]);
  assert.equal(commanderApplicationInvalidation?.invalidation.target?.type, "objective");
  assert.equal(commanderApplicationInvalidation?.invalidation.target?.id, objective.id);
  const challengerApplicationInvalidation = challengerApplicationEvents.find(
    (event) => event.kind === "orf.read-model.invalidated" && event.invalidation.reason === "objective.challenge.application.changed",
  );
  assert.equal(challengerApplicationInvalidation?.invalidation.reason, "objective.challenge.application.changed");
  const applicationNotifications = await listNotificationsForUser(fixture.commander.id, fixture.scope);
  assert.equal(applicationNotifications[0]?.kind, "challenge.application.created");
  assert.equal(applicationNotifications[0]?.targetId, objective.id);
  assert.equal(applicationNotifications[0]?.targetHref, `/tasks#objective:${encodeURIComponent(objective.id)}`);
  assert.equal(applicationNotifications[0]?.readAt, null);

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
  const approvalNotifications = (await listNotificationsForUser(fixture.challenger.id, fixture.scope)).filter(
    (notification) => notification.kind === "challenge.application.approved",
  );
  assert.equal(approvalNotifications[0]?.targetHref, `/bounties#objective:${encodeURIComponent(objective.id)}`);

  const hallAfterApproval = await getBountyHallData(fixture.challenger.name, { scope: fixture.scope });
  const publicApprovalItem = hallAfterApproval.publicItems.find((item) => item.objective.id === objective.id);
  assert.ok(publicApprovalItem, "approved objectives remain visible in the public bounty hall");
  assert.equal(publicApprovalItem.isCurrentChallenger, true);
  assert.deepEqual(publicApprovalItem.challengers, [fixture.challenger.name]);
  assert.equal(publicApprovalItem.applications.find((application) => application.id === applicationId)?.status, "approved");
  assert.equal(hallAfterApproval.availableItems.some((item) => item.objective.id === objective.id), false);

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
  const lootNotifications = await listNotificationsForUser(fixture.commander.id, fixture.scope);
  assert.equal(lootNotifications[0]?.kind, "objective.loot.submitted");
  assert.equal(lootNotifications[0]?.targetId, loot.loot.id);

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

test("notification API scopes messages to the current recipient and supports read state", async () => {
  const fixture = await createFixture("notification-api");
  const objective = await createPublishedObjective(fixture, "notification API objective");

  const applied = await applyForObjectiveChallenge(objective.id, fixture.challenger.name, fixture.challenger.id);
  assert.equal(applied.status, "applied");

  await withApiServer(fixture, async (app) => {
    const challengerList = await apiInject(app, fixture.challenger, "GET", "/api/notifications");
    assert.equal(challengerList.statusCode, 200);
    const challengerPayload = challengerList.json() as { notifications: Array<{ id: string; kind: string; readAt: string | null }>; unreadCount: number };
    assert.equal(challengerPayload.unreadCount, 1);
    assert.equal(challengerPayload.notifications[0]?.kind, "objective.published");

    const commanderList = await apiInject(app, fixture.commander, "GET", "/api/notifications");
    assert.equal(commanderList.statusCode, 200);
    const commanderPayload = commanderList.json() as { notifications: Array<{ id: string; kind: string; readAt: string | null }>; unreadCount: number };
    assert.equal(commanderPayload.unreadCount, 1);
    assert.equal(commanderPayload.notifications[0]?.kind, "challenge.application.created");

    const read = await apiInject(app, fixture.commander, "PATCH", `/api/notifications/${encodeURIComponent(commanderPayload.notifications[0]!.id)}/read`);
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().unreadCount, 0);

    const missingForChallenger = await apiInject(app, fixture.challenger, "PATCH", `/api/notifications/${encodeURIComponent(commanderPayload.notifications[0]!.id)}/read`);
    assert.equal(missingForChallenger.statusCode, 404);
  });
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
  const recruitmentNotifications = (await listNotificationsForUser(fixture.challenger.id, fixture.scope)).filter(
    (notification) => notification.kind === "objective.recruitment.created",
  );
  assert.equal(recruitmentNotifications[0]?.targetId, objective.id);
  assert.equal(recruitmentNotifications[0]?.targetHref, `/bounties#objective:${encodeURIComponent(objective.id)}`);

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
  const acceptanceNotifications = await listNotificationsForUser(fixture.commander.id, fixture.scope);
  assert.equal(acceptanceNotifications[0]?.kind, "objective.challenge.accepted");
  assert.equal(acceptanceNotifications[0]?.targetId, objective.id);
  assert.equal(acceptanceNotifications[0]?.metadata.challenger, fixture.challenger.name);

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

test("challenge participant entrypoints reject administrators", async () => {
  const fixture = await createFixture("admin-challenger-guard");
  const objective = await createPublishedObjective(fixture, "admin cannot become challenger");
  await createTestResult(objective.id, fixture.commander.name, `${fixture.prefix} admin challenger guard result`);

  const adminApplication = await applyForObjectiveChallenge(objective.id, fixture.commander.name, fixture.commander.id);
  assert.equal(adminApplication.status, "forbidden");

  const adminRecruitment = await recruitObjectiveChallengers(objective.id, [fixture.commander.name], fixture.commander.id);
  assert.equal(adminRecruitment.status, "invalid");

  await db
    .update(objectives)
    .set({
      assignedChallengers: [fixture.commander.name],
      flowStatus: "recruiting",
    })
    .where(eq(objectives.id, objective.id));
  const adminAcceptance = await acceptObjectiveChallenge(objective.id, fixture.commander.name, fixture.commander.id);
  assert.equal(adminAcceptance.status, "forbidden");

  const applicationObjective = await createPublishedObjective(fixture, "admin application cannot be approved");
  const applicationId = `${fixture.prefix}-admin-application`;
  await db
    .update(objectives)
    .set({
      challengeApplications: [
        {
          id: applicationId,
          applicant: fixture.commander.name,
          status: "pending",
          createdAt: "2999-01-01T00:00:00.000Z",
          decidedAt: null,
        },
      ],
      flowStatus: "applying",
    })
    .where(eq(objectives.id, applicationObjective.id));
  const adminApproval = await approveObjectiveChallengeApplication(applicationObjective.id, applicationId, fixture.commander.id);
  assert.equal(adminApproval.status, "invalid");

  await withApiServer(fixture, async (app) => {
    const bounties = await apiInject(app, fixture.commander, "GET", "/api/bounties");
    assert.equal(bounties.statusCode, 200);
    const bountyPayload = bounties.json() as {
      availableItems: Array<{ hasCurrentApplication: boolean; objective: { id: string } }>;
      recruitmentItems: Array<{ objective: { id: string } }>;
    };
    const visibleApplicationObjective = bountyPayload.availableItems.find((item) => item.objective.id === applicationObjective.id);
    assert.ok(visibleApplicationObjective, "commanders should see bounty hall entries instead of receiving an empty list");
    assert.equal(visibleApplicationObjective.hasCurrentApplication, false);

    const response = await apiInject(app, fixture.commander, "POST", `/api/objectives/${encodeURIComponent(applicationObjective.id)}/challenge-applications`);
    assert.equal(response.statusCode, 403);

    const acceptance = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/challenge`);
    assert.equal(acceptance.statusCode, 403);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  const refreshed = data.objectives.find((item) => item.id === applicationObjective.id);
  assert.equal(refreshed?.challengers.includes(fixture.commander.name), false);
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

  const observerHall = await getBountyHallData(fixture.observer.name, { scope: fixture.scope });
  const publicItem = observerHall.publicItems.find((item) => item.objective.id === objective.id);
  assert.ok(publicItem, "accepted objectives stay visible with both approved challengers and pending applicants");
  assert.deepEqual(publicItem.challengers, [fixture.challenger.name]);
  assert.deepEqual(publicItem.pendingApplications.map((application) => application.applicant), [fixture.observer.name]);

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

test("concurrent recruitment acceptances preserve every member transition", async () => {
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
});

test("recruitment decline is not an available API action", async () => {
  const fixture = await createFixture("decline-disabled-guard");
  const objective = await createPublishedObjective(fixture, "decline disabled guard");

  const recruited = await recruitObjectiveChallengers(objective.id, [fixture.challenger.name], fixture.commander.id);
  assert.equal(recruited.status, "ok");

  await withApiServer(fixture, async (app) => {
    const decline = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(objective.id)}/challenge/decline`);
    assert.equal(decline.statusCode, 404);
  });

  const data = await getTaskManagementData({ scope: fixture.scope });
  const unchanged = data.objectives.find((item) => item.id === objective.id);
  assert.equal(unchanged?.flowStatus, "recruiting");
  assert.deepEqual(unchanged?.assignedChallengers, [fixture.challenger.name]);
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

test("freeze rejects invalid source states and stays closed after freezing", async () => {
  const fixture = await createFixture("freeze-source-state-guards");
  const candidate = await createTestObjective(fixture, "candidate freeze guard");
  assert.equal((await freezeObjectiveAfterReestimate(candidate.id, fixture.commander.id)).status, "invalid");

  const applying = await createPublishedObjective(fixture, "applying freeze guard");
  assert.equal((await applyForObjectiveChallenge(applying.id, fixture.challenger.name)).status, "applied");
  assert.equal((await freezeObjectiveAfterReestimate(applying.id, fixture.commander.id)).status, "invalid");

  const { objective: approved } = await createApprovedObjectiveWithResult(fixture, "approved freeze guard");
  const frozen = await freezeObjectiveAfterReestimate(approved.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  assert.equal((await freezeObjectiveAfterReestimate(approved.id, fixture.commander.id)).status, "invalid");
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
  await db
    .update(objectives)
    .set({ challengers: [fixture.challenger.name, fixture.commander.name] })
    .where(eq(objectives.id, objective.id));

  const adminLoot = await submitObjectiveLoot(
    objective.id,
    { body: "admin should not submit loot", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "admin evidence" }] },
    { id: fixture.commander.id, name: fixture.commander.name, role: "admin" },
  );
  assert.equal(adminLoot.status, "forbidden");

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

test("settlement uses multi-challenger standard contribution ratios and supports overdelivery", async () => {
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

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    {
      acceptedResult: "overdelivered",
      resultReviews: [
        { resultId: resultA.id, acceptedResult: "completed" },
        { resultId: resultB.id, acceptedResult: "completed" },
      ],
      contributionResolution: {
        ratios: [
          { member: fixture.challenger.name, ratio: 2 / 3 },
          { member: fixture.observer.name, ratio: 1 / 3 },
        ],
        reason: "Resolved by local anonymous settlement service.",
      },
    },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");
  assert.equal(reviewed.objective.objectiveBasePoints, 40);
  assert.equal(reviewed.objective.completionMultiplier, 1.5);
  assert.equal(reviewed.objective.objectiveSettlementPoints, 60);

  const data = await getTaskManagementData({ scope: fixture.scope });
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => right.points - left.points);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0]?.memberName, fixture.challenger.name);
  assert.equal(ledger[0]?.points, 40);
  assert.equal(ledger[1]?.memberName, fixture.observer.name);
  assert.equal(ledger[1]?.points, 20);

  const challengerReadModel = await getMyChallengesData(fixture.challenger.name, false, { scope: fixture.scope });
  const challengerLedger = challengerReadModel.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => right.points - left.points);
  assert.deepEqual(challengerLedger.map((entry) => entry.memberName), [fixture.challenger.name, fixture.observer.name]);
  assert.deepEqual(challengerLedger.map((entry) => entry.points), [40, 20]);

  const observerReadModel = await getMyChallengesData(fixture.observer.name, false, { scope: fixture.scope });
  const observerLedger = observerReadModel.pointLedger.filter((entry) => entry.objectiveId === objective.id).sort((left, right) => right.points - left.points);
  assert.deepEqual(observerLedger.map((entry) => entry.memberName), [fixture.challenger.name, fixture.observer.name]);
  assert.deepEqual(observerLedger.map((entry) => entry.points), [40, 20]);
});

test("multi-challenger settlement requires final contribution resolution without raw backend reviews", async () => {
  const fixture = await createFixture("peer-review-local-resolution");
  const objective = await createPublishedObjective(fixture, "local peer review settlement");
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
      body: "Local peer review target loot.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "done" }],
    },
    { id: fixture.challenger.id, name: fixture.challenger.name, role: "member" },
  );
  assert.equal(loot.status, "ok");

  const missingResolution = await reviewObjectiveLoot(
    objective.id,
    {
      lootId: loot.loot.id,
      resultReviews: [{ resultId: result.id, acceptedResult: "completed" }],
    },
    fixture.commander.id,
  );
  assert.equal(missingResolution.status, "invalid");

  const reviewed = await reviewObjectiveLoot(
    objective.id,
    {
      lootId: loot.loot.id,
      resultReviews: [{ resultId: result.id, acceptedResult: "completed" }],
      contributionResolution: {
        ratios: [
          { member: fixture.challenger.name, ratio: 0.5 },
          { member: fixture.observer.name, ratio: 0.5 },
        ],
        reason: "Resolved by local anonymous settlement service.",
      },
    },
    fixture.commander.id,
  );
  assert.equal(reviewed.status, "ok");

  const data = await getTaskManagementData({ scope: fixture.scope });
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

test("settlement resolution uses standard contribution ratios before writing point ledger", async () => {
  const fixture = await createFixture("settlement-resolution-standard-ratios");
  const objective = await createPublishedObjective(fixture, "standard resolution ratios");
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
      body: "Standard resolution ratios should produce one ledger row per challenger.",
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
          { member: fixture.challenger.name, ratio: 0.8 },
          { member: fixture.observer.name, ratio: 0.2 },
        ],
        reason: "Resolve contribution input.",
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
  const apiApplicationObjective = await createPublishedObjective(fixture, "api application reason permission");

  await withApiServer(fixture, async (app) => {
    const memberPublish = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}/publish`);
    assert.equal(memberPublish.statusCode, 403);

    const missingPublish = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(`${fixture.prefix}-missing`)}/publish`);
    assert.equal(missingPublish.statusCode, 404);

    const memberDeadlineUpdate = await apiInject(app, fixture.challenger, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}`, {
      finalDueAt: "2999-11-30",
    });
    assert.equal(memberDeadlineUpdate.statusCode, 403);
    const commanderDeadlineUpdate = await apiInject(app, fixture.commander, "PATCH", `/api/objectives/${encodeURIComponent(candidate.id)}`, {
      finalDueAt: "2999-11-30",
    });
    assert.equal(commanderDeadlineUpdate.statusCode, 200);

    const memberRecruit = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(objective.id)}/recruitments`, {
      members: [fixture.observer.name],
    });
    assert.equal(memberRecruit.statusCode, 403);

    const missingReasonApplication = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(apiApplicationObjective.id)}/challenge-applications`, {});
    assert.equal(missingReasonApplication.statusCode, 400);

    const rawContributionReview = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(apiApplicationObjective.id)}/contribution-reviews`, {
      allocations: [{ member: fixture.challenger.name, ratio: 1 }],
    });
    assert.equal(rawContributionReview.statusCode, 410);

    const memberApplication = await apiInject(app, fixture.challenger, "POST", `/api/objectives/${encodeURIComponent(apiApplicationObjective.id)}/challenge-applications`, {
      reason: "I have the right context and can own this challenge.",
    });
    assert.equal(memberApplication.statusCode, 200);
    const memberApplicationPayload = memberApplication.json() as { objective: { challengeApplications: Array<{ applicant: string; reason?: string; status: string }> } };
    const storedApplication = memberApplicationPayload.objective.challengeApplications.find((item) => item.applicant === fixture.challenger.name);
    assert.equal(storedApplication?.status, "pending");
    assert.equal(storedApplication?.reason, "I have the right context and can own this challenge.");

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

test("objective final due date updates follow commander and lifecycle rules", async () => {
  const fixture = await createFixture("objective-deadline-lifecycle");
  const candidate = await createTestObjective(fixture, "deadline candidate");
  const candidateUpdate = await updateObjectiveDetails(candidate.id, { finalDueAt: "2999-11-30" }, fixture.commander.id);
  assert.equal(candidateUpdate.status, "ok");
  assert.equal(candidateUpdate.status === "ok" ? candidateUpdate.objective.finalDueAt : null, "2999-11-30");

  const { objective, result } = await createApprovedObjectiveWithResult(fixture, "deadline frozen objective");
  const reestimateUpdate = await updateObjectiveDetails(objective.id, { finalDueAt: "2999-01-31" }, fixture.commander.id);
  assert.equal(reestimateUpdate.status, "ok");

  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");
  assert.equal((await updateObjectiveDetails(objective.id, { finalDueAt: "2999-01-30" }, fixture.commander.id)).status, "locked");
  const extended = await updateObjectiveDetails(objective.id, { finalDueAt: "2999-02-01" }, fixture.commander.id);
  assert.equal(extended.status, "ok");
  assert.equal(extended.status === "ok" ? extended.objective.finalDueAt : null, "2999-02-01");

  const submitted = await submitObjectiveLoot(
    objective.id,
    {
      body: "Completed deadline lifecycle objective.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "Evidence" }],
    },
    { ...fixture.challenger, role: "member" },
  );
  assert.equal(submitted.status, "ok");
  assert.equal((await updateObjectiveDetails(objective.id, { finalDueAt: "2999-02-02" }, fixture.commander.id)).status, "locked");
});

test("objective trial review is a one-time frozen-stage feedback loop without submitting loot", async () => {
  const fixture = await createFixture("objective-trial-review");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, "trial review objective");
  const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
  assert.equal(frozen.status, "ok");

  const trialReview = await submitObjectiveTrialReview(
    objective.id,
    {
      body: "Please check this once before formal submission.",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "Trial evidence" }],
      selfTestReportBody: "Self test passed.",
    },
    { ...fixture.challenger, role: "member" },
  );
  assert.equal(trialReview.status, "ok");
  assert.equal(trialReview.status === "ok" ? trialReview.trialReview.status : null, "requested");
  assert.equal((await submitObjectiveTrialReview(objective.id, { body: "Second request", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "Evidence" }] }, { ...fixture.challenger, role: "member" })).status, "duplicate");

  const dataAfterRequest = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(dataAfterRequest.objectives.find((item) => item.id === objective.id)?.flowStatus, "frozen");

  assert.equal(
    (
      await reviewObjectiveTrialReview(
        objective.id,
        trialReview.status === "ok" ? trialReview.trialReview.id : "",
        { status: "needsWork", commanderFeedback: "Add one more verification note." },
        fixture.commander.id,
      )
    ).status,
    "ok",
  );

  const dataAfterReview = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(dataAfterReview.objectives.find((item) => item.id === objective.id)?.flowStatus, "frozen");
  assert.equal(dataAfterReview.objectiveTrialReviews.find((item) => item.objectiveId === objective.id)?.status, "needsWork");
});

test("API task creation is owned by the objective and does not require a result", async () => {
  const fixture = await createFixture("api-task-objective-ownership");
  const candidateObjective = await createTestObjective(fixture, "candidate action objective");
  const objective = await createTestObjective(fixture, "resultless action objective");
  await db
    .update(objectives)
    .set({
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [fixture.challenger.name],
      confirmationDueAt: "2999-01-01T00:00:00.000Z",
    })
    .where(eq(objectives.id, objective.id));

  await withApiServer(fixture, async (app) => {
    const candidateResponse = await apiInject(app, fixture.commander, "POST", "/api/tasks", {
      title: `${fixture.prefix} candidate planning task`,
      linkedObjectiveId: candidateObjective.id,
    });
    assert.equal(candidateResponse.statusCode, 200, candidateResponse.body);
    const candidatePayload = candidateResponse.json() as { task: Task };
    assert.equal(candidatePayload.task.linkedObjectiveId, candidateObjective.id);

    const response = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: `${fixture.prefix} objective-only task`,
      linkedObjectiveId: objective.id,
    });
    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json() as { task: Task };

    assert.equal(payload.task.linkedObjectiveId, objective.id);

    const data = await getTaskManagementData({ scope: fixture.scope });
    const storedTask = data.tasks.find((item) => item.id === payload.task.id);
    assert.equal(storedTask?.linkedObjectiveId, objective.id);
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
    });
    assert.equal(blankTaskTitle.statusCode, 400);

    const invalidTaskDueDate = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "valid task title",
      linkedObjectiveId: objective.id,
      dueDate: "2999-02-31",
    });
    assert.equal(invalidTaskDueDate.statusCode, 400);

    const invalidTaskAssignee = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "valid task title",
      assignee: `${fixture.prefix} Missing Assignee`,
      linkedObjectiveId: objective.id,
    });
    assert.equal(invalidTaskAssignee.statusCode, 400);
    assert.equal((invalidTaskAssignee.json() as { error?: string }).error, "Task assignee must be an active member");

    const trimmedTask = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: "  trimmed action title  ",
      description: "   ",
      assignee: "   ",
      linkedObjectiveId: objective.id,
      dueDate: "2999-02-28",
    });
    assert.equal(trimmedTask.statusCode, 200);
    const trimmedTaskPayload = trimmedTask.json() as { task: { id: string; title: string; description: string; assignee: string; dueDate: string } };
    assert.equal(trimmedTaskPayload.task.title, "trimmed action title");
    assert.equal(trimmedTaskPayload.task.description, "执行支撑目标的下一步技术任务。");
    assert.equal(trimmedTaskPayload.task.assignee, fixture.challenger.name);
    assert.equal(trimmedTaskPayload.task.dueDate, "2999-02-28");

    const objectiveOwnedTask = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: `${fixture.prefix} objective-owned action`,
      linkedObjectiveId: objective.id,
    });
    assert.equal(objectiveOwnedTask.statusCode, 200, objectiveOwnedTask.body);
    const objectiveOwnedTaskPayload = objectiveOwnedTask.json() as { task: Task };
    assert.equal(objectiveOwnedTaskPayload.task.linkedObjectiveId, objective.id);

    const defaultLabel = await apiInject(app, fixture.challenger, "POST", `/api/tasks/${encodeURIComponent(trimmedTaskPayload.task.id)}/checklist`, {
      label: "   ",
    });
    assert.equal(defaultLabel.statusCode, 200);
    const defaultLabelPayload = defaultLabel.json() as { item: Task["checklist"][number] };
    assert.equal(defaultLabelPayload.item.label, "新子任务");
    assert.equal(defaultLabelPayload.item.done, false);
    assert.ok(defaultLabelPayload.item.id);

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
        linkedObjectiveId: result.objectiveId,
        assignee: fixture.challenger.name,
      }),
      createTask({
        title: `${fixture.prefix} concurrent task B`,
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
  assert.equal(data.tasks.filter((task) => task.linkedObjectiveId === result.objectiveId).length, 2);
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
        linkedObjectiveId: objective.id,
        assignee: fixture.challenger.name,
      }),
    ),
  );
  assert.equal(createdTasks.every(Boolean), true);
  const storedTasks = await db
    .select({ id: taskRows.id, sortOrder: taskRows.sortOrder })
    .from(taskRows)
    .where(eq(taskRows.linkedObjectiveId, objective.id));
  assert.deepEqual(storedTasks.map((row) => row.sortOrder).sort((left, right) => left - right), expectedSortOrders);

  const checklistTask = createdTasks[0];
  assert.ok(checklistTask);
  const checklistCreates = await Promise.all(
    expectedSortOrders.map((index) => createChecklistItem(checklistTask.id, { label: `${fixture.prefix} concurrent checklist ${index}` })),
  );
  assert.equal(checklistCreates.every(Boolean), true);
  assert.deepEqual(
    checklistCreates.map((item) => item?.label).sort(),
    expectedSortOrders.map((index) => `${fixture.prefix} concurrent checklist ${index}`).sort(),
  );
  const storedChecklist = await db
    .select({ id: taskChecklistItems.id, sortOrder: taskChecklistItems.sortOrder })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, checklistTask.id));
  assert.deepEqual(storedChecklist.map((row) => row.sortOrder).sort((left, right) => left - right), expectedSortOrders);
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

test("user avatar upload is self-scoped and projected into users and comments", async () => {
  const fixture = await createFixture("api-user-avatar");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "avatar comment projection objective");

  await withApiServer(fixture, async (app) => {
    const upload = await apiMultipartInject(app, fixture.challenger, "/api/users/me/avatar", {
      fields: {},
      file: {
        fieldName: "file",
        fileName: "avatar.png",
        mimeType: "image/png",
        content: tinyPng,
      },
    });
    assert.equal(upload.statusCode, 200);
    const uploadPayload = upload.json() as { user: { avatarUrl?: string | null; id: string } };
    assert.equal(uploadPayload.user.id, fixture.challenger.id);
    assert.ok(uploadPayload.user.avatarUrl);
    assert.equal(uploadPayload.user.avatarUrl.includes("127.0.0.1:9000"), false);
    assert.equal(uploadPayload.user.avatarUrl.includes("orf-comment-attachments"), false);
    assert.equal(uploadPayload.user.avatarUrl.includes(`/api/users/${encodeURIComponent(fixture.challenger.id)}/avatar`), true);

    const usersResponse = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(usersResponse.statusCode, 200);
    const usersPayload = usersResponse.json() as { users: Array<{ avatarUrl?: string | null; id: string }> };
    assert.equal(usersPayload.users.find((user) => user.id === fixture.challenger.id)?.avatarUrl, uploadPayload.user.avatarUrl);

    const avatarContent = await apiInject(app, fixture.commander, "GET", attachmentContentPath(uploadPayload.user.avatarUrl));
    assert.equal(avatarContent.statusCode, 200);
    assert.equal(avatarContent.headers["content-type"], "image/png");
    assert.equal(Buffer.from(avatarContent.rawPayload).subarray(0, 8).equals(tinyPng.subarray(0, 8)), true);

    const body = `${fixture.prefix} avatar projection ${Date.now()}`;
    const comment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body,
    });
    assert.equal(comment.statusCode, 200);
    const commentPayload = comment.json() as {
      commentThread: { messages: Array<{ authorAvatarUrl?: string | null; authorUserId?: string | null; body: string }> };
    };
    const message = commentPayload.commentThread.messages.find((item) => item.body === body);
    assert.equal(message?.authorUserId, fixture.challenger.id);
    assert.equal(message?.authorAvatarUrl, uploadPayload.user.avatarUrl);

    const deleted = await apiInject(app, fixture.challenger, "DELETE", "/api/users/me/avatar");
    assert.equal(deleted.statusCode, 200);
    assert.equal((deleted.json() as { user: { avatarUrl?: string | null } }).user.avatarUrl, null);
    const deletedContent = await apiInject(app, fixture.commander, "GET", attachmentContentPath(uploadPayload.user.avatarUrl));
    assert.equal(deletedContent.statusCode, 404);
  });
});

test("user avatar upload rejects spoofed image payloads", async () => {
  const fixture = await createFixture("api-user-avatar-reject");

  await withApiServer(fixture, async (app) => {
    const upload = await apiMultipartInject(app, fixture.challenger, "/api/users/me/avatar", {
      fields: {},
      file: {
        fieldName: "file",
        fileName: "avatar.png",
        mimeType: "image/png",
        content: Buffer.from("not a png", "utf8"),
      },
    });
    assert.equal(upload.statusCode, 415);
    assert.equal((upload.json() as { error: string }).error, "Unsupported image type");
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

test("password login binds a preapproved ORF member to the Ory identity id", async () => {
  const fixture = await createFixture("auth-login-bind-preapproved");
  const identity = {
    id: `${fixture.prefix}-ory-challenger`,
    traits: {
      email: fixture.challenger.email,
      name: `${fixture.prefix} Ory Challenger`,
    },
  };

  await withMockOryLogin(identity, async () => {
    const auth = await loginWithPassword(fixture.challenger.email, "password");
    assert.equal(auth.user.id, fixture.challenger.id);
    assert.equal(auth.user.name, fixture.challenger.name);
    assert.equal(auth.user.status, "active");
  });

  const [stored] = await db.select({ oryIdentityId: users.oryIdentityId }).from(users).where(eq(users.id, fixture.challenger.id)).limit(1);
  assert.equal(stored?.oryIdentityId, identity.id);
});

test("password login resolves bound ORF users by Ory identity id before email", async () => {
  const fixture = await createFixture("auth-login-bound-identity-first");
  const identity = {
    id: `${fixture.prefix}-ory-stable-id`,
    traits: {
      email: `${fixture.prefix}-ory-renamed@orf.test`,
      name: `${fixture.prefix} Ory Renamed`,
    },
  };
  const orfEmail = `${fixture.prefix}-orf-contact@orf.test`;
  await db.update(users).set({ oryIdentityId: identity.id, email: orfEmail }).where(eq(users.id, fixture.challenger.id));

  await withMockOryLogin(identity, async () => {
    const auth = await loginWithPassword(String(identity.traits.email), "password");
    assert.equal(auth.user.id, fixture.challenger.id);
    assert.equal(auth.user.email, orfEmail);
    assert.equal(auth.user.status, "active");
  });

  const duplicateRows = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${identity.traits.email}`);
  assert.equal(duplicateRows.length, 0);
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

  const [created] = await db.select({ status: users.status, oryIdentityId: users.oryIdentityId }).from(users).where(eq(users.email, email)).limit(1);
  assert.equal(created?.status, "pending");
  assert.equal(created?.oryIdentityId, identity.id);
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

test("API user management rejects email changes for Ory-bound members", async () => {
  const fixture = await createFixture("api-user-bound-email-change");
  await db.update(users).set({ oryIdentityId: fixture.challenger.id }).where(eq(users.id, fixture.challenger.id));

  await withApiServer(fixture, async (app) => {
    const userList = await apiInject(app, fixture.commander, "GET", "/api/users");
    assert.equal(userList.statusCode, 200);
    const boundUser = (userList.json() as { users: Array<{ id: string; authLinked?: boolean }> }).users.find((user) => user.id === fixture.challenger.id);
    assert.equal(boundUser?.authLinked, true);

    const update = await apiInject(app, fixture.commander, "PATCH", `/api/users/${encodeURIComponent(fixture.challenger.id)}`, {
      name: fixture.challenger.name,
      email: `${fixture.prefix}-renamed-login@orf.test`,
      role: "member",
    });
    assert.equal(update.statusCode, 409);
    assert.equal((update.json() as { error?: string }).error, "Bound login email cannot be changed");

    const [stored] = await db.select({ email: users.email }).from(users).where(eq(users.id, fixture.challenger.id)).limit(1);
    assert.equal(stored?.email, fixture.challenger.email);
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

test("task-page and state snapshot APIs scope private records but expose public point ledger to ordinary members", async () => {
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
    assert.equal(observerData.pointLedger.some((item) => item.objectiveId === objective.id), true);

    const observerMyChallenges = await apiInject(app, fixture.observer, "GET", "/api/my-challenges?scope=mine");
    assert.equal(observerMyChallenges.statusCode, 200);
    assert.equal((observerMyChallenges.json() as { pointLedger: Array<{ objectiveId: string }> }).pointLedger.some((item) => item.objectiveId === objective.id), true);

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
      linkedObjectiveId: intruderWorkResult.objectiveId,
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
    assert.equal((challengerChecklist.json() as { item: Task["checklist"][number] }).item.label, "challenger can add");

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

test("objective challengers share task and subtask maintenance", async () => {
  const fixture = await createFixture("api-shared-task-maintenance");
  const { objective, result } = await createApprovedObjectiveWithResult(fixture, "shared task maintenance objective");

  await withApiServer(fixture, async (app) => {
    const firstTaskResponse = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: `${fixture.prefix} shared task A`,
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    });
    assert.equal(firstTaskResponse.statusCode, 200, firstTaskResponse.body);
    const firstTask = (firstTaskResponse.json() as { task: Task }).task;
    assert.equal(firstTask.createdBy, fixture.challenger.id);
    assert.equal(firstTask.updatedBy, fixture.challenger.id);

    const secondTaskResponse = await apiInject(app, fixture.challenger, "POST", "/api/tasks", {
      title: `${fixture.prefix} shared task B`,
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    });
    assert.equal(secondTaskResponse.statusCode, 200, secondTaskResponse.body);
    const secondTask = (secondTaskResponse.json() as { task: Task }).task;

    const firstChecklistResponse = await apiInject(app, fixture.challenger, "POST", `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist`, {
      label: `${fixture.prefix} shared subtask A`,
    });
    assert.equal(firstChecklistResponse.statusCode, 200, firstChecklistResponse.body);
    const firstChecklistItem = (firstChecklistResponse.json() as { item: Task["checklist"][number] }).item;

    const observerStatusBeforeJoin = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}/status`, {
      status: "In Progress",
    });
    assert.equal(observerStatusBeforeJoin.statusCode, 403);

    const recruitedObserver = await recruitObjectiveChallengers(objective.id, [fixture.observer.name], fixture.commander.id);
    assert.equal(recruitedObserver.status, "ok");

    const observerStatusBeforeAccept = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}/status`, {
      status: "In Progress",
    });
    assert.equal(observerStatusBeforeAccept.statusCode, 403);

    const acceptedObserver = await acceptObjectiveChallenge(objective.id, fixture.observer.name, fixture.observer.id);
    assert.equal(acceptedObserver.status, "accepted");

    const observerTitle = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}`, {
      title: `${fixture.prefix} observer maintained task`,
    });
    assert.equal(observerTitle.statusCode, 200, observerTitle.body);

    const observerStatus = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}/status`, {
      status: "In Progress",
    });
    assert.equal(observerStatus.statusCode, 200, observerStatus.body);

    const observerCompletion = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}/completion`, {
      done: true,
    });
    assert.equal(observerCompletion.statusCode, 200, observerCompletion.body);

    const secondChecklistResponse = await apiInject(app, fixture.observer, "POST", `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist`, {
      label: `${fixture.prefix} shared subtask B`,
    });
    assert.equal(secondChecklistResponse.statusCode, 200, secondChecklistResponse.body);
    const secondChecklistItem = (secondChecklistResponse.json() as { item: Task["checklist"][number] }).item;

    const observerChecklistDone = await apiInject(
      app,
      fixture.observer,
      "PATCH",
      `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist/${encodeURIComponent(firstChecklistItem.id)}`,
      { done: false },
    );
    assert.equal(observerChecklistDone.statusCode, 200, observerChecklistDone.body);

    const observerChecklistLabel = await apiInject(
      app,
      fixture.observer,
      "PATCH",
      `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist/${encodeURIComponent(firstChecklistItem.id)}/label`,
      { label: `${fixture.prefix} observer maintained subtask` },
    );
    assert.equal(observerChecklistLabel.statusCode, 200, observerChecklistLabel.body);

    const observerTaskMove = await apiInject(app, fixture.observer, "PATCH", `/api/tasks/${encodeURIComponent(firstTask.id)}/move`, {
      objectiveId: objective.id,
      referenceTaskId: secondTask.id,
      placement: "after",
    });
    assert.equal(observerTaskMove.statusCode, 200, observerTaskMove.body);

    const observerChecklistMove = await apiInject(
      app,
      fixture.observer,
      "PATCH",
      `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist/${encodeURIComponent(firstChecklistItem.id)}/move`,
      { toTaskId: secondTask.id },
    );
    assert.equal(observerChecklistMove.statusCode, 200, observerChecklistMove.body);

    const observerChecklistDelete = await apiInject(
      app,
      fixture.observer,
      "DELETE",
      `/api/tasks/${encodeURIComponent(firstTask.id)}/checklist/${encodeURIComponent(secondChecklistItem.id)}`,
    );
    assert.equal(observerChecklistDelete.statusCode, 200, observerChecklistDelete.body);

    const afterObserverMaintenance = await getTaskManagementData({ scope: fixture.scope });
    assert.equal(afterObserverMaintenance.tasks.find((task) => task.id === firstTask.id)?.updatedBy, fixture.observer.id);
    assert.equal(afterObserverMaintenance.tasks.find((task) => task.id === secondTask.id)?.updatedBy, fixture.observer.id);

    const commanderDeleteSecondTask = await apiInject(app, fixture.commander, "DELETE", `/api/tasks/${encodeURIComponent(secondTask.id)}`);
    assert.equal(commanderDeleteSecondTask.statusCode, 200, commanderDeleteSecondTask.body);

    const observerDeleteFirstTask = await apiInject(app, fixture.observer, "DELETE", `/api/tasks/${encodeURIComponent(firstTask.id)}`);
    assert.equal(observerDeleteFirstTask.statusCode, 200, observerDeleteFirstTask.body);
  });

  const finalData = await getTaskManagementData({ scope: fixture.scope });
  assert.equal(finalData.tasks.some((task) => task.linkedObjectiveId === objective.id), false);
});

test("comment mentions resolve scoped active users and create recipient notifications", async () => {
  const fixture = await createFixture("api-comment-mention");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "mention objective");
  await db.update(users).set({ status: "disabled" }).where(eq(users.id, fixture.observer.id));

  await withApiServer(fixture, async (app) => {
    const mentionableUrl = `/api/comments/mentionable-users?targetType=objective&targetId=${encodeURIComponent(objective.id)}`;
    const observerCandidates = await apiInject(app, fixture.observer, "GET", mentionableUrl);
    assert.equal(observerCandidates.statusCode, 403);

    const challengerCandidates = await apiInject(app, fixture.challenger, "GET", mentionableUrl);
    assert.equal(challengerCandidates.statusCode, 200);
    const candidatePayload = challengerCandidates.json() as { users: Array<{ id: string; status: string }> };
    assert.equal(candidatePayload.users.some((user) => user.id === fixture.commander.id), true);
    assert.equal(candidatePayload.users.some((user) => user.id === fixture.challenger.id), true);
    assert.equal(candidatePayload.users.some((user) => user.id === fixture.observer.id), false);

    const challengerMention = `@[${fixture.challenger.name}](orf-user:${fixture.challenger.id})`;
    const comment = await apiInject(app, fixture.commander, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: `请 ${challengerMention} 看一下，重复 ${challengerMention}，自己 @[${fixture.commander.name}](orf-user:${fixture.commander.id})，禁用 @[${fixture.observer.name}](orf-user:${fixture.observer.id})，普通 @Ghost。`,
    });
    assert.equal(comment.statusCode, 200);
  });

  const challengerNotifications = (await listNotificationsForUser(fixture.challenger.id, fixture.scope)).filter(
    (notification) => notification.kind === "comment.mention.created",
  );
  assert.equal(challengerNotifications.length, 1);
  assert.equal(challengerNotifications[0]?.targetType, "comment");
  assert.equal(challengerNotifications[0]?.targetHref, `/tasks#objective:${encodeURIComponent(objective.id)}`);
  assert.equal(challengerNotifications[0]?.metadata.targetId, objective.id);
  assert.match(challengerNotifications[0]?.body ?? "", /评论中提到了你/);

  const observerNotifications = (await listNotificationsForUser(fixture.observer.id, fixture.scope)).filter(
    (notification) => notification.kind === "comment.mention.created",
  );
  const commanderNotifications = (await listNotificationsForUser(fixture.commander.id, fixture.scope)).filter(
    (notification) => notification.kind === "comment.mention.created",
  );
  assert.equal(observerNotifications.length, 0);
  assert.equal(commanderNotifications.length, 0);
});

test("comment image attachments upload, bind, and read through authorized comment APIs", async () => {
  const fixture = await createFixture("api-comment-image");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "image attachment objective");

  await withApiServer(fixture, async (app) => {
    const upload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "proof.png",
        mimeType: "image/png",
        content: tinyPng,
      },
    });
    assert.equal(upload.statusCode, 200);

    const uploadPayload = upload.json() as {
      markdown: string;
      attachment: {
        id: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
        width?: number;
        height?: number;
        contentUrl: string;
      };
    };
    assert.match(uploadPayload.attachment.id, /^catt_/);
    assert.equal(uploadPayload.attachment.fileName, "proof.png");
    assert.equal(uploadPayload.attachment.mimeType, "image/png");
    assert.equal(uploadPayload.attachment.fileSize, tinyPng.byteLength);
    assert.equal(uploadPayload.attachment.contentUrl.includes("127.0.0.1:9000"), false);
    assert.equal(uploadPayload.attachment.contentUrl.includes("orf-comment-attachments"), false);
    assert.equal(uploadPayload.markdown, `![proof.png](orf-attachment:${uploadPayload.attachment.id})`);

    const comment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: uploadPayload.markdown,
    });
    assert.equal(comment.statusCode, 200);

    const commentPayload = comment.json() as {
      commentThread: {
        id: string;
        messages: Array<{
          id: string;
          body: string;
          attachments: Array<{
            id: string;
            fileName: string;
            mimeType: string;
            fileSize: number;
            contentUrl: string;
          }>;
        }>;
      };
    };
    const message = commentPayload.commentThread.messages.find((item) => item.body === uploadPayload.markdown);
    assert.ok(message);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0]?.id, uploadPayload.attachment.id);
    assert.equal(message.attachments[0]?.contentUrl.includes(`/api/comments/attachments/${uploadPayload.attachment.id}/content`), true);

    const image = await apiInject(app, fixture.challenger, "GET", attachmentContentPath(message.attachments[0]?.contentUrl ?? ""));
    assert.equal(image.statusCode, 200);
    assert.match(image.headers["content-type"]?.toString() ?? "", /^image\/png\b/);
    assert.equal(Buffer.from(image.rawPayload).subarray(0, 8).equals(tinyPng.subarray(0, 8)), true);

    const observerImage = await apiInject(app, fixture.observer, "GET", attachmentContentPath(message.attachments[0]?.contentUrl ?? ""));
    assert.equal(observerImage.statusCode, 403);

    const cleanupUpload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "cleanup.png",
        mimeType: "image/png",
        content: tinyPng,
      },
    });
    assert.equal(cleanupUpload.statusCode, 200);
    const cleanupPayload = cleanupUpload.json() as typeof uploadPayload;
    const cleanupComment = await apiInject(app, fixture.challenger, "POST", "/api/comments", {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: cleanupPayload.markdown,
    });
    assert.equal(cleanupComment.statusCode, 200);
    const cleanupCommentPayload = cleanupComment.json() as typeof commentPayload;
    const cleanupMessage = cleanupCommentPayload.commentThread.messages.find((item) => item.body === cleanupPayload.markdown);
    assert.ok(cleanupMessage);
    assert.equal(cleanupMessage.attachments.length, 1);

    const deleted = await apiInject(app, fixture.challenger, "DELETE", `/api/comments/${cleanupCommentPayload.commentThread.id}/messages/${cleanupMessage.id}`);
    assert.equal(deleted.statusCode, 200);

    const deletedImage = await apiInject(app, fixture.challenger, "GET", attachmentContentPath(cleanupMessage.attachments[0]?.contentUrl ?? ""));
    assert.equal(deletedImage.statusCode, 404);

    await db.update(objectives).set({ flowStatus: "closed" }).where(eq(objectives.id, objective.id));
    const archivedImage = await apiInject(app, fixture.challenger, "GET", attachmentContentPath(message.attachments[0]?.contentUrl ?? ""));
    assert.equal(archivedImage.statusCode, 200);

    const lockedUpload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "locked.png",
        mimeType: "image/png",
        content: tinyPng,
      },
    });
    assert.equal(lockedUpload.statusCode, 403);
  });
});

test("comment image attachment upload rejects unauthorized users and invalid image payloads", async () => {
  const fixture = await createFixture("api-comment-image-reject");
  const { objective } = await createApprovedObjectiveWithResult(fixture, "image attachment rejection objective");

  await withApiServer(fixture, async (app) => {
    const observerUpload = await apiMultipartInject(app, fixture.observer, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "proof.png",
        mimeType: "image/png",
        content: tinyPng,
      },
    });
    assert.equal(observerUpload.statusCode, 403);

    const textUpload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "notes.txt",
        mimeType: "text/plain",
        content: Buffer.from("plain text is not a comment image", "utf8"),
      },
    });
    assert.equal([400, 415].includes(textUpload.statusCode), true);

    const spoofedUpload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "spoofed.png",
        mimeType: "image/png",
        content: Buffer.from("<script>alert(1)</script>", "utf8"),
      },
    });
    assert.equal([400, 415].includes(spoofedUpload.statusCode), true);

    const oversizedUpload = await apiMultipartInject(app, fixture.challenger, "/api/comments/attachments", {
      fields: {
        targetType: "objective",
        targetId: objective.id,
      },
      file: {
        fieldName: "file",
        fileName: "oversized.png",
        mimeType: "image/png",
        content: Buffer.concat([tinyPng, Buffer.alloc(10 * 1024 * 1024)]),
      },
    });
    assert.equal(oversizedUpload.statusCode, 413);
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

test("API personal settings routes are scoped to the current active user", async () => {
  const fixture = await createFixture("api-personal-settings");

  try {
    await withApiServer(fixture, async (app) => {
      const memberPreferences = await apiInject(app, fixture.challenger, "GET", "/api/settings/personal/preferences");
      assert.equal(memberPreferences.statusCode, 200);
      assert.equal(memberPreferences.json().data.userId, fixture.challenger.id);

      const savedMemberPreferences = await apiInject(app, fixture.challenger, "PUT", "/api/settings/personal/preferences", {
        defaultLandingPath: "/reports",
        sidebarCollapsed: true,
        notificationDisplay: { toastEnabled: false },
      });
      assert.equal(savedMemberPreferences.statusCode, 200);
      assert.equal(savedMemberPreferences.json().data.userId, fixture.challenger.id);
      assert.equal(savedMemberPreferences.json().data.defaultLandingPath, "/reports");
      assert.equal(savedMemberPreferences.json().data.sidebarCollapsed, true);
      assert.equal(savedMemberPreferences.json().data.notificationDisplay.toastEnabled, false);

      const commanderPreferences = await apiInject(app, fixture.commander, "GET", "/api/settings/personal/preferences");
      assert.equal(commanderPreferences.statusCode, 200);
      assert.equal(commanderPreferences.json().data.userId, fixture.commander.id);
      assert.equal(commanderPreferences.json().data.defaultLandingPath, null);

      const invalidLoginBackgroundPreference = await apiInject(app, fixture.challenger, "PUT", "/api/settings/personal/preferences", {
        appBackground: {
          mode: "fixed",
          fixedBackgroundId: "login_background/default/orf-login-sky-adventure.png",
          switchTrigger: "on_open",
          switchOrder: "random",
          switchIntervalMinutes: 10,
        },
      });
      assert.equal(invalidLoginBackgroundPreference.statusCode, 404);
    });
  } finally {
    await Promise.all([
      rm(personalSettingsTestDir(fixture.challenger.id), { recursive: true, force: true }),
      rm(personalSettingsTestDir(fixture.commander.id), { recursive: true, force: true }),
    ]);
  }
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

function applyForObjectiveChallenge(objectiveId: string, applicant: string, actorUserId?: string | null, reason = `${applicant} wants to challenge this objective.`) {
  return applyForObjectiveChallengeRepository(objectiveId, applicant, actorUserId, reason);
}

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

function personalSettingsTestDir(userId: string) {
  return path.join(process.cwd(), "public", "settings", "users", Buffer.from(userId, "utf8").toString("base64url"));
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

async function apiMultipartInject(
  app: FastifyInstance,
  user: FixtureUser,
  url: string,
  input: {
    fields: Record<string, string>;
    file: {
      fieldName: string;
      fileName: string;
      mimeType: string;
      content: Buffer;
    };
  },
) {
  const boundary = `----orf-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  const push = (value: string | Buffer) => {
    chunks.push(typeof value === "string" ? Buffer.from(value, "utf8") : value);
  };

  for (const [name, value] of Object.entries(input.fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  push(`--${boundary}\r\n`);
  push(
    `Content-Disposition: form-data; name="${input.file.fieldName}"; filename="${input.file.fileName}"\r\n` +
      `Content-Type: ${input.file.mimeType}\r\n\r\n`,
  );
  push(input.file.content);
  push(`\r\n--${boundary}--\r\n`);

  return app.inject({
    method: "POST",
    url,
    headers: {
      cookie: apiCookie(user),
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(chunks),
  });
}

function attachmentContentPath(contentUrl: string) {
  const parsed = new URL(contentUrl, "http://127.0.0.1");
  return `${parsed.pathname}${parsed.search}`;
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
  const directRunPattern = `${runId}%`;
  const generatedUserPattern = `user-${runId}%`;
  const runEmailPattern = `${runId}%@orf.test`;

  await db.delete(teams).where(sql`${teams.id} like ${`${runId}%`}`);
  await db
    .delete(users)
    .where(sql`${users.id} like ${directRunPattern} or ${users.id} like ${generatedUserPattern} or ${users.email} like ${runEmailPattern}`);
}
