import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../_framework/types";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { requiredString } from "../../../_operators/params";
import { adminDeleteTaskActiveOperators } from "../admin-delete-task-active/admin-delete-task-active.operators";
import type {
  AdminDeleteTaskReestimateCaseData,
  AdminDeleteTaskReestimateTarget,
  TestContext,
} from "./_support/admin-delete-task-reestimate.context";
import {
  prepareAdminTaskDeleteReestimateTarget,
  targetCanDeleteReestimateTask,
} from "./_support/admin-delete-task-reestimate.helpers";

const reestimateTargetOperators = {
  "db.task_target": {
    prepare: async ({ params }) => {
      await prepareAdminTaskDeleteReestimateTarget(requiredTaskTarget(params, "target"), requiredString(params, "memberName"));
    },

    can_delete_task: async ({ params }) => {
      await expect
        .poll(() =>
          targetCanDeleteReestimateTask(requiredTaskTarget(params, "target"), {
            name: requiredString(params, "actorName"),
            role: requiredString(params, "role"),
          }),
        )
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminDeleteTaskReestimateCaseData>;

export const adminDeleteTaskReestimateOperators = mergeOperatorRegistries(
  adminDeleteTaskActiveOperators as unknown as OperatorRegistry<TestContext, AdminDeleteTaskReestimateCaseData>,
  reestimateTargetOperators,
);

function requiredTaskTarget(params: StepParams, key: string): AdminDeleteTaskReestimateTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as AdminDeleteTaskReestimateTarget).objective !== "object" ||
    (value as AdminDeleteTaskReestimateTarget).objective === null ||
    typeof (value as AdminDeleteTaskReestimateTarget).objective.id !== "string" ||
    typeof (value as AdminDeleteTaskReestimateTarget).objective.title !== "string" ||
    typeof (value as AdminDeleteTaskReestimateTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是管理员重估中删除行动项用例目标`);
  }

  return value as AdminDeleteTaskReestimateTarget;
}
