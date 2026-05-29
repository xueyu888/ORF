import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";
import {
  deleteTestObjectives,
  testObjectiveAbsent,
  upsertTestObjective,
} from "../../../_operators/common.helpers";
import type { AdminFreezeObjectiveTarget } from "./admin-freeze-objective.context";
import { freezeButton, freezeTargetFromObjective, objectivePanel } from "./admin-freeze-objective.helpers";

export type FreezeForbiddenTargetFixture = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  confirmedAt: "present" | "absent";
};

export type FreezeForbiddenTargetRuntime = AdminFreezeObjectiveTarget;

export async function upsertFreezeForbiddenTarget(input: {
  fixture: FreezeForbiddenTargetFixture;
  teamId: string;
  createdBy?: string;
  updatedBy?: string;
  challengerName?: string;
}) {
  const challengers = input.challengerName ? [input.challengerName] : [];
  await upsertTestObjective({
    id: input.fixture.id,
    title: input.fixture.title,
    teamId: input.teamId,
    stage: input.fixture.stage,
    flowStatus: input.fixture.flowStatus,
    status: "Draft",
    challengers,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
  });

  await db
    .update(objectives)
    .set({
      challengers,
      confirmedAt: input.fixture.confirmedAt === "present" ? nowIso() : null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, input.fixture.id));

  return freezeTargetFromObjective(input.fixture.id);
}

export async function deleteFreezeForbiddenTargets(fixtures: readonly FreezeForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    await deleteTestObjectives({ id: fixture.id, title: fixture.title });
  }
}

export async function freezeForbiddenTargetsAbsent(fixtures: readonly FreezeForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    if (!(await testObjectiveAbsent({ id: fixture.id, title: fixture.title }))) {
      return false;
    }
  }
  return true;
}

export async function freezeForbiddenTargetMatchesFixture(fixture: FreezeForbiddenTargetFixture) {
  const objective = await readObjective(fixture.id);
  if (!objective) {
    return false;
  }
  const confirmedAtMatches = fixture.confirmedAt === "present" ? Boolean(objective.confirmedAt) : !objective.confirmedAt;
  return objective.stage === fixture.stage && objective.flowStatus === fixture.flowStatus && confirmedAtMatches;
}

export async function freezeForbiddenTargetsMatchFixtures(fixtures: readonly FreezeForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    if (!(await freezeForbiddenTargetMatchesFixture(fixture))) {
      return false;
    }
  }
  return true;
}

export async function freezeForbiddenTargetsHaveChallenger(
  fixtures: readonly FreezeForbiddenTargetFixture[],
  memberName: string,
) {
  for (const fixture of fixtures) {
    const objective = await readObjective(fixture.id);
    if (!objective?.challengers.includes(memberName)) {
      return false;
    }
  }
  return true;
}

export async function workbenchContainsFreezeForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly FreezeForbiddenTargetFixture[];
    scope: "mine" | "all";
  },
) {
  const response = await page.evaluate(async (scope) => {
    const result = await fetch(`/api/my-challenges?scope=${encodeURIComponent(scope)}`, {
      credentials: "include",
    });
    return {
      status: result.status,
      body: await result.json().catch(() => ({})),
    };
  }, input.scope);

  if (response.status !== 200) {
    return false;
  }

  const objectivesValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { objectives?: unknown }).objectives
    : undefined;
  const rows = Array.isArray(objectivesValue) ? objectivesValue : [];
  return input.fixtures.every((fixture) =>
    rows.some((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const objective = item as { id?: unknown; title?: unknown };
      return objective.id === fixture.id || objective.title === fixture.title;
    }),
  );
}

export async function expectFreezeForbiddenTargetPanelsVisible(
  page: Page,
  fixtures: readonly FreezeForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, targetFromFixture(fixture))).toBeVisible();
  }
}

export async function expectFreezeForbiddenButtonsAbsent(
  page: Page,
  fixtures: readonly FreezeForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(freezeButton(page, targetFromFixture(fixture))).toHaveCount(0);
  }
}

export function freezeTargetFixtureValues(targets: Record<string, FreezeForbiddenTargetFixture>) {
  return Object.values(targets);
}

function targetFromFixture(fixture: FreezeForbiddenTargetFixture): AdminFreezeObjectiveTarget {
  return {
    objective: {
      id: fixture.id,
      title: fixture.title,
      flowStatus: fixture.flowStatus,
    },
  };
}

async function readObjective(objectiveId: string): Promise<{
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  confirmedAt: string | null;
  challengers: string[];
} | null> {
  const [row] = await db
    .select({
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      confirmedAt: objectives.confirmedAt,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
