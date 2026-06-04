import type { Page } from "@playwright/test";
import type {
  BountyHallResponse,
  MyChallengesResponse,
} from "./objective-publish-member-forbidden.context";

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

export async function memberWorkbenchMissingObjectiveTitle(page: Page, title: string) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  return !(response.body.objectives ?? []).some((objective) => objective.title === title);
}

export async function readMemberBountyHallData(page: Page): Promise<BountyHallResponse> {
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

export async function memberBountyHallMissingObjectiveTitle(page: Page, title: string) {
  const response = await readMemberBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return [
    ...(response.body.availableItems ?? []),
    ...(response.body.recruitmentItems ?? []),
  ].every((item) => item.objective?.title !== title);
}
