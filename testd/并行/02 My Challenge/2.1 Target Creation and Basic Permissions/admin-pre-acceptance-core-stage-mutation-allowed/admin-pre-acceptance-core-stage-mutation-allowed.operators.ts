import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminPreAcceptanceCoreStageMutationAllowedCaseData,
  ObjectiveStageTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/admin-pre-acceptance-core-stage-mutation-allowed.context";
import {
  adminObjectiveContentEditGranted,
  adminPermissionGranted,
  challengeScopeTab,
  clickObjectiveMenuAction,
  confirmNextObjectiveDelete,
  deleteObjectivesByTitlePrefix,
  editObjectiveTitle,
  loginAsAdmin,
  myChallengesContainsObjectiveTitle,
  objectiveAbsentByTitle,
  objectiveCountByTitlePrefix,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveTitleEditInput,
  openMyChallenges,
  prepareStageObjective,
  readSessionUserName,
  selectChallengeScope,
  startObjectiveDelete,
} from "./_support/admin-pre-acceptance-core-stage-mutation-allowed.helpers";

export const adminPreAcceptanceCoreStageMutationAllowedOperators: OperatorRegistry<TestContext, AdminPreAcceptanceCoreStageMutationAllowedCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "api.permissions": {
    admin_granted: async ({ ctx, params }) => {
      await expect
        .poll(() => adminPermissionGranted(ctx.page, requiredString(params, "permissionKey") as AdminPreAcceptanceCoreStageMutationAllowedCaseData["deleteObjectivePermissionKey"]))
        .toBe(true);
    },
  },

  "api.objective_content_edit_permission": {
    admin_granted: async ({ ctx }) => {
      await expect.poll(() => adminObjectiveContentEditGranted(ctx.page)).toBe(true);
    },
  },

  "api.my_challenges": {
    contains_title: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    not_contains_title: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(false);
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsAdmin(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.challenge": {
    open_my_challenges: async ({ ctx }) => {
      await openMyChallenges(ctx.page);
    },

    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/tasks(?:[?#].*)?$/);
    },
  },

  "page.challenge_scope": {
    select: async ({ ctx, params }) => {
      await selectChallengeScope(ctx.page, requiredString(params, "label"));
    },

    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_objective_menu": {
    click_edit: async ({ ctx, params }) => {
      await clickObjectiveMenuAction(ctx.page, requiredString(params, "title"), "编辑");
      await expect(objectiveTitleEditInput(ctx.page)).toBeVisible();
    },

    click_delete: async ({ ctx, params }) => {
      await startObjectiveDelete(ctx.page, requiredString(params, "title"));
    },
  },

  "page.objective_title_editor": {
    submit_title: async ({ ctx, params }) => {
      await editObjectiveTitle(ctx.page, {
        oldTitle: requiredString(params, "oldTitle"),
        newTitle: requiredString(params, "newTitle"),
      });
    },
  },

  "page.objective_delete_confirm": {
    confirm: async ({ ctx }) => {
      await confirmNextObjectiveDelete(ctx.page);
    },
  },

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },

    hidden_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toHaveCount(0);
    },
  },

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },

    count: async ({ params }) => {
      await expect.poll(() => objectiveCountByTitlePrefix(requiredString(params, "prefix"))).toBe(requiredNumber(params, "count"));
    },
  },

  "db.objective": {
    absent_by_title: async ({ params }) => {
      await expect.poll(() => objectiveAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },
  },

  "db.objective_stage_fixture": {
    prepare: async ({ params }) =>
      prepareStageObjective({
        adminUser: requiredAdminUser(params, "adminUser"),
        target: requiredStageTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      const target = requiredStageTarget(params, "target");
      await expect
        .poll(() =>
          objectiveHasStageAndFlowStatus({
            title: target.title,
            stage: target.stage,
            flowStatus: target.flowStatus,
          }),
        )
        .toBe(true);
    },
  },
};

function requiredStageTarget(params: StepParams, key: string): ObjectiveStageTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ObjectiveStageTargetData`);
  }
  const target = value as Partial<ObjectiveStageTargetData>;
  if (
    typeof target.title !== "string" ||
    !isOrfStage(target.stage) ||
    !isObjectiveFlowStatus(target.flowStatus)
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus`);
  }
  return target as ObjectiveStageTargetData;
}

function requiredAdminUser(params: StepParams, key: string): TestUserAccountRecord {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TestUserAccountRecord`);
  }
  const account = value as Partial<TestUserAccountRecord>;
  if (
    typeof account.userId !== "string" ||
    typeof account.teamId !== "string" ||
    typeof account.email !== "string" ||
    typeof account.name !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 userId/teamId/email/name`);
  }
  return account as TestUserAccountRecord;
}

function isOrfStage(value: unknown): value is ObjectiveStageTargetData["stage"] {
  return value === "goalSetting" || value === "resultClaiming" || value === "orfReestimate" || value === "goalFrozen";
}

function isObjectiveFlowStatus(value: unknown): value is ObjectiveStageTargetData["flowStatus"] {
  return value === "candidate" || value === "open" || value === "reestimating" || value === "frozen";
}
