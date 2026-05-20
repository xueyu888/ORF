import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { optionalString, requiredString } from "../../_operators/params";
import type { MloginCaseData, TestContext } from "./_support/mlogin.context";
import {
  ensureTestTeam,
  readOrfMembership,
  restoreLastOnlineAt,
  revokeIdentitySessions,
  upsertOrfMember,
  upsertOryIdentity,
} from "./_support/mlogin.helpers";

export const mloginOperators = {
  "ory.identity": {
    upsert: async ({ data }) => upsertOryIdentity(data),
  },

  "ory.sessions": {
    revoke: async ({ params }) => {
      const identityId = optionalString(params, "identityId");
      if (!identityId) {
        if (params.optional === true) {
          return;
        }
        throw new Error("ory.sessions.revoke 缺少 identityId");
      }

      await revokeIdentitySessions(identityId);
    },
  },

  "db.team": {
    ensure: async ({ data }) => ensureTestTeam(data.teamId),
  },

  "db.user": {
    upsert: async ({ data }) => upsertOrfMember(data.teamId, data),

    restore_last_online_at: async ({ params }) => {
      const userId = optionalString(params, "userId");
      if (!userId) {
        if (params.optional === true) {
          return;
        }
        throw new Error("db.user.restore_last_online_at 缺少 userId");
      }

      const lastOnlineAt = params.lastOnlineAt;
      if (lastOnlineAt !== null && typeof lastOnlineAt !== "string") {
        if (params.optional === true && lastOnlineAt === undefined) {
          return;
        }
        throw new Error("db.user.restore_last_online_at 的 lastOnlineAt 必须是 string 或 null");
      }

      await restoreLastOnlineAt(userId, lastOnlineAt);
    },
  },

  "db.member": {
    matches: async ({ params }) => {
      const userId = requiredString(params, "userId");
      const teamId = requiredString(params, "teamId");
      const email = requiredString(params, "email");
      const role = requiredString(params, "role");

      await expect.poll(() => readOrfMembership(userId, teamId)).toMatchObject({ email, role });
    },
  },
} satisfies OperatorRegistry<TestContext, MloginCaseData>;
