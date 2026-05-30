import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, users } from "../../../../server/db/schema";
import type { BountyHallResponse, MyChallengesResponse, RecruitMemberDbSnapshot, RecruitMemberTarget } from "./recruit-member.context";

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

export async function readMemberWorkbenchData(page: Page): Promise<MyChallengesResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
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

export async function workbenchContainsObjective(page: Page, target: Pick<RecruitMemberTarget, "id" | "title">, scope: "all" | "mine") {
  const response = scope === "all" ? await readAdminWorkbenchData(page) : await readMemberWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  return (response.body.objectives ?? []).some(
    (objective) => objective.id === target.id && objective.title === target.title,
  );
}

export async function bountyHallContainsRecruitment(page: Page, target: Pick<RecruitMemberTarget, "id" | "title">) {
  const response = await readBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return (response.body.recruitmentItems ?? []).some(
    (item) => item.objective?.id === target.id && item.objective?.title === target.title && item.isRecruitment === true,
  );
}

export async function bountyHallMissingRecruitment(page: Page, target: Pick<RecruitMemberTarget, "id" | "title">) {
  const response = await readBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return !(response.body.recruitmentItems ?? []).some(
    (item) => item.objective?.id === target.id && item.objective?.title === target.title,
  );
}

export async function readObjectiveSnapshot(objectiveId: string): Promise<RecruitMemberDbSnapshot | null> {
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
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

export async function userStatusByEmail(email: string) {
  const [row] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return row?.status ?? null;
}

export function objectivePanel(page: Page, target: Pick<RecruitMemberTarget, "title">) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.title }).first();
}

export function recruitDialog(page: Page) {
  return page.getByRole("dialog", { name: "征召挑战者" });
}

export function bountyRow(page: Page, target: Pick<RecruitMemberTarget, "title">) {
  return page.locator(".bounty-list-row").filter({ hasText: target.title }).first();
}

export function acceptChallengeDialog(page: Page) {
  return page.getByRole("dialog", { name: "接受后会进入你的挑战页" });
}
