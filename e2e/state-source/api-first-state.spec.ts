import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { Task } from "../../src/types/orf";

function taskManagementData(tasks: Task[] = initialOrfState.tasks) {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments: initialOrfState.comments,
    permissionRules: initialOrfState.permissionRules,
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

test("does not show bundled business data when task data API fails", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ status: 503, json: { error: "task data unavailable" } });
  });

  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.getByText("RAG 检索 Recall@5 达到 85%")).toHaveCount(0);
  await expect(page.getByText("当前没有可申请挑战的悬赏指标")).toBeVisible();
});

test("ignores stale business data in legacy localStorage", async ({ page }) => {
  await page.addInitScript((state) => {
    window.localStorage.setItem("orf-flow-state-v3", JSON.stringify(state));
  }, initialOrfState);
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ status: 503, json: { error: "task data unavailable" } });
  });

  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.getByText("RAG 检索 Recall@5 达到 85%")).toHaveCount(0);
  await expect(page.getByText("当前没有可申请挑战的悬赏指标")).toBeVisible();
});

test("keeps task status unchanged until the API write succeeds and refreshed data arrives", async ({ page }) => {
  let tasks = structuredClone(initialOrfState.tasks);
  let failNextStatusWrite = true;

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData(tasks) });
  });
  await page.route("**/api/tasks/ORF-128/status", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    if (failNextStatusWrite) {
      failNextStatusWrite = false;
      await route.fulfill({ status: 500, json: { error: "forced status failure" } });
      return;
    }

    const body = route.request().postDataJSON() as { status: Task["status"] };
    tasks = tasks.map((task) => (task.id === "ORF-128" ? { ...task, status: body.status, updatedAt: "2026-05-14" } : task));
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/objectives/obj-engineering/results/res-rag-recall");

  const taskRow = page.locator(".orf-table-row", { hasText: "构建 RAG 召回评估脚本" });
  const statusSelect = taskRow.locator("select");
  await expect(statusSelect).toHaveValue("In Progress");

  await statusSelect.selectOption("Done");
  await expect(statusSelect).toHaveValue("In Progress");
  await expect(page.getByText("forced status failure")).toBeVisible();

  await statusSelect.selectOption("Done");
  await expect(statusSelect).toHaveValue("Done");
});
