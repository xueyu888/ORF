import fs from "node:fs";
import path from "node:path";
import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

const STATE_CASE_ID_ANNOTATION = "state-case-id";
const STATE_CASE_TITLE_ANNOTATION = "state-case-title";
const STATE_CASE_STAGES = new Set(["B", "Setup", "S0", "Action", "S1", "Clean", "B after Clean"]);
const SCREENSHOT_ATTACHMENT_PREFIX = "state-case-screenshot";
const REPORT_ROOT_DIR = "test-reports";
const REPORT_STATE_ROOT_DIR = path.join(".artifacts", "testd-report-runs");
const TESTD_REPORT_AGGREGATE_ENV = "TESTD_REPORT_AGGREGATE";
const TESTD_REPORT_RUN_ID_ENV = "TESTD_REPORT_RUN_ID";
const TESTD_RUN_ID_ENV = "TESTD_RUN_ID";
const TESTD_SUITE_ENV = "TESTD_SUITE";
const TESTD_RECOVERY_ONLY_ENV = "TESTD_RECOVERY_ONLY";
const REPORT_RETENTION_DAYS_ENV = "TESTD_REPORT_RETENTION_DAYS";
const DEFAULT_REPORT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUITE_ORDER = ["isolated", "permissions", "settings"];

type StageStatus = "passed" | "failed";
type CaseStatus = TestResult["status"];
type ScreenshotMoment = "on-failure" | "after-failure";
type RunStatus = FullResult["status"];

type ReportError = {
  message: string;
  stack?: string;
};

type ScreenshotReport = {
  name: string;
  stage: string;
  moment: ScreenshotMoment;
  label: string;
  path: string;
};

type StageReport = {
  name: string;
  status: StageStatus;
  durationMs: number;
  error?: ReportError;
  screenshots?: ScreenshotReport[];
};

type CaseReport = {
  id: string;
  title: string;
  suite?: string;
  status: CaseStatus;
  durationMs: number;
  failedStage?: string;
  error?: ReportError;
  stages: StageReport[];
  screenshots?: ScreenshotReport[];
};

type RawScreenshotAttachment = {
  name: string;
  contentType: string;
  stage: string;
  moment: ScreenshotMoment;
  body?: Buffer;
  sourcePath?: string;
};

type InternalCaseReport = Omit<CaseReport, "screenshots"> & {
  screenshotAttachments: RawScreenshotAttachment[];
};

type RunReport = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  interrupted: number;
};

type SuiteSummary = {
  name: string;
} & RunReport;

type ResultJson = {
  run: RunReport;
  suites?: SuiteSummary[];
  cases: CaseReport[];
};

type SuiteReport = {
  name: string;
  run: RunReport;
  cases: CaseReport[];
};

type AggregateState = {
  runId: string;
  startedAt: string;
  reportDirName: string;
  suites: Record<string, SuiteReport>;
};

type AggregateManifest = {
  runId: string;
  reportDir: string;
  resultPath: string;
  summaryPath: string;
};

export default class StateCaseReporter implements Reporter {
  private total = 0;
  private cases: InternalCaseReport[] = [];

  onBegin(_config: unknown, suite: Suite) {
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const stages = collectStateCaseStages(result.steps);
    const failedStage = stages.find((stage) => stage.status === "failed")?.name;
    const caseId = annotation(result, STATE_CASE_ID_ANNOTATION) ?? test.id;
    const caseTitle = annotation(result, STATE_CASE_TITLE_ANNOTATION) ?? test.title;

    this.cases.push({
      id: caseId,
      title: caseTitle,
      status: result.status,
      durationMs: result.duration,
      ...(failedStage ? { failedStage } : {}),
      ...(result.error ? { error: serializeError(result.error) } : {}),
      stages,
      screenshotAttachments: collectScreenshotAttachments(result),
    });
  }

