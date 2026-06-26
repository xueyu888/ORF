import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import {
  type MemberDeleteTaskReestimateCaseData,
  type MemberDeleteTaskTarget,
  type TestContext,
} from "./_support/member-delete-task-reestimate.context";
import {
  prepareTaskDeleteReestimateTarget,
  targetCanDeleteReestimateTask,
} from "./_support/member-delete-task-reestimate.helpers";

export const memberDeleteTaskReestimateOperators = {
  "db.task_target": {
    prepare: async ({ params }) => {
      await prepareTaskDeleteReestimateTarget(requiredTaskTarget(params, "target"), requiredString(params, "memberName"));
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
} satisfies OperatorRegistry<TestContext, MemberDeleteTaskReestimateCaseData>;

function requiredTaskTarget(params: StepParams, key: string): MemberDeleteTaskTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskTarget).objective !== "object" ||
    (value as MemberDeleteTaskTarget).objective === null ||
    typeof (value as MemberDeleteTaskTarget).objective.id !== "string" ||
    typeof (value as MemberDeleteTaskTarget).objective.title !== "string" ||
    typeof (value as MemberDeleteTaskTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是重估中删除行动项用例目标`);
  }

  return value as MemberDeleteTaskTarget;
}
