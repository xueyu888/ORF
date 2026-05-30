import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  MloginCaseData,
  MemberAccountRecord,
  TestContext,
} from "./_support/mlogin.context";
import {
  deleteMemberByEmail,
  deleteMemberMembershipsByEmail,
  deleteOryIdentityByEmail,
  memberAccountActive,
  oryIdentityPasswordAvailable,
  readMemberAccount,
  resetMemberDefaultLandingPathByEmail,
  revokeOrySessionsByEmail,
  setMemberDefaultLandingPath,
  upsertOrfMember,
  upsertOryIdentityWithPassword,
} from "./_support/mlogin.helpers";

export const mloginOperators = {
  "ory.identity": {
    upsert_password: async ({ data }) => upsertOryIdentityWithPassword(data),

    password_available: async ({ params }) => {
      await expect
        .poll(() =>
          oryIdentityPasswordAvailable(requiredString(params, "email")),
        )
        .toBe(true);
    },

    delete_by_email: async ({ params }) => {
      await deleteOryIdentityByEmail(requiredString(params, "email"));
    },
  },

  "ory.sessions": {
    revoke_by_email: async ({ params }) => {
      await revokeOrySessionsByEmail(requiredString(params, "email"));
    },
  },

  "db.member": {
    upsert: async ({ data, params }) =>
      upsertOrfMember(data, requiredString(params, "identityId")),

    active: async ({ params }) => {
      await expect
        .poll(() => memberAccountActive(requiredString(params, "email")))
        .toBe(true);
    },

    record: async ({ params }) => {
      const account = await readMemberAccount(requiredString(params, "email"));
      if (!account) {
        throw new Error("预置普通成员账号不存在或不可用");
      }
      return account;
    },

    matches: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect.poll(() => readMemberAccount(email)).not.toBeNull();
      const account = await readMemberAccount(email);
      expect(account).toMatchObject({
        email,
        role: "member",
        status: "active",
      } satisfies Partial<MemberAccountRecord>);
    },

    delete_memberships: async ({ params }) => {
      await deleteMemberMembershipsByEmail(requiredString(params, "email"));
    },

    delete: async ({ params }) => {
      await deleteMemberByEmail(requiredString(params, "email"));
    },
  },

  "user.preferences": {
    set_default_landing_path: async ({ params }) => {
      await setMemberDefaultLandingPath(
        requiredString(params, "userId"),
        requiredString(params, "path"),
      );
    },

    reset_default_landing_path_by_email: async ({ params }) => {
      await resetMemberDefaultLandingPathByEmail(
        requiredString(params, "email"),
      );
    },
  },
} satisfies OperatorRegistry<TestContext, MloginCaseData>;
