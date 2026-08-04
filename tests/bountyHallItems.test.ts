import assert from "node:assert/strict";
import test from "node:test";
import { isObjectiveVisibleInBountyHallByFlow } from "../src/domain/orfLifecycle";
import {
  buildHallItemBuckets,
  currentUserApplication,
  defaultHallTab,
  hallTabs,
  isCurrentUserRelatedBounty,
} from "../src/features/bounty-hall/model/bountyHallItems";
import {
  bountyHallFilterPreferenceFromRecord,
  bountyHallFilterPreferenceToRecord,
} from "../src/features/bounty-hall/model/bountyHallFilterPreferences";
import type { BountyItem } from "../src/features/bounty-hall/model/bountyHallTypes";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../src/types/orf";

test("bounty hall tabs follow the public lifecycle and related-view contract", () => {
  assert.equal(defaultHallTab, "all");
  assert.deepEqual(
    hallTabs.map((tab) => tab.key),
    ["all", "open", "frozen", "submitted", "revisionRequired", "accepted", "settled", "related"],
  );
});

test("bounty hall lifecycle visibility includes settled objectives but excludes drafts and closed records", () => {
  const visibleStatuses: ObjectiveFlowStatus[] = ["open", "applying", "recruiting", "reestimating", "frozen", "submitted", "revisionRequired", "accepted", "settled"];
  for (const status of visibleStatuses) {
    assert.equal(isObjectiveVisibleInBountyHallByFlow(status), true, status);
  }

  assert.equal(isObjectiveVisibleInBountyHallByFlow("candidate"), false);
  assert.equal(isObjectiveVisibleInBountyHallByFlow("closed"), false);
});

test("bounty hall buckets are built in a single lifecycle pass", () => {
  const items = [
    bountyItem({ id: "objective-open", flowStatus: "open" }),
    bountyItem({ id: "objective-reestimating", flowStatus: "reestimating", challengerUserIds: ["user-1"] }),
    bountyItem({ id: "objective-frozen", flowStatus: "frozen" }),
    bountyItem({ id: "objective-submitted", flowStatus: "submitted" }),
    bountyItem({ id: "objective-revision-required", flowStatus: "revisionRequired", challengerUserIds: ["user-1"] }),
    bountyItem({ id: "objective-accepted", flowStatus: "accepted", assignedChallengerUserIds: ["user-1"] }),
    bountyItem({ id: "objective-settled", flowStatus: "settled" }),
  ];

  const buckets = buildHallItemBuckets(items, "user-1");

  assert.deepEqual(buckets.all.map((item) => item.objective.id), [
    "objective-open",
    "objective-reestimating",
    "objective-frozen",
    "objective-submitted",
    "objective-revision-required",
    "objective-accepted",
    "objective-settled",
  ]);
  assert.deepEqual(buckets.open.map((item) => item.objective.id), ["objective-open", "objective-reestimating"]);
  assert.deepEqual(buckets.frozen.map((item) => item.objective.id), ["objective-frozen"]);
  assert.deepEqual(buckets.submitted.map((item) => item.objective.id), ["objective-submitted"]);
  assert.deepEqual(buckets.revisionRequired.map((item) => item.objective.id), ["objective-revision-required"]);
  assert.deepEqual(buckets.accepted.map((item) => item.objective.id), ["objective-accepted"]);
  assert.deepEqual(buckets.settled.map((item) => item.objective.id), ["objective-settled"]);
  assert.deepEqual(buckets.related.map((item) => item.objective.id), ["objective-reestimating", "objective-revision-required", "objective-accepted"]);
});

test("bounty hall filter preference stores only non-default tab and sort choices", () => {
  assert.deepEqual(
    bountyHallFilterPreferenceToRecord({ sortKey: "deadline", tab: "all" }),
    null,
  );
  assert.deepEqual(
    bountyHallFilterPreferenceToRecord({ sortKey: "published", tab: "open" }),
    {
      values: {
        sort: "published",
        tab: "open",
      },
      version: 1,
    },
  );
  assert.deepEqual(
    bountyHallFilterPreferenceFromRecord({
      values: {
        sort: "invalid",
        tab: "invalid",
      },
      version: 1,
    }),
    {
      sortKey: "deadline",
      tab: "all",
    },
  );
});

test("current user application ignores declined records outside the related view", () => {
  const bounty = bountyItem({
    applications: [
      challengeApplication({
        applicantUserId: "user-1",
        createdAt: "2026-06-18T08:00:00.000Z",
        id: "application-declined",
        status: "declined",
      }),
    ],
  });

  assert.equal(currentUserApplication(bounty, "user-1"), null);
  assert.equal(currentUserApplication(bounty, "user-1", { includeDeclined: true })?.id, "application-declined");
  assert.equal(isCurrentUserRelatedBounty(bounty, "user-1"), true);
});

test("current user application selects the latest record for the active user", () => {
  const bounty = bountyItem({
    applications: [
      challengeApplication({
        applicantUserId: "user-2",
        createdAt: "2026-06-18T11:00:00.000Z",
        id: "application-other",
        status: "pending",
      }),
      challengeApplication({
        applicantUserId: "user-1",
        createdAt: "2026-06-18T09:00:00.000Z",
        id: "application-old",
        status: "declined",
      }),
      challengeApplication({
        applicantUserId: "user-1",
        createdAt: "2026-06-18T10:00:00.000Z",
        id: "application-new",
        status: "pending",
      }),
    ],
  });

  assert.equal(currentUserApplication(bounty, "user-1", { includeDeclined: true })?.id, "application-new");
});

function bountyItem(input: {
  applications?: ChallengeApplication[];
  assignedChallengerUserIds?: string[];
  challengerUserIds?: string[];
  flowStatus?: ObjectiveFlowStatus;
  id?: string;
} = {}): BountyItem {
  return {
    applications: input.applications ?? [],
    objective: {
      assignedChallengerUserIds: input.assignedChallengerUserIds ?? [],
      challengeApplications: input.applications ?? [],
      challengerUserIds: input.challengerUserIds ?? [],
      flowStatus: input.flowStatus ?? "open",
      id: input.id ?? "objective-1",
      title: "目标",
    },
  } as BountyItem;
}

function challengeApplication(input: Partial<ChallengeApplication>): ChallengeApplication {
  return {
    applicant: "成员",
    applicantUserId: "user-1",
    createdAt: "2026-06-18T08:00:00.000Z",
    id: "application-1",
    reason: "想挑战",
    status: "pending",
    ...input,
  };
}