  async onEnd(result: FullResult) {
    if (this.cases.length === 0 || process.env[TESTD_RECOVERY_ONLY_ENV] === "1") {
      return;
    }

    const startedAt = result.startTime;
    const endedAt = new Date(result.startTime.getTime() + result.duration);
    const reportRoot = path.join(process.cwd(), REPORT_ROOT_DIR);
    await pruneOldReports(reportRoot, startedAt);

    if (shouldWriteAggregateReport()) {
      const reportRunId = aggregateReportRunId();
      if (reportRunId) {
        const suiteName = currentSuiteName();
        const state = await loadAggregateState(reportRunId, startedAt);
        const reportDir = path.join(reportRoot, state.reportDirName);
        const sortedCases = await this.materializeCurrentCases(reportDir, suiteName);
        const suiteReport: SuiteReport = {
          name: suiteName,
          run: createRunReport({
            startedAt,
            endedAt,
            durationMs: result.duration,
            status: result.status,
            total: this.total,
            cases: sortedCases,
          }),
          cases: sortedCases,
        };

        await writeAggregateReport(reportRoot, state, suiteReport, startedAt);
        return;
      }
    }

    const reportDir = path.join(reportRoot, formatDirectoryName(startedAt));
    const sortedCases = await this.materializeCurrentCases(reportDir);
    const resultJson: ResultJson = {
      run: createRunReport({
        startedAt,
        endedAt,
        durationMs: result.duration,
        status: result.status,
        total: this.total,
        cases: sortedCases,
      }),
      cases: sortedCases,
    };

    await fs.promises.writeFile(path.join(reportDir, "result.json"), `${JSON.stringify(resultJson, null, 2)}\n`);
    await fs.promises.writeFile(path.join(reportDir, "summary.md"), renderSummary(resultJson, startedAt));
  }

  printsToStdio() {
    return false;
  }

  private async materializeCurrentCases(reportDir: string, suiteName?: string) {
    const sortedInternalCases = [...this.cases].sort((left, right) => left.id.localeCompare(right.id));
    const sortedCases: CaseReport[] = [];

    await fs.promises.mkdir(reportDir, { recursive: true });
    for (const [index, testCase] of sortedInternalCases.entries()) {
      const materializedCase = await materializeCaseReport(reportDir, testCase, index);
      sortedCases.push(suiteName ? { ...materializedCase, suite: suiteName } : materializedCase);
    }

    return sortedCases;
  }
}

export async function pruneOldReports(reportRoot: string, now = new Date(), env = process.env) {
  const retentionDays = reportRetentionDays(env);
  const cutoffTime = now.getTime() - retentionDays * DAY_MS;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(reportRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const reportDir = path.join(reportRoot, entry.name);
        if (!(await isStateCaseReportDir(reportDir))) {
          return;
        }

        const stats = await fs.promises.stat(reportDir);
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.promises.rm(reportDir, { force: true, recursive: true });
        }
      }),
  );
}

export function reportRetentionDays(env = process.env) {
  const value = env[REPORT_RETENTION_DAYS_ENV];
  if (value === undefined || value.trim() === "") {
    return DEFAULT_REPORT_RETENTION_DAYS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_REPORT_RETENTION_DAYS;
  }

  return Math.floor(parsed);
}

async function isStateCaseReportDir(reportDir: string) {
  const summaryPath = path.join(reportDir, "summary.md");
  const resultPath = path.join(reportDir, "result.json");
  return (await pathExists(summaryPath)) || (await pathExists(resultPath));
}

