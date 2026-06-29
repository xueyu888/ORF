import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  ApplyChallengeObjective,
  ApplyChallengeProject,
  MemberApplyChallengeCaseData,
  TestContext,
} from "./_support/member-apply-challenge.context";
import {
  applicationReasonInput,
  applyChallengeDialog,
  bountyAllowsApply,
  bountyObjectiveRow,
  bountyShowsApplied,
  deleteProjectByName,
  excludeObjectiveApplication,
  excludeObjectiveAssignment,
  excludeObjectiveChallenger,
  objectiveAssignedExcludes,
  objectiveChallengersExclude,
  objectiveHasFlowStatus,
  objectivePendingApplicationAbsent,
  objectivePendingApplicationPresent,
  objectivePendingApplicationReasonEquals,
  openBountyHallOpenAs,
  projectAbsentByName,
  requiredTestUser,
  selectBountyHallTab,
  submitBountyChallengeApplication,
  upsertOpenProjectObjective,
  upsertProject,
} from "./_support/member-apply-challenge.helpers";

export const memberApplyChallengeOperators: OperatorRegistry<TestContext, MemberApplyChallengeCaseData> = {
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
    upsert_open: async ({ params }) => {
      const admin = requiredTestUser(params.adminUser);
      return upsertOpenProjectObjective({
        title: requiredString(params, "title"),
        project: requiredProject(params, "project"),
        adminUserId: admin.userId,
      });
    },
  },

  "db.objective_challengers": {
    exclude_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      return excludeObjectiveChallenger(requiredObjective(params, "objective"), member);
    },

    excludes_member: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() => objectiveChallengersExclude(requiredObjective(params, "objective"), member.userId, member.name))
        .toBe(true);
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

    pending_present: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() => objectivePendingApplicationPresent(requiredObjective(params, "objective"), member.userId))
        .toBe(true);
    },

    pending_reason_equals: async ({ params }) => {
      const member = requiredTestUser(params.memberUser);
      await expect
        .poll(() =>
          objectivePendingApplicationReasonEquals(
            requiredObjective(params, "objective"),
            member.userId,
            requiredString(params, "reason"),
          ),
        )
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
    open_open_as_member: async ({ ctx, params }) => {
      await openBountyHallOpenAs(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },

    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/bounties(?:\?.*)?$/);
    },
  },

  "page.bounty_hall.tab": {
    selected: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      await selectBountyHallTab(ctx.page, requiredBountyTabName(name));
    },
  },

  "api.bounty_hall": {
    apply_allowed: async ({ ctx, params }) => {
      await expect.poll(() => bountyAllowsApply(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },

    applied: async ({ ctx, params }) => {
      await expect.poll(() => bountyShowsApplied(ctx.page, requiredObjective(params, "objective"))).toBe(true);
    },
  },

  "page.bounty_hall.objective": {
    visible: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toBeVisible();
    },

    participation_waiting_application: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toContainText("等待申请");
    },

    participation_applying_member: async ({ ctx, params }) => {
      const member = requiredTestUser(params.memberUser);
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row).toContainText("申请中");
      await expect(row).toContainText(member.name);
    },

    application_reason_visible: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row.getByLabel("申请理由")).toContainText(requiredString(params, "reason"));
    },

    apply_action_enabled: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await expect(row.getByRole("button", { name: "申请挑战", exact: true })).toBeEnabled();
    },

    apply: async ({ ctx, params }) => {
      const row = bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"));
      await row.getByRole("button", { name: "申请挑战", exact: true }).click();
    },

    action_status_applying: async ({ ctx, params }) => {
      await expect(bountyObjectiveRow(ctx.page, requiredObjective(params, "objective"))).toContainText("申请中");
    },
  },

  "page.apply_challenge_dialog": {
    visible: async ({ ctx }) => {
      await expect(applyChallengeDialog(ctx.page)).toBeVisible();
    },

    reason_visible: async ({ ctx }) => {
      await expect(applicationReasonInput(ctx.page)).toBeVisible();
    },

    fill_reason: async ({ ctx, params }) => {
      await applicationReasonInput(ctx.page).fill(requiredString(params, "reason"));
    },

    confirm: async ({ ctx, params }) => {
      const applied = await submitBountyChallengeApplication(ctx.page, requiredObjective(params, "objective"));
      await expect(ctx.page).toHaveURL(/\/bounties(?:\?.*)?$/);
      return applied;
    },
  },

  "api.apply_challenge_result": {
    recorded: async ({ params }) => {
      requiredObjective(params, "objective");
    },

    ok: async ({ params }) => {
      const objective = requiredObjective(params, "objective");
      const member = requiredTestUser(params.memberUser);
      const reason = requiredString(params, "reason");
      expect(objective.flowStatus).toBe("applying");
      expect(objective.challengerUserIds).not.toContain(member.userId);
      expect(objective.challengers).not.toContain(member.name);
      expect(objective.assignedChallengerUserIds).not.toContain(member.userId);
      expect(objective.assignedChallengers).not.toContain(member.name);
      expect(
        objective.challengeApplications.some(
          (application) =>
            application.applicantUserId === member.userId &&
            application.applicant === member.name &&
            application.status === "pending" &&
            application.reason === reason,
        ),
      ).toBe(true);
    },
  },
};

function requiredProject(params: Record<string, unknown>, key: string): ApplyChallengeProject {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApplyChallengeProject).id === "string" &&
    typeof (value as ApplyChallengeProject).name === "string" &&
    typeof (value as ApplyChallengeProject).teamId === "string"
  ) {
    return value as ApplyChallengeProject;
  }
  throw new Error(`参数 ${key} 必须是本用例项目`);
}

function requiredObjective(params: Record<string, unknown>, key: string): ApplyChallengeObjective {
  const value = params[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApplyChallengeObjective).id === "string" &&
    typeof (value as ApplyChallengeObjective).title === "string" &&
    typeof (value as ApplyChallengeObjective).flowStatus === "string"
  ) {
    return value as ApplyChallengeObjective;
  }
  throw new Error(`参数 ${key} 必须是本用例目标`);
}

function requiredBountyTabName(name: string): "开放中" | "我的相关" {
  if (name === "开放中" || name === "我的相关") {
    return name;
  }
  throw new Error(`不支持的悬赏大厅视图: ${name}`);
}
