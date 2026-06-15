import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  RegisterExistingEmailCaseData,
  TestContext,
} from "./_support/register-existing-email.context";
import {
  countOryIdentitiesByEmail,
  countUsersByEmail,
} from "./_support/register-existing-email.helpers";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

export const registerExistingEmailOperators = {
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

  "api.registration_response": {
    rejected: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(false);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    },
  },

  "ory.identity": {
    single: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect.poll(() => countOryIdentitiesByEmail(email)).toBe(1);
    },
  },

  "db.user": {
    single: async ({ params }) => {
      const email = requiredString(params, "email");
      await expect.poll(() => countUsersByEmail(email)).toBe(1);
    },
  },
} satisfies OperatorRegistry<TestContext, RegisterExistingEmailCaseData>;

async function toCapturedResponse(response: Response) {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}