async function pathExists(targetPath: string) {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function shouldWriteAggregateReport() {
  return process.env[TESTD_REPORT_AGGREGATE_ENV] === "1";
}

function aggregateReportRunId() {
  return process.env[TESTD_REPORT_RUN_ID_ENV] ?? process.env[TESTD_RUN_ID_ENV];
}

function currentSuiteName() {
  return process.env[TESTD_SUITE_ENV] ?? "default";
}

async function loadAggregateState(runId: string, startedAt: Date): Promise<AggregateState> {
  const statePath = aggregateStatePath(runId);
  await fs.promises.mkdir(path.dirname(statePath), { recursive: true });

  try {
    return JSON.parse(await fs.promises.readFile(statePath, "utf8")) as AggregateState;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    runId,
    startedAt: formatIsoWithOffset(startedAt),
    reportDirName: formatDirectoryName(startedAt),
    suites: {},
  };
}

async function writeAggregateReport(
  reportRoot: string,
  state: AggregateState,
  suiteReport: SuiteReport,
  reportTime: Date,
) {
  state.suites[suiteReport.name] = suiteReport;

  const reportDir = path.join(reportRoot, state.reportDirName);
  const resultJson = buildAggregateResult(state);
  const resultPath = path.join(reportDir, "result.json");
  const summaryPath = path.join(reportDir, "summary.md");

  await fs.promises.mkdir(reportDir, { recursive: true });
  await fs.promises.writeFile(resultPath, `${JSON.stringify(resultJson, null, 2)}\n`);
  await fs.promises.writeFile(summaryPath, renderSummary(resultJson, new Date(state.startedAt || reportTime)));
  await fs.promises.writeFile(aggregateStatePath(state.runId), `${JSON.stringify(state, null, 2)}\n`);
  await fs.promises.writeFile(
    aggregateManifestPath(state.runId),
    `${JSON.stringify(createAggregateManifest(state.runId, reportDir, resultPath, summaryPath), null, 2)}\n`,
  );
}

function createAggregateManifest(
  runId: string,
  reportDir: string,
  resultPath: string,
  summaryPath: string,
): AggregateManifest {
  return {
    runId,
    reportDir: toPosixPath(path.relative(process.cwd(), reportDir)),
    resultPath: toPosixPath(path.relative(process.cwd(), resultPath)),
    summaryPath: toPosixPath(path.relative(process.cwd(), summaryPath)),
  };
}

function buildAggregateResult(state: AggregateState): ResultJson {
  const suites = Object.values(state.suites).sort((left, right) => compareSuiteNames(left.name, right.name));
  const cases = suites.flatMap((suite) => suite.cases).sort(compareCaseReports);
  const startedAt = new Date(state.startedAt);
  const endedAt = latestSuiteEndTime(suites) ?? startedAt;
  const suiteSummaries = suites.map((suite) => ({
    name: suite.name,
    ...suite.run,
  }));

  return {
    run: {
      startedAt: formatIsoWithOffset(startedAt),
      endedAt: formatIsoWithOffset(endedAt),
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      status: aggregateRunStatus(suites),
      total: sumSuiteCount(suites, "total"),
      passed: sumSuiteCount(suites, "passed"),
      failed: sumSuiteCount(suites, "failed"),
      skipped: sumSuiteCount(suites, "skipped"),
      timedOut: sumSuiteCount(suites, "timedOut"),
      interrupted: sumSuiteCount(suites, "interrupted"),
    },
    ...(suiteSummaries.length ? { suites: suiteSummaries } : {}),
    cases,
  };
}

function createRunReport(input: {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  status: RunStatus;
  total: number;
  cases: CaseReport[];
}): RunReport {
  const failedCases = input.cases.filter((testCase) =>
    ["failed", "timedOut", "interrupted"].includes(testCase.status),
  );

  return {
    startedAt: formatIsoWithOffset(input.startedAt),
    endedAt: formatIsoWithOffset(input.endedAt),
    durationMs: Math.round(input.durationMs),
    status: input.status,
    total: input.total,
    passed: input.cases.filter((testCase) => testCase.status === "passed").length,
    failed: failedCases.length,
    skipped: input.cases.filter((testCase) => testCase.status === "skipped").length,
    timedOut: input.cases.filter((testCase) => testCase.status === "timedOut").length,
    interrupted: input.cases.filter((testCase) => testCase.status === "interrupted").length,
  };
}

function latestSuiteEndTime(suites: SuiteReport[]) {
  return suites.reduce<Date | undefined>((latest, suite) => {
    const endedAt = new Date(suite.run.endedAt);
    if (Number.isNaN(endedAt.getTime())) {
      return latest;
    }
    if (!latest || endedAt.getTime() > latest.getTime()) {
      return endedAt;
    }
    return latest;
  }, undefined);
}

function aggregateRunStatus(suites: SuiteReport[]): RunStatus {
  if (suites.some((suite) => suite.run.status === "interrupted")) {
    return "interrupted";
  }
  if (suites.some((suite) => suite.run.status === "timedout")) {
    return "timedout";
  }
  if (suites.some((suite) => suite.run.status === "failed" || suite.run.failed > 0)) {
    return "failed";
  }
  return "passed";
}

function sumSuiteCount(suites: SuiteReport[], key: keyof Pick<RunReport, "total" | "passed" | "failed" | "skipped" | "timedOut" | "interrupted">) {
  return suites.reduce((total, suite) => total + suite.run[key], 0);
}

function compareCaseReports(left: CaseReport, right: CaseReport) {
  return compareSuiteNames(left.suite ?? "", right.suite ?? "") || left.id.localeCompare(right.id);
}

function compareSuiteNames(left: string, right: string) {
  const leftIndex = SUITE_ORDER.indexOf(left);
  const rightIndex = SUITE_ORDER.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? SUITE_ORDER.length : leftIndex) - (rightIndex === -1 ? SUITE_ORDER.length : rightIndex);
  }
  return left.localeCompare(right);
}

