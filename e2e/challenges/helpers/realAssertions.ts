import { expect, type Page } from "@playwright/test";
import type { Objective } from "../../../src/types/orf";
import type { RealSystemHarness, RealUser } from "./realSystemHarness";

const flyingMetricPoints = 810;

export function objectivePanel(page: Page, title: string) {
  return page.locator("section.orf-objective-panel").filter({ hasText: title });
}

export function bountyRow(page: Page, title: string) {
  return page.locator(".bounty-list-row").filter({ hasText: title });
}

export function leaderboardRow(page: Page, memberName: string) {
  return page.locator(".reports-leaderboard-row").filter({
    has: page.locator(`.reports-member-avatar[aria-label="${cssAttributeValue(memberName)}"]`),
  });
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function assertBountyHallVisibility(
  real: RealSystemHarness,
  user: RealUser,
  expected: {
    absent?: string[];
    applications?: string[];
    available?: string[];
    recruitments?: string[];
  },
) {
  const { body, status } = await real.apiAs<{
    availableItems: Array<{ objective: { title: string }; hasCurrentApplication: boolean }>;
    recruitmentItems: Array<{ objective: { title: string } }>;
  }>(user, "/api/bounties");
  expect(status).toBe(200);

  const availableTitles = new Set(body.availableItems.map((item) => item.objective.title));
  const appliedTitles = new Set(body.availableItems.filter((item) => item.hasCurrentApplication).map((item) => item.objective.title));
  const recruitmentTitles = new Set(body.recruitmentItems.map((item) => item.objective.title));
  const allTitles = new Set([...availableTitles, ...recruitmentTitles]);

  for (const title of expected.available ?? []) {
    expect(availableTitles.has(title), `${user.name} should see ${title} as available`).toBe(true);
  }
  for (const title of expected.applications ?? []) {
    expect(appliedTitles.has(title), `${user.name} should see ${title} as already applied`).toBe(true);
  }
  for (const title of expected.recruitments ?? []) {
    expect(recruitmentTitles.has(title), `${user.name} should see ${title} as recruitment`).toBe(true);
  }
  for (const title of expected.absent ?? []) {
    expect(allTitles.has(title), `${user.name} should not see ${title} in bounty hall`).toBe(false);
  }
}

export async function assertMyChallengeVisibility(page: Page, expected: { hidden?: string[]; visible?: string[] }) {
  await page.goto("/tasks");
  for (const title of expected.visible ?? []) {
    await expect(objectivePanel(page, title), `${title} should be visible in my challenges`).toBeVisible();
  }
  for (const title of expected.hidden ?? []) {
    await expect(page.getByText(title), `${title} should be hidden from my challenges`).toHaveCount(0);
  }
}

export async function assertCommanderTaskVisibility(page: Page, titles: string[]) {
  await page.goto("/tasks");
  for (const title of titles) {
    await expect(objectivePanel(page, title), `${title} should be visible to commander`).toBeVisible();
  }
}

export async function assertNoUnauthorizedButtons(page: Page) {
  await expect(page.getByRole("button", { name: "发布" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "冻结" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "征召" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "拒绝" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "验收战利品" })).toHaveCount(0);
}

export async function assertObjectiveInvariants(real: RealSystemHarness, objectiveId: string) {
  const data = await real.taskData();
  const objective = data.objectives.find((item) => item.id === objectiveId);
  expect(objective, `Objective should exist: ${objectiveId}`).toBeTruthy();
  if (!objective) return;

  expect(new Set(objective.challengers).size, "challengers should be unique").toBe(objective.challengers.length);
  expect(new Set(objective.assignedChallengers).size, "assignedChallengers should be unique").toBe(objective.assignedChallengers.length);
  for (const member of objective.challengers) {
    expect(objective.assignedChallengers).not.toContain(member);
  }

  if (objective.flowStatus === "reestimating") {
    expect(objective.stage).toBe("orfReestimate");
  }
  if (["frozen", "submitted", "settled", "closed"].includes(objective.flowStatus)) {
    expect(objective.stage).toBe("goalFrozen");
    expect(objective.assignedChallengers, "closed work phases should not keep outstanding recruitments").toEqual([]);
    expect(
      objective.challengeApplications.filter((application) => application.status === "pending"),
      "closed work phases should not keep pending applications",
    ).toEqual([]);
  }

  const results = data.results.filter((result) => result.objectiveId === objectiveId);
  const loot = data.objectiveLoot.filter((item) => item.objectiveId === objectiveId);
  if (objective.flowStatus !== "settled") {
    for (const result of results) {
      expect(result.acceptedResult).toBe("unreviewed");
    }
  }

  if (objective.flowStatus === "submitted") {
    expect(loot.length, "submitted objective should have exactly one loot submission").toBe(1);
  }

  if (objective.flowStatus === "settled") {
    expect(loot.length, "settled objective should keep exactly one loot submission").toBe(1);
    for (const result of results) {
      expect(result.acceptedResult, "settled results should have concrete review outcomes").not.toBe("unreviewed");
    }
    await assertLedgerConsistency(real, objectiveId);
  }
}

export async function assertLedgerConsistency(real: RealSystemHarness, objectiveId: string) {
  const data = await real.taskData();
  const objective = data.objectives.find((item) => item.id === objectiveId);
  expect(objective, `Objective should exist: ${objectiveId}`).toBeTruthy();
  if (!objective) return;

  const results = data.results.filter((result) => result.objectiveId === objectiveId);
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objectiveId);
  const basePoints = results.reduce((sum, result) => sum + result.uncertaintyScore, 0);
  const settlementPoints = objective.objectiveSettlementPoints ?? 0;
  const ledgerPoints = Number(ledger.reduce((sum, entry) => sum + entry.points, 0).toFixed(2));

  expect(objective.objectiveBasePoints).toBe(basePoints);
  expect(Number((basePoints * (objective.completionMultiplier ?? 0)).toFixed(2))).toBe(settlementPoints);
  expect(ledgerPoints).toBe(settlementPoints);
  expect(new Set(ledger.map((entry) => entry.memberName)).size, "each challenger should have at most one ledger entry").toBe(ledger.length);
  for (const entry of ledger) {
    expect(objective.challengers).toContain(entry.memberName);
  }
}

export async function assertNoDuplicateLoot(real: RealSystemHarness, objectiveId: string) {
  const data = await real.taskData();
  const lootCount = data.objectiveLoot.filter((item) => item.objectiveId === objectiveId).length;
  expect(lootCount).toBeLessThanOrEqual(1);
}

export async function assertNoDuplicateLedger(real: RealSystemHarness, objectiveId: string) {
  const data = await real.taskData();
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objectiveId);
  const members = new Set(ledger.map((entry) => entry.memberName));
  expect(members.size).toBe(ledger.length);
}

export async function flyingMetricCountForReportsVisibility(real: RealSystemHarness, smallestContributionShare: number) {
  const data = await real.taskData();
  const pointsByMember = new Map<string, number>();
  for (const entry of data.pointLedger) {
    pointsByMember.set(entry.memberName, (pointsByMember.get(entry.memberName) ?? 0) + entry.points);
  }

  const currentMaxPoints = Math.max(0, ...pointsByMember.values());
  const visiblePoints = currentMaxPoints + 100;
  return Math.max(1, Math.ceil(visiblePoints / (flyingMetricPoints * smallestContributionShare)));
}

export function expectedSettlement(basePoints: number, objective: Pick<Objective, "completionMultiplier">) {
  return Number((basePoints * (objective.completionMultiplier ?? 0)).toFixed(2));
}
