import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type { CapturedResponse } from "../../_operators/common.context";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  AdminFreezeObjectiveCaseData,
  AdminFreezeObjectiveTarget,
  FreezePrerequisiteResult,
  FrozenObjective,
  TestContext,
} from "./_support/admin-freeze-objective.context";
import {
  createFreezePrerequisiteResult,
  deleteFreezePrerequisiteResult,
  freezeButton,
  freezeTargetFromObjective,
  frozenObjectiveFromResponse,
  frozenStatus,
  objectivePanel,
  prepareFreezeTarget,
  targetFrozen,
  targetReestimating,
  targetResultPresent,
  testResultAbsent,
} from "./_support/admin-freeze-objective.helpers";

export const adminFreezeObjectiveOperators = {
  "db.freeze_target": {
    from_objective: async ({ params }) => freezeTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareFreezeTarget(requiredFreezeTarget(params, "target"));
    },

    reestimating: async ({ params }) => {
      await expect.poll(() => targetReestimating(requiredFreezeTarget(params, "target"))).toBe(true);
    },

    frozen: async ({ params }) => {
      await expect.poll(() => targetFrozen(requiredFreezeTarget(params, "target"))).toBe(true);
    },
  },

  "db.freeze_result": {
    create: async ({ params }) => {
      return createFreezePrerequisiteResult(requiredFreezeTarget(params, "target"), {
        freezeResultTitle: requiredString(params, "title"),
        freezeMetricName: requiredString(params, "metricName"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetResultPresent(requiredFreezeTarget(params, "target"), requiredFreezeResult(params, "result")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteFreezePrerequisiteResult(requiredString(params, "title"), optionalFreezeResult(params, "result"));
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },
  },

  "api.objective_freeze_response": {
    record_objective: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return frozenObjectiveFromResponse(response.body);
    },

    matches: async ({ params }) => {
      const objective = requiredFrozenObjective(params, "objective");
      const target = requiredFreezeTarget(params, "target");
      expect(objective).toMatchObject({
        id: target.objective.id,
        flowStatus: "frozen",
        stage: "goalFrozen",
      });
      expect(objective.confirmedAt).toBeTruthy();
    },
  },

  "page.freeze_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredFreezeTarget(params, "target"))).toBeVisible();
    },

    freeze_enabled: async ({ ctx, params }) => {
      await expect(freezeButton(ctx.page, requiredFreezeTarget(params, "target"))).toBeEnabled();
    },

    freeze: async ({ ctx, params }) => {
      const target = requiredFreezeTarget(params, "target");
      const responsePromise = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "PATCH" && response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/freeze`);
        })
        .then(toCapturedResponse);

      try {
        await freezeButton(ctx.page, target).click();
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
    },

    frozen_status_visible: async ({ ctx, params }) => {
      await expect(frozenStatus(ctx.page, requiredFreezeTarget(params, "target"))).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminFreezeObjectiveCaseData>;

async function toCapturedResponse(response: Response): Promise<CapturedResponse> {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

function requiredFreezeTarget(params: StepParams, key: string): AdminFreezeObjectiveTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as AdminFreezeObjectiveTarget).objective !== "object" ||
    (value as AdminFreezeObjectiveTarget).objective === null ||
    typeof (value as AdminFreezeObjectiveTarget).objective.id !== "string" ||
    typeof (value as AdminFreezeObjectiveTarget).objective.title !== "string" ||
    typeof (value as AdminFreezeObjectiveTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是冻结目标`);
  }

  return value as AdminFreezeObjectiveTarget;
}

function requiredFreezeResult(params: StepParams, key: string): FreezePrerequisiteResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FreezePrerequisiteResult).id !== "string" ||
    typeof (value as FreezePrerequisiteResult).objectiveId !== "string" ||
    typeof (value as FreezePrerequisiteResult).title !== "string" ||
    typeof (value as FreezePrerequisiteResult).metricName !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是冻结前置指标`);
  }

  return value as FreezePrerequisiteResult;
}

function optionalFreezeResult(params: StepParams, key: string): FreezePrerequisiteResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredFreezeResult(params, key);
}

function requiredFrozenObjective(params: StepParams, key: string): FrozenObjective {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FrozenObjective).id !== "string" ||
    typeof (value as FrozenObjective).flowStatus !== "string" ||
    typeof (value as FrozenObjective).stage !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是冻结后的目标`);
  }

  return value as FrozenObjective;
}
