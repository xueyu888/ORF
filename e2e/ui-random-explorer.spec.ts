import { expect, test } from "@playwright/test";
import { installUiExplorerScenario } from "./_explorer/authenticatedAppScenario";
import { runUiExplorer } from "./_explorer/explorerRunner";
import { writeExplorerReport } from "./_explorer/reporter";
import { readExplorerConfig } from "./_explorer/safety";
import { loadStateAbstractorRegistration } from "./_explorer/stateAbstractorRegistry";

test("coverage-guided UI random explorer", async ({ page }, testInfo) => {
  await loadStateAbstractorRegistration(process.env.UI_EXPLORER_STATE_ABSTRACTOR_MODULE);
  const config = readExplorerConfig(String(testInfo.project.use.baseURL ?? "") || undefined);
  const repeatableBudget = config.runRepeatableRegionTests
    ? config.repeatableRegionMaxObjects * config.repeatableRegionStepsPerObject
    : 0;
  const mainBudgetMs = config.maxDurationMs > 0 ? config.maxDurationMs : config.steps * 950;
  testInfo.setTimeout(Math.max(60_000, mainBudgetMs + repeatableBudget * 950 + 30_000));

  await installUiExplorerScenario(page, config.safetyProfile);

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
  if (reportPaths.repeatableRegionReportPath && reportPaths.repeatableRegionHtmlReportPath) {
    result.repeatableRegionReportPath = reportPaths.repeatableRegionReportPath;
    result.repeatableRegionHtmlReportPath = reportPaths.repeatableRegionHtmlReportPath;
    await testInfo.attach("ui-explorer-repeatable-regions", {
      path: reportPaths.repeatableRegionReportPath,
      contentType: "application/json",
    });
    await testInfo.attach("ui-explorer-repeatable-regions-report", {
      path: reportPaths.repeatableRegionHtmlReportPath,
      contentType: "text/html",
    });
  }

  expect(result.summary.severeFailureCount, `UI explorer report: ${reportPaths.htmlReportPath}`).toBe(0);
  expect(
    result.repeatableRegionExploration?.summary.severeFailureCount ?? 0,
    `UI explorer repeatable-region report: ${reportPaths.repeatableRegionHtmlReportPath ?? reportPaths.htmlReportPath}`,
  ).toBe(0);
});
