import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  AdminRecruitChallengerNeedAcceptCaseData,
  RecruitNeedAcceptObjective,
  RecruitNeedAcceptProject,
  TestContext,
} from "./_support/admin-recruit-challenger-need-accept.context";
import {
  assignedRecruitmentStrip,
  bountyAllowsAccept,
  bountyObjectiveRow,
  deleteProjectByName,
  gotoTasks,
  login,
  objectiveAssignedContains,
  objectiveChallengersExclude,
  objectivePanel,
  objectivePublished,
  openBountyHallAllAs,
  publishObjective,
  recruitButton,
  recruitMemberCheckbox,
  recruitObjective,
  recruitmentDialog,
  requiredTestUser,
  selectChallengeProject,
  selectChallengeScope,
  upsertProject,
  upsertUnpublishedProjectObjective,
} from "./_support/admin-recruit-challenger-need-accept.helpers";

export const adminRecruitChallengerNeedAcceptOperators: OperatorRegistry<TestContext, AdminRecruitChallengerNeedAcceptCaseData> = {
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
    upsert_unpublished: async ({ params }) =>
      upsertUnpublishedProjectObjective({
        title: requiredString(params, "title"),
        project: requiredProject(params, "project"),
        adminUserId: requiredTestUser(params.adminUser).userId,
      }),
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await login(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.challenge": {
    goto: async ({ ctx }) => {
      await gotoTasks(ctx.page);
    },
  },

  "page.challenge_scope": {
    select: async ({ ctx, params }) => {
      await selectChallengeScope(ctx.page, requiredString(params, "label"));
    },
  },

  "page.challenge_project_filter": {
    select: async ({ ctx, params }) => {
      await selectChallengeProject(ctx.page, requiredString(params, "projectName"));
    },
  },

  "page.challenge_objective": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    publish: async ({ ctx, params }) => {
      return publishObjective(ctx.page, requiredObjective(params, "objective"));
    },

    recruiting_visible: async ({ ctx, params }) => {
      const objective = requiredObjective(params, "objective");
      const panel = objectivePanel(ctx.page, objective);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("征召");
    },

    recruit_action_enabled: async ({ ctx, params }) => {
      await expect(recruitButton(ctx.page, requiredObjective(params, "objective"))).toBeEnabled();
    },

    recruit: async ({ ctx, params }) => {
      await recruitButton(ctx.page, requiredObjective(params, "objective")).click();
    },
  },

  "api.publish_objective_result": {
    ok: async ({ params }) => {
      const objective = requiredObjective(params, "objective");
      expect(objective.id).toBeTruthy();
      expect(objective.publishedAt).toBeTruthy();
    },
  },

  "db.objective_publication": {
    published: async ({ params }) => {
      await expect.poll(() => objectivePublished(requiredObjective(params, "objective"))).toBe(true);
    },
  },

  "page.recruit_dialog": {
    visible: async ({ ctx }) => {
      await expect(recruitmentDialog(ctx.page)).toBeVisible();
    },

    submit: async ({ ctx, params }) => {
      return recruitObjective(ctx.page, requiredObjective(params, "objective"));
    },
  },

  "page.recruit_dialog.member": {
    check: async ({ ctx, params }) => {
      await recruitMemberCheckbox(ctx.page, requiredString(params, "memberName")).check();
    },
  },

  "api.recruit_result": {
    ok: async ({ params }) => {
      const objective = requiredObjective(params, "objective");
      const member = requiredTestUser(params.memberUser);
      expect(objective.assignedChallengerUserIds).toContain(member.userId);
      expect(objective.assignedChallengers).toContain(member.name);
    },
  },

  "page.challenge_objective.recruitment": {
    visible: async ({ ctx, params }) => {
      await expect(assignedRecruitmentStrip(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    member_waiting_accept: async ({ ctx, params }) => {
      const strip = assignedRecruitmentStrip(ctx.page, requiredObjective(params, "objective"));
      await expect(strip).toContainText(requiredString(params, "memberName"));
      await expect(strip).toContainText("已征召，等待接受");
    },
  },

  "db.objective_assignment": {
    contains_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveAssignedContains(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
    },
  },

  "db.objective_challengers": {
    excludes_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect.poll(() => objectiveChallengersExclude(requiredObjective(params, "objective"), member.userId, member.name)).toBe(true);
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
  },

  "page.bounty_hall.objective": {
    participation_pending_recruitment: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toContainText("待响应征召");
    },

    accept_action_enabled: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row.getByRole("button", { name: "接受挑战", exact: true })).toBeEnabled();
    },
  },
};

function requiredProject(params: Record<string, unknown>, key: string): RecruitNeedAcceptProject {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecruitNeedAcceptProject).id === "string" &&
    typeof (value as RecruitNeedAcceptProject).name === "string" &&
    typeof (value as RecruitNeedAcceptProject).teamId === "string"
  ) {
    return value as RecruitNeedAcceptProject;
  }
  throw new Error(`参数 ${key} 必须是本用例项目`);
}

function requiredObjective(params: Record<string, unknown>, key: string): RecruitNeedAcceptObjective {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecruitNeedAcceptObjective).id === "string" &&
    typeof (value as RecruitNeedAcceptObjective).title === "string" &&
    typeof (value as RecruitNeedAcceptObjective).flowStatus === "string"
  ) {
    return value as RecruitNeedAcceptObjective;
  }
  throw new Error(`参数 ${key} 必须是本用例目标`);
}
