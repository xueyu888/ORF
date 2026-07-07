import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberReapplyReestimateAfterRejectCaseData,
  ReestimateObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
  UncalibratedMetricData,
} from "./_support/member-reapply-reestimate-after-reject.context";
import {
  alignmentRequestExists,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsUncalibrated,
  metricExistsWithDifficulty,
  metricRow,
  myChallengesContainsAlignmentRequestStatus,
  myChallengesContainsMetricWithDifficulty,
  myChallengesContainsObjective,
  myChallengesObjectiveHasStageAndFlowStatus,
  objectiveChallengerContains,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveReestimateDueFuture,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareHistoricalNeedsWorkAlignmentRequest,
  prepareReestimateObjective,
  prepareUncalibratedMetric,
  readSessionUserName,
  requestReestimateCompletion,
  selectMetricDifficulty,
  toastMessageAppeared,
} from "./_support/member-reapply-reestimate-after-reject.helpers";

export const memberReapplyReestimateAfterRejectOperators: OperatorRegistry<TestContext, MemberReapplyReestimateAfterRejectCaseData> = {
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
      await expect.poll(() => toastMessageAppeared(ctx.page, "已申请重估对齐")).toBe(true);
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
    visible_under_objective: async ({ ctx, params }) => {
      const panel = objectivePanel(ctx.page, requiredString(params, "targetTitle"));
      await expect(panel).toBeVisible();
      await expect(panel.locator(".orf-result-row").filter({ hasText: requiredString(params, "metricTitle") })).toBeVisible();
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

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_metric_with_difficulty: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsMetricWithDifficulty(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metricTitle: requiredString(params, "metricTitle"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },

    contains_alignment_request_status: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsAlignmentRequestStatus(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
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
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
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
            memberUser: requiredUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    reestimate_due_future: async ({ params }) => {
      await expect.poll(() => objectiveReestimateDueFuture(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_uncalibrated: async ({ params }) =>
      prepareUncalibratedMetric({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    exists_uncalibrated: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsUncalibrated({
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    exists_with_difficulty: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsWithDifficulty({
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_alignment_request": {
    prepare_needs_work: async ({ params }) =>
      prepareHistoricalNeedsWorkAlignmentRequest({
        target: requiredTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
        status: requiredNeedsWorkStatus(params, "status"),
        memberUser: requiredUser(params, "memberUser"),
        adminUser: requiredUser(params, "adminUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          alignmentRequestExists({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            memberUser: requiredUser(params, "memberUser"),
            adminUser: optionalUser(params, "adminUser"),
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

function requiredMetric(params: StepParams, key: string): UncalibratedMetricData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 UncalibratedMetricData`);
  }
  const metric = value as Partial<UncalibratedMetricData>;
  if (typeof metric.title !== "string") {
    throw new Error(`参数 ${key} 缺少 title`);
  }
  return metric as UncalibratedMetricData;
}

function requiredUser(params: StepParams, key: string): TestUserAccountRecord {
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

function optionalUser(params: StepParams, key: string): TestUserAccountRecord | undefined {
  return params[key] === undefined ? undefined : requiredUser(params, key);
}

function requiredDifficulty(params: StepParams, key: string): MemberReapplyReestimateAfterRejectCaseData["metricDifficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAlignmentKind(params: StepParams, key: string): MemberReapplyReestimateAfterRejectCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "reestimateCompletion") {
    throw new Error(`参数 ${key} 必须是 reestimateCompletion`);
  }
  return value;
}

function requiredAlignmentStatus(
  params: StepParams,
  key: string,
): MemberReapplyReestimateAfterRejectCaseData["requestedStatus"] | MemberReapplyReestimateAfterRejectCaseData["needsWorkStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "needsWork") {
    throw new Error(`参数 ${key} 必须是 requested 或 needsWork`);
  }
  return value;
}

function requiredNeedsWorkStatus(params: StepParams, key: string): MemberReapplyReestimateAfterRejectCaseData["needsWorkStatus"] {
  const value = requiredString(params, key);
  if (value !== "needsWork") {
    throw new Error(`参数 ${key} 必须是 needsWork`);
  }
  return value;
}
