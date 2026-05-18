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

type StageStatus = "passed" | "failed";
type CaseStatus = TestResult["status"];

type ReportError = {
  message: string;
  stack?: string;
};

type StageReport = {
  name: string;
  status: StageStatus;
  durationMs: number;
  error?: ReportError;
};

type CaseReport = {
  id: string;
  title: string;
  status: CaseStatus;
  durationMs: number;
  failedStage?: string;
  error?: ReportError;
  stages: StageReport[];
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

export default class StateCaseMarkdownReporter implements Reporter {
  private total = 0;
  private cases: CaseReport[] = [];

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
    });
  }

  async onEnd(result: FullResult) {
    if (this.cases.length === 0) {
      return;
    }

    const startedAt = result.startTime;
    const endedAt = new Date(result.startTime.getTime() + result.duration);
    const reportDir = path.join(process.cwd(), "test-reports", formatDirectoryName(startedAt));
    const sortedCases = [...this.cases].sort((left, right) => left.id.localeCompare(right.id));
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

    await fs.promises.mkdir(reportDir, { recursive: true });
    await fs.promises.writeFile(path.join(reportDir, "result.json"), `${JSON.stringify(resultJson, null, 2)}\n`);
    await fs.promises.writeFile(path.join(reportDir, "summary.md"), renderSummary(resultJson, startedAt));
  }

  printsToStdio() {
    return false;
  }
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

function annotation(result: TestResult, type: string) {
  return result.annotations.find((item) => item.type === type)?.description;
}

function serializeError(error: TestError): ReportError {
  return {
    message: error.message ?? error.value ?? "Unknown error",
    ...(error.stack ? { stack: error.stack } : {}),
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
