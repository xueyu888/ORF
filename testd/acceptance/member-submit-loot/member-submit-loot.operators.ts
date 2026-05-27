import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  LootPrerequisiteResult,
  LootTarget,
  MemberSubmitLootCaseData,
  SubmittedLoot,
  TestContext,
} from "./_support/member-submit-loot.context";
import {
  claimEvidenceInput,
  createLootPrerequisiteResult,
  deleteLootPrerequisiteResult,
  deleteTestLoot,
  lootFromResponse,
  lootPagePath,
  lootTargetFromObjective,
  prepareLootTarget,
  targetFrozenForMember,
  targetLootPresent,
  targetResultPresent,
  targetSubmitted,
  testLootAbsent,
  testResultAbsent,
} from "./_support/member-submit-loot.helpers";

export const memberSubmitLootOperators = {
  "db.loot_target": {
    from_objective: async ({ params }) => lootTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      await prepareLootTarget(requiredLootTarget(params, "target"), requiredString(params, "memberName"));
    },

    frozen_for_member: async ({ params }) => {
      await expect
        .poll(() => targetFrozenForMember(requiredLootTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    submitted: async ({ params }) => {
      await expect.poll(() => targetSubmitted(requiredLootTarget(params, "target"))).toBe(true);
    },
  },

  "db.loot_result": {
    create: async ({ params }) => {
      return createLootPrerequisiteResult(requiredLootTarget(params, "target"), {
        resultTitle: requiredString(params, "title"),
        metricName: requiredString(params, "metricName"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetResultPresent(requiredLootTarget(params, "target"), requiredLootResult(params, "result")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteLootPrerequisiteResult(requiredString(params, "title"), optionalLootResult(params, "result"));
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteLootPrerequisiteResult(requiredString(params, "title"), optionalLootResult(params, "result"));
    },
  },

  "db.loot": {
    absent: async ({ params }) => {
      await expect.poll(() => testLootAbsent(requiredString(params, "body"))).toBe(true);
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetLootPresent(requiredLootTarget(params, "target"), {
          lootBody: requiredString(params, "body"),
          selfTestReportBody: requiredString(params, "selfTestReportBody"),
        }))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteTestLoot(requiredString(params, "body"), optionalSubmittedLoot(params, "loot"));
    },
  },

  "page.loot": {
    goto: async ({ ctx, params }) => {
      await ctx.page.goto(lootPagePath(requiredLootTarget(params, "target")));
    },
  },

  "page.loot_form": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
      await expect(ctx.page.getByLabel("完成说明")).toBeVisible();
    },

    fill_evidence: async ({ ctx, params }) => {
      await claimEvidenceInput(ctx.page).fill(requiredString(params, "value"));
    },
  },

  "api.loot_submit": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredLootTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "POST" && response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/loot`);
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

  "api.loot_submit_response": {
    record_loot: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return lootFromResponse(response.body);
    },

    matches: async ({ params }) => {
      const loot = requiredSubmittedLoot(params, "loot");
      const target = requiredLootTarget(params, "target");
      const result = requiredLootResult(params, "result");
      expect(loot).toMatchObject({
        objectiveId: target.objective.id,
        submittedBy: requiredString(params, "memberName"),
        body: requiredString(params, "body"),
      });
      expect(loot.selfTestReportBody).toBe(requiredString(params, "selfTestReportBody"));
      expect(loot.selfTestReportBody).toContain(requiredString(params, "reportUrl"));
      expect(loot.resultClaims).toContainEqual({
        resultId: result.id,
        claim: "completed",
        evidenceText: requiredString(params, "evidenceText"),
      });
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitLootCaseData>;

function requiredLootTarget(params: StepParams, key: string): LootTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as LootTarget).objective !== "object" ||
    (value as LootTarget).objective === null ||
    typeof (value as LootTarget).objective.id !== "string" ||
    typeof (value as LootTarget).objective.teamId !== "string" ||
    typeof (value as LootTarget).objective.title !== "string" ||
    typeof (value as LootTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是成员提交战利品目标`);
  }

  return value as LootTarget;
}

function requiredLootResult(params: StepParams, key: string): LootPrerequisiteResult {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as LootPrerequisiteResult).id !== "string" ||
    typeof (value as LootPrerequisiteResult).objectiveId !== "string" ||
    typeof (value as LootPrerequisiteResult).title !== "string" ||
    typeof (value as LootPrerequisiteResult).metricName !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是战利品前置指标`);
  }

  return value as LootPrerequisiteResult;
}

function optionalLootResult(params: StepParams, key: string): LootPrerequisiteResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredLootResult(params, key);
}

function requiredSubmittedLoot(params: StepParams, key: string): SubmittedLoot {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SubmittedLoot).id !== "string" ||
    typeof (value as SubmittedLoot).objectiveId !== "string" ||
    typeof (value as SubmittedLoot).submittedBy !== "string" ||
    typeof (value as SubmittedLoot).body !== "string" ||
    !Array.isArray((value as SubmittedLoot).resultClaims)
  ) {
    throw new Error(`参数 ${key} 必须是提交后的战利品`);
  }

  return value as SubmittedLoot;
}

function optionalSubmittedLoot(params: StepParams, key: string): SubmittedLoot | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredSubmittedLoot(params, key);
}
