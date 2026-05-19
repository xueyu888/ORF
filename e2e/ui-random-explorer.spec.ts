import { expect, test } from "@playwright/test";
import { initialOrfState } from "../src/data/initialOrfState";
import { runUiExplorer } from "./_explorer/explorerRunner";
import { writeExplorerReport } from "./_explorer/reporter";
import { readExplorerConfig } from "./_explorer/safety";

function taskManagementData() {
  return {
    objectives: [],
    results: [],
    tasks: [],
    evidence: [],
    feedback: [],
    comments: [],
    permissionRules: initialOrfState.permissionRules,
  };
}

test("coverage-guided UI random explorer", async ({ page }, testInfo) => {
  const config = readExplorerConfig(String(testInfo.project.use.baseURL ?? "") || undefined);
  testInfo.setTimeout(Math.max(60_000, config.steps * 850));

  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: { authenticated: false, user: null } });
      return;
    }

    if (url.pathname === "/api/settings/visual/backgrounds") {
      await route.fulfill({
        json: {
          code: 0,
          message: "ok",
          data: {
            scene: "login_background",
            config: { mode: "fixed", fixedBackgroundId: null, switchTrigger: "on_open", switchOrder: "random", switchIntervalMinutes: 10 },
            list: [],
          },
        },
      });
      return;
    }

    if (url.pathname === "/api/tasks-page") {
      await route.fulfill({ json: taskManagementData() });
      return;
    }

    if (url.pathname === "/api/permissions") {
      await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
      return;
    }

    if (url.pathname === "/api/users") {
      await route.fulfill({ json: { users: initialOrfState.users } });
      return;
    }

    if (url.pathname === "/api/auth/login") {
      await route.fulfill({ status: 401, json: { error: "Invalid email or password" } });
      return;
    }

    if (url.pathname === "/api/auth/registration") {
      await route.fulfill({ status: 400, json: { error: "Registration failed" } });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "UI explorer test stub: API route not modeled" } });
  });

  const result = await runUiExplorer(page, config);
  const reportPaths = await writeExplorerReport(result);
  result.reportPath = reportPaths.reportPath;
  result.htmlReportPath = reportPaths.htmlReportPath;

  await testInfo.attach("ui-explorer-result", {
    path: reportPaths.reportPath,
    contentType: "application/json",
  });
  await testInfo.attach("ui-explorer-report", {
    path: reportPaths.htmlReportPath,
    contentType: "text/html",
  });

  expect(result.summary.severeFailureCount, `UI explorer report: ${reportPaths.htmlReportPath}`).toBe(0);
});
