import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  FrozenObjectiveTargetData,
  MemberFrozenReestimateRequestCaseData,
  MetricData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-frozen-reestimate-request.context";
import {
  alignmentRequestExistsWithNote,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  deleteOpenAlignmentRequests,
  fillFrozenReestimateReason,
  frozenReestimateActionHidden,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsWithScore,
  metricRow,
  myChallengesContainsAlignmentRequestWithNote,
  myChallengesContainsObjective,
  myChallengesObjectiveHasStageAndFlowStatus,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareCalibratedMetric,
  prepareFrozenObjective,
  readSessionUserName,
  requestFrozenReestimate,
  toastMessageAppeared,
} from "./_support/member-frozen-reestimate-request.helpers";

export const memberFrozenReestimateRequestOperators: OperatorRegistry<TestContext, MemberFrozenReestimateRequestCaseData> = {
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
    frozen_reestimate_requested: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "已申请重新重估，请等待指挥官审批")).toBe(true);
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

  "page.frozen_reestimate_request": {
    fill_reason: async ({ ctx, params }) => {
      await fillFrozenReestimateReason(ctx.page, {
        targetTitle: requiredString(params, "targetTitle"),
        reason: requiredString(params, "reason"),
      });
    },

    submit: async ({ ctx, params }) => {
      await requestFrozenReestimate(ctx.page, {
        targetTitle: requiredString(params, "targetTitle"),
        reason: requiredString(params, "reason"),
      });
    },

    submit_hidden: async ({ ctx, params }) => {
      await frozenReestimateActionHidden(ctx.page, requiredString(params, "targetTitle"));
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
    visible: async ({ ctx, params }) => {
      await expect(metricRow(ctx.page, requiredString(params, "metricTitle"))).toContainText(requiredDifficulty(params, "difficulty"));
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_alignment_request_with_note: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsAlignmentRequestWithNote(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            note: requiredString(params, "reason"),
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

  "db.frozen_objective_fixture": {
    prepare: async ({ params }) =>
      prepareFrozenObjective({
        memberUser: requiredUser(params, "memberUser"),
        target: requiredTarget(params, "target"),
      }),

    exists: async ({ params }) => {
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

    confirmed_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtExists(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    exists_with_score: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsWithScore({
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
    delete_open: async ({ params }) => {
      await deleteOpenAlignmentRequests({
        target: requiredTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
      });
    },

    exists_with_note: async ({ params }) => {
      await expect
        .poll(() =>
          alignmentRequestExistsWithNote({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            memberUser: requiredUser(params, "memberUser"),
            note: requiredString(params, "reason"),
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

function requiredTarget(params: StepParams, key: string): FrozenObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 FrozenObjectiveTargetData`);
  }
  const target = value as Partial<FrozenObjectiveTargetData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    target.flowStatus !== "frozen" ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as FrozenObjectiveTargetData;
}

function requiredMetric(params: StepParams, key: string): MetricData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 MetricData`);
  }
  const metric = value as Partial<MetricData>;
  if (typeof metric.title !== "string" || metric.difficulty !== "进阶" || metric.score !== 30) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score`);
  }
  return metric as MetricData;
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

function requiredDifficulty(params: StepParams, key: string): MemberFrozenReestimateRequestCaseData["metric"]["difficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAlignmentKind(params: StepParams, key: string): MemberFrozenReestimateRequestCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "frozenReestimate") {
    throw new Error(`参数 ${key} 必须是 frozenReestimate`);
  }
  return value;
}

function requiredAlignmentStatus(params: StepParams, key: string): MemberFrozenReestimateRequestCaseData["requestedStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested") {
    throw new Error(`参数 ${key} 必须是 requested`);
  }
  return value;
}
