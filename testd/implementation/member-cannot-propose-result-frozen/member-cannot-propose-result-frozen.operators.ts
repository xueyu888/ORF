import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  FrozenMemberProposalCaseData,
  FrozenProposalTarget,
  RejectedResultCreateResponse,
  TestContext,
} from "./_support/member-cannot-propose-result-frozen.context";
import {
  deleteTestResult,
  frozenProposalTargetFromObjective,
  objectivePanel,
  prepareFrozenProposalTarget,
  submitMemberProposedResult,
  targetFrozenForMember,
  targetMetricButton,
  targetResultAbsent,
  targetResultRow,
  testResultAbsent,
} from "./_support/member-cannot-propose-result-frozen.helpers";

export const memberCannotProposeResultFrozenOperators = {
  "db.frozen_proposal_target": {
    from_objective: async ({ params }) => frozenProposalTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareFrozenProposalTarget(requiredFrozenProposalTarget(params, "target"), requiredString(params, "memberName"));
    },

    frozen_for_member: async ({ params }) => {
      await expect
        .poll(() => targetFrozenForMember(requiredFrozenProposalTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    result_absent: async ({ params }) => {
      await expect
        .poll(() => targetResultAbsent(requiredFrozenProposalTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
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
    submit_member_proposed: async ({ ctx, params }) => {
      return submitMemberProposedResult(ctx.page, requiredFrozenProposalTarget(params, "target"), {
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

  "page.frozen_proposal_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredFrozenProposalTarget(params, "target"))).toBeVisible();
    },

    propose_metric_absent: async ({ ctx, params }) => {
      await expect(targetMetricButton(ctx.page, requiredFrozenProposalTarget(params, "target"))).toHaveCount(0);
    },

    result_absent: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredFrozenProposalTarget(params, "target"), requiredString(params, "title"))).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, FrozenMemberProposalCaseData>;

function requiredFrozenProposalTarget(params: StepParams, key: string): FrozenProposalTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FrozenProposalTarget).objective !== "object" ||
    (value as FrozenProposalTarget).objective === null ||
    typeof (value as FrozenProposalTarget).objective.id !== "string" ||
    typeof (value as FrozenProposalTarget).objective.title !== "string" ||
    typeof (value as FrozenProposalTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是实施阶段成员提出指标限制目标`);
  }

  return value as FrozenProposalTarget;
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
