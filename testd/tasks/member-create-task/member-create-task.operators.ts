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
  createdTaskFromResponse,
  deleteTestTask,
  memberAccountActive,
  objectivePanel,
  prepareTaskTarget,
  recordCreatedSubtask,
  restoreTaskTarget,
  selectTaskTarget,
  targetCanCreateTask,
  targetSubtaskRow,
  targetTaskAbsent,
  targetTaskButton,
  targetTaskPresent,
  targetTaskRow,
  taskSubtaskPresent,
  taskTargetAvailable,
  testTaskAbsent,
} from "./_support/member-create-task.helpers";

export const memberCreateTaskOperators = {
  "db.member": {
    active: async ({ params }) => {
      await expect.poll(() => memberAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.task_target": {
    available: async ({ data }) => {
      await expect.poll(() => taskTargetAvailable(data)).toBe(true);
    },

    select: async ({ data }) => {
      const target = await selectTaskTarget(data);
      if (!target) {
        throw new Error("没有可构造成员新增行动项起点的目标");
      }
      return target;
    },

    original_state_recorded: async ({ params }) => {
      expect(requiredTaskTarget(params, "target").previous).toBeTruthy();
    },

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
        .poll(() => targetTaskPresent(requiredTaskTarget(params, "target"), {
          name: requiredString(params, "assignee"),
          taskTitle: requiredString(params, "title"),
          taskDescription: requiredString(params, "description"),
        }))
        .toBe(true);
    },

    restore: async ({ params }) => {
      await restoreTaskTarget(optionalTaskTarget(params, "target"));
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
      return recordCreatedSubtask(requiredTask(params, "task"), requiredString(params, "label"));
    },
  },

  "page.task_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredTaskTarget(params, "target"))).toBeVisible();
    },

    add_task_enabled: async ({ ctx, params }) => {
      await expect(targetTaskButton(ctx.page, requiredTaskTarget(params, "target"))).toBeEnabled();
    },

    add_task: async ({ ctx, params }) => {
      await targetTaskButton(ctx.page, requiredTaskTarget(params, "target")).click();
    },

    add_subtask: async ({ ctx, params }) => {
      const row = targetTaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"));
      await row.hover();
      await row.getByLabel("新增子行动项").click();
    },

    task_visible: async ({ ctx, params }) => {
      await expect(targetTaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toBeVisible();
    },

    subtask_visible: async ({ ctx, params }) => {
      await expect(
        targetSubtaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"), requiredSubtask(params, "subtask")),
      ).toBeVisible();
    },
  },

  "page.task_modal": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("dialog", { name: "新建行动项" })).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, MemberCreateTaskCaseData>;

function requiredTaskTarget(params: StepParams, key: string): MemberCreateTaskTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberCreateTaskTarget).objective !== "object" ||
    (value as MemberCreateTaskTarget).objective === null ||
    typeof (value as MemberCreateTaskTarget).objective.id !== "string" ||
    typeof (value as MemberCreateTaskTarget).objective.title !== "string" ||
    typeof (value as MemberCreateTaskTarget).previous !== "object" ||
    (value as MemberCreateTaskTarget).previous === null
  ) {
    throw new Error(`参数 ${key} 必须是成员新增行动项目标`);
  }

  return value as MemberCreateTaskTarget;
}

function optionalTaskTarget(params: StepParams, key: string): MemberCreateTaskTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredTaskTarget(params, key);
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
