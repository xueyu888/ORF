import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import { objectiveTitleAbsent, removeObjectivesByTitle } from "../publish/_support/objective-publish.helpers";
import type { ApiAttemptResult, ObjectiveCreateForbiddenCaseData, TestContext } from "./_support/objective-create-forbidden.context";
import {
  attemptCreateObjectiveAsCurrentUser,
  memberWorkbenchMissingObjectiveTitle,
  readMemberWorkbenchData,
} from "./_support/objective-create-forbidden.helpers";

export const objectiveCreateForbiddenOperators = {
  "db.objective": {
    absent: async ({ params }) => {
      await expect.poll(() => objectiveTitleAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete_by_title: async ({ params }) => {
      await removeObjectivesByTitle(requiredString(params, "title"));
    },
  },

  "api.my_challenges": {
    read_mine: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "api.objective_create": {
    attempt: async ({ ctx, params }) => attemptCreateObjectiveAsCurrentUser(ctx.page, requiredString(params, "title")),

    forbidden: async ({ params }) => {
      const result = requiredApiAttemptResult(params, "result");
      expect(result.status).toBe(403);
    },
  },
} satisfies OperatorRegistry<TestContext, ObjectiveCreateForbiddenCaseData>;

function requiredApiAttemptResult(params: Record<string, unknown>, key: string): ApiAttemptResult {
  const value = params[key];
  if (typeof value !== "object" || value === null || typeof (value as ApiAttemptResult).status !== "number") {
    throw new Error(`参数 ${key} 必须是接口尝试结果`);
  }
  return value as ApiAttemptResult;
}
