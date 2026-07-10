import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  EnterParticipatedObjective,
  EnterParticipatedProject,
  MemberEnterParticipatedTargetCaseData,
  TestContext,
} from "./_support/member-enter-participated-target.context";
import {
  bountyObjectiveRow,
  bountyShowsParticipated,
  challengeObjectivePanel,
  deleteProjectByName,
  enterChallengeTargetFromBountyHall,
  excludeObjectiveApplication,
  excludeObjectiveAssignment,
  myChallengesContainsObjective,
  objectiveAssignedExcludes,
  objectiveChallengersContains,
  objectiveHasFlowStatus,
  objectivePendingApplicationAbsent,
  openBountyHallRelatedAs,
  projectAbsentByName,
  requiredTestUser,
  selectBountyHallTab,
  upsertParticipatedProjectObjective,
  upsertProject,
} from "./_support/member-enter-participated-target.helpers";

export const memberEnterParticipatedTargetOperators: OperatorRegistry<TestContext, MemberEnterParticipatedTargetCaseData> = {
  "db.project": {
    upsert: async ({ params }) =>
      upsertProject({
        name: requiredString(params, "name"),
        teamId: requiredString(params, "teamId"),
      }),

    delete_by_name: async ({ params }) => {
      await deleteProjectByName(requiredString(params, "name"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => projectAbsentByName(requiredString(params, "name"))).toBe(true);
    },
  },

  "db.project_objective": {
    upsert_participated: async ({ params }) => {
      const admin = requiredTestUser(params.adminUser);
      const member = requiredTestUser(params.memberUser);
      return upsertParticipatedProjectObjective({
        title: requiredString(params, "title"),
        project: requiredProject(params, "project"),
        adminUserId: admin.userId,
        memberName: member.name,
        memberUserId: member.userId,
      });
    },
  },

  "db.objective_assignment": {
    exclude_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      return excludeObjectiveAssignment(requiredObjective(params, "objective"), member);
    },

    excludes_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() => objectiveAssignedExcludes(requiredObjective(params, "objective"), member.userId, member.name))
        .toBe(true);
    },
  },

  "db.objective_applications": {
    exclude_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      return excludeObjectiveApplication(requiredObjective(params, "objective"), member);
    },

    pending_absent: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() => objectivePendingApplicationAbsent(requiredObjective(params, "objective"), member.userId))
        .toBe(true);
    },
  },

  "db.objective_challengers": {
    contains_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() => objectiveChallengersContains(requiredObjective(params, "objective"), member.userId, member.name))
        .toBe(true);
    },
  },

  "db.objective_flow_status": {
    is: async ({ params }) => {
      await expect
        .poll(() => objectiveHasFlowStatus(requiredObjective(params, "objective"), requiredString(params, "flowStatus")))
        .toBe(true);
    },
  },

  "page.bounty_hall": {
    open_related_as_member: async ({ ctx, params }) => {
      await openBountyHallRelatedAs(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.bounty_hall.tab": {
    selected: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      if (name !== "我的相关") {
        throw new Error(`不支持的悬赏大厅视图: ${name}`);
      }
      await selectBountyHallTab(ctx.page, name);
    },
  },

  "api.bounty_hall": {
    participated: async ({ ctx, params }) => {
      await expect.poll(() => bountyShowsParticipated(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },
  },

  "page.bounty_hall.objective": {
    visible: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    participation_challenger_member: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row).toContainText("挑战者");
    },

    enter_action_enabled: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row.getByRole("button", { name: "进入目标", exact: true })).toBeEnabled();
    },

    enter: async ({ ctx, params }) => {
      await enterChallengeTargetFromBountyHall(ctx.page, requiredObjective(params, "objective"));
    },
  },

  "page.challenge": {
    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/tasks(?:[?#].*)?$/);
    },

    url_anchor: async ({ ctx, params }) => {
      const objective = requiredObjective(params, "objective");
      await expect(ctx.page).toHaveURL(new RegExp(`/tasks#objective:${escapeRegExp(encodeURIComponent(objective.id))}$`));
    },
  },

  "page.challenge_objective": {
    visible: async ({ ctx, params }) => {
      await expect(challengeObjectivePanel(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    title_visible: async ({ ctx, params }) => {
      const objective = requiredObjective(params, "objective");
      await expect(challengeObjectivePanel(ctx.page, objective)).toContainText(objective.title);
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },
  },
};

function requiredProject(params: Record<string, unknown>, key: string): EnterParticipatedProject {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EnterParticipatedProject).id === "string" &&
    typeof (value as EnterParticipatedProject).name === "string" &&
    typeof (value as EnterParticipatedProject).teamId === "string"
  ) {
    return value as EnterParticipatedProject;
  }
  throw new Error(`参数 ${key} 必须是本用例项目`);
}

function requiredObjective(params: Record<string, unknown>, key: string): EnterParticipatedObjective {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EnterParticipatedObjective).id === "string" &&
    typeof (value as EnterParticipatedObjective).title === "string" &&
    typeof (value as EnterParticipatedObjective).flowStatus === "string"
  ) {
    return value as EnterParticipatedObjective;
  }
  throw new Error(`参数 ${key} 必须是本用例目标`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
