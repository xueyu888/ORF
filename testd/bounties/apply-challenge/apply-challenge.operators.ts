import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type { ApplyChallengeCaseData, BountyTarget, TestContext } from "./_support/apply-challenge.context";
import {
  availableBountyTargetExists,
  bountyTargetHasCurrentApplication,
  bountyTargetPresentForCurrentUser,
  memberAccountActive,
  objectiveFlowMatchesApplicationOutcome,
  pendingApplicationAbsent,
  pendingApplicationExists,
  removePendingApplication,
  selectBountyTargetFromPage,
  targetStillExistsWithoutApplication,
} from "./_support/apply-challenge.helpers";

export const applyChallengeOperators = {
  "db.member": {
    active: async ({ data }) => {
      await expect.poll(() => memberAccountActive(data)).toBe(true);
    },
  },

  "db.bounty_target": {
    available: async ({ data }) => {
      await expect.poll(() => availableBountyTargetExists(data)).toBe(true);
    },

    no_pending_application: async ({ params }) => {
      await expect
        .poll(() => pendingApplicationAbsent(requiredBountyTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(true);
    },

    pending_application: async ({ params }) => {
      await expect
        .poll(() => pendingApplicationExists(requiredBountyTarget(params, "target"), requiredString(params, "applicant")))
        .toMatchObject({
          applicant: requiredString(params, "applicant"),
          status: "pending",
        });
      const application = await pendingApplicationExists(requiredBountyTarget(params, "target"), requiredString(params, "applicant"));
      expect(application?.createdAt).toBeTruthy();
    },

    flow_matches_application: async ({ params }) => {
      await expect.poll(() => objectiveFlowMatchesApplicationOutcome(requiredBountyTarget(params, "target"))).toBe(true);
    },

    remove_pending_application: async ({ params }) => {
      await removePendingApplication(requiredBountyTarget(params, "target"), requiredString(params, "applicant"));
    },

    clean: async ({ params }) => {
      await expect
        .poll(() => targetStillExistsWithoutApplication(requiredBountyTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(true);
    },
  },

  "api.bounties": {
    select_available_target: async ({ ctx, data }) => selectBountyTargetFromPage(ctx.page, data.name),

    target_present: async ({ ctx, params }) => {
      await expect.poll(() => bountyTargetPresentForCurrentUser(ctx.page, requiredBountyTarget(params, "target"))).toBe(true);
    },

    has_current_application: async ({ ctx, params }) => {
      await expect.poll(() => bountyTargetHasCurrentApplication(ctx.page, requiredBountyTarget(params, "target"))).toBe(true);
    },
  },

  "api.challenge_application": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredBountyTarget(params, "target");
      const saveAs = requiredString(params, "saveAs");
      runtime.values[saveAs] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "POST" &&
            response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/challenge-applications`)
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await response.json().catch(() => null),
        }));
    },

    matches: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const target = requiredBountyTarget(params, "target");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        objective: {
          id: target.objective.id,
        },
      });
    },
  },

  "page.bounty_row": {
    visible: async ({ ctx, params }) => {
      await expect(bountyRow(ctx, requiredBountyTarget(params, "target"))).toBeVisible();
    },

    apply: async ({ ctx, params }) => {
      await bountyRow(ctx, requiredBountyTarget(params, "target")).getByRole("button", { name: "申请挑战" }).click();
    },

    apply_enabled: async ({ ctx, params }) => {
      await expect(bountyRow(ctx, requiredBountyTarget(params, "target")).getByRole("button", { name: "申请挑战" })).toBeEnabled();
    },

    applied_disabled: async ({ ctx, params }) => {
      const row = bountyRow(ctx, requiredBountyTarget(params, "target"));
      if ((await row.count()) === 0) {
        return;
      }
      await expect(row.getByRole("button", { name: "已申请" })).toBeDisabled();
    },
  },

  "page.challenge_application_dialog": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByText("提交后等待指挥官确认")).toBeVisible();
    },

    confirm: async ({ ctx }) => {
      await ctx.page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, ApplyChallengeCaseData>;

function bountyRow(ctx: TestContext, target: BountyTarget) {
  return ctx.page.locator(".bounty-list-row").filter({ hasText: target.objective.title }).first();
}

function requiredBountyTarget(params: StepParams, key: string): BountyTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as BountyTarget).objective !== "object" ||
    (value as BountyTarget).objective === null ||
    typeof (value as BountyTarget).objective.id !== "string" ||
    typeof (value as BountyTarget).objective.title !== "string" ||
    typeof (value as BountyTarget).previousFlowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是悬赏目标`);
  }
  return value as BountyTarget;
}
