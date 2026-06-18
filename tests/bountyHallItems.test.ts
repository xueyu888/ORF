import assert from "node:assert/strict";
import test from "node:test";
import {
  currentUserApplication,
  hallTabs,
  isCurrentUserApplicationBounty,
} from "../src/features/bounty-hall/model/bountyHallItems";
import type { BountyItem } from "../src/features/bounty-hall/model/bountyHallTypes";
import type { ChallengeApplication } from "../src/types/orf";

test("bounty hall exposes my applications as a first-class tab", () => {
  assert.deepEqual(
    hallTabs.map((tab) => tab.key),
    ["recruiting", "started", "mine", "all"],
  );
});

test("current user application ignores declined records outside application view", () => {
  const bounty = bountyItem([
    challengeApplication({
      applicantUserId: "user-1",
      createdAt: "2026-06-18T08:00:00.000Z",
      id: "application-declined",
      status: "declined",
    }),
  ]);

  assert.equal(currentUserApplication(bounty, "user-1"), null);
  assert.equal(currentUserApplication(bounty, "user-1", { includeDeclined: true })?.id, "application-declined");
  assert.equal(isCurrentUserApplicationBounty(bounty, "user-1"), true);
});

test("current user application selects the latest record for the active user", () => {
  const bounty = bountyItem([
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
  ]);

  assert.equal(currentUserApplication(bounty, "user-1", { includeDeclined: true })?.id, "application-new");
});

function bountyItem(applications: ChallengeApplication[]): BountyItem {
  return {
    applications,
    objective: {
      id: "objective-1",
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
