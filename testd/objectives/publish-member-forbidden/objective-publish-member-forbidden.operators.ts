import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import { objectiveTitleAbsent, removeObjectivesByTitle } from "../publish/_support/objective-publish.helpers";
import type {
  MemberPermissionSnapshot,
  ObjectivePublishMemberForbiddenCaseData,
  TestContext,
} from "./_support/objective-publish-member-forbidden.context";
import {
  memberBountyHallMissingObjectiveTitle,
  memberObjectiveCreatePermissionAbsent,
  memberWorkbenchMissingObjectiveTitle,
  readMemberWorkbenchData,
  removeMemberObjectiveCreatePermission,
  restoreMemberPermissionSnapshot,
} from "./_support/objective-publish-member-forbidden.helpers";

export const objectivePublishMemberForbiddenOperators = {
  "db.objective": {
    absent: async ({ params }) => {
      await expect.poll(() => objectiveTitleAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete_by_title: async ({ params }) => {
      await removeObjectivesByTitle(requiredString(params, "title"));
    },
  },

  "db.member_permissions": {
    without_objective_create: async () => removeMemberObjectiveCreatePermission(),

    objective_create_absent: async () => {
      await expect.poll(() => memberObjectiveCreatePermissionAbsent()).toBe(true);
    },

    restore_original: async ({ params }) => {
      await restoreMemberPermissionSnapshot(optionalMemberPermissionSnapshot(params.snapshot));
    },
  },

  "api.my_challenges": {
    read_mine: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "api.bounties": {
    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberBountyHallMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, ObjectivePublishMemberForbiddenCaseData>;

function optionalMemberPermissionSnapshot(value: unknown): MemberPermissionSnapshot | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value === "object" &&
    typeof (value as MemberPermissionSnapshot).teamId === "string" &&
    typeof (value as MemberPermissionSnapshot).existed === "boolean" &&
    Array.isArray((value as MemberPermissionSnapshot).actions)
  ) {
    return value as MemberPermissionSnapshot;
  }
  throw new Error("参数 snapshot 必须是普通成员权限快照");
}
