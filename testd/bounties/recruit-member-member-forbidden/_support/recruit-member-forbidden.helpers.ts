import type { Page } from "@playwright/test";
import type { RecruitMemberTarget } from "./recruit-member-forbidden.context";
import {
  readMemberWorkbenchData,
  workbenchContainsObjective,
} from "../../recruit-member/_support/recruit-member.helpers";

export { readMemberWorkbenchData, workbenchContainsObjective };

export async function memberWorkbenchMissingObjective(
  page: Page,
  target: Pick<RecruitMemberTarget, "id" | "title">,
) {
  return !(await workbenchContainsObjective(page, target, "mine"));
}
