import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { optionalString, requiredString } from "../../_operators/params";
import type {
  MemberDeleteTaskReestimateForbiddenCaseData,
  MemberDeleteTaskReestimateForbiddenFixture,
  MemberDeleteTaskReestimateForbiddenSubtaskFixture,
  MemberDeleteTaskReestimateForbiddenTarget,
  TestContext,
} from "./_support/member-delete-task-reestimate-forbidden.context";
import {
  challengeScopeTab,
  challengeStatusTrigger,
  createFixtureSubtask,
  createFixtureTask,
  deleteTestTask,
  fixtureRecorded,
  memberWorkbenchMissingObjective,
  memberWorkbenchMissingTask,
  objectivePanel,
  prepareForbiddenReestimateDeleteTaskTarget,
  targetCanDeleteTask,
  targetFlowStatus,
  targetHasChallenger,
  targetStage,
  targetTaskPresent,
  taskDeleteMenuButton,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "./_support/member-delete-task-reestimate-forbidden.helpers";

export const memberDeleteTaskReestimateForbiddenOperators = {
  "db.task_target": {
    from_objective: async ({ params }) => taskTargetFromObjective(requiredString(params, "objectiveId")),

    prepare_forbidden: async ({ params }) => {
      await prepareForbiddenReestimateDeleteTaskTarget(requiredTaskTarget(params, "target"), {
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

    cannot_delete_task: async ({ params }) => {
      await expect
        .poll(() =>
          targetCanDeleteTask(requiredTaskTarget(params, "target"), {
            name: requiredString(params, "actorName"),
            role: requiredString(params, "role"),
          }),
        )
        .toBe(false);
    },

    task_present: async ({ params }) => {
      await expect.poll(() => targetTaskPresent(requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toBe(true);
    },
  },

  "db.task": {
    create_fixture: async ({ params }) =>
      createFixtureTask({
        id: requiredString(params, "id"),
        linkedObjectiveId: requiredTaskTarget(params, "target").objective.id,
        teamId: requiredString(params, "teamId"),
        userId: optionalString(params, "userId") ?? undefined,
        title: requiredString(params, "title"),
        description: requiredString(params, "description"),
        assignee: requiredString(params, "assignee"),
        status: requiredString(params, "status") as MemberDeleteTaskReestimateForbiddenFixture["status"],
        priority: requiredString(params, "priority") as MemberDeleteTaskReestimateForbiddenFixture["priority"],
      }),

    create_subtask_fixture: async ({ params }) =>
      createFixtureSubtask({
        id: requiredString(params, "id"),
        taskId: requiredTask(params, "task").id,
        label: requiredString(params, "label"),
      }),

    fixture_recorded: async ({ params }) => {
      await expect.poll(() => fixtureRecorded(requiredTask(params, "task"), requiredSubtask(params, "subtask"))).toBe(true);
    },

    subtask_present: async ({ params }) => {
      await expect.poll(() => taskSubtaskPresent(requiredTask(params, "task"), requiredString(params, "label"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestTask(requiredString(params, "title"), optionalTask(params, "task"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => testTaskAbsent(requiredString(params, "title"))).toBe(true);
    },
  },

  "page.challenge_scope": {
    select: async ({ ctx, params }) => {
      await challengeScopeTab(ctx.page, requiredString(params, "label")).click();
    },

    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_status_filter": {
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      await challengeStatusTrigger(ctx.page).click();
      await ctx.page.getByRole("option", { name: label }).click();
      await expect(challengeStatusTrigger(ctx.page)).toContainText(label);
    },

    selected: async ({ ctx, params }) => {
      await expect(challengeStatusTrigger(ctx.page)).toContainText(requiredString(params, "label"));
    },
  },

  "page.task_target": {
    absent: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredTaskTarget(params, "target"))).toHaveCount(0);
    },

    delete_action_absent: async ({ ctx, params }) => {
      await expect(taskDeleteMenuButton(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toHaveCount(0);
    },
  },

  "api.member_workbench": {
    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingObjective(ctx.page, requiredTaskTarget(params, "target"))).toBe(true);
    },

    task_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingTask(ctx.page, requiredTask(params, "task"))).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberDeleteTaskReestimateForbiddenCaseData>;

function requiredTaskTarget(params: StepParams, key: string): MemberDeleteTaskReestimateForbiddenTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskReestimateForbiddenTarget).objective !== "object" ||
    (value as MemberDeleteTaskReestimateForbiddenTarget).objective === null ||
    typeof (value as MemberDeleteTaskReestimateForbiddenTarget).objective.id !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenTarget).objective.title !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是重估中删除行动项反向用例目标`);
  }

  return value as MemberDeleteTaskReestimateForbiddenTarget;
}

function requiredTask(params: StepParams, key: string): MemberDeleteTaskReestimateForbiddenFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).id !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).title !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).description !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).assignee !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).linkedObjectiveId !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).status !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenFixture).priority !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是重估中删除行动项反向测试任务`);
  }

  return value as MemberDeleteTaskReestimateForbiddenFixture;
}

function optionalTask(params: StepParams, key: string): MemberDeleteTaskReestimateForbiddenFixture | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  return requiredTask(params, key);
}

function requiredSubtask(params: StepParams, key: string): MemberDeleteTaskReestimateForbiddenSubtaskFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskReestimateForbiddenSubtaskFixture).id !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenSubtaskFixture).taskId !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenSubtaskFixture).label !== "string" ||
    typeof (value as MemberDeleteTaskReestimateForbiddenSubtaskFixture).done !== "boolean"
  ) {
    throw new Error(`参数 ${key} 必须是重估中删除行动项反向测试子行动项`);
  }

  return value as MemberDeleteTaskReestimateForbiddenSubtaskFixture;
}
