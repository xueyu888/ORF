import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  ActionItemData,
  MemberReestimateMetricActionPermissionsCaseData,
  MetricItemData,
  ObjectiveStageTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-reestimate-metric-action-permissions.context";
import {
  actionExistsForObjective,
  actionPrefixAbsent,
  challengeRow,
  clickMemberProposeMetric,
  clickObjectiveAddAction,
  clickRowMenuAction,
  confirmNextDelete,
  deleteObjectivesByTitlePrefix,
  editActionTitle,
  editMetricTitle,
  loginAsMember,
  memberHasNoDirectMetricDeleteCapability,
  memberMetricMutationAllowed,
  memberWorkItemMutationAllowed,
  metricExistsForObjective,
  metricPrefixAbsent,
  myChallengesContainsTitle,
  objectiveHasReestimateMember,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveStageStill,
  openMyChallenges,
  prepareAction,
  prepareMemberReestimateObjective,
  prepareMetric,
  readSessionUserName,
  startActionDelete,
  startMetricDelete,
  submitActionDraft,
  submitMemberMetricDraft,
} from "./_support/member-reestimate-metric-action-permissions.helpers";

export const memberReestimateMetricActionPermissionsOperators: OperatorRegistry<TestContext, MemberReestimateMetricActionPermissionsCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "api.member_metric_mutation_permission": {
    allowed: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          memberMetricMutationAllowed({
            page: ctx.page,
            objectiveTitle: requiredString(params, "objectiveTitle"),
            memberUser: requiredMemberUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },
  },

  "api.member_role_metric_delete_capability": {
    forbidden: async ({ ctx }) => {
      await expect.poll(() => memberHasNoDirectMetricDeleteCapability(ctx.page)).toBe(true);
    },
  },

  "api.member_work_item_mutation_permission": {
    allowed: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          memberWorkItemMutationAllowed({
            page: ctx.page,
            objectiveTitle: requiredString(params, "objectiveTitle"),
            memberUser: requiredMemberUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },
  },

  "api.my_challenges": {
    contains_title: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    not_contains_title: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsTitle(ctx.page, requiredString(params, "title"))).toBe(false);
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

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },
  },

  "page.challenge_items": {
    visible_title: async ({ ctx, params }) => {
      await expect(challengeRow(ctx.page, requiredString(params, "title"))).toBeVisible();
    },

    hidden_title: async ({ ctx, params }) => {
      await expect(challengeRow(ctx.page, requiredString(params, "title"))).toHaveCount(0);
    },
  },

  "page.challenge_objective_add": {
    click_member_metric: async ({ ctx, params }) => {
      await clickMemberProposeMetric(ctx.page, requiredString(params, "objectiveTitle"));
      await expect(ctx.page.getByLabel("编辑指标标题", { exact: true })).toBeVisible();
    },

    click_action: async ({ ctx, params }) => {
      await clickObjectiveAddAction(ctx.page, requiredString(params, "objectiveTitle"));
      await expect(ctx.page.getByLabel("编辑行动项标题", { exact: true })).toBeVisible();
    },
  },

  "page.metric_draft": {
    submit_title: async ({ ctx, params }) => {
      return submitMemberMetricDraft(ctx.page, requiredString(params, "title"));
    },
  },

  "page.action_draft": {
    submit_title: async ({ ctx, params }) => {
      return submitActionDraft(ctx.page, requiredString(params, "title"));
    },
  },

  "page.metric_menu": {
    click_edit: async ({ ctx, params }) => {
      await clickRowMenuAction(ctx.page, requiredString(params, "title"), "编辑");
      await expect(ctx.page.getByLabel("编辑指标标题", { exact: true })).toBeVisible();
    },

    click_delete: async ({ ctx, params }) => {
      await startMetricDelete(ctx.page, requiredString(params, "title"));
    },
  },

  "page.action_menu": {
    click_edit: async ({ ctx, params }) => {
      await clickRowMenuAction(ctx.page, requiredString(params, "title"), "编辑");
      await expect(ctx.page.getByLabel("编辑行动项标题", { exact: true })).toBeVisible();
    },

    click_delete: async ({ ctx, params }) => {
      await startActionDelete(ctx.page, requiredString(params, "title"));
    },
  },

  "page.metric_title_editor": {
    submit_title: async ({ ctx, params }) => {
      await editMetricTitle(ctx.page, {
        oldTitle: requiredString(params, "oldTitle"),
        newTitle: requiredString(params, "newTitle"),
      });
    },
  },

  "page.action_title_editor": {
    submit_title: async ({ ctx, params }) => {
      await editActionTitle(ctx.page, {
        oldTitle: requiredString(params, "oldTitle"),
        newTitle: requiredString(params, "newTitle"),
      });
    },
  },

  "page.action_delete_confirm": {
    confirm: async ({ ctx }) => {
      await confirmNextDelete(ctx.page, "行动项");
    },
  },

  "page.metric_delete_confirm": {
    confirm: async ({ ctx }) => {
      await confirmNextDelete(ctx.page, "指标");
    },
  },

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.metrics_by_prefix": {
    absent: async ({ params }) => {
      await expect.poll(() => metricPrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.actions_by_prefix": {
    absent: async ({ params }) => {
      await expect.poll(() => actionPrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.member_reestimate_objective": {
    prepare: async ({ params }) =>
      prepareMemberReestimateObjective({
        memberUser: requiredMemberUser(params, "memberUser"),
        target: requiredStageTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      const target = requiredStageTarget(params, "target");
      await expect
        .poll(() =>
          objectiveHasReestimateMember({
            title: target.title,
            memberUser: requiredMemberUser(params, "memberUser"),
            stage: target.stage,
            flowStatus: target.flowStatus,
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_stage": {
    exists: async ({ params }) => {
      const target = requiredStageTarget(params, "target");
      await expect
        .poll(() =>
          objectiveStageStill({
            title: target.title,
            stage: target.stage,
            flowStatus: target.flowStatus,
          }),
        )
        .toBe(true);
    },
  },

  "db.metric": {
    prepare: async ({ params }) =>
      prepareMetric({
        memberUser: requiredMemberUser(params, "memberUser"),
        objective: requiredStageTarget(params, "objective"),
        metric: requiredMetricItem(params, "metric"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsForObjective({
            objectiveTitle: requiredString(params, "objectiveTitle"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    absent: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsForObjective({
            objectiveTitle: requiredString(params, "objectiveTitle"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(false);
    },
  },

  "db.action": {
    prepare: async ({ params }) =>
      prepareAction({
        memberUser: requiredMemberUser(params, "memberUser"),
        objective: requiredStageTarget(params, "objective"),
        action: requiredActionItem(params, "action"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          actionExistsForObjective({
            objectiveTitle: requiredString(params, "objectiveTitle"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    absent: async ({ params }) => {
      await expect
        .poll(() =>
          actionExistsForObjective({
            objectiveTitle: requiredString(params, "objectiveTitle"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(false);
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
    typeof target.key !== "string" ||
    typeof target.title !== "string" ||
    target.stage !== "orfReestimate" ||
    target.flowStatus !== "reestimating"
  ) {
    throw new Error(`参数 ${key} 缺少重估中目标字段`);
  }
  return target as ObjectiveStageTargetData;
}

function requiredMetricItem(params: StepParams, key: string): MetricItemData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 MetricItemData`);
  }
  const item = value as Partial<MetricItemData>;
  if (
    typeof item.key !== "string" ||
    typeof item.objectiveKey !== "string" ||
    typeof item.title !== "string" ||
    !isUncertaintyLevel(item.uncertaintyLevel) ||
    typeof item.uncertaintyScore !== "number" ||
    typeof item.acceptedResult !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少指标字段`);
  }
  return item as MetricItemData;
}

function requiredActionItem(params: StepParams, key: string): ActionItemData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ActionItemData`);
  }
  const item = value as Partial<ActionItemData>;
  if (
    typeof item.key !== "string" ||
    typeof item.objectiveKey !== "string" ||
    typeof item.title !== "string" ||
    typeof item.status !== "string" ||
    typeof item.priority !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少行动项字段`);
  }
  return item as ActionItemData;
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

function isUncertaintyLevel(value: unknown): value is MetricItemData["uncertaintyLevel"] {
  return value === "简易" || value === "入门" || value === "进阶" || value === "破局" || value === "渡劫" || value === "飞升";
}
