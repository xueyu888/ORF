import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  MemberCreateTargetForbiddenCaseData,
  MemberPermissionSnapshot,
  TestContext,
} from "./_support/member-create-target-forbidden.context";
import {
  challengeScopeTab,
  loginAsMember,
  memberPermissionDenied,
  objectiveDraftTitleInput,
  openMyChallenges,
  projectCreateObjectiveActions,
  recordMemberPermissionSnapshot,
  removeMemberPermission,
  restoreMemberPermissionSnapshot,
  topbarCreateObjectiveButton,
} from "./_support/member-create-target-forbidden.helpers";

export const memberCreateTargetForbiddenOperators: OperatorRegistry<TestContext, MemberCreateTargetForbiddenCaseData> = {
  "api.permissions": {
    record_member: async () => recordMemberPermissionSnapshot(),

    update_member: async ({ params }) => {
      await removeMemberPermission(requiredString(params, "withoutPermission") as MemberCreateTargetForbiddenCaseData["createObjectivePermissionKey"]);
    },

    restore_member: async ({ params }) => {
      await restoreMemberPermissionSnapshot(params.snapshot as MemberPermissionSnapshot | undefined);
    },

    member_denied: async ({ ctx, params }) => {
      await expect
        .poll(() => memberPermissionDenied(ctx.page, requiredString(params, "permissionKey") as MemberCreateTargetForbiddenCaseData["createObjectivePermissionKey"]))
        .toBe(true);
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

  "page.create_objective_action": {
    hidden: async ({ ctx }) => {
      await expect(topbarCreateObjectiveButton(ctx.page)).toHaveCount(0);
    },
  },

  "page.project_create_objective_action": {
    hidden: async ({ ctx }) => {
      await expect(projectCreateObjectiveActions(ctx.page)).toHaveCount(0);
    },
  },

  "page.objective_draft_title": {
    hidden: async ({ ctx }) => {
      await expect(objectiveDraftTitleInput(ctx.page)).toHaveCount(0);
    },
  },
};
