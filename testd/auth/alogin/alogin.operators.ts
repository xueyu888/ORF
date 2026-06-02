import type { OperatorRegistry } from "../../_framework/types";
import { readTestUserAccount } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import { saveUserPreferences } from "../../../server/settings/personalSettings";
import type { ALoginCaseData, TestContext } from "./_support/alogin.context";

export const aloginOperators = {
  "user.preferences": {
    set_default_landing_path: async ({ params }) => {
      await saveUserPreferences(requiredString(params, "userId"), {
        defaultLandingPath: requiredString(params, "path"),
      });
    },

    reset_default_landing_path_by_email: async ({ params }) => {
      const account = await readTestUserAccount({
        email: requiredString(params, "email"),
      });
      if (!account) {
        return;
      }
      await saveUserPreferences(account.userId, { defaultLandingPath: null });
    },
  },
} satisfies OperatorRegistry<TestContext, ALoginCaseData>;
