import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberCreateTaskCaseData,
  MemberCreateTaskTarget,
  MemberCreatedSubtask,
  MemberCreatedTask,
  TestContext,
} from "./_support/member-create-task.context";
import {
  createdSubtaskFromResponse,
  createdTaskFromResponse,
  deleteTestTask,
  objectivePanel,
  prepareTaskTarget,
  targetAddMenuButton,
  targetCanCreateTask,
  targetSubtaskButton,
  targetSubtaskRow,
  targetTaskAbsent,
  targetTaskMenuItem,
  targetTaskPresent,
  targetTaskRow,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "./_support/member-create-task.helpers";

export const memberCreateTaskOperators = {
  "db.task_target": {
    from_objective: async ({ params }) => taskTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareTaskTarget(requiredTaskTarget(params, "target"), requiredString(params, "memberName"));
    },

    can_create_task: async ({ params }) => {
      await expect
        .poll(() => targetCanCreateTask(requiredTaskTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    task_absent: async ({ params }) => {
      await expect
        .poll(() => targetTaskAbsent(requiredTaskTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },

    task_present: async ({ params }) => {
      await expect
        .poll(() =>
          targetTaskPresent(requiredTaskTarget(params, "target"), {
            name: requiredString(params, "assignee"),
            taskTitle: requiredString(params, "title"),
            taskDescription: requiredString(params, "description"),
          }),
        )
        .toBe(true);
    },
  },

  "db.task": {
    absent: async ({ params }) => {
      await expect.poll(() => testTaskAbsent(requiredString(params, "title"))).toBe(true);
    },

    subtask_present: async ({ params }) => {
      await expect.poll(() => taskSubtaskPresent(requiredTask(params, "task"), requiredString(params, "label"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestTask(requiredString(params, "title"), optionalTask(params, "task"));
    },
  },

  "api.task_create_response": {
    record_task: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return createdTaskFromResponse(response.body);
    },

    matches: async ({ params }) => {
      const task = requiredTask(params, "task");
      const target = requiredTaskTarget(params, "target");
      expect(task).toMatchObject({
        linkedObjectiveId: target.objective.id,
        title: requiredString(params, "title"),
        description: requiredString(params, "description"),
        assignee: requiredString(params, "assignee"),
      });
    },
  },

  "api.subtask_create": {
    capture_response: async ({ ctx, runtime, params }) => {
      const task = requiredTask(params, "task");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "POST" && response.url().endsWith(`/api/tasks/${encodeURIComponent(task.id)}/checklist`);
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
    },
  },

  "api.subtask_create_response": {
    record_subtask: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return createdSubtaskFromResponse(response.body, requiredTask(params, "task"));
    },
  },

  "page.task_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredTaskTarget(params, "target"))).toBeVisible();
    },

    add_task_enabled: async ({ ctx, params }) => {
      const target = requiredTaskTarget(params, "target");
      await openTaskCreationMenu(ctx, target);
      await expect(targetTaskMenuItem(ctx.page, target)).toBeEnabled();
      await targetAddMenuButton(ctx.page, target).click();
    },

    add_task: async ({ ctx, params }) => {
      const target = requiredTaskTarget(params, "target");
      await openTaskCreationMenu(ctx, target);
      await targetTaskMenuItem(ctx.page, target).click();
    },

    add_subtask: async ({ ctx, params }) => {
      const target = requiredTaskTarget(params, "target");
      const task = requiredTask(params, "task");
      await targetTaskRow(ctx.page, target, task).hover();
      await expect(targetSubtaskButton(ctx.page, target, task)).toBeEnabled();
      await targetSubtaskButton(ctx.page, target, task).click();
    },

    task_visible: async ({ ctx, params }) => {
      await expect(targetTaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toBeVisible();
    },

    subtask_visible: async ({ ctx, params }) => {
      await expect(targetSubtaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredSubtask(params, "subtask"))).toBeVisible();
    },
  },

  "page.task_inline_editor": {
    submit: async ({ ctx }) => {
      await ctx.page.getByLabel("编辑行动项标题").press("Enter");
    },
  },

  "page.subtask_inline_editor": {
    submit: async ({ ctx }) => {
      await ctx.page.getByLabel("编辑子行动项标题").press("Enter");
    },
  },
} satisfies OperatorRegistry<TestContext, MemberCreateTaskCaseData>;

async function openTaskCreationMenu(ctx: TestContext, target: MemberCreateTaskTarget) {
  await objectivePanel(ctx.page, target).hover();
  await expect(targetAddMenuButton(ctx.page, target)).toBeEnabled();
  if (!(await targetTaskMenuItem(ctx.page, target).isVisible())) {
    await targetAddMenuButton(ctx.page, target).click();
  }
  await expect(targetTaskMenuItem(ctx.page, target)).toBeVisible();
}

function requiredTaskTarget(params: StepParams, key: string): MemberCreateTaskTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberCreateTaskTarget).objective !== "object" ||
    (value as MemberCreateTaskTarget).objective === null ||
    typeof (value as MemberCreateTaskTarget).objective.id !== "string" ||
    typeof (value as MemberCreateTaskTarget).objective.title !== "string" ||
    typeof (value as MemberCreateTaskTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是成员新增行动项目标`);
  }

  return value as MemberCreateTaskTarget;
}

function requiredTask(params: StepParams, key: string): MemberCreatedTask {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberCreatedTask).id !== "string" ||
    typeof (value as MemberCreatedTask).title !== "string" ||
    typeof (value as MemberCreatedTask).linkedObjectiveId !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是新建行动项`);
  }

  return value as MemberCreatedTask;
}

function optionalTask(params: StepParams, key: string): MemberCreatedTask | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredTask(params, key);
}

function requiredSubtask(params: StepParams, key: string): MemberCreatedSubtask {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberCreatedSubtask).id !== "string" ||
    typeof (value as MemberCreatedSubtask).taskId !== "string" ||
    typeof (value as MemberCreatedSubtask).label !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是新建子行动项`);
  }

  return value as MemberCreatedSubtask;
}