function aggregateStatePath(runId: string) {
  return path.join(aggregateStateDir(runId), "state.json");
}

function aggregateManifestPath(runId: string) {
  return path.join(aggregateStateDir(runId), "manifest.json");
}

function aggregateStateDir(runId: string) {
  return path.join(process.cwd(), REPORT_STATE_ROOT_DIR, sanitizeFileName(runId));
}

function collectStateCaseStages(steps: TestStep[]): StageReport[] {
  return flattenSteps(steps)
    .filter((step) => step.category === "test.step" && STATE_CASE_STAGES.has(step.title))
    .map((step) => ({
      name: step.title,
      status: step.error ? "failed" : "passed",
      durationMs: step.duration,
      ...(step.error ? { error: serializeError(step.error) } : {}),
    }));
}

function flattenSteps(steps: TestStep[]): TestStep[] {
  return steps.flatMap((step) => [step, ...flattenSteps(step.steps)]);
}

function collectScreenshotAttachments(result: TestResult): RawScreenshotAttachment[] {
  const attachments = [...result.attachments, ...flattenSteps(result.steps).flatMap((step) => step.attachments)];
  const screenshots = new Map<string, RawScreenshotAttachment>();

  for (const attachment of attachments) {
    const metadata = parseScreenshotAttachmentName(attachment.name);
    if (!metadata || screenshots.has(attachment.name)) {
      continue;
    }

    screenshots.set(attachment.name, {
      name: attachment.name,
      contentType: attachment.contentType,
      stage: metadata.stage,
      moment: metadata.moment,
      ...(attachment.body ? { body: attachment.body } : {}),
      ...(attachment.path ? { sourcePath: attachment.path } : {}),
    });
  }

  return [...screenshots.values()];
}

function parseScreenshotAttachmentName(name: string): { stage: string; moment: ScreenshotMoment } | null {
  const [prefix, moment, ...stageParts] = name.split(":");
  if (prefix !== SCREENSHOT_ATTACHMENT_PREFIX || !isScreenshotMoment(moment) || stageParts.length === 0) {
    return null;
  }

  return {
    moment,
    stage: stageParts.join(":"),
  };
}

