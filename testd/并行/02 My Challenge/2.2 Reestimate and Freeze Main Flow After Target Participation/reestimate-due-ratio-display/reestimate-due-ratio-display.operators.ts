import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  ReestimateDueRatioCaseData,
  ReestimateDueRatioTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/reestimate-due-ratio-display.context";
import {
  acceptBountyChallenge,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  expectedReestimateDueAtMinuteLabelByTitle,
  loginAsMember,
  myChallengeObjectiveHasStageAndFlowStatus,
  myChallengeObjectiveReestimateDueMatchesRule,
  myChallengesContainsObjective,
  objectiveAcceptedAtAbsent,
  objectiveAcceptedAtPresent,
  objectiveAssignedContains,
  objectiveChallengerContains,
  objectiveChallengerExcludes,
  objectiveFinalDueOffsetMatches,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveReestimateDueAbsent,
  objectiveReestimateDueMatchesRule,
  objectiveTimeSummary,
  openBountyHallRelated,
  openMyChallenges,
  prepareRecruitedObjective,
  readSessionUserName,
} from "./_support/reestimate-due-ratio-display.helpers";

export const reestimateDueRatioDisplayOperators: OperatorRegistry<TestContext, ReestimateDueRatioCaseData> = {
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

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.recruited_objective_fixture": {
    prepare: async ({ params }) =>
      prepareRecruitedObjective({
        memberUser: requiredMemberUser(params.memberUser),
        target: requiredTarget(params.target),
      }),

    exists: async ({ params }) => {
      const target = requiredTarget(params.target);
      await expect
        .poll(() =>
          objectiveHasStageAndFlowStatus({
            title: target.title,
            stage: target.stage,
            flowStatus: target.flowStatus,
          }),
        )
        .toBe(true);
    },

    final_due_offset_matches: async ({ params }) => {
      const target = requiredTarget(params.target);
      await expect
        .poll(() =>
          objectiveFinalDueOffsetMatches({
            title: target.title,
            finalDueOffsetDays: target.finalDueOffsetDays,
          }),
        )
        .toBe(true);
    },

    assigned_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveAssignedContains({
            target: requiredTarget(params.target),
            memberUser: requiredMemberUser(params.memberUser),
          }),
        )
        .toBe(true);
    },

    challenger_excludes: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerExcludes({
            target: requiredTarget(params.target),
            memberUser: requiredMemberUser(params.memberUser),
          }),
        )
        .toBe(true);
    },

    accepted_at_absent: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtAbsent(requiredTarget(params.target))).toBe(true);
    },

    reestimate_due_absent: async ({ params }) => {
      await expect.poll(() => objectiveReestimateDueAbsent(requiredTarget(params.target))).toBe(true);
    },
  },

  "page.bounty_hall": {
    open_related: async ({ ctx }) => {
      await openBountyHallRelated(ctx.page);
    },
  },

  "page.bounty_hall.objective": {
    accept: async ({ ctx, params }) => {
      return acceptBountyChallenge(ctx.page, requiredString(params, "title"));
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

  "db.reestimate_objective": {
    stage_flow_matches: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveHasStageAndFlowStatus({
            title: requiredString(params, "title"),
            stage: requiredString(params, "stage") as "orfReestimate",
            flowStatus: requiredString(params, "flowStatus") as "reestimating",
          }),
        )
        .toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredTarget(params.target),
            memberUser: requiredMemberUser(params.memberUser),
          }),
        )
        .toBe(true);
    },

    accepted_at_present: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtPresent(requiredTarget(params.target))).toBe(true);
    },

    reestimate_due_matches_rule: async ({ params }) => {
      await expect.poll(() => objectiveReestimateDueMatchesRule(requiredTarget(params.target))).toBe(true);
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow_matches: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengeObjectiveHasStageAndFlowStatus({
            page: ctx.page,
            title: requiredString(params, "title"),
            stage: requiredString(params, "stage") as "orfReestimate",
            flowStatus: requiredString(params, "flowStatus") as "reestimating",
          }),
        )
        .toBe(true);
    },

    objective_reestimate_due_matches_rule: async ({ ctx, params }) => {
      await expect.poll(() => myChallengeObjectiveReestimateDueMatchesRule(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "page.objective_time_summary": {
    reestimate_remaining_visible: async ({ ctx, params }) => {
      await expect(objectiveTimeSummary(ctx.page, requiredString(params, "title"))).toContainText("重估");
    },

    reestimate_due_tooltip_matches_rule: async ({ ctx, params }) => {
      const title = requiredString(params, "title");
      const expected = await expectedReestimateDueAtMinuteLabelByTitle(title);
      const summary = objectiveTimeSummary(ctx.page, title);
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute("title", new RegExp(`重估截止：${escapeRegExp(expected)}`));
    },

    final_remaining_visible: async ({ ctx, params }) => {
      await expect(objectiveTimeSummary(ctx.page, requiredString(params, "title"))).toContainText("最终");
    },
  },
};

function requiredMemberUser(value: unknown): TestUserAccountRecord {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TestUserAccountRecord).userId === "string" &&
    typeof (value as TestUserAccountRecord).teamId === "string" &&
    typeof (value as TestUserAccountRecord).name === "string" &&
    typeof (value as TestUserAccountRecord).email === "string"
  ) {
    return value as TestUserAccountRecord;
  }
  throw new Error("参数必须是测试用户账号记录");
}

function requiredTarget(value: unknown): ReestimateDueRatioTargetData {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReestimateDueRatioTargetData).title === "string" &&
    (value as ReestimateDueRatioTargetData).stage === "resultClaiming" &&
    (value as ReestimateDueRatioTargetData).flowStatus === "recruiting" &&
    (value as ReestimateDueRatioTargetData).finalDueOffsetDays === 8
  ) {
    return value as ReestimateDueRatioTargetData;
  }
  throw new Error("参数 target 必须是本用例目标数据");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
