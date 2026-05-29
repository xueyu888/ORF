import { assertNoDuplicateLedger, assertNoDuplicateLoot, bountyRow, expectObjectiveChildCreateOptionAbsent, objectivePanel, openObjectiveChildCreateMenu } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real stale UI and duplicate mutation guards", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("commander sees two challenge applications through realtime read-model invalidation without refresh", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const firstApplicant = await real.newLoggedInPage(browser, real.fixture.challengerA);
    const secondApplicant = await real.newLoggedInPage(browser, real.fixture.challengerB);

    try {
      const title = `${real.fixture.runLabel} 实时申请同步目标`;
      await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, title, `${title} 指标`);

      await dsl.openTasks(commander.page);
      const panel = objectivePanel(commander.page, title);
      await expect(panel).toContainText("可申请");

      await dsl.applyForObjective(firstApplicant.page, title);
      await expect(panel).toContainText(real.fixture.challengerA.name);
      await expect(panel).not.toContainText(real.fixture.challengerB.name);

      await dsl.applyForObjective(secondApplicant.page, title);
      await expect(panel).toContainText(real.fixture.challengerA.name);
      await expect(panel).toContainText(real.fixture.challengerB.name);
      await real.attachScreenshot(commander.page, testInfo, "commander-realtime-two-applications");
    } finally {
      await dsl.closePages(commander, firstApplicant, secondApplicant);
    }
  });

  test("stale pages fail safely and duplicate loot/review mutations do not duplicate records", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const staleApplicant = await real.newLoggedInPage(browser, real.fixture.observer);
    const challenger = await real.newLoggedInPage(browser, real.fixture.challengerA);

    try {
      const staleBountyTitle = `${real.fixture.runLabel} 旧大厅申请目标`;
      const staleBounty = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, staleBountyTitle, `${staleBountyTitle} 指标`);
      await dsl.openBounties(staleApplicant.page);
      await expect(bountyRow(staleApplicant.page, staleBountyTitle)).toBeVisible();
      await dsl.recruitViaApi(real.fixture.commander, staleBounty.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, staleBounty.objectiveId);
      await bountyRow(staleApplicant.page, staleBountyTitle).getByRole("button", { name: "申请挑战" }).click();
      await staleApplicant.page.getByRole("dialog").getByRole("textbox", { name: "申请理由" }).fill("旧页面申请挑战验证。");
      await staleApplicant.page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
      await expect(staleApplicant.page.getByText("目标状态已变化，请刷新后再试")).toBeVisible();
      await staleApplicant.page.reload();
      await expect(bountyRow(staleApplicant.page, staleBountyTitle)).toHaveCount(0);
      await real.attachScreenshot(staleApplicant.page, testInfo, "stale-bounty-application-rejected");

      const staleTaskTitle = `${real.fixture.runLabel} 旧挑战页提指标目标`;
      const staleTask = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, staleTaskTitle, `${staleTaskTitle} 指标`);
      await dsl.recruitViaApi(real.fixture.commander, staleTask.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, staleTask.objectiveId);
      await dsl.openTasks(challenger.page);
      const stalePanel = objectivePanel(challenger.page, staleTaskTitle);
      await openObjectiveChildCreateMenu(stalePanel);
      await expect(stalePanel.getByRole("button", { name: "提出指标" })).toBeVisible();
      await dsl.freezeViaApi(real.fixture.commander, staleTask.objectiveId);
      await stalePanel.getByRole("button", { name: "提出指标" }).click();
      await stalePanel.getByLabel("编辑指标标题").fill(`${staleTaskTitle} 旧页面不应创建`);
      await stalePanel.getByLabel("编辑指标标题").press("Enter");
      await expect(challenger.page.getByText("没有执行这个操作的权限")).toBeVisible();
      await challenger.page.reload();
      await expectObjectiveChildCreateOptionAbsent(objectivePanel(challenger.page, staleTaskTitle), "提出指标");
      await real.attachScreenshot(challenger.page, testInfo, "stale-task-proposal-rejected");

      const duplicateTitle = `${real.fixture.runLabel} 重复提交验收目标`;
      const duplicate = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, duplicateTitle, `${duplicateTitle} 指标`);
      await dsl.recruitViaApi(real.fixture.commander, duplicate.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, duplicate.objectiveId);
      await dsl.freezeViaApi(real.fixture.commander, duplicate.objectiveId);
      const lootResponses = await Promise.all([
        dsl.submitLootViaApi(real.fixture.challengerA, duplicate.objectiveId, `${duplicateTitle} 第一次战利品`),
        dsl.submitLootViaApi(real.fixture.challengerA, duplicate.objectiveId, `${duplicateTitle} 第二次战利品`),
      ]);
      expect(lootResponses.map((response) => response.status).sort()).toEqual([200, 409]);
      await assertNoDuplicateLoot(real, duplicate.objectiveId);

      const reviewResponses = await Promise.all([
        dsl.reviewAndSettleViaApi(real.fixture.commander, duplicate.objectiveId, { reason: `${duplicateTitle} 第一次验收` }),
        dsl.reviewAndSettleViaApi(real.fixture.commander, duplicate.objectiveId, { reason: `${duplicateTitle} 第二次验收` }),
      ]);
      expect(reviewResponses.map((response) => response.status).sort()).toEqual([200, 409]);
      await assertNoDuplicateLedger(real, duplicate.objectiveId);
    } finally {
      await dsl.closePages(commander, staleApplicant, challenger);
    }
  });
});
