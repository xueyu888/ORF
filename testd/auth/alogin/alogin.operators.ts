import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { optionalString, requiredString } from "../../_operators/params";
import type { ALoginCaseData, AdminAccountRecord, TestContext } from "./_support/alogin.context";
import {
  adminAccountActive,
  readAdminAccount,
  restoreLastOnlineAt,
  revokeOrySessionsByEmail,
} from "./_support/alogin.helpers";

export const aloginOperators = {
  "ory.sessions": {
    revoke_by_email: async ({ params }) => {
      const email = optionalString(params, "email");
      if (!email) {
        return;
      }
      await revokeOrySessionsByEmail(email);
    },
  },

  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },

    record: async ({ params }) => {
      const account = await readAdminAccount(requiredString(params, "email"));
      if (!account) {
        throw new Error("预置管理员账号不存在或不可用");
      }
      return account;
    },

    matches: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect.poll(() => readAdminAccount(email)).not.toBeNull();
      const account = await readAdminAccount(email);
      expect(account).toMatchObject({
        email,
        role: "admin",
        status: "active",
      } satisfies Partial<AdminAccountRecord>);
    },

    restore_last_online_at: async ({ params }) => {
      const account = optionalAdminAccount(params, "account");
      if (!account) {
        return;
      }
      await restoreLastOnlineAt(account.userId, account.lastOnlineAt);
    },
  },
} satisfies OperatorRegistry<TestContext, ALoginCaseData>;

function optionalAdminAccount(params: StepParams, key: string): AdminAccountRecord | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value === "object" &&
    typeof (value as AdminAccountRecord).userId === "string" &&
    typeof (value as AdminAccountRecord).email === "string" &&
    (value as AdminAccountRecord).role === "admin"
  ) {
    return value as AdminAccountRecord;
  }
  throw new Error(`参数 ${key} 必须是管理员账号记录`);
}
