import { expect, type Page } from "@playwright/test";
import type { ContributionAllocation, ObjectiveAcceptedResult, ResultAcceptedResult, UncertaintyLevel } from "../../../src/types/orf";
import { realFutureDueDate } from "./realClock";
import { bountyRow, objectivePanel } from "./realAssertions";
import type { LoggedInPage, RealSystemHarness, RealUser } from "./realSystemHarness";

export class RealScenarioDsl {
  constructor(private readonly real: RealSystemHarness) {}

  async openBounties(page: Page) {
    await page.goto("/bounties");
    await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  }

  async openTasks(page: Page) {
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "挑战" })).toBeVisible();
  }

  async openReports(page: Page) {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "成员积分排行榜" })).toBeVisible();
  }

  async createCandidateObjective(page: Page, title: string, options: { cycle?: string; finalDueAt?: string } = {}) {
    await this.openTasks(page);
    await page.getByRole("button", { name: "新建目标" }).click();
    const dialog = page.getByRole("dialog", { name: "新建目标" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("目标标题").fill(title);
    await dialog.getByLabel("为什么重要").fill(`${title} 需要真实系统联调验证。`);
    await dialog.getByRole("textbox", { name: "周期" }).fill(options.cycle ?? "2999 Q4");
    await dialog.getByLabel("最终截止时间").fill(options.finalDueAt ?? realFutureDueDate);
    await dialog.getByLabel("边界 / 不做什么").fill("只验证 ORF 流程，不改开发代码。");
    await dialog.getByRole("button", { name: "保存目标" }).click();
    await expect(objectivePanel(page, title)).toBeVisible();
    return this.real.objectiveIdByTitle(title);
  }

  async addManagerMetric(page: Page, objectiveTitle: string, metricTitle: string, metricName = "真实联调完成率") {
    const panel = objectivePanel(page, objectiveTitle);
    await panel.hover();
    await panel.getByLabel("新增指标").click();
    const dialog = page.getByRole("dialog", { name: "新增指标" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("指标标题").fill(metricTitle);
    await dialog.getByLabel("衡量指标").fill(metricName);
    await dialog.getByRole("button", { name: "保存指标" }).click();
    await expect(panel).toContainText(metricTitle);
    return this.real.resultIdByTitle(metricTitle);
  }

  async publishObjective(page: Page, objectiveTitle: string) {
    const panel = objectivePanel(page, objectiveTitle);
    await panel.getByRole("button", { name: "发布" }).click();
    await expect(panel).toContainText("可申请");
    return this.real.objectiveIdByTitle(objectiveTitle);
  }

  async createPublishedObjective(page: Page, title: string, metricTitle: string, options: { cycle?: string; finalDueAt?: string } = {}) {
    const objectiveId = await this.createCandidateObjective(page, title, options);
    await this.addManagerMetric(page, title, metricTitle);
    await this.publishObjective(page, title);
    return objectiveId;
  }

  async applyForObjective(page: Page, title: string) {
    await this.openBounties(page);
    const row = bountyRow(page, title);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "申请挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
    await expect(row.getByRole("button", { name: "已申请" })).toBeDisabled();
  }

  async approveApplication(page: Page, title: string, count = 1) {
    await this.openTasks(page);
    const panel = objectivePanel(page, title);
    await expect(panel.getByRole("button", { name: "通过" })).toHaveCount(count);
    for (let remaining = count; remaining > 0; remaining -= 1) {
      await panel.getByRole("button", { name: "通过" }).first().click();
      await expect(panel.getByRole("button", { name: "通过" })).toHaveCount(remaining - 1);
    }
    await expect(panel).toContainText("重估中");
  }

  async rejectApplication(page: Page, title: string) {
    await this.openTasks(page);
    const panel = objectivePanel(page, title);
    await panel.getByRole("button", { name: "拒绝" }).first().click();
    await expect(panel.getByRole("button", { name: "拒绝" })).toHaveCount(0);
  }

  async recruitMembers(page: Page, title: string, members: string[]) {
    const panel = objectivePanel(page, title);
    await panel.hover();
    await panel.getByRole("button", { name: "征召" }).click();
    const dialog = page.getByRole("dialog", { name: "征召挑战者" });
    await expect(dialog).toBeVisible();
    for (const member of members) {
      const checkbox = dialog.getByRole("checkbox", { name: `征召 ${member}` });
      await checkbox.click({ force: true, timeout: 5_000 });
      await expect(checkbox, `${member} should be selected for recruitment`).toBeChecked();
    }
    await expect(dialog.getByRole("button", { name: "发送征召" })).toBeEnabled();
    await dialog.getByRole("button", { name: "发送征召" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel).toContainText("征召中");
  }

  async acceptRecruitment(page: Page, title: string) {
    await this.openBounties(page);
    const row = bountyRow(page, title);
    await expect(row).toContainText("征召令");
    await row.getByRole("button", { name: "接受挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "接受挑战" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
  }

  async declineRecruitment(user: RealUser, objectiveId: string) {
    return this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/challenge/decline`, { method: "PATCH" });
  }

  async proposeMetric(page: Page, title: string, metricTitle: string, metricName = "挑战者校准达成率") {
    const panel = objectivePanel(page, title);
    await expect(panel).toContainText("重估中");
    await panel.hover();
    await panel.getByLabel("提出指标").click();
    const dialog = page.getByRole("dialog", { name: "提出指标" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("指标标题").fill(metricTitle);
    await dialog.getByLabel("衡量指标").fill(metricName);
    await dialog.getByRole("button", { name: "提交指标" }).click();
    await expect(panel).toContainText(metricTitle);
    return this.real.resultIdByTitle(metricTitle);
  }

  async editMetric(user: RealUser, resultId: string, title: string) {
    return this.real.apiAs(user, `/api/results/${encodeURIComponent(resultId)}`, {
      body: JSON.stringify({ title }),
      method: "PATCH",
    });
  }

  async addTask(user: RealUser, objectiveId: string, resultId: string, title: string) {
    const response = await this.real.apiAs<{ task: { id: string } }>(user, "/api/tasks", {
      body: JSON.stringify({
        title,
        description: `${title} 真实联调任务`,
        assignee: user.name,
        priority: "High",
        linkedObjectiveId: objectiveId,
        linkedResultId: resultId,
      }),
      method: "POST",
    });
    expect(response.status).toBe(200);
    return response.body.task.id;
  }

  async addSubtask(user: RealUser, taskId: string, label: string) {
    const response = await this.real.apiAs<{ ok: true }>(user, `/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
      body: JSON.stringify({ label }),
      method: "POST",
    });
    expect(response.status).toBe(200);
    return response.body.ok;
  }

  async freezeObjective(page: Page, title: string) {
    await this.openTasks(page);
    const panel = objectivePanel(page, title);
    await panel.getByRole("button", { name: "冻结" }).click();
    await expect(panel).toContainText("已冻结");
  }

  async submitLoot(page: Page, objectiveId: string, title: string, note: string) {
    await page.goto(`/objectives/${objectiveId}/loot`);
    await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await page.getByLabel("完成说明").fill(note);
    const evidenceFields = page.getByPlaceholder("证据、数据或链接");
    const evidenceCount = await evidenceFields.count();
    for (let index = 0; index < evidenceCount; index += 1) {
      await evidenceFields.nth(index).fill(`${note} evidence ${index + 1}`);
    }
    await page.getByLabel("自测报告").fill(`${note} 自测通过。`);
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(objectivePanel(page, title)).toContainText("待验收");
  }

  async submitPeerReview(page: Page, objectiveId: string, allocations?: ContributionAllocation[]) {
    const objective = await this.objective(objectiveId);
    await page.goto(`/objectives/${objectiveId}/loot`);
    await expect(page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
    const nextAllocations = allocations ?? objective.challengers.map((member) => ({ member, ratio: 1 }));
    for (const allocation of nextAllocations) {
      await page.getByLabel(`${allocation.member} 贡献比例`).fill(String(allocation.ratio));
    }
    await page.getByRole("button", { name: "提交匿名互评" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
  }

  async reviewAndSettle(page: Page, objectiveId: string, reason: string, resolution?: ContributionAllocation[]) {
    await page.goto(`/objectives/${objectiveId}/loot`);
    await expect(page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
    if (resolution) {
      for (const allocation of resolution) {
        await page.getByLabel(`${allocation.member} 处理后贡献比例`).fill(String(allocation.ratio));
      }
      await page.getByLabel("分歧处理说明").fill("真实联调处理匿名互评分歧。");
    }
    await page.getByLabel("验收说明").fill(reason);
    await page.getByRole("button", { name: "验收并结算" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "成员积分排行榜" })).toBeVisible();
    await expect.poll(async () => (await this.objective(objectiveId)).flowStatus).toBe("settled");
    const objective = await this.objective(objectiveId);
    const data = await this.real.taskData();
    expect(objective.objectiveSettlementPoints).not.toBeNull();
    expect(data.pointLedger.some((entry) => entry.objectiveId === objectiveId)).toBe(true);
  }

  async reviewAndSettleViaApi(
    user: RealUser,
    objectiveId: string,
    input: {
      acceptedResult?: ObjectiveAcceptedResult;
      contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
      resultReviews?: Array<{ acceptedResult: ResultAcceptedResult; resultId: string }>;
      reason?: string;
    },
  ) {
    return this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/review`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  }

  async apiCreatePublishedObjectiveWithMetric(
    user: RealUser,
    title: string,
    metricTitle: string,
    options: { cycle?: string; finalDueAt?: string; uncertaintyLevel?: UncertaintyLevel } = {},
  ) {
    const objectiveId = await this.apiCreateCandidateObjective(user, title, options);
    const resultId = await this.apiAddMetric(user, objectiveId, metricTitle, { uncertaintyLevel: options.uncertaintyLevel });
    await this.apiPublish(user, objectiveId);
    return { objectiveId, resultId };
  }

  async apiCreateCandidateObjective(user: RealUser, title: string, options: { cycle?: string; finalDueAt?: string } = {}) {
    const response = await this.real.apiAs<{ objective: { id: string } }>(user, "/api/objectives", {
      body: JSON.stringify({
        title,
        whyItMatters: `${title} 真实系统测试目标。`,
        cycle: options.cycle ?? "2999 Q4",
        boundary: "只用于真实系统联调。",
        finalDueAt: options.finalDueAt ?? realFutureDueDate,
      }),
      method: "POST",
    });
    expect(response.status).toBe(200);
    return response.body.objective.id;
  }

  async apiAddMetric(
    user: RealUser,
    objectiveId: string,
    title: string,
    options: { source?: "managerDefined" | "memberProposed"; uncertaintyLevel?: UncertaintyLevel } = {},
  ) {
    const response = await this.real.apiAs<{ result: { id: string } }>(user, "/api/results", {
      body: JSON.stringify({
        objectiveId,
        title,
        metricName: `${title} 指标`,
        baseline: 0,
        current: 0,
        target: 1,
        unit: "case",
        direction: "increase",
        uncertaintyLevel: options.uncertaintyLevel ?? "进阶",
        source: options.source ?? "managerDefined",
      }),
      method: "POST",
    });
    expect(response.status).toBe(200);
    return response.body.result.id;
  }

  async apiPublish(user: RealUser, objectiveId: string) {
    const response = await this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/publish`, { method: "PATCH" });
    expect(response.status).toBe(200);
  }

  async apiApply(user: RealUser, objectiveId: string) {
    const response = await this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications`, { method: "POST" });
    expect([200, 409]).toContain(response.status);
    return response;
  }

  async recruitViaApi(user: RealUser, objectiveId: string, members: string[]) {
    const response = await this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/recruitments`, {
      body: JSON.stringify({ members }),
      method: "POST",
    });
    expect(response.status).toBe(200);
  }

  async acceptRecruitmentViaApi(user: RealUser, objectiveId: string) {
    const response = await this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/challenge`, { method: "PATCH" });
    expect([200, 403, 409]).toContain(response.status);
    return response;
  }

  async freezeViaApi(user: RealUser, objectiveId: string) {
    const response = await this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/freeze`, { method: "PATCH" });
    expect(response.status).toBe(200);
  }

  async submitLootViaApi(user: RealUser, objectiveId: string, body = "真实联调 API 战利品") {
    const data = await this.real.taskData();
    const resultClaims = data.results
      .filter((result) => result.objectiveId === objectiveId)
      .map((result) => ({ resultId: result.id, claim: "completed", evidenceText: `${result.title} evidence` }));
    return this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/loot`, {
      body: JSON.stringify({ body, resultClaims, selfTestReportBody: `${body} self test` }),
      method: "POST",
    });
  }

  async submitPeerReviewViaApi(user: RealUser, objectiveId: string, allocations: ContributionAllocation[]) {
    return this.real.apiAs(user, `/api/objectives/${encodeURIComponent(objectiveId)}/contribution-reviews`, {
      body: JSON.stringify({ allocations }),
      method: "POST",
    });
  }

  async objective(objectiveId: string) {
    const data = await this.real.taskData();
    const objective = data.objectives.find((item) => item.id === objectiveId);
    if (!objective) throw new Error(`Objective not found: ${objectiveId}`);
    return objective;
  }

  async result(resultId: string) {
    const data = await this.real.taskData();
    const result = data.results.find((item) => item.id === resultId);
    if (!result) throw new Error(`Result not found: ${resultId}`);
    return result;
  }

  async closePages(...pages: LoggedInPage[]) {
    await Promise.all(pages.map((item) => item.context.close()));
  }
}
