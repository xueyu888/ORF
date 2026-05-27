import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import { deleteObjective } from "../../../../server/repositories/orfRepository";
import type {
  BountyHallResponse,
  MyChallengesResponse,
  ObjectivePublishDbSnapshot,
  ObjectivePublishTarget,
} from "./objective-publish.context";

export async function objectiveTitleAbsent(title: string) {
  return (await readObjectiveByTitle(title)) === null;
}

export async function readObjectiveByTitle(title: string): Promise<ObjectivePublishDbSnapshot | null> {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);

  return row ?? null;
}

export async function removeObjectivesByTitle(title: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.title, title));
  for (const row of rows) {
    const deleted = await deleteObjective(row.id);
    if (!deleted) {
      await db.delete(objectives).where(eq(objectives.id, row.id));
    }
  }
}

export async function readAdminWorkbenchData(page: Page): Promise<MyChallengesResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=all", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

export async function workbenchContainsObjective(page: Page, target: ObjectivePublishTarget) {
  const response = await readAdminWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  return (response.body.objectives ?? []).some(
    (objective) => objective.id === target.id && objective.title === target.title,
  );
}

export async function workbenchMissingObjectiveTitle(page: Page, title: string) {
  const response = await readAdminWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  return !(response.body.objectives ?? []).some((objective) => objective.title === title);
}

export async function readBountyHallData(page: Page): Promise<BountyHallResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bounties", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

export async function bountyHallContainsObjective(page: Page, target: ObjectivePublishTarget) {
  const response = await readBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return [...(response.body.availableItems ?? []), ...(response.body.recruitmentItems ?? [])].some(
    (item) => item.objective?.id === target.id && item.objective?.title === target.title,
  );
}

export async function visibleObjectiveInWorkbench(page: Page, target: ObjectivePublishTarget) {
  await objectivePanel(page, target).waitFor({ state: "visible" });
}

export function objectivePanel(page: Page, target: Pick<ObjectivePublishTarget, "title">) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.title }).first();
}

export function bountyRow(page: Page, target: Pick<ObjectivePublishTarget, "title">) {
  return page.locator(".bounty-list-row").filter({ hasText: target.title }).first();
}