function isScreenshotMoment(value: string): value is ScreenshotMoment {
  return value === "on-failure" || value === "after-failure";
}

async function materializeCaseReport(
  reportDir: string,
  testCase: InternalCaseReport,
  caseIndex: number,
): Promise<CaseReport> {
  const { screenshotAttachments, ...caseReport } = testCase;
  const screenshots = await writeScreenshots(reportDir, caseReport, screenshotAttachments, caseIndex);
  const stages = caseReport.stages.map((stage) => {
    const stageScreenshots = screenshots.filter((screenshot) => screenshot.stage === stage.name);
    return stageScreenshots.length ? { ...stage, screenshots: stageScreenshots } : stage;
  });

  return {
    ...caseReport,
    stages,
    ...(screenshots.length ? { screenshots } : {}),
  };
}

async function writeScreenshots(
  reportDir: string,
  testCase: Omit<InternalCaseReport, "screenshotAttachments">,
  attachments: RawScreenshotAttachment[],
  caseIndex: number,
): Promise<ScreenshotReport[]> {
  if (attachments.length === 0) {
    return [];
  }

  const attachmentDir = path.join(reportDir, "attachments", `${caseIndex + 1}-${sanitizeFileName(testCase.id)}`);
  await fs.promises.mkdir(attachmentDir, { recursive: true });

  const screenshots: ScreenshotReport[] = [];
  for (const [attachmentIndex, attachment] of attachments.entries()) {
    const fileName = `${attachmentIndex + 1}-${sanitizeFileName(attachment.stage)}-${attachment.moment}.png`;
    const targetPath = path.join(attachmentDir, fileName);

    if (attachment.body) {
      await fs.promises.writeFile(targetPath, attachment.body);
    } else if (attachment.sourcePath) {
      await fs.promises.copyFile(attachment.sourcePath, targetPath);
    } else {
      continue;
    }

    screenshots.push({
      name: attachment.name,
      stage: attachment.stage,
      moment: attachment.moment,
      label: screenshotMomentLabel(attachment.moment),
      path: toPosixPath(path.relative(reportDir, targetPath)),
    });
  }

  return screenshots;
}

function annotation(result: TestResult, type: string) {
  return result.annotations.find((item) => item.type === type)?.description;
}

function serializeError(error: TestError): ReportError {
  return {
    message: stripAnsi(error.message ?? error.value ?? "Unknown error"),
    ...(error.stack ? { stack: stripAnsi(error.stack) } : {}),
  };
}

