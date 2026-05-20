import { assertBountyHallVisibility, assertMyChallengeVisibility } from "./helpers/realAssertions";
import { realSystemEnabled, test, expect } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real recruitment flow", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("commander recruits A/B/C, recruited members can only accept, observer cannot accept", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const challengerA = await real.newLoggedInPage(browser, real.fixture.challengerA);
    const challengerB = await real.newLoggedInPage(browser, real.fixture.challengerB);
    const reluctant = await real.newLoggedInPage(browser, real.fixture.reluctantMember);
    const observer = await real.newLoggedInPage(browser, real.fixture.observer);
    const title = `${real.fixture.runLabel} 多人征召连续接受目标`;

    try {
      const objectiveId = await dsl.createPublishedObjective(commander.page, title, `${title} 指标`);
      await dsl.recruitMembers(commander.page, title, [
        real.fixture.challengerA.name,
        real.fixture.challengerB.name,
        real.fixture.reluctantMember.name,
      ]);
      await real.attachScreenshot(commander.page, testInfo, "recruitment-commander-launch");

      await dsl.acceptRecruitment(challengerA.page, title);
      await assertBountyHallVisibility(real, real.fixture.challengerB, { recruitments: [title] });
      await dsl.acceptRecruitment(challengerB.page, title);

      await dsl.openBounties(reluctant.page);
      const reluctantRow = reluctant.page.locator(".bounty-list-row").filter({ hasText: title });
      await expect(reluctantRow).toContainText("征召令");
      await expect(reluctantRow.getByRole("button", { name: "接受挑战" })).toBeVisible();
      await expect(reluctantRow.getByRole("button", { name: "拒绝征召" })).toHaveCount(0);
      const legacyDecline = await real.apiAs(real.fixture.reluctantMember, `/api/objectives/${encodeURIComponent(objectiveId)}/challenge/decline`, { method: "PATCH" });
      expect(legacyDecline.status).toBe(404);
      const observerAccept = await dsl.acceptRecruitmentViaApi(real.fixture.observer, objectiveId);
      expect(observerAccept.status).toBe(403);

      const objective = await dsl.objective(objectiveId);
      expect(objective.challengers).toEqual([real.fixture.challengerA.name, real.fixture.challengerB.name]);
      expect(objective.assignedChallengers).toEqual([real.fixture.reluctantMember.name]);
      expect(objective.challengers).not.toContain(real.fixture.reluctantMember.name);
      expect(objective.challengers).not.toContain(real.fixture.observer.name);

      await assertMyChallengeVisibility(challengerA.page, { visible: [title] });
      await assertMyChallengeVisibility(challengerB.page, { visible: [title] });
      await assertMyChallengeVisibility(reluctant.page, { hidden: [title] });
      await assertMyChallengeVisibility(observer.page, { hidden: [title] });
      await real.attachScreenshot(challengerB.page, testInfo, "recruitment-b-accepted");
    } finally {
      await dsl.closePages(commander, challengerA, challengerB, reluctant, observer);
    }
  });
});
