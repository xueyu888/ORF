import { assertNoDuplicateLedger, assertNoDuplicateLoot, bountyRow, objectivePanel } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real stale UI and duplicate mutation guards", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

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
      await staleApplicant.page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
      await expect(staleApplicant.page.getByText("这个悬赏目标已经有挑战者")).toBeVisible();
      await staleApplicant.page.reload();
      await expect(bountyRow(staleApplicant.page, staleBountyTitle)).toHaveCount(0);
      await real.attachScreenshot(staleApplicant.page, testInfo, "stale-bounty-application-rejected");

      const staleTaskTitle = `${real.fixture.runLabel} 旧挑战页提指标目标`;
      const staleTask = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, staleTaskTitle, `${staleTaskTitle} 指标`);
      await dsl.recruitViaApi(real.fixture.commander, staleTask.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, staleTask.objectiveId);
      await dsl.openTasks(challenger.page);
      await expect(objectivePanel(challenger.page, staleTaskTitle).getByLabel("提出指标")).toBeVisible();
      await dsl.freezeViaApi(real.fixture.commander, staleTask.objectiveId);
      await objectivePanel(challenger.page, staleTaskTitle).hover();
      await objectivePanel(challenger.page, staleTaskTitle).getByLabel("提出指标").click();
      await challenger.page.getByLabel("指标标题").fill(`${staleTaskTitle} 旧页面不应创建`);
      await challenger.page.getByLabel("衡量指标").fill("旧页面指标");
      await challenger.page.getByRole("button", { name: "提交指标" }).click();
      await expect(challenger.page.getByText("没有执行这个操作的权限")).toBeVisible();
      await challenger.page.reload();
      await expect(objectivePanel(challenger.page, staleTaskTitle).getByLabel("提出指标")).toHaveCount(0);
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
