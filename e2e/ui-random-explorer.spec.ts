import { expect, test } from "@playwright/test";
import { installUiExplorerScenario } from "./_explorer/authenticatedAppScenario";
import { runUiExplorer } from "./_explorer/explorerRunner";
import { writeExplorerReport } from "./_explorer/reporter";
import { readExplorerConfig } from "./_explorer/safety";
import { loadStateAbstractorRegistration } from "./_explorer/stateAbstractorRegistry";

test("coverage-guided UI random explorer", async ({ page }, testInfo) => {
  await loadStateAbstractorRegistration(process.env.UI_EXPLORER_STATE_ABSTRACTOR_MODULE);
  const config = readExplorerConfig(String(testInfo.project.use.baseURL ?? "") || undefined);
  testInfo.setTimeout(Math.max(60_000, config.steps * 850));

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

  expect(result.summary.severeFailureCount, `UI explorer report: ${reportPaths.htmlReportPath}`).toBe(0);
});
