import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  HttpError,
  contentTypeFor,
  isFailedCaseStatus,
  isInside,
  isNodeError,
  numberOrZero,
  resolveInside,
  stringOrEmpty,
  toPosixPath,
} from "./utils.mjs";

export async function listReports({ cwd = process.cwd(), reportRoot }) {
  let entries;
  try {
    entries = await fsp.readdir(reportRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readReportMetadata(entry.name, { cwd, reportRoot });
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            return undefined;
          }
          console.warn(`跳过无法读取的 TestD 报告 ${entry.name}: ${error.message ?? String(error)}`);
          return undefined;
        }
      }),
  );

  return reports
    .filter(Boolean)
    .sort((left, right) => reportSortTime(right) - reportSortTime(left));
}

export async function readReport(reportId, { cwd = process.cwd(), reportRoot }) {
  const report = await readReportJson(reportId, { reportRoot });
  return {
    metadata: await buildReportMetadata(reportId, report, { cwd, reportRoot }),
    report,
  };
}

export async function readLatestReport({ cwd = process.cwd(), reportRoot }) {
  const reports = await listReports({ cwd, reportRoot });
  if (reports.length === 0) {
    return null;
  }
  return readReport(reports[0].id, { cwd, reportRoot });
}

export async function readReportMetadata(reportId, { cwd = process.cwd(), reportRoot }) {
  return buildReportMetadata(reportId, await readReportJson(reportId, { reportRoot }), { cwd, reportRoot });
}

export async function readReportJson(reportId, { reportRoot }) {
  const reportDir = resolveReportDir(reportId, reportRoot);
  const resultPath = resolveInside(reportDir, "result.json");

  let raw;
  try {
    raw = await fsp.readFile(resultPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new HttpError(404, "报告结果不存在");
    }
    throw error;
  }

  const report = JSON.parse(raw);
  if (!report || typeof report !== "object" || !report.run || !Array.isArray(report.cases)) {
    throw new HttpError(422, "报告结果格式不正确");
  }
  return report;
}

export async function buildReportMetadata(reportId, report, { cwd = process.cwd(), reportRoot }) {
  const reportDir = resolveReportDir(reportId, reportRoot);
  const resultPath = resolveInside(reportDir, "result.json");
  const stats = await fsp.stat(resultPath);
  const run = report.run ?? {};
  const suites = Array.isArray(report.suites) ? report.suites : [];
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const failedCases = cases.filter((testCase) => isFailedCaseStatus(testCase?.status));

  return {
    id: reportId,
    directory: toPosixPath(path.relative(cwd, reportDir)),
    resultPath: toPosixPath(path.relative(cwd, resultPath)),
    summaryPath: toPosixPath(path.relative(cwd, resolveInside(reportDir, "summary.md"))),
    startedAt: stringOrEmpty(run.startedAt),
    endedAt: stringOrEmpty(run.endedAt),
    updatedAt: stats.mtime.toISOString(),
    status: stringOrEmpty(run.status),
    total: numberOrZero(run.total),
    passed: numberOrZero(run.passed),
    failed: numberOrZero(run.failed),
    skipped: numberOrZero(run.skipped),
    timedOut: numberOrZero(run.timedOut),
    interrupted: numberOrZero(run.interrupted),
    durationMs: numberOrZero(run.durationMs),
    suiteCount: suites.length,
    caseCount: cases.length,
    failedCaseCount: failedCases.length,
    suites: suites.map((suite) => ({
      name: stringOrEmpty(suite.name),
      status: stringOrEmpty(suite.status),
      total: numberOrZero(suite.total),
      passed: numberOrZero(suite.passed),
      failed: numberOrZero(suite.failed),
      skipped: numberOrZero(suite.skipped),
      durationMs: numberOrZero(suite.durationMs),
    })),
  };
}

export async function serveReportAttachment(pathname, response, { reportRoot }) {
  const rest = pathname.slice("/reports/".length);
  const [encodedReportId, ...encodedParts] = rest.split("/");
  const reportId = decodeURIComponent(encodedReportId ?? "");
  const parts = encodedParts.map((part) => decodeURIComponent(part));
  if (parts[0] !== "attachments" || parts.length < 2) {
    throw new HttpError(404, "附件不存在");
  }

  const reportDir = resolveReportDir(reportId, reportRoot);
  const targetPath = resolveInside(reportDir, ...parts);
  const attachmentRoot = resolveInside(reportDir, "attachments");
  if (!isInside(attachmentRoot, targetPath)) {
    throw new HttpError(403, "附件路径非法");
  }

  let stats;
  try {
    stats = await fsp.stat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new HttpError(404, "附件不存在");
    }
    throw error;
  }

  if (!stats.isFile()) {
    throw new HttpError(404, "附件不存在");
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(targetPath),
    "Content-Length": stats.size,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(targetPath).pipe(response);
}

export function resolveReportDir(reportId, reportRoot) {
  if (!reportId || reportId.includes("/") || reportId.includes("\\") || reportId.includes("\0")) {
    throw new HttpError(400, "报告 ID 非法");
  }
  const reportDir = path.resolve(reportRoot, reportId);
  if (!isInside(reportRoot, reportDir)) {
    throw new HttpError(403, "报告路径非法");
  }
  return reportDir;
}

function reportSortTime(report) {
  const startedAt = Date.parse(report.startedAt);
  if (Number.isFinite(startedAt)) {
    return startedAt;
  }
  const updatedAt = Date.parse(report.updatedAt);
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}
