import { assertBountyHallVisibility, assertCommanderTaskVisibility, assertMyChallengeVisibility, objectivePanel, openObjectiveChildCreateMenu } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real multi-state dashboard", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("candidate/open/applying/recruiting/reestimating/frozen/submitted/settled coexist with correct visibility", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const challengerA = await real.newLoggedInPage(browser, real.fixture.challengerA);
    const challengerB = await real.newLoggedInPage(browser, real.fixture.challengerB);

    const titles = {
      applying: `${real.fixture.runLabel} 多状态 applying 目标`,
      candidate: `${real.fixture.runLabel} 多状态 candidate 目标`,
      frozen: `${real.fixture.runLabel} 多状态 frozen 目标`,
      open: `${real.fixture.runLabel} 多状态 open 目标`,
      recruiting: `${real.fixture.runLabel} 多状态 recruiting 目标`,
      reestimating: `${real.fixture.runLabel} 多状态 reestimating 目标`,
      settled: `${real.fixture.runLabel} 多状态 settled 目标`,
      submitted: `${real.fixture.runLabel} 多状态 submitted 目标`,
    };

    try {
      await dsl.apiCreateCandidateObjective(real.fixture.commander, titles.candidate);
      const open = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.open, `${titles.open} 指标`);
      const applying = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.applying, `${titles.applying} 指标`);
      const recruiting = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.recruiting, `${titles.recruiting} 指标`);
      const reestimating = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.reestimating, `${titles.reestimating} 指标`);
      const frozen = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.frozen, `${titles.frozen} 指标`);
      const submitted = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.submitted, `${titles.submitted} 指标`);
      const settled = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, titles.settled, `${titles.settled} 指标`);

      await dsl.apiApply(real.fixture.challengerA, applying.objectiveId);
      await dsl.recruitViaApi(real.fixture.commander, recruiting.objectiveId, [real.fixture.challengerB.name]);
      await dsl.recruitViaApi(real.fixture.commander, reestimating.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, reestimating.objectiveId);
      await dsl.recruitViaApi(real.fixture.commander, frozen.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, frozen.objectiveId);
      await dsl.freezeViaApi(real.fixture.commander, frozen.objectiveId);
      await dsl.recruitViaApi(real.fixture.commander, submitted.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, submitted.objectiveId);
      await dsl.freezeViaApi(real.fixture.commander, submitted.objectiveId);
      await dsl.submitLootViaApi(real.fixture.challengerA, submitted.objectiveId, `${titles.submitted} 战利品`);
      await dsl.recruitViaApi(real.fixture.commander, settled.objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, settled.objectiveId);
      await dsl.freezeViaApi(real.fixture.commander, settled.objectiveId);
      const settledLoot = await dsl.submitLootViaApi(real.fixture.challengerA, settled.objectiveId, `${titles.settled} 战利品`);
      expect(settledLoot.status).toBe(200);
      await dsl.reviewAndSettleViaApi(real.fixture.commander, settled.objectiveId, { reason: `${titles.settled} 结算` });

      await assertCommanderTaskVisibility(commander.page, Object.values(titles));
      await expect(objectivePanel(commander.page, titles.candidate).getByRole("button", { name: "发布" })).toBeVisible();
      await expect(objectivePanel(commander.page, titles.applying).getByRole("button", { name: "通过" })).toBeVisible();
      await expect(objectivePanel(commander.page, titles.reestimating).getByRole("button", { name: "冻结" })).toBeVisible();
      await expect(objectivePanel(commander.page, titles.submitted).getByRole("link", { name: "验收战利品" })).toBeVisible();
      await real.attachScreenshot(commander.page, testInfo, "multi-state-commander-tasks");

      await assertMyChallengeVisibility(challengerA.page, {
        hidden: [titles.candidate, titles.open, titles.applying, titles.recruiting],
        visible: [titles.reestimating, titles.frozen, titles.submitted, titles.settled],
      });
      await expect(objectivePanel(challengerA.page, titles.frozen).getByRole("link", { name: "提交战利品" })).toBeVisible();
      const reestimatingPanel = objectivePanel(challengerA.page, titles.reestimating);
      await openObjectiveChildCreateMenu(reestimatingPanel);
      await expect(reestimatingPanel.getByRole("button", { name: "提出指标" })).toBeVisible();
      await real.attachScreenshot(challengerA.page, testInfo, "multi-state-challenger-tasks");

      await assertBountyHallVisibility(real, real.fixture.challengerA, {
        absent: [titles.candidate, titles.reestimating, titles.frozen, titles.submitted, titles.settled],
        applications: [titles.applying],
        available: [titles.open],
      });
      await assertBountyHallVisibility(real, real.fixture.challengerB, {
        absent: [titles.candidate, titles.reestimating, titles.frozen, titles.submitted, titles.settled],
        recruitments: [titles.recruiting],
      });
      await dsl.openBounties(challengerB.page);
      await expect(challengerB.page.getByText("征召令")).toBeVisible();

      expect(open.objectiveId).toBeTruthy();
    } finally {
      await dsl.closePages(commander, challengerA, challengerB);
    }
  });
});
