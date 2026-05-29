import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../server/db/client";
import {
  feedback,
  objectives,
  objectiveContributionReviews,
  objectiveLoot,
  pointLedger,
  results,
  tasks,
} from "../../../server/db/schema";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { optionalString, requiredString } from "../../_operators/params";
import { captureUserDeleteResponse } from "../admin-edit-member/_support/admin-edit-member.helpers";
import type { AdminDeleteMemberCaseData, TestContext } from "./_support/admin-delete-member.context";

export const adminDeleteMemberOperators = {
  "page.admin_delete_member_login": {
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

    absent: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toHaveCount(0);
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

  "db.delete_member_references": {
    absent: async ({ params }) => {
      await expect
        .poll(() =>
          memberBusinessReferencesAbsent({
            teamId: requiredString(params, "teamId"),
            memberName: requiredString(params, "memberName"),
          }),
        )
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminDeleteMemberCaseData>;

function memberRow(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-user-table").getByRole("row").filter({ hasText: text });
}

async function memberBusinessReferencesAbsent(input: { teamId: string; memberName: string }) {
  const objectiveRows = await db
    .select({
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.teamId, input.teamId));

  if (
    objectiveRows.some(
      (objective) =>
        (objective.challengers ?? []).includes(input.memberName) ||
        (objective.assignedChallengers ?? []).includes(input.memberName) ||
        (objective.challengeApplications ?? []).some((application) => application.applicant === input.memberName),
    )
  ) {
    return false;
  }

  const contributionRows = await db
    .select({
      reviewer: objectiveContributionReviews.reviewer,
      allocations: objectiveContributionReviews.allocations,
    })
    .from(objectiveContributionReviews)
    .where(eq(objectiveContributionReviews.teamId, input.teamId));

  if (
    contributionRows.some(
      (review) =>
        review.reviewer === input.memberName ||
        (review.allocations ?? []).some((allocation) => allocation.member === input.memberName),
    )
  ) {
    return false;
  }

  const [resultRef, taskRef, feedbackRef, lootRef, ledgerRef] = await Promise.all([
    db
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.teamId, input.teamId), eq(results.definer, input.memberName)))
      .limit(1),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.teamId, input.teamId), eq(tasks.assignee, input.memberName)))
      .limit(1),
    db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.teamId, input.teamId), eq(feedback.owner, input.memberName)))
      .limit(1),
    db
      .select({ id: objectiveLoot.id })
      .from(objectiveLoot)
      .where(and(eq(objectiveLoot.teamId, input.teamId), eq(objectiveLoot.submittedBy, input.memberName)))
      .limit(1),
    db
      .select({ id: pointLedger.id })
      .from(pointLedger)
      .where(and(eq(pointLedger.teamId, input.teamId), eq(pointLedger.memberName, input.memberName)))
      .limit(1),
  ]);

  return [resultRef, taskRef, feedbackRef, lootRef, ledgerRef].every((rows) => rows.length === 0);
}
