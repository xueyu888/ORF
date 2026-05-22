import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { optionalString, requiredString } from "../../_operators/params";
import type { RegisterCaseData, RegisteredUserRecord, TestContext } from "./_support/register.context";
import {
  adminAccountActive,
  deleteOryIdentityByEmail,
  deleteRegisteredUserByEmail,
  oryIdentityAbsent,
  readRegisteredUser,
  registeredUserAbsent,
  revokeOrySessionsByEmail,
} from "./_support/register.helpers";

const APPROVAL_RESPONSE_TIMEOUT_MS = 5_000;

export const registerOperators = {
  "ory.identity": {
    absent: async ({ params }) => {
      await expect.poll(() => oryIdentityAbsent(requiredString(params, "email"))).toBe(true);
    },

    delete_by_email: async ({ params }) => {
      const email = requiredString(params, "email");
      await deleteOryIdentityByEmail(email);
      await expect.poll(() => oryIdentityAbsent(email)).toBe(true);
    },
  },

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
  },

  "db.registered_user": {
    absent: async ({ params }) => {
      await expect.poll(() => registeredUserAbsent(requiredString(params, "email"))).toBe(true);
    },

    pending: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect.poll(() => readRegisteredUser(email)).toMatchObject({
        email,
        status: "pending",
        role: "member",
      });
      return readRegisteredUser(email);
    },

    active: async ({ params }) => {
      await expect.poll(() => readRegisteredUser(requiredString(params, "email"))).toMatchObject({
        email: requiredString(params, "email"),
        status: "active",
        role: "member",
      });
    },

    delete: async ({ params }) => {
      const email = requiredString(params, "email");
      await deleteRegisteredUserByEmail(email);
      await expect.poll(() => registeredUserAbsent(email)).toBe(true);
    },
  },

  "page.approval_pending": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "等待注册审核" })).toBeVisible();
      return true;
    },
  },

  "page.member_row": {
    visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, params)).toBeVisible();
    },

    approve: async ({ ctx, params }) => {
      await memberRow(ctx, params).getByRole("button", { name: "通过" }).click();
    },
  },

  "api.registration_response": {
    record_user: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      const user = response.body && typeof response.body === "object" ? (response.body as { user?: unknown }).user : null;
      if (!isRegisteredUserPayload(user)) {
        throw new Error("注册响应缺少用户信息");
      }
      return user;
    },

    pending: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const user = response.body && typeof response.body === "object" ? (response.body as { user?: unknown }).user : null;
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(user).toMatchObject({
        email: requiredString(params, "email"),
        role: "member",
        status: "pending",
      });
    },
  },

  "api.registration_approval": {
    capture_response: async ({ ctx, runtime, params }) => {
      const userId = requiredString(params, "userId");
      const saveAs = requiredString(params, "saveAs");
      runtime.values[saveAs] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "PATCH" &&
            response.url().endsWith(`/api/registration-requests/${encodeURIComponent(userId)}/approve`)
          );
        }, { timeout: APPROVAL_RESPONSE_TIMEOUT_MS })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await response.json().catch(() => null),
        }));
    },

    ok: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    },
  },

  "runtime.boolean": {
    true: async ({ params }) => {
      expect(params.value).toBe(true);
    },
  },

  "runtime.registered_user": {
    pending: async ({ params }) => {
      expect(requiredRegisteredUser(params, "user")).toMatchObject({
        email: requiredString(params, "email"),
        status: "pending",
        role: "member",
      });
    },
  },
} satisfies OperatorRegistry<TestContext, RegisterCaseData>;

function memberRow(ctx: TestContext, params: StepParams) {
  const email = requiredString(params, "email");
  const name = optionalString(params, "name");
  const table = ctx.page.locator(".orf-user-table");
  return table.locator("tr").filter({ hasText: name ? new RegExp(`${escapeRegExp(name)}|${escapeRegExp(email)}`) : email }).first();
}

function isRegisteredUserPayload(value: unknown): value is RegisteredUserRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RegisteredUserRecord).id === "string" &&
    typeof (value as RegisteredUserRecord).email === "string" &&
    typeof (value as RegisteredUserRecord).role === "string" &&
    typeof (value as RegisteredUserRecord).status === "string"
  );
}

function requiredRegisteredUser(params: StepParams, key: string): RegisteredUserRecord {
  const value = params[key];
  if (!isRegisteredUserPayload(value)) {
    throw new Error(`参数 ${key} 必须是注册用户记录`);
  }
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
