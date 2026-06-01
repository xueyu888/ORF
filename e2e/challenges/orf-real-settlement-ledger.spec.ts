import { assertLedgerConsistency, flyingMetricCountForReportsVisibility, leaderboardRow } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real settlement ledger", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("three challengers resolve local settlement override into consistent ledger and reports", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const title = `${real.fixture.runLabel} 三人互评结算目标`;
    const flyingMetricCount = await flyingMetricCountForReportsVisibility(real, 0.2);
    const basePoints = flyingMetricCount * 810;
    const { objectiveId } = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, title, `${title} 入门指标`, {
      uncertaintyLevel: "飞升",
    });
    for (let index = 2; index <= flyingMetricCount; index += 1) {
      await dsl.apiAddMetric(real.fixture.commander, objectiveId, `${title} 飞升指标 ${index}`, { uncertaintyLevel: "飞升" });
    }
    await dsl.recruitViaApi(real.fixture.commander, objectiveId, [
      real.fixture.challengerA.name,
      real.fixture.challengerB.name,
      real.fixture.challengerC.name,
    ]);
    await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, objectiveId);
    await dsl.acceptRecruitmentViaApi(real.fixture.challengerB, objectiveId);
    await dsl.acceptRecruitmentViaApi(real.fixture.challengerC, objectiveId);
    await dsl.freezeViaApi(real.fixture.commander, objectiveId);
    expect((await dsl.submitLootViaApi(real.fixture.challengerA, objectiveId, `${title} 战利品`)).status).toBe(200);

    try {
      await commander.page.goto(`/objectives/${objectiveId}/loot`);
      await expect(commander.page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
      await expect(commander.page.getByText("验收时从本地结算服务读取匿名互评汇总。")).toBeVisible();
      await real.attachScreenshot(commander.page, testInfo, "settlement-peer-review-resolution");
      await dsl.reviewAndSettle(commander.page, objectiveId, `${title} 按指挥官分歧处理结算`, [
        { member: real.fixture.challengerA.name, ratio: 5 },
        { member: real.fixture.challengerB.name, ratio: 3 },
        { member: real.fixture.challengerC.name, ratio: 2 },
      ]);

      const objective = await dsl.objective(objectiveId);
      expect(objective.objectiveBasePoints).toBe(basePoints);
      expect(objective.objectiveSettlementPoints).toBe(basePoints);
      await assertLedgerConsistency(real, objectiveId);

      const data = await real.taskData();
      const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objectiveId);
      const expectedA = basePoints * 0.5;
      const expectedB = basePoints * 0.3;
      const expectedC = basePoints * 0.2;
      expect(ledger.find((entry) => entry.memberName === real.fixture.challengerA.name)?.points).toBe(expectedA);
      expect(ledger.find((entry) => entry.memberName === real.fixture.challengerB.name)?.points).toBe(expectedB);
      expect(ledger.find((entry) => entry.memberName === real.fixture.challengerC.name)?.points).toBe(expectedC);
      expect(ledger.some((entry) => entry.memberName === real.fixture.observer.name)).toBe(false);

      await dsl.openReports(commander.page);
      await expect(leaderboardRow(commander.page, real.fixture.challengerA.name)).toContainText(expectedA.toFixed(1));
      await expect(leaderboardRow(commander.page, real.fixture.challengerB.name)).toContainText(expectedB.toFixed(1));
      await expect(leaderboardRow(commander.page, real.fixture.challengerC.name)).toContainText(expectedC.toFixed(1));
    } finally {
      await dsl.closePages(commander);
    }
  });
});
