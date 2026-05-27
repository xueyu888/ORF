import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitPeerReviewCaseData,
  PeerReviewLoot,
  PeerReviewTarget,
  SubmittedPeerReview,
  TestContext,
} from "./_support/member-submit-peer-review.context";
import {
  createPeerReviewLoot,
  deletePeerReview,
  deletePeerReviewLoot,
  lootPagePath,
  memberAccountActive,
  peerReviewAbsent,
  peerReviewFromResponse,
  peerReviewPresent,
  peerReviewTargetAvailable,
  preparePeerReviewTarget,
  restorePeerReviewTarget,
  selectPeerReviewTarget,
  targetLootPresent,
  targetSubmittedForMember,
  testLootAbsent,
} from "./_support/member-submit-peer-review.helpers";

export const memberSubmitPeerReviewOperators = {
  "db.member": {
    active: async ({ params }) => {
      await expect.poll(() => memberAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.peer_review_target": {
    available: async ({ data }) => {
      await expect.poll(() => peerReviewTargetAvailable(data)).toBe(true);
    },

    select: async ({ data }) => {
      const target = await selectPeerReviewTarget(data);
      if (!target) {
        throw new Error("没有可构造成员提交匿名互评起点的目标");
      }
      return target;
    },

    original_state_recorded: async ({ params }) => {
      expect(requiredPeerReviewTarget(params, "target").previous).toBeTruthy();
    },

    prepare: async ({ params }) => {
      await preparePeerReviewTarget(requiredPeerReviewTarget(params, "target"), requiredString(params, "memberName"));
    },

    submitted_for_member: async ({ params }) => {
      await expect
        .poll(() => targetSubmittedForMember(requiredPeerReviewTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },

    restore: async ({ params }) => {
      await restorePeerReviewTarget(optionalPeerReviewTarget(params, "target"));
    },
  },

  "db.peer_review_loot": {
    absent: async ({ params }) => {
      await expect.poll(() => testLootAbsent(requiredString(params, "body"))).toBe(true);
    },

    create: async ({ params }) => {
      return createPeerReviewLoot(requiredPeerReviewTarget(params, "target"), requiredString(params, "body"), requiredString(params, "memberName"));
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetLootPresent(requiredPeerReviewTarget(params, "target"), requiredPeerReviewLoot(params, "loot")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deletePeerReviewLoot(requiredString(params, "body"), optionalPeerReviewLoot(params, "loot"));
    },
  },

  "db.peer_review": {
    absent: async ({ params }) => {
      await expect.poll(() => peerReviewAbsent(optionalPeerReviewTarget(params, "target"), requiredString(params, "reviewer"))).toBe(true);
    },

    present: async ({ params }) => {
      await expect
        .poll(() => peerReviewPresent(requiredPeerReviewTarget(params, "target"), requiredString(params, "reviewer"), requiredRatio(params, "ratio")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deletePeerReview(optionalPeerReviewTarget(params, "target"), requiredString(params, "reviewer"), optionalSubmittedPeerReview(params, "review"));
    },
  },

  "page.peer_review": {
    goto: async ({ ctx, params }) => {
      await ctx.page.goto(lootPagePath(requiredPeerReviewTarget(params, "target")));
    },
  },

  "page.peer_review_form": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
      await expect(ctx.page.getByRole("button", { name: "提交匿名互评" })).toBeVisible();
    },
  },

  "api.peer_review_submit": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredPeerReviewTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "POST" && response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/contribution-reviews`);
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

  "api.peer_review_submit_response": {
    record_review: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      return peerReviewFromResponse(response.body);
    },

    matches: async ({ params }) => {
      const review = requiredSubmittedPeerReview(params, "review");
      const target = requiredPeerReviewTarget(params, "target");
      const reviewer = requiredString(params, "reviewer");
      expect(review).toMatchObject({
        objectiveId: target.objective.id,
        reviewer,
      });
      expect(review.allocations).toContainEqual({
        member: reviewer,
        ratio: requiredRatio(params, "ratio"),
      });
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitPeerReviewCaseData>;

function requiredPeerReviewTarget(params: StepParams, key: string): PeerReviewTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewTarget).objective !== "object" ||
    (value as PeerReviewTarget).objective === null ||
    typeof (value as PeerReviewTarget).objective.id !== "string" ||
    typeof (value as PeerReviewTarget).objective.title !== "string" ||
    typeof (value as PeerReviewTarget).previous !== "object" ||
    (value as PeerReviewTarget).previous === null
  ) {
    throw new Error(`参数 ${key} 必须是成员提交匿名互评目标`);
  }

  return value as PeerReviewTarget;
}

function optionalPeerReviewTarget(params: StepParams, key: string): PeerReviewTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredPeerReviewTarget(params, key);
}

function requiredPeerReviewLoot(params: StepParams, key: string): PeerReviewLoot {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewLoot).id !== "string" ||
    typeof (value as PeerReviewLoot).objectiveId !== "string" ||
    typeof (value as PeerReviewLoot).body !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是匿名互评前置战利品`);
  }

  return value as PeerReviewLoot;
}

function optionalPeerReviewLoot(params: StepParams, key: string): PeerReviewLoot | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredPeerReviewLoot(params, key);
}

function requiredSubmittedPeerReview(params: StepParams, key: string): SubmittedPeerReview {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SubmittedPeerReview).id !== "string" ||
    typeof (value as SubmittedPeerReview).objectiveId !== "string" ||
    typeof (value as SubmittedPeerReview).reviewer !== "string" ||
    !Array.isArray((value as SubmittedPeerReview).allocations)
  ) {
    throw new Error(`参数 ${key} 必须是提交后的匿名互评`);
  }

  return value as SubmittedPeerReview;
}

function optionalSubmittedPeerReview(params: StepParams, key: string): SubmittedPeerReview | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredSubmittedPeerReview(params, key);
}

function requiredRatio(params: StepParams, key: string) {
  const ratio = Number(params[key]);
  if (!Number.isFinite(ratio)) {
    throw new Error(`参数 ${key} 必须是数字比例`);
  }
  return ratio;
}
