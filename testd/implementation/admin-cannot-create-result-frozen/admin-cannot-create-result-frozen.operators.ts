import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  FrozenAdminCreateResultCaseData,
  FrozenAdminResultTarget,
  RejectedResultCreateResponse,
  TestContext,
} from "./_support/admin-cannot-create-result-frozen.context";
import {
  addMetricButton,
  adminAccountActive,
  deleteTestResult,
  frozenAdminResultTargetAvailable,
  objectivePanel,
  prepareFrozenAdminResultTarget,
  restoreFrozenAdminResultTarget,
  selectFrozenAdminResultTarget,
  submitManagerDefinedResult,
  targetFrozen,
  targetResultAbsent,
  targetResultRow,
  testResultAbsent,
} from "./_support/admin-cannot-create-result-frozen.helpers";

export const adminCannotCreateResultFrozenOperators = {
  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.frozen_admin_result_target": {
    available: async ({ data }) => {
      await expect.poll(() => frozenAdminResultTargetAvailable(data)).toBe(true);
    },

    select: async ({ data }) => {
      const target = await selectFrozenAdminResultTarget(data);
      if (!target) {
        throw new Error("没有可构造实施阶段管理员不可新增指标起点的目标");
      }
      return target;
    },

    original_state_recorded: async ({ params }) => {
      expect(requiredFrozenAdminResultTarget(params, "target").previous).toBeTruthy();
    },

    prepare: async ({ params }) => {
      await prepareFrozenAdminResultTarget(requiredFrozenAdminResultTarget(params, "target"));
    },

    frozen: async ({ params }) => {
      await expect.poll(() => targetFrozen(requiredFrozenAdminResultTarget(params, "target"))).toBe(true);
    },

    result_absent: async ({ params }) => {
      await expect
        .poll(() => targetResultAbsent(requiredFrozenAdminResultTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },

    restore: async ({ params }) => {
      await restoreFrozenAdminResultTarget(optionalFrozenAdminResultTarget(params, "target"));
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestResult(requiredString(params, "title"));
    },
  },

  "api.result_create": {
    submit_manager_defined: async ({ ctx, params }) => {
      return submitManagerDefinedResult(ctx.page, requiredFrozenAdminResultTarget(params, "target"), {
        resultTitle: requiredString(params, "title"),
        metricName: requiredString(params, "metricName"),
      });
    },
  },

  "api.result_create_response": {
    rejected: async ({ params }) => {
      const response = requiredRejectedResponse(params, "response");
      expect(response.ok).toBe(false);
      expect(response.status).toBe(Number(params.status));
    },
  },

  "page.frozen_admin_result_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredFrozenAdminResultTarget(params, "target"))).toBeVisible();
    },

    add_metric_absent: async ({ ctx, params }) => {
      await expect(addMetricButton(ctx.page, requiredFrozenAdminResultTarget(params, "target"))).toHaveCount(0);
    },

    result_absent: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredFrozenAdminResultTarget(params, "target"), requiredString(params, "title"))).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, FrozenAdminCreateResultCaseData>;

function requiredFrozenAdminResultTarget(params: StepParams, key: string): FrozenAdminResultTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FrozenAdminResultTarget).objective !== "object" ||
    (value as FrozenAdminResultTarget).objective === null ||
    typeof (value as FrozenAdminResultTarget).objective.id !== "string" ||
    typeof (value as FrozenAdminResultTarget).objective.title !== "string" ||
    typeof (value as FrozenAdminResultTarget).previous !== "object" ||
    (value as FrozenAdminResultTarget).previous === null
  ) {
    throw new Error(`参数 ${key} 必须是实施阶段管理员新增指标限制目标`);
  }

  return value as FrozenAdminResultTarget;
}

function optionalFrozenAdminResultTarget(params: StepParams, key: string): FrozenAdminResultTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredFrozenAdminResultTarget(params, key);
}

function requiredRejectedResponse(params: StepParams, key: string): RejectedResultCreateResponse {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as RejectedResultCreateResponse).ok !== "boolean" ||
    typeof (value as RejectedResultCreateResponse).status !== "number"
  ) {
    throw new Error(`参数 ${key} 必须是新增指标接口响应`);
  }

  return value as RejectedResultCreateResponse;
}
