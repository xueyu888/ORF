import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  MemberEditObjectiveForbiddenCaseData,
  MemberEditObjectiveForbiddenObjective,
  ObjectiveUpdateResponse,
  TestContext,
} from "./_support/member-edit-objective-forbidden.context";
import {
  challengeScopeTab,
  challengeStatusTrigger,
  doubleClickObjectiveTitle,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectivePanel,
  objectiveTitleEquals,
  objectiveTitleInput,
  submitObjectiveTitleUpdate,
  toastMessage,
  upsertActiveMemberObjective,
} from "./_support/member-edit-objective-forbidden.helpers";

export const memberEditObjectiveForbiddenOperators = {
  "db.member_challenge_objective": {
    upsert_active: async ({ params }) =>
      upsertActiveMemberObjective({
        id: requiredString(params, "id"),
        teamId: requiredString(params, "teamId"),
        title: requiredString(params, "title"),
        memberName: requiredString(params, "memberName"),
        memberUserId: requiredString(params, "memberUserId"),
        status: requiredString(params, "status"),
      }),

    flow_status: async ({ params }) => {
      await expect.poll(() => objectiveFlowStatus(requiredObjective(params, "objective"))).toBe(requiredString(params, "status"));
    },

    challenger_present: async ({ params }) => {
      await expect
        .poll(() => objectiveHasChallenger(requiredObjective(params, "objective"), requiredString(params, "memberName")))
        .toBe(true);
    },

    title_equals: async ({ params }) => {
      await expect.poll(() => objectiveTitleEquals(requiredObjective(params, "objective"), requiredString(params, "title"))).toBe(true);
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
      await ctx.page.getByRole("option", { name: label, exact: true }).click();
      await expect(challengeStatusTrigger(ctx.page)).toContainText(label);
    },

    selected: async ({ ctx, params }) => {
      await expect(challengeStatusTrigger(ctx.page)).toContainText(requiredString(params, "label"));
    },
  },

  "page.challenge_objective": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    title_input_absent: async ({ ctx }) => {
      await expect(objectiveTitleInput(ctx.page)).toHaveCount(0);
    },

    double_click_title: async ({ ctx, params }) => {
      await doubleClickObjectiveTitle(ctx.page, requiredObjective(params, "objective"));
    },
  },

  "api.objective_update": {
    submit_title: async ({ ctx, params }) =>
      submitObjectiveTitleUpdate(
        ctx.page,
        requiredObjective(params, "objective"),
        requiredString(params, "title"),
      ),
  },

  "api.objective_update_result": {
    forbidden: async ({ params }) => {
      const response = requiredObjectiveUpdateResponse(params, "response");
      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    },
  },

  "page.toast": {
    visible: async ({ ctx, params }) => {
      await expect(toastMessage(ctx.page, requiredString(params, "message"))).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, MemberEditObjectiveForbiddenCaseData>;

function requiredObjective(params: StepParams, key: string): MemberEditObjectiveForbiddenObjective {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberEditObjectiveForbiddenObjective).id !== "string" ||
    typeof (value as MemberEditObjectiveForbiddenObjective).teamId !== "string" ||
    typeof (value as MemberEditObjectiveForbiddenObjective).title !== "string" ||
    typeof (value as MemberEditObjectiveForbiddenObjective).flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是目标编辑权限用例目标`);
  }

  return value as MemberEditObjectiveForbiddenObjective;
}

function requiredObjectiveUpdateResponse(params: StepParams, key: string): ObjectiveUpdateResponse {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ObjectiveUpdateResponse).ok !== "boolean" ||
    typeof (value as ObjectiveUpdateResponse).status !== "number"
  ) {
    throw new Error(`参数 ${key} 必须是目标详情修改响应`);
  }

  return value as ObjectiveUpdateResponse;
}
