import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  MemberCreateTaskForbiddenCaseData,
  MemberCreateTaskForbiddenTarget,
  TestContext,
} from "./_support/member-create-task-forbidden.context";
import {
  deleteTestTask,
  memberWorkbenchMissingObjective,
  prepareForbiddenTaskTarget,
  targetCanCreateTask,
  targetFlowStatus,
  targetHasChallenger,
  targetPanel,
  targetStage,
  targetSubtaskAbsent,
  targetTaskAbsent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "./_support/member-create-task-forbidden.helpers";

export const memberCreateTaskForbiddenOperators = {
  "db.task_target": {
    from_objective: async ({ params }) => taskTargetFromObjective(requiredString(params, "objectiveId")),

    prepare_forbidden: async ({ params }) => {
      await prepareForbiddenTaskTarget(requiredTaskTarget(params, "target"), {
        challengerName: requiredString(params, "challengerName"),
        forbiddenName: requiredString(params, "forbiddenName"),
      });
    },

    flow_status: async ({ params }) => {
      await expect.poll(() => targetFlowStatus(requiredTaskTarget(params, "target"))).toBe(requiredString(params, "status"));
    },

    stage: async ({ params }) => {
      await expect.poll(() => targetStage(requiredTaskTarget(params, "target"))).toBe(requiredString(params, "stage"));
    },

    challenger_present: async ({ params }) => {
      await expect
        .poll(() => targetHasChallenger(requiredTaskTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    challenger_absent: async ({ params }) => {
      await expect
        .poll(() => targetHasChallenger(requiredTaskTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(false);
    },

    cannot_create_task: async ({ params }) => {
      await expect
        .poll(() =>
          targetCanCreateTask(requiredTaskTarget(params, "target"), {
            name: requiredString(params, "actorName"),
            role: requiredString(params, "role"),
          }),
        )
        .toBe(false);
    },

    task_absent: async ({ params }) => {
      await expect
        .poll(() => targetTaskAbsent(requiredTaskTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },

    subtask_absent: async ({ params }) => {
      await expect
        .poll(() => targetSubtaskAbsent(requiredTaskTarget(params, "target"), requiredString(params, "label")))
        .toBe(true);
    },
  },

  "db.task": {
    absent: async ({ params }) => {
      await expect.poll(() => testTaskAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestTask(requiredString(params, "title"));
    },
  },

  "page.task_target": {
    absent: async ({ ctx, params }) => {
      await expect(targetPanel(ctx.page, requiredTaskTarget(params, "target"))).toHaveCount(0);
    },
  },

  "api.member_workbench": {
    objective_absent: async ({ ctx, params }) => {
      await expect
        .poll(() => memberWorkbenchMissingObjective(ctx.page, requiredTaskTarget(params, "target")))
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberCreateTaskForbiddenCaseData>;

function requiredTaskTarget(params: StepParams, key: string): MemberCreateTaskForbiddenTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberCreateTaskForbiddenTarget).objective !== "object" ||
    (value as MemberCreateTaskForbiddenTarget).objective === null ||
    typeof (value as MemberCreateTaskForbiddenTarget).objective.id !== "string" ||
    typeof (value as MemberCreateTaskForbiddenTarget).objective.title !== "string" ||
    typeof (value as MemberCreateTaskForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是行动项反向用例目标`);
  }

  return value as MemberCreateTaskForbiddenTarget;
}
