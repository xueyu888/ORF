import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type { CapturedResponse } from "../../_operators/common.context";
import { openObjectiveChildMenu } from "../../_operators/challenge-workbench.helpers";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type {
  AdminCreateResultCaseData,
  AdminCreatedResult,
  AdminCreateResultTarget,
  TestContext,
} from "./_support/admin-create-result.context";
import {
  createdResultFromResponse,
  deleteTestResult,
  objectivePanel,
  resultTargetFromObjective,
  targetCanCreateResult,
  targetMetricMenuItem,
  targetResultAbsent,
  targetResultPresent,
  targetResultRow,
  testResultAbsent,
} from "./_support/admin-create-result.helpers";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

export const adminCreateResultOperators = {
  "db.result_target": {
    from_objective: async ({ params }) => resultTargetFromObjective(requiredString(params, "objectiveId")),

    can_create_result: async ({ params }) => {
      await expect.poll(() => targetCanCreateResult(requiredResultTarget(params, "target"))).toBe(true);
    },

    result_absent: async ({ params }) => {
      await expect
        .poll(() => targetResultAbsent(requiredResultTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },

    result_present: async ({ params }) => {
      await expect
        .poll(() => targetResultPresent(requiredResultTarget(params, "target"), {
          resultTitle: requiredString(params, "title"),
        }))
        .toBe(true);
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestResult(requiredString(params, "title"), optionalCreatedResult(params, "result"));
    },
  },

  "api.result_create_response": {
    record_result: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return createdResultFromResponse(response.body);
    },

    matches: async ({ params }) => {
      const result = requiredCreatedResult(params, "result");
      const target = requiredResultTarget(params, "target");
      expect(result).toMatchObject({
        objectiveId: target.objective.id,
        title: requiredString(params, "title"),
        source: requiredString(params, "source"),
      });
    },
  },

  "page.result_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredResultTarget(params, "target"))).toBeVisible();
    },

    add_metric_enabled: async ({ ctx, params }) => {
      const target = requiredResultTarget(params, "target");
      await openMetricCreationMenu(ctx, target);
      await expect(targetMetricMenuItem(ctx.page, target)).toBeEnabled();
    },

    add_metric: async ({ ctx, params }) => {
      const target = requiredResultTarget(params, "target");
      await openMetricCreationMenu(ctx, target);
      await targetMetricMenuItem(ctx.page, target).click();
    },

    result_visible: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredResultTarget(params, "target"), requiredCreatedResult(params, "result"))).toBeVisible();
    },
  },

  "page.result_inline_editor": {
    submit: async ({ ctx }) => {
      const responsePromise = ctx.page
        .waitForResponse(
          (response) => response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/results"),
          { timeout: CAPTURED_RESPONSE_TIMEOUT_MS },
        )
        .then(toCapturedResponse);

      try {
        await ctx.page.getByLabel("编辑指标标题").press("Enter");
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
    },
  },
} satisfies OperatorRegistry<TestContext, AdminCreateResultCaseData>;

async function toCapturedResponse(response: Response): Promise<CapturedResponse> {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

async function openMetricCreationMenu(ctx: TestContext, target: AdminCreateResultTarget) {
  await openObjectiveChildMenu(ctx.page, target.objective.title, "新增指标");
}

function requiredResultTarget(params: StepParams, key: string): AdminCreateResultTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as AdminCreateResultTarget).objective !== "object" ||
    (value as AdminCreateResultTarget).objective === null ||
    typeof (value as AdminCreateResultTarget).objective.id !== "string" ||
    typeof (value as AdminCreateResultTarget).objective.title !== "string" ||
    typeof (value as AdminCreateResultTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是新增指标目标`);
  }

  return value as AdminCreateResultTarget;
}

function requiredCreatedResult(params: StepParams, key: string): AdminCreatedResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as AdminCreatedResult).id !== "string" ||
    typeof (value as AdminCreatedResult).objectiveId !== "string" ||
    typeof (value as AdminCreatedResult).title !== "string" ||
    typeof (value as AdminCreatedResult).detail !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是新增的指标`);
  }

  return value as AdminCreatedResult;
}

function optionalCreatedResult(params: StepParams, key: string): AdminCreatedResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredCreatedResult(params, key);
}
