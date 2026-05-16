import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { buildServer } from "../server/app";
import { closeDb, db } from "../server/db/client";
import { objectives, teams, teamMembers, users } from "../server/db/schema";
import type { Result } from "../src/types/orf";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canEditObjectiveResultsDuringReestimate,
  createObjective,
  createResult,
  freezeObjectiveAfterReestimate,
  getBountyHallData,
  getMyChallengesData,
  getTaskManagementData,
  publishObjective,
  recruitObjectiveChallengers,
  reviewObjectiveLoot,
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
      acceptedResult: "completed",
      resultReviews: [
        { resultId: result.id, acceptedResult: "completed" },
        { resultId: challengerResult.id, acceptedResult: "completed" },
      ],
      contributionRatios: [{ member: fixture.challenger.name, ratio: 1 }],
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

    await reopenReestimateWindow(objective.id);
    const frozen = await freezeObjectiveAfterReestimate(objective.id, fixture.commander.id);
    assert.equal(frozen.status, "ok");
    const afterFreeze = await patchResultTitle(app, fixture.challenger, result.id, `${fixture.prefix} frozen edit`);
    assert.equal(afterFreeze.statusCode, 403);
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

async function reopenReestimateWindow(objectiveId: string) {
  await db.update(objectives).set({ confirmationDueAt: "2999-01-01T00:00:00.000Z" }).where(sql`${objectives.id} = ${objectiveId}`);
}

async function cleanupRun() {
  await db.delete(teams).where(sql`${teams.id} like ${`${runId}%`}`);
  await db.delete(users).where(sql`${users.id} like ${`${runId}%`}`);
}
