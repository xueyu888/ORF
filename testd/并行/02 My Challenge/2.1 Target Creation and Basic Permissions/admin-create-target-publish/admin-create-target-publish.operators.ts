import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  AdminCreateTargetPublishCaseData,
  AdminCreateTargetPublishObjective,
  TestContext,
} from "./_support/admin-create-target-publish.context";
import {
  bountyHallContainsObjective,
  bountyObjectiveRow,
  challengeProjectTrigger,
  challengeScopeTab,
  clickCreateObjective,
  createObjectiveButton,
  dbObjectivePublished,
  draftTitleInput,
  loginAsAdmin,
  objectivePanel,
  publishObjectiveFromPanel,
  recruitButton,
  submitDraftTitle,
} from "./_support/admin-create-target-publish.helpers";

export const adminCreateTargetPublishOperators: OperatorRegistry<TestContext, AdminCreateTargetPublishCaseData> = {
  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsAdmin(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.create_objective_action": {
    visible: async ({ ctx }) => {
      await expect(createObjectiveButton(ctx.page)).toBeVisible();
    },

    enabled: async ({ ctx }) => {
      await expect(createObjectiveButton(ctx.page)).toBeEnabled();
    },

    click: async ({ ctx }) => {
      await clickCreateObjective(ctx.page);
    },
  },

  "page.challenge_scope": {
    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_project_filter": {
    selected: async ({ ctx, params }) => {
      await expect(challengeProjectTrigger(ctx.page)).toContainText(requiredString(params, "label"));
    },
  },

  "page.objective_draft_title": {
    fill: async ({ ctx, params }) => {
      await draftTitleInput(ctx.page).fill(requiredString(params, "title"));
    },

    submit: async ({ ctx, params }) => {
      return submitDraftTitle(ctx.page, requiredString(params, "title"));
    },
  },

  "page.challenge_objective": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    publish: async ({ ctx, params }) => {
      return publishObjectiveFromPanel(ctx.page, requiredObjective(params, "objective"));
    },

    recruit_action_visible: async ({ ctx, params }) => {
      await expect(recruitButton(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    recruit_action_enabled: async ({ ctx, params }) => {
      await expect(recruitButton(ctx.page, requiredObjective(params, "objective"))).toBeEnabled();
    },
  },

  "api.bounty_hall": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallContainsObjective(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },
  },

  "page.bounty_hall": {
    objective_visible: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },
  },

  "db.objective_publication": {
    published: async ({ params }) => {
      await expect.poll(() => dbObjectivePublished(requiredObjective(params, "objective"))).toBe(true);
    },
  },
};

function requiredObjective(params: Record<string, unknown>, key: string): AdminCreateTargetPublishObjective {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AdminCreateTargetPublishObjective).id === "string" &&
    typeof (value as AdminCreateTargetPublishObjective).title === "string"
  ) {
    return value as AdminCreateTargetPublishObjective;
  }

  throw new Error(`参数 ${key} 必须是本用例目标`);
}
