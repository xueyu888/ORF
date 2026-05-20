import { objectivePanel } from "./helpers/realAssertions";
import { expect, realSystemEnabled, test } from "./helpers/realSystemHarness";
import { RealScenarioDsl } from "./helpers/realScenarioDsl";

test.describe("ORF real comment context", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("switching comment targets clears stale reply draft before sending", async ({ browser, real }) => {
    const dsl = new RealScenarioDsl(real);
    const commander = await real.newLoggedInPage(browser, real.fixture.commander);
    const sourceTitle = `${real.fixture.runLabel} 评论上下文 源目标`;
    const targetTitle = `${real.fixture.runLabel} 评论上下文 新目标`;
    const sourceCommentBody = `${real.fixture.runLabel} 源目标已有评论`;
    const targetCommentBody = `${real.fixture.runLabel} 新目标已有评论`;
    const submittedBody = `${real.fixture.runLabel} 切换后发送到新目标`;

    try {
      const sourceObjectiveId = await dsl.apiCreateCandidateObjective(real.fixture.commander, sourceTitle, { cycle: "2999 Q4" });
      const targetObjectiveId = await dsl.apiCreateCandidateObjective(real.fixture.commander, targetTitle, { cycle: "2999 Q4" });
      for (const [targetId, targetTitleForComment, body] of [
        [sourceObjectiveId, sourceTitle, sourceCommentBody],
        [targetObjectiveId, targetTitle, targetCommentBody],
      ]) {
        const comment = await real.apiAs(real.fixture.commander, "/api/comments", {
          body: JSON.stringify({
            targetType: "objective",
            targetId,
            targetTitle: targetTitleForComment,
            body,
          }),
          method: "POST",
        });
        expect(comment.status).toBe(200);
      }

      await dsl.openTasks(commander.page);
      const sourcePanel = objectivePanel(commander.page, sourceTitle);
      await sourcePanel.locator(".orf-objective-header").getByRole("button", { name: "打开 1 条评论" }).click();
      const commentPanel = commander.page.locator("[data-comment-panel='true']");
      await expect(commentPanel).toContainText(sourceCommentBody);
      await commentPanel.getByRole("button", { name: "回复评论" }).click();
      await expect(commentPanel.locator(".orf-comment-draft-target")).toContainText(`回复 ${real.fixture.commander.name}`);

      const targetPanel = objectivePanel(commander.page, targetTitle);
      await targetPanel.locator(".orf-objective-header").getByRole("button", { name: "打开 1 条评论" }).click();
      await expect(commentPanel.locator(".orf-comment-context-title")).toHaveText(targetTitle);
      await expect(commentPanel.locator(".orf-comment-draft-target")).toHaveCount(0);
      await expect(commentPanel.getByPlaceholder("添加评论...")).toBeVisible();

      await commentPanel.getByPlaceholder("添加评论...").fill(submittedBody);
      await commentPanel.getByRole("button", { name: "发送评论" }).click();
      await expect.poll(async () => {
        const data = await real.taskData();
        const targetThread = data.comments.find((thread) => thread.targetType === "objective" && thread.targetId === targetObjectiveId);
        return targetThread?.messages.some((message) => message.body === submittedBody && !message.parentMessageId) ?? false;
      }).toBe(true);
    } finally {
      await dsl.closePages(commander);
    }
  });
});
