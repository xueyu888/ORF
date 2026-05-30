import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  FrozenAdminCreateResultCaseData,
  FrozenAdminResultTarget,
  TestContext,
} from "./_support/admin-cannot-create-result-frozen.context";
import {
  deleteTestResult,
  frozenAdminResultTargetFromObjective,
  objectivePanel,
  prepareFrozenAdminResultTarget,
  targetActionMenuItem,
  targetAddMenuButton,
  targetFrozen,
  targetMetricButton,
  targetResultAbsent,
  targetResultRow,
  testResultAbsent,
} from "./_support/admin-cannot-create-result-frozen.helpers";

export const adminCannotCreateResultFrozenOperators = {
  "db.frozen_admin_result_target": {
    from_objective: async ({ params }) => frozenAdminResultTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareFrozenAdminResultTarget(requiredFrozenAdminResultTarget(params, "target"));
    },

    frozen: async ({ params }) => {
      await expect.poll(() => targetFrozen(requiredFrozenAdminResultTarget(params, "target"))).toBe(true);
    },

    result_absent: async ({ params }) => {
      await expect
        .poll(() => targetResultAbsent(requiredFrozenAdminResultTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestResult(requiredString(params, "title"));
    },
  },

  "page.frozen_admin_result_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredFrozenAdminResultTarget(params, "target"))).toBeVisible();
    },

    open_add_menu: async ({ ctx, params }) => {
      await openAddMenu(ctx, requiredFrozenAdminResultTarget(params, "target"));
    },

    add_action_visible: async ({ ctx, params }) => {
      const target = requiredFrozenAdminResultTarget(params, "target");
      await openAddMenu(ctx, target);
      await expect(targetActionMenuItem(ctx.page, target)).toBeVisible();
    },

    add_metric_absent: async ({ ctx, params }) => {
      const target = requiredFrozenAdminResultTarget(params, "target");
      await openAddMenu(ctx, target);
      await expect(targetMetricButton(ctx.page, target)).toHaveCount(0);
    },

    result_absent: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredFrozenAdminResultTarget(params, "target"), requiredString(params, "title"))).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, FrozenAdminCreateResultCaseData>;

async function openAddMenu(ctx: TestContext, target: FrozenAdminResultTarget) {
  await objectivePanel(ctx.page, target).hover();
  await expect(targetAddMenuButton(ctx.page, target)).toBeEnabled();
  if (!(await targetActionMenuItem(ctx.page, target).isVisible())) {
    await targetAddMenuButton(ctx.page, target).click();
  }
}

function requiredFrozenAdminResultTarget(params: StepParams, key: string): FrozenAdminResultTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FrozenAdminResultTarget).objective !== "object" ||
    (value as FrozenAdminResultTarget).objective === null ||
    typeof (value as FrozenAdminResultTarget).objective.id !== "string" ||
    typeof (value as FrozenAdminResultTarget).objective.title !== "string" ||
    typeof (value as FrozenAdminResultTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是实施阶段管理员新增指标限制目标`);
  }

  return value as FrozenAdminResultTarget;
}
