import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type {
  MemberProposeResultCaseData,
  MemberProposeResultTarget,
  MemberProposedResult,
  TestContext,
} from "./_support/member-propose-result.context";
import {
  createdResultFromResponse,
  deleteTestResult,
  objectivePanel,
  prepareProposalTarget,
  proposalTargetFromObjective,
  targetAddMenuButton,
  targetCanProposeResult,
  targetMetricMenuItem,
  targetResultAbsent,
  targetResultPresent,
  targetResultRow,
  testResultAbsent,
} from "./_support/member-propose-result.helpers";

export const memberProposeResultOperators = {
  "db.proposal_target": {
    from_objective: async ({ params }) => proposalTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareProposalTarget(requiredProposalTarget(params, "target"), requiredString(params, "memberName"));
    },

    can_propose_result: async ({ params }) => {
      await expect
        .poll(() => targetCanProposeResult(requiredProposalTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    result_absent: async ({ params }) => {
      await expect
        .poll(() => targetResultAbsent(requiredProposalTarget(params, "target"), requiredString(params, "title")))
        .toBe(true);
    },

    result_present: async ({ params }) => {
      await expect
        .poll(() =>
          targetResultPresent(requiredProposalTarget(params, "target"), {
            name: requiredString(params, "memberName"),
            resultTitle: requiredString(params, "title"),
            metricName: requiredString(params, "metricName"),
          }),
        )
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
      const target = requiredProposalTarget(params, "target");
      expect(result).toMatchObject({
        objectiveId: target.objective.id,
        title: requiredString(params, "title"),
        metricName: requiredString(params, "metricName"),
        source: requiredString(params, "source"),
        definer: requiredString(params, "definer"),
      });
    },
  },

  "page.proposal_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredProposalTarget(params, "target"))).toBeVisible();
    },

    propose_metric_enabled: async ({ ctx, params }) => {
      const target = requiredProposalTarget(params, "target");
      await openMetricProposalMenu(ctx, target);
      await expect(targetMetricMenuItem(ctx.page, target)).toBeEnabled();
      await targetAddMenuButton(ctx.page, target).click();
    },

    propose_metric: async ({ ctx, params }) => {
      const target = requiredProposalTarget(params, "target");
      await openMetricProposalMenu(ctx, target);
      await targetMetricMenuItem(ctx.page, target).click();
    },

    result_visible: async ({ ctx, params }) => {
      await expect(targetResultRow(ctx.page, requiredProposalTarget(params, "target"), requiredCreatedResult(params, "result"))).toBeVisible();
    },
  },

  "page.result_inline_editor": {
    submit: async ({ ctx }) => {
      await ctx.page.getByLabel("编辑指标标题").press("Enter");
    },
  },
} satisfies OperatorRegistry<TestContext, MemberProposeResultCaseData>;

async function openMetricProposalMenu(ctx: TestContext, target: MemberProposeResultTarget) {
  await objectivePanel(ctx.page, target).hover();
  await expect(targetAddMenuButton(ctx.page, target)).toBeEnabled();
  if (!(await targetMetricMenuItem(ctx.page, target).isVisible())) {
    await targetAddMenuButton(ctx.page, target).click();
  }
  await expect(targetMetricMenuItem(ctx.page, target)).toBeVisible();
}

function requiredProposalTarget(params: StepParams, key: string): MemberProposeResultTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberProposeResultTarget).objective !== "object" ||
    (value as MemberProposeResultTarget).objective === null ||
    typeof (value as MemberProposeResultTarget).objective.id !== "string" ||
    typeof (value as MemberProposeResultTarget).objective.title !== "string" ||
    typeof (value as MemberProposeResultTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是成员提出指标目标`);
  }

  return value as MemberProposeResultTarget;
}

function requiredCreatedResult(params: StepParams, key: string): MemberProposedResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberProposedResult).id !== "string" ||
    typeof (value as MemberProposedResult).objectiveId !== "string" ||
    typeof (value as MemberProposedResult).title !== "string" ||
    typeof (value as MemberProposedResult).metricName !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是提出的指标`);
  }

  return value as MemberProposedResult;
}

function optionalCreatedResult(params: StepParams, key: string): MemberProposedResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredCreatedResult(params, key);
}
