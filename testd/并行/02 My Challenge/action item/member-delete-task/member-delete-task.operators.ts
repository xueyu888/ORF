import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import type { CapturedResponse } from "../../../../_operators/common.context";
import { requiredCapturedResponse } from "../../../../_operators/common.operators";
import { readResponseBody } from "../../../../_operators/common.helpers";
import { optionalString, requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberDeleteSubtaskFixture,
  MemberDeleteTaskCaseData,
  MemberDeleteTaskFixture,
  MemberDeleteTaskTarget,
  TestContext,
} from "./_support/member-delete-task.context";
import {
  challengeScopeTab,
  challengeStatusTrigger,
  createFixtureSubtask,
  createFixtureTask,
  deleteTestTask,
  fixtureRecorded,
  memberWorkbenchTaskMissing,
  objectivePanel,
  prepareTaskDeleteTarget,
  testTaskAbsent,
  targetCanDeleteTask,
  targetFlowStatus,
  targetHasChallenger,
  targetStage,
  targetSubtaskRow,
  targetTaskAbsent,
  targetTaskPresent,
  targetTaskRow,
  taskDeleteMenuItem,
  taskRowMenuButton,
  taskSubtaskAbsent,
  taskSubtaskPresent,
  taskTargetFromObjective,
} from "./_support/member-delete-task.helpers";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

type DeleteTaskDialogCapture = {
  type: () => string;
  message: () => string;
  accept: () => Promise<CapturedResponse>;
};

