import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type {
  AdminSettleLootCaseData,
  SettleLoot,
  SettleLootResult,
  SettleLootTarget,
  TestContext,
} from "./_support/admin-settle-loot.context";
import {
  createSettleLoot,
  createSettleLootResult,
  deleteSettleLoot,
  deleteSettleLootLedger,
  deleteSettleLootResult,
  lootPagePath,
  prepareSettleLootTarget,
  settleLootLedgerPresent,
  settleLootPresent,
  settleLootResultPresent,
  settleLootTargetAccepted,
  settleLootTargetFromObjective,
  settleLootTargetSettled,
  testSettleLootAbsent,
  testSettleLootLedgerAbsent,
  testSettleLootResultAbsent,
} from "./_support/admin-settle-loot.helpers";

export const adminSettleLootOperators = {
  "db.settle_loot_target": {
    prepare: async ({ params }) => {
      const target = await settleLootTargetFromObjective(requiredString(params, "objectiveId"));
      await prepareSettleLootTarget(
        target,
        requiredString(params, "memberName"),
        requiredNumber(params, "points"),
      );
      return target;
    },

    accepted: async ({ params }) => {
      await expect
        .poll(() =>
          settleLootTargetAccepted(
            requiredSettleLootTarget(params, "target"),
            requiredString(params, "memberName"),
            requiredNumber(params, "points"),
          ),
        )
        .toBe(true);
    },

    settled: async ({ params }) => {
      await expect
        .poll(() =>
          settleLootTargetSettled(
            requiredSettleLootTarget(params, "target"),
            requiredNumber(params, "points"),
          ),
        )
        .toBe(true);
    },
  },

  "db.settle_loot_result": {
    absent: async ({ params }) => {
      await expect.poll(() => testSettleLootResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    create: async ({ params }) =>
      createSettleLootResult(requiredSettleLootTarget(params, "target"), {
        resultTitle: requiredString(params, "title"),
        metricName: requiredString(params, "metricName"),
        points: requiredNumber(params, "points"),
      }),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          settleLootResultPresent(
            requiredSettleLootTarget(params, "target"),
            requiredSettleLootResult(params, "result"),
            requiredNumber(params, "points"),
          ),
        )
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteSettleLootResult(
        requiredString(params, "title"),
        optionalSettleLootResult(params, "result"),
      );
    },
  },

  "db.settle_loot": {
    absent: async ({ params }) => {
      await expect.poll(() => testSettleLootAbsent(requiredString(params, "body"))).toBe(true);
    },

    create: async ({ params }) =>
      createSettleLoot(
        requiredSettleLootTarget(params, "target"),
        requiredSettleLootResult(params, "result"),
        {
          lootBody: requiredString(params, "body"),
          evidenceText: requiredString(params, "evidenceText"),
          memberName: requiredString(params, "memberName"),
        },
      ),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          settleLootPresent(
            requiredSettleLootTarget(params, "target"),
            requiredSettleLoot(params, "loot"),
            requiredSettleLootResult(params, "result"),
          ),
        )
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteSettleLoot(
        requiredString(params, "body"),
        optionalSettleLoot(params, "loot"),
      );
    },
  },

  "db.settle_loot_ledger": {
    absent: async ({ params }) => {
      await expect
        .poll(() =>
          testSettleLootLedgerAbsent(
            requiredString(params, "objectiveId"),
            requiredString(params, "reason"),
          ),
        )
        .toBe(true);
    },

    present: async ({ params }) => {
      await expect
        .poll(() =>
          settleLootLedgerPresent(
            requiredSettleLootTarget(params, "target"),
            requiredString(params, "memberName"),
            requiredNumber(params, "points"),
            requiredString(params, "reason"),
          ),
        )
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteSettleLootLedger(
        requiredString(params, "objectiveId"),
        requiredString(params, "reason"),
      );
    },
  },

  "page.settle_loot": {
    goto: async ({ ctx, params }) => {
      await ctx.page.goto(lootPagePath(requiredSettleLootTarget(params, "target")));
    },
  },

  "page.settle_loot_form": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "确认结算" })).toBeVisible();
      await expect(ctx.page.getByRole("button", { name: "确认结算" })).toBeVisible();
    },

    submit: async ({ ctx, runtime, params }) => {
      const target = requiredSettleLootTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "POST" &&
            response.url().endsWith(
              `/api/objectives/${encodeURIComponent(target.objective.id)}/settle`,
            )
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
      await ctx.page.getByRole("button", { name: "确认结算" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminSettleLootCaseData>;

function requiredSettleLootTarget(params: StepParams, key: string): SettleLootTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SettleLootTarget).objective !== "object" ||
    (value as SettleLootTarget).objective === null ||
    typeof (value as SettleLootTarget).objective.id !== "string" ||
    typeof (value as SettleLootTarget).objective.teamId !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是管理员结算目标`);
  }
  return value as SettleLootTarget;
}

function requiredSettleLootResult(params: StepParams, key: string): SettleLootResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SettleLootResult).id !== "string" ||
    typeof (value as SettleLootResult).objectiveId !== "string" ||
    typeof (value as SettleLootResult).title !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是管理员结算前置指标`);
  }
  return value as SettleLootResult;
}

function optionalSettleLootResult(params: StepParams, key: string) {
  const value = params[key];
  return value === undefined || value === null
    ? null
    : requiredSettleLootResult(params, key);
}

function requiredSettleLoot(params: StepParams, key: string): SettleLoot {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SettleLoot).id !== "string" ||
    typeof (value as SettleLoot).objectiveId !== "string" ||
    typeof (value as SettleLoot).body !== "string" ||
    !Array.isArray((value as SettleLoot).resultClaims)
  ) {
    throw new Error(`参数 ${key} 必须是管理员结算前置战利品`);
  }
  return value as SettleLoot;
}

function optionalSettleLoot(params: StepParams, key: string) {
  const value = params[key];
  return value === undefined || value === null
    ? null
    : requiredSettleLoot(params, key);
}
