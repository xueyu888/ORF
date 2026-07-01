import { expect } from "@playwright/test";
import type { StepParams, OperatorRegistry } from "../../../../_framework/types";
import { optionalString, requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberPermissionSnapshot,
  MemberTargetMutationForbiddenAllStagesCaseData,
  ObjectiveStageTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-target-mutation-forbidden-all-stages.context";
import {
  allMutationResultsForbidden,
  challengeScopeTab,
  clickDeleteForStageTargets,
  clickEditForStageTargets,
  deleteAllStageObjectivesByApi,
  deleteObjectivesByTitlePrefix,
  loginAsMember,
  memberObjectiveContentEditDenied,
  memberPermissionDenied,
  noDeleteConfirmDialog,
  objectiveCountByTitlePrefix,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveTitleEditInput,
  openMyChallenges,
  patchAllStageObjectiveTitles,
  permissionNotice,
  prepareStageObjective,
  readSessionUserName,
  recordMemberPermissionSnapshot,
  removeMemberPermission,
  restoreMemberPermissionSnapshot,
} from "./_support/member-target-mutation-forbidden-all-stages.helpers";

export const memberTargetMutationForbiddenAllStagesOperators: OperatorRegistry<TestContext, MemberTargetMutationForbiddenAllStagesCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "api.permissions": {
    record_member: async () => recordMemberPermissionSnapshot(),

    update_member: async ({ params }) => {
      await removeMemberPermission(requiredString(params, "withoutPermission") as MemberTargetMutationForbiddenAllStagesCaseData["deleteObjectivePermissionKey"]);
    },

    restore_member: async ({ params }) => {
      await restoreMemberPermissionSnapshot(params.snapshot as MemberPermissionSnapshot | undefined);
    },

    member_denied: async ({ ctx, params }) => {
      await expect
        .poll(() => memberPermissionDenied(ctx.page, requiredString(params, "permissionKey") as MemberTargetMutationForbiddenAllStagesCaseData["deleteObjectivePermissionKey"]))
        .toBe(true);
    },
  },

  "api.objective_content_edit_permission": {
    member_denied: async ({ ctx }) => {
      await expect.poll(() => memberObjectiveContentEditDenied(ctx.page)).toBe(true);
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsMember(ctx.page, {
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
    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },

    click_all_edit: async ({ ctx, params }) => {
      await clickEditForStageTargets(ctx.page, requiredStageTargets(params, "targets"));
    },

    click_all_delete: async ({ ctx, params }) => {
      return clickDeleteForStageTargets(ctx.page, requiredStageTargets(params, "targets"));
    },
  },

  "page.challenge_notice": {
    visible: async ({ ctx, params }) => {
      await expect(permissionNotice(ctx.page, requiredString(params, "text"))).toBeVisible();
    },
  },

  "page.objective_title_editor": {
    hidden: async ({ ctx }) => {
      await expect(objectiveTitleEditInput(ctx.page)).toHaveCount(0);
    },
  },

  "page.objective_delete_confirm": {
    absent: async ({ params }) => {
      expect(noDeleteConfirmDialog(params.result)).toBe(true);
    },
  },

  "api.objective_mutation": {
    patch_titles_forbidden: async ({ ctx, params }) =>
      patchAllStageObjectiveTitles(ctx.page, {
        targets: requiredStageTargets(params, "targets"),
        modifiedTitle: requiredString(params, "modifiedTitle"),
      }),

    delete_forbidden: async ({ ctx, params }) =>
      deleteAllStageObjectivesByApi(ctx.page, requiredStageTargets(params, "targets")),

    all_forbidden: async ({ params }) => {
      expect(allMutationResultsForbidden(params.results)).toBe(true);
    },
  },

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredPrefix(params));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredPrefix(params))).toBe(true);
    },

    count: async ({ params }) => {
      await expect.poll(() => objectiveCountByTitlePrefix(requiredPrefix(params))).toBe(requiredNumber(params, "count"));
    },
  },

  "db.objective_stage_fixture": {
    prepare: async ({ params }) =>
      prepareStageObjective({
        memberUser: requiredMemberUser(params, "memberUser"),
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

    unchanged: async ({ params }) => {
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

function requiredPrefix(params: StepParams) {
  const prefix = optionalString(params, "prefix") ?? optionalString(params, "legacyPrefix");
  if (!prefix) {
    throw new Error("参数 prefix 必须是 string");
  }
  return prefix;
}

function requiredStageTargets(params: StepParams, key: string): ObjectiveStageTargetData[] {
  const value = params[key];
  if (!Array.isArray(value)) {
    throw new Error(`参数 ${key} 必须是 ObjectiveStageTargetData[]`);
  }
  return value.map((target) => assertStageTarget(target));
}

function requiredStageTarget(params: StepParams, key: string): ObjectiveStageTargetData {
  return assertStageTarget(params[key]);
}

function assertStageTarget(value: unknown): ObjectiveStageTargetData {
  if (typeof value !== "object" || value === null) {
    throw new Error("阶段目标参数必须是 object");
  }
  const target = value as Partial<ObjectiveStageTargetData>;
  if (
    typeof target.title !== "string" ||
    !isOrfStage(target.stage) ||
    !isObjectiveFlowStatus(target.flowStatus)
  ) {
    throw new Error("阶段目标参数缺少 title/stage/flowStatus");
  }
  return target as ObjectiveStageTargetData;
}

function requiredMemberUser(params: StepParams, key: string): TestUserAccountRecord {
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
