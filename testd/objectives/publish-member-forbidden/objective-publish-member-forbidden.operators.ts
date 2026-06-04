import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import { objectiveTitleAbsent, removeObjectivesByTitle } from "../publish/_support/objective-publish.helpers";
import type {
  ObjectivePublishMemberForbiddenCaseData,
  TestContext,
} from "./_support/objective-publish-member-forbidden.context";
import {
  memberBountyHallMissingObjectiveTitle,
  memberWorkbenchMissingObjectiveTitle,
  readMemberWorkbenchData,
} from "./_support/objective-publish-member-forbidden.helpers";

export const objectivePublishMemberForbiddenOperators = {
  "db.objective": {
    absent: async ({ params }) => {
      await expect.poll(() => objectiveTitleAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete_by_title: async ({ params }) => {
      await removeObjectivesByTitle(requiredString(params, "title"));
    },
  },

  "api.my_challenges": {
    read_mine: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "api.bounties": {
    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberBountyHallMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "page.objective_publish_action": {
    absent: async ({ ctx, params }) => {
      const objectivePanel = ctx.page.locator("section.orf-objective-panel").filter({ hasText: requiredString(params, "title") });
      await expect(objectivePanel.getByRole("button", { name: "发布" })).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, ObjectivePublishMemberForbiddenCaseData>;
