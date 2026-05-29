import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { BountyHallData, BountyHallItem, TaskManagementData } from "../../src/state/apiClient";
import type { AppNotification } from "../../src/types/orf";
import { routeVisualBackgroundMocks } from "../helpers/visualBackgroundMocks";

const difficultyRanks = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};
const bountyHallUser = initialOrfState.users.find((user) => user.role === "member") ?? initialOrfState.users[0]!;
const bountyHallCommander = initialOrfState.users.find((user) => user.role === "admin") ?? initialOrfState.users[0]!;

function bountyHallItem(objectiveId: string, isRecruitment = false, viewerName = bountyHallUser.name): BountyHallItem {
  const objective = initialOrfState.objectives.find((item) => item.id === objectiveId);
  const results = initialOrfState.results.filter((item) => item.objectiveId === objectiveId);
  const result = results[0];

  if (!objective || !result) {
    throw new Error(`Missing bounty fixture for ${objectiveId}`);
  }
  const applications = objective.challengeApplications ?? [];
  const pendingApplications = applications.filter((application) => application.status === "pending");
  const approvedApplicants = applications.filter((application) => application.status === "approved").map((application) => application.applicant);
  const challengers = objective.challengers ?? [];

  return {
    applications,
    approvedApplicants,
    challengers,
    uncertaintyPoints: results.reduce((sum, item) => sum + item.uncertaintyScore, 0),
    deadline: objective.finalDueAt,
    definer: result.definer ?? "",
    difficultyRank: Math.max(...results.map((item) => difficultyRanks[item.uncertaintyLevel ?? "进阶"])),
    hasCurrentApplication: pendingApplications.some((application) => application.applicant === viewerName),
    isCurrentChallenger: challengers.includes(viewerName),
    isRecruitment,
    objective,
    pendingApplications,
    result,
    results,
    source: result.source ?? "managerDefined",
  };
}

const recruitmentBounty = bountyHallItem("obj-bounty-agent-retry", true);
const availableBounty = bountyHallItem("obj-bounty-cost-routing");
const startedCurrentUserBounty = bountyHallItem("obj-demo-submitted-peer-review");
const bountyHallData: BountyHallData = {
  publicItems: [recruitmentBounty, availableBounty, startedCurrentUserBounty],
  recruitmentItems: [recruitmentBounty],
  availableItems: [availableBounty],
  objectiveOptions: [
    initialOrfState.objectives.find((item) => item.id === "obj-bounty-agent-retry"),
    initialOrfState.objectives.find((item) => item.id === "obj-bounty-cost-routing"),
    initialOrfState.objectives.find((item) => item.id === "obj-demo-submitted-peer-review"),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  contribution: { points: 0 },
};
const taskPageData: TaskManagementData = {
  objectives: initialOrfState.objectives,
  results: initialOrfState.results,
  tasks: initialOrfState.tasks,
  evidence: initialOrfState.evidence,
  feedback: initialOrfState.feedback,
  comments: initialOrfState.comments,
  objectiveLoot: initialOrfState.objectiveLoot,
  objectiveContributionReviews: initialOrfState.objectiveContributionReviews,
  pointLedger: initialOrfState.pointLedger,
  permissionRules: initialOrfState.permissionRules,
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await routeVisualBackgroundMocks(page);

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: bountyHallUser } });
  });
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskPageData });
  });
  await page.route("**/api/my-challenges?scope=all", async (route) => {
    await route.fulfill({ json: taskPageData });
  });
  await page.route("**/api/my-challenges?scope=mine", async (route) => {
    await route.fulfill({ json: taskPageData });
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

test("commander sees bounty hall actions but challenge writes are blocked", async ({ page }) => {
  let applicationRequests = 0;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: bountyHallCommander } });
  });
  await page.route("**/api/objectives/*/challenge-applications", async (route) => {
    applicationRequests += 1;
    await route.fulfill({ status: 500, json: { error: "commander should not submit challenge applications" } });
  });

  await page.goto("/bounties");

  const availableRow = page.locator(".bounty-list-row").filter({ hasText: "建立成本感知的模型路由策略" });
  const action = availableRow.getByRole("button", { name: "申请挑战" });
  await expect(availableRow).toBeVisible();
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();

  await action.click();

  const dialog = page.getByRole("dialog", { name: "指挥官不应该申请挑战" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("不能成为挑战者");
  await expect.poll(() => applicationRequests).toBe(0);
});

test("commander focuses a bounty row on click and opens the matching challenge workbench objective on double click", async ({ page }) => {
  const objectiveId = "obj-bounty-cost-routing";
  const objectiveTitle = "建立成本感知的模型路由策略";

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: bountyHallCommander } });
  });

  await page.goto("/bounties");

  const availableRow = page.locator(".bounty-list-row").filter({ hasText: objectiveTitle });
  await expect(availableRow).toBeVisible();

  await availableRow.click();

  await expect(page).toHaveURL(/\/bounties$/);
  await expect(availableRow).toBeFocused();

  await availableRow.dblclick();

  const challengeTargetRow = page.locator(`[data-challenge-row-target="objective:${objectiveId}"]`);
  await expect(page).toHaveURL(new RegExp(`/tasks#objective:${objectiveId}$`));
  await expect(challengeTargetRow).toBeVisible();
  await expect(challengeTargetRow).toContainText(objectiveTitle);
});

test("highlights the current challenger identity and uses the action column as a work entry", async ({ page }) => {
  const objectiveId = "obj-demo-submitted-peer-review";
  const objectiveTitle = "验收引用质量回归包";

  await page.goto("/bounties");
  await page.getByRole("tab", { name: /已开始/ }).click();

  const startedRow = page.locator(".bounty-list-row").filter({ hasText: objectiveTitle });
  await expect(startedRow).toBeVisible();
  await expect(startedRow.locator(".bounty-row-reward")).not.toContainText("重估中");
  await expect(startedRow.locator(".bounty-avatar[data-current-user='true']")).toHaveAttribute("title", `你 · ${bountyHallUser.name}`);

  await startedRow.getByRole("button", { name: "进入目标" }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks#objective:${objectiveId}$`));
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
    targetHref: `/bounties#objective:${recruitmentObjective.id}`,
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
        ? {
            ...bountyHallData,
            publicItems: bountyHallData.publicItems.filter((item) => !item.isRecruitment),
            recruitmentItems: [],
          }
        : bountyHallData,
    });
  });

  await page.goto("/bounties");

  await expect.poll(() => bountyRequests).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".bounty-list-row").filter({ hasText: recruitmentObjective.title })).toContainText("征召令");
  await expect(page.getByRole("heading", { name: recruitmentObjective.title })).toBeVisible();
});
