import { inArray } from "drizzle-orm";
import { closeDb, db } from "../server/db/client";
import {
  objectives,
  results,
  resultTrendPoints,
  teamMembers,
  teams,
  users,
} from "../server/db/schema";
import { initialOrfState } from "../src/data/initialOrfState";
import {
  assertDemoSeedSafety,
  namespacedSeedId,
  seedBootstrapAdmin,
  seedTeamId,
  seedTeamName,
  seedUserIdForName,
} from "./seedSafety";

const team = {
  id: seedTeamId(),
  name: seedTeamName(),
  createdAt: "2026-04-01",
};
const bootstrapAdmin = seedBootstrapAdmin(team.id);

function userIdForName(name: string) {
  return seedUserIdForName(team.id, name);
}

function seedId(id: string) {
  return namespacedSeedId(team.id, id);
}

function emailForName(name: string) {
  return `${userIdForName(name).replace(/^user-/, "")}@orf.local`;
}

function collectBountyUserNames(objectiveIds: Set<string>) {
  return Array.from(
    new Set([
      ...initialOrfState.objectives.filter((item) => objectiveIds.has(item.id)).flatMap((item) => [
        ...item.challengers,
        ...item.assignedChallengers,
        ...item.challengeApplications.map((application) => application.applicant),
      ]),
      ...initialOrfState.results.filter((item) => objectiveIds.has(item.objectiveId)).map((item) => item.definer ?? ""),
    ]),
  ).filter(Boolean);
}

async function seedBountyHall() {
  const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  assertDemoSeedSafety({
    connectionString,
    scriptName: "db:seed:bounties",
    targetTeamId: team.id,
  });

  const bountyObjectives = initialOrfState.objectives.filter((objective) => objective.id.startsWith("obj-bounty-"));
  const sourceBountyObjectiveIds = new Set(bountyObjectives.map((objective) => objective.id));
  const bountyObjectiveIds = bountyObjectives.map((objective) => seedId(objective.id));
  const bountyResults = initialOrfState.results.filter((result) => sourceBountyObjectiveIds.has(result.objectiveId));
  const bountyResultIds = bountyResults.map((result) => seedId(result.id));

  await db.transaction(async (tx) => {
    await tx.insert(teams).values(team).onConflictDoNothing();

    const userRowsById = new Map(
      collectBountyUserNames(sourceBountyObjectiveIds).map((name) => [
        userIdForName(name),
        {
          id: userIdForName(name),
	          name,
	          email: emailForName(name),
	          createdAt: "2026-04-01",
	          lastOnlineAt: "2026-05-01T11:06:00.000Z",
	        },
      ]),
    );
    userRowsById.set(bootstrapAdmin.id, bootstrapAdmin);
    const userRows = Array.from(userRowsById.values());

    if (userRows.length > 0) {
      await tx
        .insert(users)
        .values(userRows)
        .onConflictDoNothing();

      await tx
        .insert(teamMembers)
        .values(userRows.map((user) => ({ teamId: team.id, userId: user.id, role: user.id === bootstrapAdmin.id ? ("admin" as const) : ("member" as const) })))
        .onConflictDoNothing();
    }

    if (bountyObjectives.length > 0) {
      await tx.delete(objectives).where(inArray(objectives.id, bountyObjectiveIds));
      await tx
        .insert(objectives)
        .values(
          bountyObjectives.map((objective) => ({
            id: seedId(objective.id),
            teamId: team.id,
            title: objective.title,
            description: objective.description,
            whyItMatters: objective.whyItMatters,
            cycle: objective.cycle,
            stage: objective.stage,
            flowStatus: objective.flowStatus,
            status: objective.status,
            confidence: objective.confidence,
            progress: objective.progress,
            boundary: objective.boundary,
            successDefinition: objective.successDefinition,
            finalDueAt: objective.finalDueAt,
            challengers: objective.challengers,
            assignedChallengers: objective.assignedChallengers,
            challengeApplications: objective.challengeApplications,
            acceptedAt: objective.acceptedAt ?? null,
            confirmationDueAt: objective.confirmationDueAt ?? null,
            confirmedAt: objective.confirmedAt ?? null,
            lootSubmittedAt: objective.lootSubmittedAt ?? null,
            acceptedResult: objective.acceptedResult ?? null,
            completionMultiplier: objective.completionMultiplier ?? null,
            objectiveBasePoints: objective.objectiveBasePoints,
            objectiveSettlementPoints: objective.objectiveSettlementPoints ?? null,
            createdAt: objective.createdAt,
            updatedAt: objective.updatedAt,
            createdBy: bootstrapAdmin.id,
            updatedBy: bootstrapAdmin.id,
          })),
        );
    }

    if (bountyResults.length > 0) {
      await tx
        .insert(results)
        .values(
          bountyResults.map((result) => ({
            id: seedId(result.id),
            teamId: team.id,
            objectiveId: seedId(result.objectiveId),
            title: result.title,
            description: result.description,
            metricName: result.metricName,
            metricRequirement: result.metricRequirement ?? null,
            statisticalObject: result.statisticalObject ?? null,
            completionStandard: result.completionStandard ?? null,
            sampleSet: result.sampleSet ?? null,
            measurementScope: result.measurementScope ?? null,
            uncertaintyLevel: result.uncertaintyLevel ?? null,
            baseline: result.baseline,
            current: result.current,
            target: result.target,
            unit: result.unit,
            direction: result.direction,
            status: result.status,
            confidence: result.confidence,
            source: result.source ?? "managerDefined",
            definer: result.definer ?? "",
            uncertaintyScore: result.uncertaintyScore,
            acceptedResult: result.acceptedResult,
            reviewCadence: result.reviewCadence,
            sortOrder: bountyObjectives.find((objective) => objective.id === result.objectiveId)?.resultIds.indexOf(result.id) ?? 0,
            createdBy: result.definer ? userIdForName(result.definer) : bootstrapAdmin.id,
            updatedBy: result.definer ? userIdForName(result.definer) : bootstrapAdmin.id,
          })),
        );

      await tx.delete(resultTrendPoints).where(inArray(resultTrendPoints.resultId, bountyResultIds));
      await tx.insert(resultTrendPoints).values(
        bountyResults.flatMap((result) =>
          result.trend.map((point, index) => ({
            resultId: seedId(result.id),
            date: point.date,
            value: point.value,
            sortOrder: index,
          })),
        ),
      );
    }
  });
}

try {
  await seedBountyHall();
  console.log("Seeded bounty hall data.");
} finally {
  await closeDb();
}
