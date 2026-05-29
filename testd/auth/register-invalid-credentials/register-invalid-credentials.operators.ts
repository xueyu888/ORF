import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  RegisterInvalidCredentialsCaseData,
  TestContext,
} from "./_support/register-invalid-credentials.context";
import {
  countOryIdentitiesByEmail,
  countUsersByEmail,
} from "./_support/register-invalid-credentials.helpers";

export const registerInvalidCredentialsOperators = {
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
} satisfies OperatorRegistry<TestContext, RegisterInvalidCredentialsCaseData>;
