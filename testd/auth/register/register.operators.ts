import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { optionalString, requiredString } from "../../_operators/params";
import type {
  RegisterCaseData,
  RegisteredUserRecord,
  TestContext,
} from "./_support/register.context";
import {
  deleteOryIdentityByEmail,
  deleteRegisteredUserByEmail,
  deleteRegisteredUserMembershipsByEmail,
  oryIdentityAbsent,
  oryIdentityPasswordAvailable,
  readRegisteredUser,
  registeredUserAbsent,
  registeredUserExists,
  registeredUserRoleIs,
  registeredUserStatusIs,
  revokeOrySessionsByEmail,
  upsertOryIdentityWithPassword,
} from "./_support/register.helpers";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

export const registerOperators = {
  "ory.identity": {
    upsert_password: async ({ params }) => {
      return upsertOryIdentityWithPassword({
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
        name: requiredString(params, "name"),
      });
    },

    absent: async ({ params }) => {
      await expect
        .poll(() => oryIdentityAbsent(requiredString(params, "email")))
        .toBe(true);
    },

    exists: async ({ params }) => {
      await expect
        .poll(() => oryIdentityAbsent(requiredString(params, "email")))
        .toBe(false);
    },

    delete_by_email: async ({ params }) => {
      const email = requiredString(params, "email");
      await deleteOryIdentityByEmail(email);
      await expect.poll(() => oryIdentityAbsent(email)).toBe(true);
    },

    password_available: async ({ params }) => {
      await expect
        .poll(() =>
          oryIdentityPasswordAvailable(requiredString(params, "email")),
        )
        .toBe(true);
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

  "db.registered_user": {
    absent: async ({ params }) => {
      await expect
        .poll(() => registeredUserAbsent(requiredString(params, "email")))
        .toBe(true);
    },

    pending: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect
        .poll(() => readRegisteredUser(email))
        .toMatchObject({
          email,
          status: "pending",
          role: "member",
        });
      return readRegisteredUser(email);
    },

    active: async ({ params }) => {
      await expect
        .poll(() => readRegisteredUser(requiredString(params, "email")))
        .toMatchObject({
          email: requiredString(params, "email"),
          status: "active",
          role: "member",
        });
    },

    exists: async ({ params }) => {
      await expect
        .poll(() => registeredUserExists(requiredString(params, "email")))
        .toBe(true);
    },

    status: async ({ params }) => {
      await expect
        .poll(() =>
          registeredUserStatusIs(
            requiredString(params, "email"),
            requiredString(params, "status"),
          ),
        )
        .toBe(true);
    },

    role: async ({ params }) => {
      await expect
        .poll(() =>
          registeredUserRoleIs(
            requiredString(params, "email"),
            requiredString(params, "role"),
          ),
        )
        .toBe(true);
    },

    delete_memberships: async ({ params }) => {
      await deleteRegisteredUserMembershipsByEmail(
        requiredString(params, "email"),
      );
    },

    delete: async ({ params }) => {
      const email = requiredString(params, "email");
      const deadline = Date.now() + 10_000;
      let absentSince: number | null = null;

      while (Date.now() < deadline) {
        if (await registeredUserAbsent(email)) {
          absentSince ??= Date.now();
          if (Date.now() - absentSince >= 750) {
            return;
          }
        } else {
          absentSince = null;
          await deleteRegisteredUserByEmail(email);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await expect.poll(() => registeredUserAbsent(email)).toBe(true);
    },
  },

  "page.registration_form": {
    submit: async ({ ctx }) => {
      const responsePromise = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "POST" &&
            response.url().endsWith("/api/auth/registration")
          );
        }, { timeout: CAPTURED_RESPONSE_TIMEOUT_MS })
        .then(toCapturedResponse);

      try {
        await ctx.page.getByRole("button", { name: "Create Account" }).click();
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
    },
  },

  "page.approval_pending": {
    visible: async ({ ctx }) => {
      await expect(
        ctx.page.getByRole("heading", { name: "等待注册审核" }),
      ).toBeVisible();
      return true;
    },
  },

  "api.registration_response": {
    ok: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    },

    record_user: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      const user =
        response.body && typeof response.body === "object"
          ? (response.body as { user?: unknown }).user
          : null;
      if (!isRegisteredUserPayload(user)) {
        throw new Error("注册响应缺少用户信息");
      }
      return user;
    },

    email_matches: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const user =
        response.body && typeof response.body === "object"
          ? (response.body as { user?: unknown }).user
          : null;
      expect(user).toMatchObject({ email: requiredString(params, "email") });
    },

    status: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const user =
        response.body && typeof response.body === "object"
          ? (response.body as { user?: unknown }).user
          : null;
      expect(user).toMatchObject({ status: requiredString(params, "status") });
    },

    role: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const user =
        response.body && typeof response.body === "object"
          ? (response.body as { user?: unknown }).user
          : null;
      expect(user).toMatchObject({ role: requiredString(params, "role") });
    },
  },

} satisfies OperatorRegistry<TestContext, RegisterCaseData>;

async function toCapturedResponse(response: Response) {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

function isRegisteredUserPayload(
  value: unknown,
): value is RegisteredUserRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RegisteredUserRecord).id === "string" &&
    typeof (value as RegisteredUserRecord).email === "string" &&
    typeof (value as RegisteredUserRecord).role === "string" &&
    typeof (value as RegisteredUserRecord).status === "string"
  );
}
