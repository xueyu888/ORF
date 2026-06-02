import { expect, test, type Page } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { CommentThread } from "../../src/types/orf";
import { routeVisualBackgroundMocks } from "../helpers/visualBackgroundMocks";

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
  };
}

async function openTargetCommentPanel(page: Page) {
  await page.goto("/tasks");
  const targetRow = page.locator(".orf-result-row", { hasText: target.title });
  await expect(targetRow).toBeVisible();

  await targetRow.hover();
  await targetRow.getByRole("button", { name: "按住拖拽，点击打开块菜单" }).click();
  await page.getByRole("button", { name: "评论", exact: true }).click();

  const panel = page.locator("[data-comment-panel='true']");
  await expect(panel).toBeVisible();
  return panel;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await routeVisualBackgroundMocks(page);

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

  const panel = await openTargetCommentPanel(page);
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

test("submits comments with Enter and keeps Shift+Enter as a line break", async ({ page }) => {
  const firstLine = `键盘快捷发送首行 ${Date.now()}`;
  const secondLine = "键盘快捷发送次行";
  let postCount = 0;
  let submittedBody = "";

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData([]) });
  });
  await page.route("**/api/comments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    postCount += 1;
    const requestBody = route.request().postDataJSON() as { body: string };
    submittedBody = requestBody.body;
    const commentThread: CommentThread = {
      id: "cthread-e2e-comment-keyboard-submit",
      targetType: target.type,
      targetId: target.id,
      targetTitle: target.title,
      status: "open",
      createdBy: initialOrfState.users[0].id,
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:01.000Z",
      messages: [
        {
          id: "cmsg-e2e-comment-keyboard-submit",
          author: initialOrfState.users[0].name,
          body: requestBody.body,
          createdAt: "2026-05-09T00:00:01.000Z",
        },
      ],
    };

    await route.fulfill({ json: { ok: true, commentThread } });
  });

  const panel = await openTargetCommentPanel(page);
  const input = panel.getByPlaceholder("添加评论...");
  await input.fill(firstLine);

  await input.press("Shift+Enter");
  await expect(input).toHaveValue(`${firstLine}\n`);
  await expect.poll(() => postCount, { timeout: 300 }).toBe(0);

  await input.pressSequentially(secondLine);
  const commentResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/comments") && response.request().method() === "POST",
  );
  await input.press("Enter");
  await commentResponse;

  await expect.poll(() => submittedBody).toBe(`${firstLine}\n${secondLine}`);
  await expect(panel).toContainText(firstLine);
  await expect(panel).toContainText(secondLine);
});

test("inserts and renders structured member mentions", async ({ page }) => {
  let submittedBody = "";
  const mentionTarget = initialOrfState.users[1]!;
  const existingComment: CommentThread = {
    id: "cthread-e2e-comment-mention",
    targetType: target.type,
    targetId: target.id,
    targetTitle: target.title,
    status: "open",
    createdBy: initialOrfState.users[0]!.id,
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:01.000Z",
    messages: [
      {
        id: "cmsg-e2e-comment-mention",
        author: initialOrfState.users[0]!.name,
        body: `请 @[Old Mia](orf-user:${mentionTarget.id}) 看一下`,
        createdAt: "2026-05-09T00:00:01.000Z",
      },
    ],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData([existingComment]) });
  });
  await page.route("**/api/comments/mentionable-users?**", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
  await page.route("**/api/comments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as { body: string };
    submittedBody = requestBody.body;
    await route.fulfill({
      json: {
        ok: true,
        commentThread: {
          ...existingComment,
          messages: [
            ...existingComment.messages,
            {
              id: "cmsg-e2e-comment-mention-new",
              author: initialOrfState.users[0]!.name,
              body: requestBody.body,
              createdAt: "2026-05-09T00:00:02.000Z",
            },
          ],
        },
      },
    });
  });

  const panel = await openTargetCommentPanel(page);
  await expect(panel).toContainText(`@${mentionTarget.name}`);

  await panel.getByRole("button", { name: "编辑评论" }).click();
  const editInput = panel.getByPlaceholder("编辑评论...");
  await expect(editInput).toHaveValue(`请 @${mentionTarget.name} 看一下`);
  await expect(editInput).not.toHaveValue(/orf-user/);
  await panel.locator(".orf-comment-draft-target").click();

  const input = panel.getByPlaceholder("添加评论...");
  await input.fill("hello @mia");
  await expect(panel.getByRole("button", { name: new RegExp(mentionTarget.name) })).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveValue(`hello @${mentionTarget.name} `);
  await expect(input).not.toHaveValue(/orf-user/);

  await panel.getByRole("button", { name: "发送评论" }).click();
  await expect.poll(() => submittedBody).toContain(`@[${mentionTarget.name}](orf-user:${mentionTarget.id})`);
  await expect(panel).toContainText(`@${mentionTarget.name}`);
});
