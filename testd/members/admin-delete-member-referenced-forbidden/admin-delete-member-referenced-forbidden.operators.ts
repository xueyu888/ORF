import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../server/db/client";
import { objectives } from "../../../server/db/schema";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { optionalString, requiredString } from "../../_operators/params";
import { captureUserDeleteResponse } from "../admin-edit-member/_support/admin-edit-member.helpers";
import type {
  AdminDeleteMemberReferencedForbiddenCaseData,
  TestContext,
} from "./_support/admin-delete-member-referenced-forbidden.context";

export const adminDeleteMemberReferencedForbiddenOperators = {
  "page.admin_delete_referenced_member_login": {
    submit_admin: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.adminEmail,
              role: data.adminRole,
              status: "active",
            },
          },
        });
    },
  },

  "page.member_row": {
    visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toBeVisible();
    },

    delete_visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "删除" })).toBeVisible();
    },

    delete: async ({ ctx, runtime, params }) => {
      const saveAs = optionalString(params, "saveAs");
      const userId = requiredString(params, "userId");
      if (saveAs) {
        runtime.values[saveAs] = captureUserDeleteResponse(ctx.page, userId);
      }
      ctx.page.once("dialog", (dialog) => void dialog.accept());
      await memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "删除" }).click();
    },
  },

  "db.referenced_member_objective": {
    references_member: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveReferencesMember({
            objectiveId: requiredString(params, "objectiveId"),
            memberName: requiredString(params, "memberName"),
          }),
        )
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminDeleteMemberReferencedForbiddenCaseData>;

function memberRow(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-user-table").getByRole("row").filter({ hasText: text });
}

async function objectiveReferencesMember(input: { objectiveId: string; memberName: string }) {
  const [row] = await db
    .select({ challengers: objectives.challengers })
    .from(objectives)
    .where(eq(objectives.id, input.objectiveId))
    .limit(1);

  return (row?.challengers ?? []).includes(input.memberName);
}
