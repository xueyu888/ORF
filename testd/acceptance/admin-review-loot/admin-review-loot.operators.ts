import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { AdminReviewLootCaseData, ReviewLoot, ReviewLootResult, ReviewLootTarget, TestContext } from "./_support/admin-review-loot.context";
import {
  adminAccountActive,
  closeAdminReviewLootTestDb,
  createReviewLoot,
  createReviewLootResult,
  deleteReviewLoot,
  deleteReviewLootLedger,
  deleteReviewLootResult,
  lootPagePath,
  memberAccountActive,
  prepareReviewLootTarget,
  restoreReviewLootTarget,
  reviewLootLedgerPresent,
  reviewLootPresent,
  reviewLootResultPresent,
  reviewLootTargetAvailable,
  reviewLootTargetSettled,
  reviewLootTargetSubmitted,
  selectReviewLootTarget,
  testReviewLootAbsent,
  testReviewLootLedgerAbsent,
  testReviewLootResultAbsent,
} from "./_support/admin-review-loot.helpers";

export { closeAdminReviewLootTestDb };

export const adminReviewLootOperators = {
  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.member": {
    active: async ({ params }) => {
      await expect.poll(() => memberAccountActive(requiredString(params, "memberName"))).toBe(true);
    },
  },

  "db.review_loot_target": {
    available: async () => {
      await expect.poll(() => reviewLootTargetAvailable()).toBe(true);
    },

    select: async () => {
      const target = await selectReviewLootTarget();
      if (!target) {
        throw new Error("没有可构造管理员验收战利品起点的目标");
      }
      return target;
    },

    original_state_recorded: async ({ params }) => {
      expect(requiredReviewLootTarget(params, "target").previous).toBeTruthy();
    },

    prepare: async ({ params }) => {
      await prepareReviewLootTarget(requiredReviewLootTarget(params, "target"), requiredString(params, "memberName"));
    },

    submitted: async ({ params }) => {
      await expect.poll(() => reviewLootTargetSubmitted(requiredReviewLootTarget(params, "target"))).toBe(true);
    },

    settled: async ({ params }) => {
      await expect.poll(() => reviewLootTargetSettled(requiredReviewLootTarget(params, "target"), requiredNumber(params, "points"))).toBe(true);
    },

    restore: async ({ params }) => {
      await restoreReviewLootTarget(optionalReviewLootTarget(params, "target"));
    },
  },

  "db.review_loot_result": {
    absent: async ({ params }) => {
      await expect.poll(() => testReviewLootResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    create: async ({ params }) => {
      return createReviewLootResult(requiredReviewLootTarget(params, "target"), {
        resultTitle: requiredString(params, "title"),
        metricName: requiredString(params, "metricName"),
        points: requiredNumber(params, "points"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => reviewLootResultPresent(requiredReviewLootTarget(params, "target"), requiredReviewLootResult(params, "result")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteReviewLootResult(requiredString(params, "title"), optionalReviewLootResult(params, "result"));
    },
  },

  "db.review_loot": {
    absent: async ({ params }) => {
      await expect.poll(() => testReviewLootAbsent(requiredString(params, "body"))).toBe(true);
    },

    create: async ({ params }) => {
      return createReviewLoot(requiredReviewLootTarget(params, "target"), requiredReviewLootResult(params, "result"), {
        lootBody: requiredString(params, "body"),
        evidenceText: requiredString(params, "evidenceText"),
        memberName: requiredString(params, "memberName"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => reviewLootPresent(requiredReviewLootTarget(params, "target"), requiredReviewLoot(params, "loot")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteReviewLoot(requiredString(params, "body"), optionalReviewLoot(params, "loot"));
    },
  },

  "db.review_loot_ledger": {
    absent: async ({ params }) => {
      await expect.poll(() => testReviewLootLedgerAbsent(requiredString(params, "reason"))).toBe(true);
    },

    present: async ({ params }) => {
      await expect
        .poll(() => reviewLootLedgerPresent(requiredReviewLootTarget(params, "target"), requiredString(params, "memberName"), requiredNumber(params, "points")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteReviewLootLedger(requiredString(params, "reason"));
    },
  },

  "page.review_loot": {
    goto: async ({ ctx, params }) => {
      await ctx.page.goto(lootPagePath(requiredReviewLootTarget(params, "target")));
    },
  },

  "page.review_loot_form": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
      await expect(ctx.page.getByRole("button", { name: "验收并结算" })).toBeVisible();
    },
  },

  "api.review_loot": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredReviewLootTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "POST" && response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/review`);
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
    },
  },
} satisfies OperatorRegistry<TestContext, AdminReviewLootCaseData>;

function requiredReviewLootTarget(params: StepParams, key: string): ReviewLootTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootTarget).objective !== "object" ||
    (value as ReviewLootTarget).objective === null ||
    typeof (value as ReviewLootTarget).objective.id !== "string" ||
    typeof (value as ReviewLootTarget).objective.title !== "string" ||
    typeof (value as ReviewLootTarget).previous !== "object" ||
    (value as ReviewLootTarget).previous === null
  ) {
    throw new Error(`参数 ${key} 必须是管理员验收战利品目标`);
  }

  return value as ReviewLootTarget;
}

function optionalReviewLootTarget(params: StepParams, key: string): ReviewLootTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredReviewLootTarget(params, key);
}

function requiredReviewLootResult(params: StepParams, key: string): ReviewLootResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootResult).id !== "string" ||
    typeof (value as ReviewLootResult).objectiveId !== "string" ||
    typeof (value as ReviewLootResult).title !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是管理员验收前置指标`);
  }

  return value as ReviewLootResult;
}

function optionalReviewLootResult(params: StepParams, key: string): ReviewLootResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredReviewLootResult(params, key);
}

function requiredReviewLoot(params: StepParams, key: string): ReviewLoot {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLoot).id !== "string" ||
    typeof (value as ReviewLoot).objectiveId !== "string" ||
    typeof (value as ReviewLoot).body !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是管理员验收测试战利品`);
  }

  return value as ReviewLoot;
}

function optionalReviewLoot(params: StepParams, key: string): ReviewLoot | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredReviewLoot(params, key);
}
