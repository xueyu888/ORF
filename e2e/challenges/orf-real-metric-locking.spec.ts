import { expectObjectiveChildCreateOptionAbsent, objectivePanel, openObjectiveChildCreateMenu } from "./helpers/realAssertions";
import { RealClock } from "./helpers/realClock";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real metric lifecycle locking", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("frozen, submitted, settled, and expired objectives lock ordinary metric mutations", async ({ browser, real }) => {
    const dsl = new RealScenarioDsl(real);
    const clock = new RealClock(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const member = await real.newLoggedInPage(browser, real.fixture.member1);

    const expectLocked = (status: number) => expect([403, 409]).toContain(status);

    try {
      const frozenTitle = `${real.fixture.runLabel} 指标锁 冻结目标`;
      const frozen = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, frozenTitle, `${frozenTitle} 指标`);
      await dsl.recruitViaApi(real.fixture.commander, frozen.objectiveId, [real.fixture.member1.name]);
      const accepted = await dsl.acceptRecruitmentViaApi(real.fixture.member1, frozen.objectiveId);
      expect(accepted.status).toBe(200);

      await dsl.openTasks(member.page);
      const frozenPanel = objectivePanel(member.page, frozenTitle);
      await openObjectiveChildCreateMenu(frozenPanel);
      await expect(frozenPanel.getByRole("button", { name: "提出指标" })).toBeVisible();
      await dsl.freezeViaApi(real.fixture.commander, frozen.objectiveId);

      await commander.page.reload();
      await expectObjectiveChildCreateOptionAbsent(objectivePanel(commander.page, frozenTitle), "新增指标");
      await member.page.reload();
      await expectObjectiveChildCreateOptionAbsent(objectivePanel(member.page, frozenTitle), "提出指标");

      const adminCreateAfterFreeze = await real.apiAs(real.fixture.commander, "/api/results", {
        body: JSON.stringify({
          objectiveId: frozen.objectiveId,
          title: `${frozenTitle} 冻结后不应创建`,
          metricName: "冻结后指标",
          source: "managerDefined",
        }),
        method: "POST",
      });
      expectLocked(adminCreateAfterFreeze.status);

      const adminPatchAfterFreeze = await dsl.editMetric(real.fixture.commander, frozen.resultId, `${frozenTitle} 冻结后不应修改`);
      expectLocked(adminPatchAfterFreeze.status);

      const memberProposedAfterFreeze = await real.apiAs(real.fixture.member1, "/api/results", {
        body: JSON.stringify({
          objectiveId: frozen.objectiveId,
          title: `${frozenTitle} 冻结后成员不应提出`,
          metricName: "冻结后成员指标",
          source: "memberProposed",
        }),
        method: "POST",
      });
      expectLocked(memberProposedAfterFreeze.status);

      const loot = await dsl.submitLootViaApi(real.fixture.member1, frozen.objectiveId, `${frozenTitle} 战利品`);
      expect(loot.status).toBe(200);
      const deleteSubmittedResult = await real.apiAs(real.fixture.commander, `/api/results/${encodeURIComponent(frozen.resultId)}`, {
        method: "DELETE",
      });
      expectLocked(deleteSubmittedResult.status);

      const settledTitle = `${real.fixture.runLabel} 指标锁 已结算目标`;
      const settled = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, settledTitle, `${settledTitle} 指标 A`);
      const settledResultB = await dsl.apiAddMetric(real.fixture.commander, settled.objectiveId, `${settledTitle} 指标 B`);
      await dsl.recruitViaApi(real.fixture.commander, settled.objectiveId, [real.fixture.member1.name]);
      expect((await dsl.acceptRecruitmentViaApi(real.fixture.member1, settled.objectiveId)).status).toBe(200);
      await dsl.freezeViaApi(real.fixture.commander, settled.objectiveId);
      expect((await dsl.submitLootViaApi(real.fixture.member1, settled.objectiveId, `${settledTitle} 战利品`)).status).toBe(200);
      const review = await dsl.reviewAndSettleViaApi(real.fixture.commander, settled.objectiveId, { reason: `${settledTitle} 验收` });
      expect(review.status).toBe(200);

      const reorderSettledResult = await real.apiAs(real.fixture.commander, `/api/results/${encodeURIComponent(settled.resultId)}/order`, {
        body: JSON.stringify({ referenceResultId: settledResultB, placement: "after" }),
        method: "PATCH",
      });
      expectLocked(reorderSettledResult.status);

      const expiredTitle = `${real.fixture.runLabel} 指标锁 重估过期目标`;
      const expired = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, expiredTitle, `${expiredTitle} 指标`);
      await dsl.recruitViaApi(real.fixture.commander, expired.objectiveId, [real.fixture.member1.name]);
      expect((await dsl.acceptRecruitmentViaApi(real.fixture.member1, expired.objectiveId)).status).toBe(200);
      await dsl.openTasks(member.page);
      const expiredPanel = objectivePanel(member.page, expiredTitle);
      await openObjectiveChildCreateMenu(expiredPanel);
      await expect(expiredPanel.getByRole("button", { name: "提出指标" })).toBeVisible();
      await clock.expireReestimateWindow(expired.objectiveId);
      await member.page.reload();
      await expectObjectiveChildCreateOptionAbsent(objectivePanel(member.page, expiredTitle), "提出指标");

      const memberProposedAfterExpiry = await real.apiAs(real.fixture.member1, "/api/results", {
        body: JSON.stringify({
          objectiveId: expired.objectiveId,
          title: `${expiredTitle} 过期后成员不应提出`,
          metricName: "过期后成员指标",
          source: "memberProposed",
        }),
        method: "POST",
      });
      expectLocked(memberProposedAfterExpiry.status);
    } finally {
      await dsl.closePages(commander, member);
    }
  });
});