export const memberDeleteTaskOperators = {
  "db.task_target": {
    from_objective: async ({ params }) => taskTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareTaskDeleteTarget(requiredTaskTarget(params, "target"), requiredString(params, "memberName"));
    },

    flow_status: async ({ params }) => {
      await expect.poll(() => targetFlowStatus(requiredTaskTarget(params, "target"))).toBe(requiredString(params, "status"));
    },

    stage: async ({ params }) => {
      await expect.poll(() => targetStage(requiredTaskTarget(params, "target"))).toBe(requiredString(params, "stage"));
    },

    challenger_present: async ({ params }) => {
      await expect.poll(() => targetHasChallenger(requiredTaskTarget(params, "target"), requiredString(params, "memberName"))).toBe(true);
    },

    can_delete_task: async ({ params }) => {
      await expect
        .poll(() =>
          targetCanDeleteTask(requiredTaskTarget(params, "target"), {
            name: requiredString(params, "actorName"),
            role: requiredString(params, "role"),
          }),
        )
        .toBe(true);
    },

    task_present: async ({ params }) => {
      await expect.poll(() => targetTaskPresent(requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toBe(true);
    },

    task_absent: async ({ params }) => {
      await expect.poll(() => targetTaskAbsent(requiredTaskTarget(params, "target"), requiredString(params, "title"))).toBe(true);
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
        status: requiredString(params, "status") as MemberDeleteTaskFixture["status"],
        priority: requiredString(params, "priority") as MemberDeleteTaskFixture["priority"],
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

    subtask_absent: async ({ params }) => {
      await expect.poll(() => taskSubtaskAbsent(requiredTask(params, "task"), requiredString(params, "label"))).toBe(true);
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
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredTaskTarget(params, "target"))).toBeVisible();
    },

    task_visible: async ({ ctx, params }) => {
      await expect(targetTaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toBeVisible();
    },

    delete_action_visible: async ({ ctx, params }) => {
      const target = requiredTaskTarget(params, "target");
      const task = requiredTask(params, "task");
      await openTaskDeleteMenu(ctx.page, target, task);
      await expect(taskDeleteMenuItem(ctx.page)).toBeVisible();
      await taskRowMenuButton(ctx.page, target, task).click();
    },

    delete_task: async ({ ctx, params }) => {
      const target = requiredTaskTarget(params, "target");
      const task = requiredTask(params, "task");
      await openTaskDeleteMenu(ctx.page, target, task);
      const responsePromise = ctx.page
        .waitForResponse(
          (response) => response.request().method().toUpperCase() === "DELETE" && response.url().endsWith(`/api/tasks/${encodeURIComponent(task.id)}`),
          { timeout: CAPTURED_RESPONSE_TIMEOUT_MS },
        )
        .then(toCapturedResponse);
      const dialogPromise = new Promise<DeleteTaskDialogCapture>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("等待删除行动项确认弹窗超时")), CAPTURED_RESPONSE_TIMEOUT_MS);
        ctx.page.once("dialog", async (dialog) => {
          clearTimeout(timeout);
          const captured: DeleteTaskDialogCapture = {
            type: () => dialog.type(),
            message: () => dialog.message(),
            accept: () => responsePromise,
          };
          resolve(captured);
          await dialog.accept();
        });
      });
      await taskDeleteMenuItem(ctx.page).click();
      return await dialogPromise;
    },

    task_absent: async ({ ctx, params }) => {
      await expect(targetTaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task"))).toHaveCount(0);
    },

    subtask_absent: async ({ ctx, params }) => {
      await expect(targetSubtaskRow(ctx.page, requiredTaskTarget(params, "target"), requiredSubtask(params, "subtask"))).toHaveCount(0);
    },
  },

  "browser.dialog": {
    present: async ({ params }) => {
      const dialog = requiredDialog(params, "dialog");
      expect(dialog.type()).toBe("confirm");
    },

    message_contains: async ({ params }) => {
      const dialog = requiredDialog(params, "dialog");
      const title = requiredString(params, "title");
      const count = requiredNumber(params, "count");
      expect(dialog.message()).toContain(`删除行动项「${title}」`);
      expect(dialog.message()).toContain(`${count} 个子行动项`);
    },

    accept_delete_task: async ({ ctx, params }) => {
      const dialog = requiredDialog(params, "dialog");
      return await dialog.accept();
    },
  },

  "api.task_delete_response": {
    record: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return response;
    },

    success: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ok: true });
    },
  },

  "api.member_workbench": {
    task_absent: async ({ ctx, params }) => {
      await expect
        .poll(() => memberWorkbenchTaskMissing(ctx.page, requiredTaskTarget(params, "target"), requiredTask(params, "task")))
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberDeleteTaskCaseData>;

async function toCapturedResponse(response: Response): Promise<CapturedResponse> {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

async function openTaskDeleteMenu(page: TestContext["page"], target: MemberDeleteTaskTarget, task: MemberDeleteTaskFixture) {
  await expect(targetTaskRow(page, target, task)).toBeVisible();
  await targetTaskRow(page, target, task).hover();
  if (!(await taskDeleteMenuItem(page).isVisible().catch(() => false))) {
    await taskRowMenuButton(page, target, task).click();
  }
  await expect(taskDeleteMenuItem(page)).toBeVisible();
}

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
    throw new Error(`参数 ${key} 必须是删除行动项用例目标`);
  }

  return value as MemberDeleteTaskTarget;
}

function requiredTask(params: StepParams, key: string): MemberDeleteTaskFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteTaskFixture).id !== "string" ||
    typeof (value as MemberDeleteTaskFixture).title !== "string" ||
    typeof (value as MemberDeleteTaskFixture).description !== "string" ||
    typeof (value as MemberDeleteTaskFixture).assignee !== "string" ||
    typeof (value as MemberDeleteTaskFixture).linkedObjectiveId !== "string" ||
    typeof (value as MemberDeleteTaskFixture).status !== "string" ||
    typeof (value as MemberDeleteTaskFixture).priority !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是删除行动项测试任务`);
  }

  return value as MemberDeleteTaskFixture;
}

function optionalTask(params: StepParams, key: string): MemberDeleteTaskFixture | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  return requiredTask(params, key);
}

function requiredSubtask(params: StepParams, key: string): MemberDeleteSubtaskFixture {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberDeleteSubtaskFixture).id !== "string" ||
    typeof (value as MemberDeleteSubtaskFixture).taskId !== "string" ||
    typeof (value as MemberDeleteSubtaskFixture).label !== "string" ||
    typeof (value as MemberDeleteSubtaskFixture).done !== "boolean"
  ) {
    throw new Error(`参数 ${key} 必须是删除行动项测试子行动项`);
  }

  return value as MemberDeleteSubtaskFixture;
}

function requiredDialog(params: StepParams, key: string): DeleteTaskDialogCapture {
  const value = params[key];
  if (!value || typeof (value as DeleteTaskDialogCapture).accept !== "function" || typeof (value as DeleteTaskDialogCapture).message !== "function") {
    throw new Error(`参数 ${key} 必须是删除确认弹窗`);
  }
  return value as DeleteTaskDialogCapture;
}
