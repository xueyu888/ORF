import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type {
  AdminCreateResultCaseData,
  AdminCreatedResult,
  AdminCreateResultTarget,
  TestContext,
} from "./_support/admin-create-result.context";
import {
  adminAccountActive,
  createdResultFromResponse,
  deleteTestResult,
  objectivePanel,
  resultTargetAvailable,
  selectResultTarget,
  targetCanCreateResult,
  targetMetricButton,
  targetResultAbsent,
  targetResultPresent,
  targetResultRow,
  testResultAbsent,
} from "./_support/admin-create-result.helpers";

export const adminCreateResultOperators = {
  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.result_target": {
    available: async ({ data }) => {
      await expect.poll(() => resultTargetAvailable(data)).toBe(true);
    },

    select: async ({ data }) => {
      const target = await selectResultTarget(data);
      if (!target) {
        throw new Error("没有可新增指标的目标");
      }
      return target;
    },

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
          metricName: requiredString(params, "metricName"),
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
        metricName: requiredString(params, "metricName"),
        source: requiredString(params, "source"),
      });
    },
  },

  "page.result_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredResultTarget(params, "target"))).toBeVisible();
    },

    add_metric_enabled: async ({ ctx, params }) => {
      await expect(targetMetricButton(ctx.page, requiredResultTarget(params, "target"))).toBeEnabled();
    },

    add_metric: async ({ ctx, params }) => {
      await targetMetricButton(ctx.page, requiredResultTarget(params, "target")).click();
    },

    result_visible: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredResultTarget(params, "target"), requiredCreatedResult(params, "result"))).toBeVisible();
    },
  },

  "page.result_modal": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("dialog", { name: "新增指标" })).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminCreateResultCaseData>;

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
    typeof (value as AdminCreatedResult).metricName !== "string"
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