function renderSummary(result: ResultJson, reportTime: Date) {
  const passedCases = result.cases.filter((testCase) => testCase.status === "passed");
  const failedCases = result.cases.filter((testCase) => testCase.status !== "passed" && testCase.status !== "skipped");
  const skippedCases = result.cases.filter((testCase) => testCase.status === "skipped");

  return [
    `# 测试报告：${formatTitleTime(reportTime)}`,
    "",
    `- 本次测试时间：${formatTitleTime(reportTime)}`,
    `- 总用例数：${result.run.total}`,
    `- 通过用例数：${result.run.passed}`,
    `- 失败用例数：${result.run.failed}`,
    result.suites?.length ? `- 测试批次数：${result.suites.length}` : undefined,
    skippedCases.length ? `- 跳过用例数：${skippedCases.length}` : undefined,
    result.suites?.length ? "" : undefined,
    result.suites?.length ? "## 批次结果" : undefined,
    result.suites?.length ? "" : undefined,
    result.suites?.length ? renderSuiteSummaries(result.suites) : undefined,
    "",
    "## 通过用例",
    "",
    renderPassedCases(passedCases),
    "",
    "## 失败用例",
    "",
    renderFailedCases(failedCases),
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function renderSuiteSummaries(suites: SuiteSummary[]) {
  return [
    "| 批次 | 状态 | 总数 | 通过 | 失败 | 跳过 | 耗时 |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...suites.map((suite) =>
      `| ${escapeTableCell(suite.name)} | ${translateRunStatus(suite.status)} | ${suite.total} | ${suite.passed} | ${suite.failed} | ${suite.skipped} | ${formatDuration(suite.durationMs)} |`,
    ),
  ].join("\n");
}

function renderPassedCases(cases: CaseReport[]) {
  if (cases.length === 0) {
    return "无";
  }

  const includeSuite = cases.some((testCase) => testCase.suite);
  if (includeSuite) {
    return [
      "| 批次 | 用例 ID | 用例名称 | 耗时 |",
      "|---|---|---|---:|",
      ...cases.map((testCase) =>
        `| ${escapeTableCell(testCase.suite ?? "")} | ${escapeTableCell(testCase.id)} | ${escapeTableCell(testCase.title)} | ${formatDuration(testCase.durationMs)} |`,
      ),
    ].join("\n");
  }

  return [
    "| 用例 ID | 用例名称 | 耗时 |",
    "|---|---|---:|",
    ...cases.map((testCase) =>
      `| ${escapeTableCell(testCase.id)} | ${escapeTableCell(testCase.title)} | ${formatDuration(testCase.durationMs)} |`,
    ),
  ].join("\n");
}

function renderFailedCases(cases: CaseReport[]) {
  if (cases.length === 0) {
    return "无";
  }

  return cases.map(renderFailedCase).join("\n\n");
}

function renderFailedCase(testCase: CaseReport) {
  return [
    `### ${testCase.id}`,
    "",
    `**用例名称：** ${testCase.title}`,
    "",
    testCase.suite ? `**批次：** ${testCase.suite}` : undefined,
    testCase.suite ? "" : undefined,
    `**失败阶段：** ${testCase.failedStage ?? "未记录"}`,
    "",
    `**耗时：** ${formatDuration(testCase.durationMs)}`,
    "",
    "**错误信息：**",
    "",
    "```text",
    testCase.error?.message ?? "未记录",
    "```",
    "",
    "**失败截图：**",
    "",
    renderScreenshots(testCase.screenshots ?? []),
    "",
    "**阶段结果：**",
    "",
    "| 阶段 | 结果 | 耗时 | 错误 |",
    "|---|---|---:|---|",
    ...testCase.stages.map(
      (stage) =>
        `| ${escapeTableCell(stage.name)} | ${translateStageStatus(stage.status)} | ${formatDuration(
          stage.durationMs,
        )} | ${escapeTableCell(stage.error?.message ?? "")} |`,
    ),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function renderScreenshots(screenshots: ScreenshotReport[]) {
  if (screenshots.length === 0) {
    return "未记录";
  }

  return screenshots
    .map((screenshot) => `- ${screenshot.label}（${screenshot.stage}）：[${screenshot.path}](${screenshot.path})`)
    .join("\n");
}

function screenshotMomentLabel(moment: ScreenshotMoment) {
  return moment === "on-failure" ? "失败时截图" : "失败后截图";
}

function translateStageStatus(status: StageStatus) {
  return status === "passed" ? "通过" : "失败";
}

function translateRunStatus(status: RunStatus) {
  if (status === "passed") {
    return "通过";
  }
  if (status === "timedout") {
    return "超时";
  }
  if (status === "interrupted") {
    return "中断";
  }
  return "失败";
}

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatDirectoryName(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${pad(date.getHours())}时${pad(
    date.getMinutes(),
  )}分${pad(date.getSeconds())}秒`;
}

function formatTitleTime(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function formatIsoWithOffset(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetRemainderMinutes = pad(absoluteOffset % 60);
  const localDate = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
  const localTime = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");

  return `${localDate}T${localTime}.${padMilliseconds(date.getMilliseconds())}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function padMilliseconds(value: number) {
  return value.toString().padStart(3, "0");
}

function escapeTableCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function sanitizeFileName(value: string) {
  return value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
