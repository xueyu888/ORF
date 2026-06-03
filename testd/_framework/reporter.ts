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
const REPORT_RETENTION_DAYS_ENV = "TESTD_REPORT_RETENTION_DAYS";
const DEFAULT_REPORT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type StageStatus = "passed" | "failed";
type CaseStatus = TestResult["status"];
type ScreenshotMoment = "on-failure" | "after-failure";

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

type ResultJson = {
  run: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    status: FullResult["status"];
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
  };
  cases: CaseReport[];
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
    if (this.cases.length === 0) {
      return;
    }

    const startedAt = result.startTime;
    const endedAt = new Date(result.startTime.getTime() + result.duration);
    const reportRoot = path.join(process.cwd(), REPORT_ROOT_DIR);
    await pruneOldReports(reportRoot, startedAt);

    const reportDir = path.join(reportRoot, formatDirectoryName(startedAt));
    const sortedInternalCases = [...this.cases].sort((left, right) => left.id.localeCompare(right.id));
    const sortedCases: CaseReport[] = [];

    await fs.promises.mkdir(reportDir, { recursive: true });
    for (const [index, testCase] of sortedInternalCases.entries()) {
      sortedCases.push(await materializeCaseReport(reportDir, testCase, index));
    }

    const failedCases = sortedCases.filter((testCase) =>
      ["failed", "timedOut", "interrupted"].includes(testCase.status),
    );

    const resultJson: ResultJson = {
      run: {
        startedAt: formatIsoWithOffset(startedAt),
        endedAt: formatIsoWithOffset(endedAt),
        durationMs: Math.round(result.duration),
        status: result.status,
        total: this.total,
        passed: sortedCases.filter((testCase) => testCase.status === "passed").length,
        failed: failedCases.length,
        skipped: sortedCases.filter((testCase) => testCase.status === "skipped").length,
        timedOut: sortedCases.filter((testCase) => testCase.status === "timedOut").length,
        interrupted: sortedCases.filter((testCase) => testCase.status === "interrupted").length,
      },
      cases: sortedCases,
    };

    await fs.promises.writeFile(path.join(reportDir, "result.json"), `${JSON.stringify(resultJson, null, 2)}\n`);
    await fs.promises.writeFile(path.join(reportDir, "summary.md"), renderSummary(resultJson, startedAt));
  }

  printsToStdio() {
    return false;
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
    skippedCases.length ? `- 跳过用例数：${skippedCases.length}` : undefined,
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

function renderPassedCases(cases: CaseReport[]) {
  if (cases.length === 0) {
    return "无";
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
  ].join("\n");
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
