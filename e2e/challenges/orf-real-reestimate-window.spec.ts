import { assertObjectiveInvariants, expectObjectiveChildCreateOptionAbsent, objectivePanel } from "./helpers/realAssertions";
import { RealClock } from "./helpers/realClock";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real reestimate window", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("multi-round reestimate edits close after accelerated deadline and freeze", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const clock = new RealClock(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const challengerA = await real.newLoggedInPage(browser, real.fixture.challengerA);
    const challengerB = await real.newLoggedInPage(browser, real.fixture.challengerB);
    const title = `${real.fixture.runLabel} 多轮重估窗口目标`;

    try {
      const objectiveId = await dsl.createPublishedObjective(commander.page, title, `${title} 指挥官指标`);
      await dsl.applyForObjective(challengerA.page, title);
      await dsl.applyForObjective(challengerB.page, title);
      await dsl.approveApplication(commander.page, title, 2);

      await dsl.openTasks(challengerA.page);
      const proposedResultId = await dsl.proposeMetric(challengerA.page, title, `${title} 挑战者A提出指标`);
      const edited = await dsl.editMetric(real.fixture.challengerB, proposedResultId, `${title} 挑战者B修订指标`);
      expect(edited.status).toBe(200);

      const taskId = await dsl.addTask(real.fixture.challengerA, objectiveId, `${title} 重估任务`);
      const subtaskCreated = await dsl.addSubtask(real.fixture.challengerB, taskId, `${title} 重估子任务`);
      expect(taskId).toBeTruthy();
      expect(subtaskCreated).toBe(true);

      await dsl.openTasks(challengerB.page);
      await expect(objectivePanel(challengerB.page, title)).toContainText("挑战者B修订指标");
      await real.attachScreenshot(challengerB.page, testInfo, "reestimate-before-expiry");

      await clock.expireReestimateWindow(objectiveId);
      await challengerA.page.reload();
      await expect(objectivePanel(challengerA.page, title)).toContainText("重估中");
      await expectObjectiveChildCreateOptionAbsent(objectivePanel(challengerA.page, title), "提出指标");
      await real.attachScreenshot(challengerA.page, testInfo, "reestimate-after-expiry");

      const expiredCreate = await real.apiAs(real.fixture.challengerA, "/api/results", {
        body: JSON.stringify({
          objectiveId,
          title: `${title} 过期后不应创建`,
          metricName: "过期指标",
          source: "memberProposed",
        }),
        method: "POST",
      });
      expect(expiredCreate.status).toBe(403);
      const expiredEdit = await dsl.editMetric(real.fixture.challengerA, proposedResultId, `${title} 过期后不应修改`);
      expect(expiredEdit.status).toBe(403);

      await dsl.freezeObjective(commander.page, title);
      const frozenEdit = await dsl.editMetric(real.fixture.challengerA, proposedResultId, `${title} 冻结后不应修改`);
      expect(frozenEdit.status).toBe(403);
      await assertObjectiveInvariants(real, objectiveId);
    } finally {
      await dsl.closePages(commander, challengerA, challengerB);
    }
  });
});
