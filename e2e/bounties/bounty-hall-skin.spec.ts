import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { BountyHallData, BountyHallItem } from "../../src/state/apiClient";
import type { AppNotification } from "../../src/types/orf";
import { routeVisualBackgroundMocks } from "../helpers/visualBackgroundMocks";

const difficultyRanks = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

function bountyHallItem(objectiveId: string, isRecruitment = false): BountyHallItem {
  const objective = initialOrfState.objectives.find((item) => item.id === objectiveId);
  const results = initialOrfState.results.filter((item) => item.objectiveId === objectiveId);
  const result = results[0];

  if (!objective || !result) {
    throw new Error(`Missing bounty fixture for ${objectiveId}`);
  }

  return {
    uncertaintyPoints: results.reduce((sum, item) => sum + item.uncertaintyScore, 0),
    deadline: objective.finalDueAt,
    definer: result.definer ?? "",
    difficultyRank: Math.max(...results.map((item) => difficultyRanks[item.uncertaintyLevel ?? "进阶"])),
    hasCurrentApplication: false,
    isRecruitment,
    objective,
    result,
    results,
    source: result.source ?? "managerDefined",
  };
}

const bountyHallData: BountyHallData = {
  recruitmentItems: [bountyHallItem("obj-bounty-agent-retry", true)],
  availableItems: [bountyHallItem("obj-bounty-cost-routing")],
  objectiveOptions: [
    initialOrfState.objectives.find((item) => item.id === "obj-bounty-agent-retry"),
    initialOrfState.objectives.find((item) => item.id === "obj-bounty-cost-routing"),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  contribution: { points: 0 },
};
const bountyHallUser = initialOrfState.users.find((user) => user.role === "member") ?? initialOrfState.users[0]!;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await routeVisualBackgroundMocks(page);

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: bountyHallUser } });
  });
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: {
        objectives: initialOrfState.objectives,
        results: initialOrfState.results,
        tasks: initialOrfState.tasks,
        evidence: initialOrfState.evidence,
        feedback: initialOrfState.feedback,
        comments: initialOrfState.comments,
        permissionRules: initialOrfState.permissionRules,
      },
    });
  });
  await page.route("**/api/bounties", async (route) => {
    await route.fulfill({ json: bountyHallData });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("renders the bounty hall list and expands details inline on hover", async ({ page }) => {
  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.locator(".bounty-hall-page")).toBeVisible();
  await expect(page.locator(".bounty-action").first()).toBeVisible();
  await expect(page.locator(".bounty-list-row").filter({ hasText: "征召令" })).toBeVisible();
  await expect(page.locator(".bounty-list-row").filter({ hasText: "建立成本感知的模型路由策略" }).getByText("征召令")).toHaveCount(0);
  await expect(page.locator(".bounty-list-head").getByText("指标", { exact: true })).toBeVisible();

  await page.getByLabel("搜索悬赏目标").fill("缓存");
  await expect(page.getByText("悬赏目标 1 条")).toBeVisible();
  await expect(page.getByRole("heading", { name: "建立成本感知的模型路由策略" })).toBeVisible();
  const costRoutingRow = page.locator(".bounty-list-row").filter({ hasText: "建立成本感知的模型路由策略" });
  await costRoutingRow.hover();
  await expect(page.getByText("低风险请求能自动走低成本路径")).toBeVisible();

  await costRoutingRow.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("recruited bounty rows only expose the accept path", async ({ page }) => {
  let declineRequests = 0;

  await page.route("**/api/bounties", async (route) => {
    await route.fulfill({ json: bountyHallData });
  });
  await page.route("**/api/objectives/*/challenge/decline", async (route) => {
    declineRequests += 1;
    await route.fulfill({ status: 500, json: { error: "decline should not be called" } });
  });

  await page.goto("/bounties");

  const recruitmentRow = page.locator(".bounty-list-row").filter({ hasText: "征召令" });
  await expect(recruitmentRow.getByRole("button", { name: "接受挑战" })).toBeVisible();
  await expect(recruitmentRow.getByRole("button", { name: "拒绝征召" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "拒绝征召" })).toHaveCount(0);
  await expect.poll(() => declineRequests).toBe(0);
});

test("refreshes the bounty hall when a recruitment notification is received", async ({ page }) => {
  const recruitmentObjective = initialOrfState.objectives.find((item) => item.id === "obj-bounty-agent-retry");
  if (!recruitmentObjective) {
    throw new Error("Missing recruitment fixture");
  }

  const recruitmentNotification: AppNotification = {
    id: "notification-recruitment",
    kind: "objective.recruitment.created",
    recipientUserId: initialOrfState.users[0].id,
    actorUserId: initialOrfState.users[1].id,
    actorName: initialOrfState.users[1].name,
    title: "新的征召",
    body: `你被征召挑战「${recruitmentObjective.title}」，请在悬赏大厅接受或拒绝。`,
    targetType: "objective",
    targetId: recruitmentObjective.id,
    targetHref: "/bounties",
    readAt: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    metadata: { objectiveTitle: recruitmentObjective.title },
  };
  let bountyRequests = 0;

  await page.route("**/api/notifications", async (route) => {
    await route.fulfill({ json: { notifications: [recruitmentNotification], unreadCount: 1 } });
  });
  await page.route("**/api/bounties", async (route) => {
    bountyRequests += 1;
    await route.fulfill({
      json: bountyRequests === 1
        ? { ...bountyHallData, recruitmentItems: [] }
        : bountyHallData,
    });
  });

  await page.goto("/bounties");

  await expect.poll(() => bountyRequests).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".bounty-list-row").filter({ hasText: recruitmentObjective.title })).toContainText("征召令");
  await expect(page.getByRole("heading", { name: recruitmentObjective.title })).toBeVisible();
});
