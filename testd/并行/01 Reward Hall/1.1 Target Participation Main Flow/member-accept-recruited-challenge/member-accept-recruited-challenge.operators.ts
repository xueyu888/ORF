import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  AcceptRecruitedObjective,
  AcceptRecruitedProject,
  MemberAcceptRecruitedChallengeCaseData,
  TestContext,
} from "./_support/member-accept-recruited-challenge.context";
import {
  acceptBountyChallenge,
  acceptChallengeDialog,
  bountyAllowsAccept,
  bountyObjectiveRow,
  bountyShowsAccepted,
  challengeObjectivePanel,
  deleteProjectByName,
  objectiveAssignedContains,
  objectiveAssignedExcludes,
  objectiveChallengersContains,
  objectiveChallengersExclude,
  objectiveHasFlowStatus,
  openBountyHallAllAs,
  requiredTestUser,
  upsertProject,
  upsertRecruitedProjectObjective,
} from "./_support/member-accept-recruited-challenge.helpers";

export const memberAcceptRecruitedChallengeOperators: OperatorRegistry<TestContext, MemberAcceptRecruitedChallengeCaseData> = {
  "db.project": {
    upsert: async ({ params }) =>
      upsertProject({
        name: requiredString(params, "name"),
        teamId: requiredString(params, "teamId"),
      }),

    delete_by_name: async ({ params }) => {
      await deleteProjectByName(requiredString(params, "name"));
    },
  },

  "db.project_objective": {
    upsert_recruited: async ({ params }) => {
      const admin = requiredTestUser(params.adminUser);
      const member = requiredTestUser(params.memberUser);
      return upsertRecruitedProjectObjective({
        title: requiredString(params, "title"),
        project: requiredProject(params, "project"),
        adminUserId: admin.userId,
        memberName: member.name,
        memberUserId: member.userId,
      });
    },
  },

  "page.bounty_hall": {
    open_all_as_member: async ({ ctx, params }) => {
      await openBountyHallAllAs(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "api.bounty_hall": {
    accept_allowed: async ({ ctx, params }) => {
      await expect.poll(() => bountyAllowsAccept(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },

    accepted: async ({ ctx, params }) => {
      await expect.poll(() => bountyShowsAccepted(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },
  },

  "page.bounty_hall.objective": {
    visible: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    participation_pending_recruitment: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toContainText("待响应征召");
    },

    accept_action_enabled: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row.getByRole("button", { name: "接受挑战", exact: true })).toBeEnabled();
    },

    accept: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await row.getByRole("button", { name: "接受挑战", exact: true }).click();
    },
  },

  "page.accept_challenge_dialog": {
    visible: async ({ ctx }) => {
      await expect(acceptChallengeDialog(ctx.page)).toBeVisible();
    },

    confirm: async ({ ctx, params }) => {
      const accepted = await acceptBountyChallenge(ctx.page, requiredObjective(params, "objective"));
      await expect(ctx.page).toHaveURL(/\/tasks(?:\?.*)?$/);
      return accepted;
    },
  },

  "api.accept_challenge_result": {
    ok: async ({ params }) => {
      const objective = requiredObjective(params, "objective");
      const member = requiredTestUser(params.memberUser);
      expect(objective.flowStatus).toBe("reestimating");
      expect(objective.challengerUserIds).toContain(member.userId);
      expect(objective.challengers).toContain(member.name);
      expect(objective.assignedChallengerUserIds).not.toContain(member.userId);
      expect(objective.assignedChallengers).not.toContain(member.name);
    },
  },

  "db.objective_assignment": {
    contains_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveAssignedContains(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
    },

    excludes_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveAssignedExcludes(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
    },
  },

  "db.objective_challengers": {
    contains_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveChallengersContains(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
    },

    excludes_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveChallengersExclude(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
    },
  },

  "db.objective_flow_status": {
    is: async ({ params }) => {
      await expect
        .poll(() => objectiveHasFlowStatus(requiredObjective(params, "objective"), requiredString(params, "flowStatus")))
        .toBe(true);
    },
  },

  "page.challenge": {
    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/tasks(?:\?.*)?$/);
    },
  },

  "page.challenge_objective": {
    visible: async ({ ctx, params }) => {
      await expect(challengeObjectivePanel(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },
  },
};

function requiredProject(params: Record<string, unknown>, key: string): AcceptRecruitedProject {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AcceptRecruitedProject).id === "string" &&
    typeof (value as AcceptRecruitedProject).name === "string" &&
    typeof (value as AcceptRecruitedProject).teamId === "string"
  ) {
    return value as AcceptRecruitedProject;
  }
  throw new Error(`参数 ${key} 必须是本用例项目`);
}

function requiredObjective(params: Record<string, unknown>, key: string): AcceptRecruitedObjective {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AcceptRecruitedObjective).id === "string" &&
    typeof (value as AcceptRecruitedObjective).title === "string" &&
    typeof (value as AcceptRecruitedObjective).flowStatus === "string"
  ) {
    return value as AcceptRecruitedObjective;
  }
  throw new Error(`参数 ${key} 必须是本用例目标`);
}
