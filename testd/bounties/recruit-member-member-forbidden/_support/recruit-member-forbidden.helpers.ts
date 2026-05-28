import type { Page } from "@playwright/test";
import type { RecruitMemberTarget, RecruitmentAttemptResult } from "./recruit-member-forbidden.context";
import {
  readMemberWorkbenchData,
  readObjectiveSnapshot,
  workbenchContainsObjective,
} from "../../recruit-member/_support/recruit-member.helpers";

export { readMemberWorkbenchData, readObjectiveSnapshot, workbenchContainsObjective };

export async function memberWorkbenchMissingObjective(
  page: Page,
  target: Pick<RecruitMemberTarget, "id" | "title">,
) {
  return !(await workbenchContainsObjective(page, target, "mine"));
}

export async function attemptRecruitmentAsCurrentUser(
  page: Page,
  target: Pick<RecruitMemberTarget, "id">,
  memberName: string,
): Promise<RecruitmentAttemptResult> {
  return page.evaluate(
    async ({ objectiveId, name }) => {
      const response = await fetch(`/api/objectives/${encodeURIComponent(objectiveId)}/recruitments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: [name] }),
      });

      return {
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    },
    { objectiveId: target.id, name: memberName },
  );
}
