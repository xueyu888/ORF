import { assertLedgerConsistency } from "./helpers/realAssertions";
import { RealClock, realFutureDueDate } from "./helpers/realClock";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real accelerated business time", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("late, overdelivered, and abandoned settlements use deterministic multipliers", async ({ real }) => {
    const dsl = new RealScenarioDsl(real);
    const clock = new RealClock(real);
    const cases = [
      { acceptedResult: "completed" as const, expectedMultiplier: 0.5, finalDueAt: "late", label: "截止后完成" },
      { acceptedResult: "overdelivered" as const, expectedMultiplier: 1.5, finalDueAt: realFutureDueDate, label: "超额完成" },
      { acceptedResult: "abandoned" as const, expectedMultiplier: 0, finalDueAt: realFutureDueDate, label: "放弃目标" },
    ];

    for (const item of cases) {
      const title = `${real.fixture.runLabel} 时间加速 ${item.label}`;
      const { objectiveId } = await dsl.apiCreatePublishedObjectiveWithMetric(real.fixture.commander, title, `${title} 指标`, {
        uncertaintyLevel: "入门",
      });
      await dsl.recruitViaApi(real.fixture.commander, objectiveId, [real.fixture.challengerA.name]);
      await dsl.acceptRecruitmentViaApi(real.fixture.challengerA, objectiveId);
      await dsl.freezeViaApi(real.fixture.commander, objectiveId);
      if (item.finalDueAt === "late") {
        await clock.makeSubmissionLate(objectiveId);
      }
      const loot = await dsl.submitLootViaApi(real.fixture.challengerA, objectiveId, `${title} 战利品`);
      expect(loot.status).toBe(200);

      const reviewed = await dsl.reviewAndSettleViaApi(real.fixture.commander, objectiveId, {
        acceptedResult: item.acceptedResult,
        reason: `${title} 结算`,
      });
      expect(reviewed.status).toBe(200);
      const objective = await dsl.objective(objectiveId);
      expect(objective.objectiveBasePoints).toBe(10);
      expect(objective.completionMultiplier).toBe(item.expectedMultiplier);
      expect(objective.objectiveSettlementPoints).toBe(Number((10 * item.expectedMultiplier).toFixed(2)));
      await assertLedgerConsistency(real, objectiveId);
    }
  });
});
