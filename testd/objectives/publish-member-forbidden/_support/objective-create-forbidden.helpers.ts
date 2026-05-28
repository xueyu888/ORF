import type { Page } from "@playwright/test";
import type { ApiAttemptResult, MyChallengesResponse } from "./objective-create-forbidden.context";

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

export async function attemptCreateObjectiveAsCurrentUser(page: Page, title: string): Promise<ApiAttemptResult> {
  return page.evaluate(async (objectiveTitle) => {
    const response = await fetch("/api/objectives", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: objectiveTitle,
        whyItMatters: "普通成员越权新增目标测试",
        cycle: "E2E",
        boundary: "普通成员不应创建目标",
        finalDueAt: "2026-12-31",
      }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, title);
}
