import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { CommentThread } from "../../src/types/orf";

const target = {
  id: "res-rag-recall",
  title: "RAG 检索 Recall@5 达到 85%",
  type: "result" as const,
};

function taskManagementData(comments: CommentThread[] = []) {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks: initialOrfState.tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments,
    permissionRules: initialOrfState.permissionRules,
    automaticCompletions: initialOrfState.automaticCompletions,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("keeps a submitted comment visible after the POST response", async ({ page }) => {
  const commentBody = `前端评论保留回归 ${Date.now()}`;

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData([]) });
  });
  await page.route("**/api/comments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as { body: string };
    const commentThread: CommentThread = {
      id: "cthread-e2e-comment-persistence",
      targetType: target.type,
      targetId: target.id,
      targetTitle: target.title,
      status: "open",
      createdBy: initialOrfState.users[0].id,
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:01.000Z",
      messages: [
        {
          id: "cmsg-e2e-comment-persistence",
          author: initialOrfState.users[0].name,
          body: requestBody.body,
          createdAt: "2026-05-09T00:00:01.000Z",
        },
      ],
    };

    await route.fulfill({ json: { ok: true, commentThread } });
  });

  await page.goto("/tasks");
  const targetRow = page.locator(".orf-result-row", { hasText: target.title });
  await expect(targetRow).toBeVisible();

  await targetRow.hover();
  await targetRow.getByRole("button", { name: "按住拖拽，点击打开块菜单" }).click();
  await page.getByRole("button", { name: "评论" }).click();

  const panel = page.locator("[data-comment-panel='true']");
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder("添加评论...").fill(commentBody);

  const commentResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/comments") && response.request().method() === "POST",
  );
  await panel.getByRole("button", { name: "发送评论" }).click();
  await commentResponse;
  await page.waitForLoadState("networkidle");

  await expect(panel).toContainText(commentBody);
  await expect(panel.getByText("暂无评论")).toHaveCount(0);
});
