import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberReestimateCompleteRequestCaseData,
  ReestimateObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-reestimate-complete-request.context";
import {
  alignmentRequestExists,
  challengeScopeTab,
  clickAddMetricAction,
  deleteObjectivesByTitlePrefix,
  fillMetricTitle,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsWithDifficulty,
  metricRow,
  myChallengesContainsMetricWithDifficulty,
  myChallengesContainsObjective,
  myChallengesContainsOpenAlignmentRequest,
  objectiveChallengerContains,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveReestimateDueFuture,
  openAlignmentRequestAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareReestimateObjective,
  readSessionUserName,
  requestReestimateCompletion,
  selectMetricDifficulty,
  submitMetricTitle,
  toast,
} from "./_support/member-reestimate-complete-request.helpers";

export const memberReestimateCompleteRequestOperators: OperatorRegistry<TestContext, MemberReestimateCompleteRequestCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsMember(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.challenge": {
    open_my_challenges: async ({ ctx }) => {
      await openMyChallenges(ctx.page);
    },

    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/tasks(?:[?#].*)?$/);
    },
  },

  "page.challenge_scope": {
    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_toast": {
    reestimate_alignment_requested: async ({ ctx }) => {
      await expect(toast(ctx.page, "已申请重估对齐")).toBeVisible();
    },
  },

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },
  },

  "page.challenge_objective": {
    status_visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toContainText(requiredString(params, "statusLabel"));
    },
  },

  "page.challenge_metric": {
    click_add: async ({ ctx, params }) => {
      await clickAddMetricAction(ctx.page, requiredString(params, "targetTitle"));
    },

    visible_under_objective: async ({ ctx, params }) => {
      const panel = objectivePanel(ctx.page, requiredString(params, "targetTitle"));
      await expect(panel).toBeVisible();
      await expect(panel.locator(".orf-result-row").filter({ hasText: requiredString(params, "metricTitle") })).toBeVisible();
    },
  },

  "page.metric_title_editor": {
    fill: async ({ ctx, params }) => {
      await fillMetricTitle(ctx.page, requiredString(params, "title"));
    },

    submit: async ({ ctx, params }) => {
      return submitMetricTitle(ctx.page, requiredString(params, "title"));
    },
  },

  "page.metric_difficulty": {
    select: async ({ ctx, params }) => {
      await selectMetricDifficulty(ctx.page, {
        metricTitle: requiredString(params, "metricTitle"),
        difficulty: requiredDifficulty(params, "difficulty"),
      });
    },

    visible: async ({ ctx, params }) => {
      await expect(metricRow(ctx.page, requiredString(params, "metricTitle"))).toContainText(requiredDifficulty(params, "difficulty"));
    },
  },

  "page.objective_alignment": {
    request_reestimate_completion: async ({ ctx, params }) => {
      await requestReestimateCompletion(ctx.page, requiredString(params, "targetTitle"));
    },

    request_reestimate_completion_hidden: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "targetTitle")).getByRole("button", { name: "申请完成重估", exact: true })).toHaveCount(0);
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    contains_metric_with_difficulty: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsMetricWithDifficulty(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metricTitle: requiredString(params, "metricTitle"),
            difficulty: requiredDifficulty(params, "difficulty"),
          }),
        )
        .toBe(true);
    },

    contains_open_alignment_request: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsOpenAlignmentRequest(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            kind: requiredAlignmentKind(params, "kind"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.reestimate_objective_fixture": {
    prepare: async ({ params }) =>
      prepareReestimateObjective({
        memberUser: requiredMemberUser(params, "memberUser"),
        target: requiredTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredTarget(params, "target"))).toBe(true);
    },

    unchanged: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredTarget(params, "target"))).toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredTarget(params, "target"),
            memberUser: requiredMemberUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    reestimate_due_future: async ({ params }) => {
      await expect.poll(() => objectiveReestimateDueFuture(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    exists_with_difficulty: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsWithDifficulty({
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_alignment_request": {
    open_absent: async ({ params }) => {
      await expect
        .poll(() =>
          openAlignmentRequestAbsent({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
          }),
        )
        .toBe(true);
    },

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          alignmentRequestExists({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            memberUser: requiredMemberUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    open_count: async ({ params }) => {
      await expect
        .poll(() =>
          openAlignmentRequestCount({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
          }),
        )
        .toBe(requiredNumber(params, "count"));
    },
  },
};

function requiredTarget(params: StepParams, key: string): ReestimateObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ReestimateObjectiveTargetData`);
  }
  const target = value as Partial<ReestimateObjectiveTargetData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "orfReestimate" ||
    target.flowStatus !== "reestimating"
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus`);
  }
  return target as ReestimateObjectiveTargetData;
}

function requiredMemberUser(params: StepParams, key: string): TestUserAccountRecord {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TestUserAccountRecord`);
  }
  const account = value as Partial<TestUserAccountRecord>;
  if (
    typeof account.userId !== "string" ||
    typeof account.teamId !== "string" ||
    typeof account.email !== "string" ||
    typeof account.name !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 userId/teamId/email/name`);
  }
  return account as TestUserAccountRecord;
}

function requiredDifficulty(params: StepParams, key: string): MemberReestimateCompleteRequestCaseData["metricDifficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAlignmentKind(params: StepParams, key: string): MemberReestimateCompleteRequestCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "reestimateCompletion") {
    throw new Error(`参数 ${key} 必须是 reestimateCompletion`);
  }
  return value;
}

function requiredAlignmentStatus(params: StepParams, key: string): MemberReestimateCompleteRequestCaseData["alignmentStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested") {
    throw new Error(`参数 ${key} 必须是 requested`);
  }
  return value;
}
