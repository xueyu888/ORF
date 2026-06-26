import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { optionalString, requiredString } from "../../../../_operators/params";
import type {
  MemberDeleteTaskActiveForbiddenCaseData,
  MemberDeleteTaskActiveForbiddenFixture,
  MemberDeleteTaskActiveForbiddenSubtaskFixture,
  MemberDeleteTaskActiveForbiddenTarget,
  TestContext,
} from "./_support/member-delete-task-active-forbidden.context";
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
  prepareForbiddenActiveDeleteTaskTarget,
  targetCanDeleteTask,
  targetFlowStatus,
  targetHasChallenger,
  targetStage,
  targetTaskPresent,
  taskDeleteMenuButton,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "./_support/member-delete-task-active-forbidden.helpers";

export const memberDeleteTaskActiveForbiddenOperators = {
  "db.task_target": {
    from_objective: async ({ params }) => taskTargetFromObjective(requiredString(params, "objectiveId")),

    prepare_forbidden: async ({ params }) => {
      await prepareForbiddenActiveDeleteTaskTarget(requiredTaskTarget(params, "target"), {
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
        status: requiredString(params, "status") as MemberDeleteTaskActiveForbiddenFixture["status"],
        priority: requiredString(params, "priority") as MemberDeleteTaskActiveForbiddenFixture["priority"],
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
} satisfies OperatorRegistry<TestContext, MemberDeleteTaskActiveForbiddenCaseData>;

function requiredTaskTarget(params: StepParams, key: string): MemberDeleteTaskActiveForbiddenTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskActiveForbiddenTarget).objective !== "object" ||
    (value as MemberDeleteTaskActiveForbiddenTarget).objective === null ||
    typeof (value as MemberDeleteTaskActiveForbiddenTarget).objective.id !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenTarget).objective.title !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是执行中删除行动项反向用例目标`);
  }

  return value as MemberDeleteTaskActiveForbiddenTarget;
}

function requiredTask(params: StepParams, key: string): MemberDeleteTaskActiveForbiddenFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).id !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).title !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).description !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).assignee !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).linkedObjectiveId !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).status !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenFixture).priority !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是执行中删除行动项反向测试任务`);
  }

  return value as MemberDeleteTaskActiveForbiddenFixture;
}

function optionalTask(params: StepParams, key: string): MemberDeleteTaskActiveForbiddenFixture | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  return requiredTask(params, key);
}

function requiredSubtask(params: StepParams, key: string): MemberDeleteTaskActiveForbiddenSubtaskFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskActiveForbiddenSubtaskFixture).id !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenSubtaskFixture).taskId !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenSubtaskFixture).label !== "string" ||
    typeof (value as MemberDeleteTaskActiveForbiddenSubtaskFixture).done !== "boolean"
  ) {
    throw new Error(`参数 ${key} 必须是执行中删除行动项反向测试子行动项`);
  }

  return value as MemberDeleteTaskActiveForbiddenSubtaskFixture;
}
