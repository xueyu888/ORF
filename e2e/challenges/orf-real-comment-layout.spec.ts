import { objectivePanel } from "./helpers/realAssertions";
import { expect, realSystemEnabled, test } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real comment layout", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("objective comment badge stays adjacent to the objective title", async ({ browser, real }, testInfo) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const title = "建立可持续交付大模型应用的工程能力";

    try {
      await commander.page.setViewportSize({ width: 1600, height: 900 });
      const objectiveId = await dsl.apiCreateCandidateObjective(real.fixture.commander, title, { cycle: "2999 Q4" });
      const comment = await real.apiAs(real.fixture.commander, "/api/comments", {
        body: JSON.stringify({
          targetType: "objective",
          targetId: objectiveId,
          targetTitle: title,
          body: "真实系统验证目标评论入口位置。",
        }),
        method: "POST",
      });
      expect(comment.status).toBe(200);

      await dsl.openTasks(commander.page);
      const panel = objectivePanel(commander.page, title);
      await expect(panel).toBeVisible();
      const row = panel.locator(".orf-objective-header");
      const titleNode = row.locator(".orf-objective-title");
      const commentBadge = row.getByRole("button", { name: "打开 1 条评论" });
      await expect(commentBadge).toBeVisible();

      const gap = await titleNode.evaluate((element) => {
        const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        const range = document.createRange();
        range.selectNodeContents(textNode ?? element);
        const textRect = range.getBoundingClientRect();
        range.detach();
        const badgeRect = element.parentElement?.querySelector(".orf-comment-count-badge")?.getBoundingClientRect();
        if (!badgeRect) throw new Error("Comment badge not found");
        return badgeRect.left - textRect.right;
      });

      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(24);
      await real.attachScreenshot(commander.page, testInfo, "issue-5-objective-comment-badge");
    } finally {
      await dsl.closePages(commander);
    }
  });
});
