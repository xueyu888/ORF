import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type { AdminDeleteMemberUserCaseData, TestContext } from "./_support/admin-delete-member-user.context";
import {
  deleteMemberFromPage,
  hasActivePublicChatMembership,
  hasAnonymousChatMembershipRemovalEvent,
  loginAsAdmin,
  memberDeleteButton,
  memberRow,
  preparePublicChatMemberships,
} from "./_support/admin-delete-member-user.helpers";

export const adminDeleteMemberUserOperators: OperatorRegistry<TestContext, AdminDeleteMemberUserCaseData> = {
  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsAdmin(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "api.chat_bootstrap": {
    prepare_public_memberships: async ({ ctx }) => {
      await preparePublicChatMemberships(ctx.page);
    },
  },

  "page.member_user": {
    visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx.page, requiredString(params, "name"))).toBeVisible();
    },

    absent: async ({ ctx, params }) => {
      await expect(memberRow(ctx.page, requiredString(params, "name"))).toHaveCount(0);
    },

    delete_visible: async ({ ctx, params }) => {
      await expect(memberDeleteButton(ctx.page, requiredString(params, "name"))).toBeVisible();
    },

    delete_enabled: async ({ ctx, params }) => {
      await expect(memberDeleteButton(ctx.page, requiredString(params, "name"))).toBeEnabled();
    },

    delete: async ({ ctx, params }) =>
      deleteMemberFromPage(ctx.page, {
        memberName: requiredString(params, "name"),
        userId: requiredString(params, "userId"),
      }),
  },

  "db.user_chat_membership": {
    exists: async ({ params }) => {
      await expect.poll(() => hasActivePublicChatMembership(requiredString(params, "userId"))).toBe(true);
    },

    absent: async ({ params }) => {
      await expect.poll(() => hasActivePublicChatMembership(requiredString(params, "userId"))).toBe(false);
    },
  },

  "db.user_chat_removal_event": {
    exists_without_deleted_actor: async ({ params }) => {
      await expect
        .poll(() => hasAnonymousChatMembershipRemovalEvent(requiredString(params, "userId")))
        .toBe(true);
    },
  },
};
