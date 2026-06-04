import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeContributionReviews,
  validateContributionAllocationInput,
} from "../src/features/challenge/model/contributionReview";
import type { ObjectiveContributionReview } from "../src/types/orf";

test("contribution review input requires standard ratios for all challengers", () => {
  const valid = validateContributionAllocationInput(
    [
      { member: "Ada", ratio: 0.6 },
      { member: "Bo", ratio: 0.4 },
    ],
    ["Ada", "Bo"],
  );
  assert.equal(valid.status, "ok");

  assert.equal(
    validateContributionAllocationInput(
      [
        { member: "Ada", ratio: 5000 },
        { member: "Bo", ratio: 5000 },
      ],
      ["Ada", "Bo"],
    ).status,
    "invalid",
  );
  assert.equal(
    validateContributionAllocationInput(
      [
        { member: "Ada", ratio: 0.6 },
        { member: "Bo", ratio: 0.3 },
      ],
      ["Ada", "Bo"],
    ).status,
    "invalid",
  );
});

test("contribution review input preserves member user ids as allocation identity", () => {
  const valid = validateContributionAllocationInput(
    [
      { member: "Ada Old", memberUserId: "usr-ada", ratio: 0.6 },
      { member: "Bo", memberUserId: "usr-bo", ratio: 0.4 },
    ],
    [
      { member: "Ada New", memberUserId: "usr-ada" },
      { member: "Bo", memberUserId: "usr-bo" },
    ],
  );

  assert.deepEqual(valid, {
    status: "ok",
    allocations: [
      { member: "Ada New", memberUserId: "usr-ada", ratio: 0.6 },
      { member: "Bo", memberUserId: "usr-bo", ratio: 0.4 },
    ],
  });

  assert.equal(
    validateContributionAllocationInput(
      [
        { member: "Ada New", memberUserId: "usr-other", ratio: 0.6 },
        { member: "Bo", memberUserId: "usr-bo", ratio: 0.4 },
      ],
      [
        { member: "Ada New", memberUserId: "usr-ada" },
        { member: "Bo", memberUserId: "usr-bo" },
      ],
    ).status,
    "invalid",
  );
});

test("contribution review summary ignores self score for settlement ratios", () => {
  const summary = summarizeContributionReviews(
    ["Ada", "Bo"],
    [
      review("review-a", "Ada", [
        { member: "Ada", ratio: 0.8 },
        { member: "Bo", ratio: 0.2 },
      ]),
      review("review-b", "Bo", [
        { member: "Ada", ratio: 0.7 },
        { member: "Bo", ratio: 0.3 },
      ]),
    ],
  );

  assert.equal(summary.status, "ready");
  assert.equal(
    summary.ratios.find((item) => item.member === "Ada")?.ratio.toFixed(3),
    "0.778",
  );
  assert.equal(
    summary.ratios.find((item) => item.member === "Bo")?.ratio.toFixed(3),
    "0.222",
  );
});

test("two-person contribution review conflicts when peer scores do not cover the full share", () => {
  const summary = summarizeContributionReviews(
    ["Ada", "Bo"],
    [
      review("review-a", "Ada", [
        { member: "Ada", ratio: 0.9 },
        { member: "Bo", ratio: 0.1 },
      ]),
      review("review-b", "Bo", [
        { member: "Ada", ratio: 0.1 },
        { member: "Bo", ratio: 0.9 },
      ]),
    ],
  );

  assert.equal(summary.status, "conflict");
  assert.deepEqual(summary.ratios, [
    { member: "Ada", ratio: 0.5 },
    { member: "Bo", ratio: 0.5 },
  ]);
});

function review(
  id: string,
  reviewer: string,
  allocations: ObjectiveContributionReview["allocations"],
): ObjectiveContributionReview {
  return {
    id,
    objectiveId: "obj-review",
    reviewer,
    allocations,
    submittedAt: id.endsWith("a")
      ? "2026-05-29T00:00:01.000Z"
      : "2026-05-29T00:00:02.000Z",
  };
}
