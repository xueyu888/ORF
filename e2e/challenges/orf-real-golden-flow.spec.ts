import { assertBountyHallVisibility, assertLedgerConsistency, assertMyChallengeVisibility, flyingMetricCountForReportsVisibility, leaderboardRow, objectivePanel } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real golden launch flow", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("two cycles, two objectives, two challengers, settlement accumulation", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const challengerA = await real.newLoggedInPage(browser, real.fixture.challengerA);
    const challengerB = await real.newLoggedInPage(browser, real.fixture.challengerB);
    const observer = await real.newLoggedInPage(browser, real.fixture.observer);
    const settledObjectiveIds: string[] = [];
    const flyingMetricCount = await flyingMetricCountForReportsVisibility(real, 1);
    const expectedChallengerPoints = flyingMetricCount * 810 + 60;

    try {
      for (const round of [1, 2]) {
        const title = `${real.fixture.runLabel} 黄金链路 第${round}轮悬赏目标`;
        const objectiveId = await dsl.createPublishedObjective(commander.page, title, `${real.fixture.runLabel} 黄金链路 第${round}轮指挥官指标`, {
          cycle: `2999 Q${round}`,
        });
        for (let index = 1; index <= flyingMetricCount; index += 1) {
          await dsl.apiAddMetric(real.fixture.commander, objectiveId, `${title} 飞升指标 ${index}`, { uncertaintyLevel: "飞升" });
        }
        await real.attachScreenshot(commander.page, testInfo, `golden-round-${round}-published`);

        await dsl.applyForObjective(challengerA.page, title);
        await dsl.applyForObjective(challengerB.page, title);
        await dsl.approveApplication(commander.page, title, 2);

        await dsl.openTasks(challengerA.page);
        await dsl.proposeMetric(challengerA.page, title, `${real.fixture.runLabel} 黄金链路 第${round}轮挑战者指标`);

        await dsl.openTasks(challengerB.page);
        await expect(objectivePanel(challengerB.page, title)).toContainText("挑战者指标");

        await assertMyChallengeVisibility(observer.page, { hidden: [title] });
        await real.attachScreenshot(observer.page, testInfo, `golden-round-${round}-observer-isolated`);

        await dsl.freezeObjective(commander.page, title);
        await dsl.submitLoot(challengerA.page, objectiveId, title, `${title} 战利品`);
        await dsl.submitPeerReview(challengerA.page, objectiveId);
        await dsl.submitPeerReview(challengerB.page, objectiveId);
        await dsl.reviewAndSettle(commander.page, objectiveId, `${title} 验收通过`);
        await assertLedgerConsistency(real, objectiveId);
        await assertBountyHallVisibility(real, real.fixture.challengerA, { absent: [title] });
        settledObjectiveIds.push(objectiveId);
      }

      await dsl.openReports(commander.page);
      await real.attachScreenshot(commander.page, testInfo, "golden-final-reports");
      await expect(leaderboardRow(commander.page, real.fixture.challengerA.name)).toContainText(expectedChallengerPoints.toFixed(1));
      await expect(leaderboardRow(commander.page, real.fixture.challengerB.name)).toContainText(expectedChallengerPoints.toFixed(1));
      await expect(leaderboardRow(commander.page, real.fixture.observer.name)).toHaveCount(0);
      for (const objectiveId of settledObjectiveIds) {
        await assertLedgerConsistency(real, objectiveId);
      }
    } finally {
      await dsl.closePages(commander, challengerA, challengerB, observer);
    }
  });
});
