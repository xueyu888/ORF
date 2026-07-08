#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const DEFAULT_PORT = 5179;
const REPORT_ROOT = path.resolve(process.cwd(), process.env.TESTD_REPORT_DIR ?? "test-reports");
const HOST = process.env.TESTD_VIEWER_HOST ?? "127.0.0.1";
const PORT = positiveInteger(process.env.TESTD_VIEWER_PORT, DEFAULT_PORT);

const server = http.createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, status, { error: message });
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`TestD 报告查看服务端口已被占用: ${HOST}:${PORT}`);
    console.error("可以使用 TESTD_VIEWER_PORT=其他端口 npm run testd:viewer 启动。");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`TestD 报告查看服务已启动: http://${HOST}:${PORT}`);
  console.log(`报告目录: ${path.relative(process.cwd(), REPORT_ROOT) || "."}`);
});

async function handleRequest(request, response) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/" || pathname === "/index.html") {
    sendHtml(response, renderViewerHtml());
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, { ok: true, reportRoot: toPosixPath(path.relative(process.cwd(), REPORT_ROOT)) });
    return;
  }

  if (pathname === "/api/reports") {
    sendJson(response, 200, { reports: await listReports() });
    return;
  }

  if (pathname === "/api/reports/latest") {
    const reports = await listReports();
    if (reports.length === 0) {
      sendJson(response, 404, { error: "还没有 TestD 报告" });
      return;
    }
    sendJson(response, 200, await readReport(reports[0].id));
    return;
  }

  if (pathname.startsWith("/api/reports/")) {
    const reportId = decodeURIComponent(pathname.slice("/api/reports/".length));
    sendJson(response, 200, await readReport(reportId));
    return;
  }

  if (pathname.startsWith("/reports/")) {
    await serveReportAttachment(pathname, response);
    return;
  }

  sendHtml(response, renderViewerHtml(), 200);
}

async function listReports() {
  let entries;
  try {
    entries = await fsp.readdir(REPORT_ROOT, { withFileTypes: true });
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
          return await readReportMetadata(entry.name);
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

async function readReport(reportId) {
  const report = await readReportJson(reportId);
  return {
    metadata: await buildReportMetadata(reportId, report),
    report,
  };
}

async function readReportMetadata(reportId) {
  return buildReportMetadata(reportId, await readReportJson(reportId));
}

async function readReportJson(reportId) {
  const reportDir = resolveReportDir(reportId);
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

async function buildReportMetadata(reportId, report) {
  const reportDir = resolveReportDir(reportId);
  const resultPath = resolveInside(reportDir, "result.json");
  const stats = await fsp.stat(resultPath);
  const run = report.run ?? {};
  const suites = Array.isArray(report.suites) ? report.suites : [];
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const failedCases = cases.filter((testCase) => isFailedCaseStatus(testCase?.status));

  return {
    id: reportId,
    directory: toPosixPath(path.relative(process.cwd(), reportDir)),
    resultPath: toPosixPath(path.relative(process.cwd(), resultPath)),
    summaryPath: toPosixPath(path.relative(process.cwd(), resolveInside(reportDir, "summary.md"))),
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

async function serveReportAttachment(pathname, response) {
  const rest = pathname.slice("/reports/".length);
  const [encodedReportId, ...encodedParts] = rest.split("/");
  const reportId = decodeURIComponent(encodedReportId ?? "");
  const parts = encodedParts.map((part) => decodeURIComponent(part));
  if (parts[0] !== "attachments" || parts.length < 2) {
    throw new HttpError(404, "附件不存在");
  }

  const reportDir = resolveReportDir(reportId);
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

function renderViewerHtml() {
  const config = JSON.stringify({
    title: "TestD 报告查看器",
    pollIntervalMs: 10_000,
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TestD 报告查看器</title>
  <style>
    :root {
      color-scheme: light;
      --page: #f6f7f9;
      --surface: #ffffff;
      --surface-muted: #f1f3f6;
      --border: #d9dee7;
      --text: #19202a;
      --muted: #657083;
      --pass: #157347;
      --fail: #b42318;
      --skip: #6b7280;
      --warn: #a15c07;
      --focus: #1d4ed8;
      --shadow: 0 10px 28px rgba(25, 32, 42, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-width: 320px;
      color: var(--text);
      background: var(--page);
    }
    button, input, select {
      font: inherit;
    }
    button {
      cursor: pointer;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 22px;
      background: rgba(255, 255, 255, 0.94);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(10px);
    }
    .brand {
      min-width: 0;
    }
    .brand h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .brand p {
      margin: 5px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .button {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      min-height: 36px;
      padding: 0 12px;
      border-radius: 7px;
    }
    .button.primary {
      background: var(--text);
      color: #fff;
      border-color: var(--text);
    }
    .button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
      max-width: 1480px;
      margin: 0 auto;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .history {
      position: sticky;
      top: 82px;
      align-self: start;
      max-height: calc(100vh - 98px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-header {
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--border);
    }
    .panel-header h2 {
      margin: 0;
      font-size: 15px;
      line-height: 1.3;
      letter-spacing: 0;
    }
    .history-list {
      overflow: auto;
      padding: 8px;
    }
    .history-item {
      width: 100%;
      display: grid;
      gap: 5px;
      text-align: left;
      padding: 10px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: var(--text);
    }
    .history-item:hover,
    .history-item.active {
      background: var(--surface-muted);
      border-color: var(--border);
    }
    .history-item strong {
      overflow-wrap: anywhere;
      font-size: 13px;
    }
    .history-meta,
    .small-muted {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .content {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .summary {
      padding: 16px;
    }
    .summary-main {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .summary-main h2 {
      margin: 0 0 6px;
      font-size: 18px;
      letter-spacing: 0;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 9px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 650;
      background: var(--surface-muted);
      color: var(--muted);
      white-space: nowrap;
    }
    .status-pill.passed { color: var(--pass); background: #e8f5ee; }
    .status-pill.failed,
    .status-pill.timedOut,
    .status-pill.interrupted,
    .status-pill.timedout { color: var(--fail); background: #fff0ee; }
    .status-pill.skipped { color: var(--skip); background: #f0f2f5; }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface-muted);
      min-width: 0;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .metric strong {
      display: block;
      margin-top: 3px;
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    .filters {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) 150px 150px 180px;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }
    .filters input,
    .filters select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 0 10px;
      background: var(--surface);
      color: var(--text);
    }
    .case-list {
      display: grid;
      gap: 10px;
      padding: 12px;
    }
    .case-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      overflow: hidden;
    }
    .case-card.failed-case {
      border-color: #f0b4ad;
    }
    .case-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 12px;
      cursor: pointer;
      list-style: none;
    }
    .case-summary::-webkit-details-marker {
      display: none;
    }
    .case-title {
      min-width: 0;
    }
    .case-title strong {
      display: block;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .case-title span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .case-detail {
      border-top: 1px solid var(--border);
      padding: 12px;
      display: grid;
      gap: 12px;
      background: #fbfcfd;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .stage-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 7px;
      overflow: hidden;
    }
    .stage-table th,
    .stage-table td {
      padding: 8px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    .stage-table th {
      color: var(--muted);
      font-weight: 650;
      background: var(--surface-muted);
    }
    .stage-table tr:last-child td {
      border-bottom: 0;
    }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      max-height: 260px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: #111827;
      color: #f9fafb;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .screenshots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
    }
    .screenshot {
      display: grid;
      gap: 6px;
      text-decoration: none;
      color: var(--text);
      font-size: 12px;
    }
    .screenshot img {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface-muted);
    }
    .empty,
    .error {
      padding: 28px 16px;
      text-align: center;
      color: var(--muted);
    }
    .error {
      color: var(--fail);
    }
    @media (max-width: 920px) {
      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }
      .toolbar {
        justify-content: flex-start;
      }
      .layout {
        grid-template-columns: 1fr;
      }
      .history {
        position: static;
        max-height: 320px;
      }
      .metric-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .filters {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 560px) {
      .topbar {
        padding: 12px;
      }
      .layout {
        padding: 10px;
      }
      .metric-grid,
      .detail-grid,
      .filters {
        grid-template-columns: 1fr;
      }
      .summary-main,
      .case-summary {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <h1>TestD 报告查看器</h1>
      <p id="viewer-subtitle">读取 test-reports，默认展示最新一次运行结果。</p>
    </div>
    <div class="toolbar">
      <button class="button" id="refresh-button" type="button">刷新</button>
      <button class="button primary" id="latest-button" type="button">查看最新</button>
    </div>
  </header>
  <main class="layout">
    <aside class="panel history">
      <div class="panel-header">
        <h2>历史报告</h2>
        <div class="small-muted" id="history-count">加载中</div>
      </div>
      <div class="history-list" id="history-list"></div>
    </aside>
    <section class="content">
      <section class="panel summary" id="summary-panel"></section>
      <section class="panel" id="cases-panel">
        <div class="filters">
          <input id="case-search" type="search" placeholder="搜索用例 ID 或名称" />
          <select id="status-filter" aria-label="状态筛选"></select>
          <select id="suite-filter" aria-label="批次筛选"></select>
          <select id="module-filter" aria-label="模块筛选"></select>
        </div>
        <div class="case-list" id="case-list"></div>
      </section>
    </section>
  </main>
  <script>
    window.__TESTD_VIEWER_CONFIG__ = ${config};

    const state = {
      reports: [],
      current: null,
      selectedId: new URLSearchParams(window.location.search).get("report"),
      filters: {
        query: "",
        status: "all",
        suite: "all",
        module: "all",
      },
    };

    const els = {
      subtitle: document.getElementById("viewer-subtitle"),
      refreshButton: document.getElementById("refresh-button"),
      latestButton: document.getElementById("latest-button"),
      historyCount: document.getElementById("history-count"),
      historyList: document.getElementById("history-list"),
      summaryPanel: document.getElementById("summary-panel"),
      casesPanel: document.getElementById("cases-panel"),
      caseSearch: document.getElementById("case-search"),
      statusFilter: document.getElementById("status-filter"),
      suiteFilter: document.getElementById("suite-filter"),
      moduleFilter: document.getElementById("module-filter"),
      caseList: document.getElementById("case-list"),
    };

    els.refreshButton.addEventListener("click", () => refresh({ keepSelection: true }));
    els.latestButton.addEventListener("click", () => selectLatest());
    els.caseSearch.addEventListener("input", () => {
      state.filters.query = els.caseSearch.value;
      renderCases();
    });
    els.statusFilter.addEventListener("change", () => {
      state.filters.status = els.statusFilter.value;
      renderCases();
    });
    els.suiteFilter.addEventListener("change", () => {
      state.filters.suite = els.suiteFilter.value;
      renderCases();
    });
    els.moduleFilter.addEventListener("change", () => {
      state.filters.module = els.moduleFilter.value;
      renderCases();
    });

    refresh({ keepSelection: true });
    window.setInterval(() => refresh({ keepSelection: true, quiet: true }), window.__TESTD_VIEWER_CONFIG__.pollIntervalMs);

    async function refresh(options = {}) {
      try {
        const { reports } = await fetchJson("/api/reports");
        const previousLatestId = state.reports[0]?.id;
        state.reports = reports;
        renderHistory();

        if (reports.length === 0) {
          state.current = null;
          state.selectedId = null;
          renderEmpty("还没有 TestD 报告。运行 npm run testd 后这里会自动显示结果。");
          return;
        }

        const selectedStillExists = state.selectedId && reports.some((report) => report.id === state.selectedId);
        const shouldMoveToLatest = !options.keepSelection || !selectedStillExists || (options.quiet && state.selectedId === previousLatestId);
        const targetId = shouldMoveToLatest ? reports[0].id : state.selectedId;
        await loadReport(targetId, { replaceUrl: options.quiet });
      } catch (error) {
        if (!options.quiet) {
          renderError(error.message ?? String(error));
        }
      }
    }

    async function selectLatest() {
      if (state.reports.length === 0) {
        await refresh({ keepSelection: false });
        return;
      }
      await loadReport(state.reports[0].id);
    }

    async function loadReport(reportId, options = {}) {
      const data = await fetchJson("/api/reports/" + encodeURIComponent(reportId));
      state.current = data;
      state.selectedId = reportId;
      if (!options.replaceUrl) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("report", reportId);
        window.history.replaceState(null, "", nextUrl);
      }
      renderAll();
    }

    function renderAll() {
      renderHistory();
      renderSummary();
      renderFilterOptions();
      renderCases();
    }

    function renderHistory() {
      els.historyCount.textContent = state.reports.length ? state.reports.length + " 次报告" : "暂无报告";
      els.historyList.innerHTML = state.reports.map((report, index) => {
        const active = report.id === state.selectedId ? " active" : "";
        const latest = index === 0 ? "最新 · " : "";
        return \`
          <button class="history-item\${active}" type="button" data-report-id="\${escapeAttr(report.id)}">
            <strong>\${escapeHtml(reportTitle(report))}</strong>
            <span class="history-meta">\${latest}\${escapeHtml(statusText(report.status))} · \${report.passed}/\${report.total} 通过 · \${formatDuration(report.durationMs)}</span>
          </button>
        \`;
      }).join("");

      for (const item of els.historyList.querySelectorAll("[data-report-id]")) {
        item.addEventListener("click", () => loadReport(item.getAttribute("data-report-id")));
      }
    }

    function renderSummary() {
      if (!state.current) {
        renderEmpty("选择一个 TestD 报告。");
        return;
      }

      const metadata = state.current.metadata;
      els.subtitle.textContent = \`当前报告：\${metadata.directory}\`;
      els.summaryPanel.innerHTML = \`
        <div class="summary-main">
          <div>
            <h2>\${escapeHtml(reportTitle(metadata))}</h2>
            <div class="small-muted">\${escapeHtml(metadata.directory)} · 更新于 \${escapeHtml(formatDateTime(metadata.updatedAt))}</div>
          </div>
          <span class="status-pill \${escapeAttr(metadata.status)}">\${escapeHtml(statusText(metadata.status))}</span>
        </div>
        <div class="metric-grid">
          \${metric("总用例", metadata.total)}
          \${metric("通过", metadata.passed)}
          \${metric("失败", metadata.failed)}
          \${metric("跳过", metadata.skipped)}
          \${metric("批次", metadata.suiteCount)}
          \${metric("耗时", formatDuration(metadata.durationMs))}
        </div>
        \${renderSuites(metadata.suites)}
      \`;
    }

    function renderSuites(suites) {
      if (!suites || suites.length === 0) {
        return "";
      }
      return \`
        <div style="margin-top: 12px; overflow-x: auto;">
          <table class="stage-table">
            <thead><tr><th>批次</th><th>状态</th><th>通过</th><th>失败</th><th>跳过</th><th>耗时</th></tr></thead>
            <tbody>
              \${suites.map((suite) => \`
                <tr>
                  <td>\${escapeHtml(suite.name)}</td>
                  <td><span class="status-pill \${escapeAttr(suite.status)}">\${escapeHtml(statusText(suite.status))}</span></td>
                  <td>\${suite.passed}/\${suite.total}</td>
                  <td>\${suite.failed}</td>
                  <td>\${suite.skipped}</td>
                  <td>\${escapeHtml(formatDuration(suite.durationMs))}</td>
                </tr>
              \`).join("")}
            </tbody>
          </table>
        </div>
      \`;
    }

    function renderFilterOptions() {
      const cases = state.current?.report?.cases ?? [];
      const suites = unique(cases.map((testCase) => testCase.suite).filter(Boolean));
      const modules = unique(cases.map((testCase) => testCase.module).filter(Boolean));
      const statusOptions = [
        ["all", "全部状态"],
        ["failedOnly", "只看未通过"],
        ["passed", "通过"],
        ["failed", "失败"],
        ["timedOut", "超时"],
        ["interrupted", "中断"],
        ["skipped", "跳过"],
      ];
      if (!statusOptions.some(([value]) => value === state.filters.status)) state.filters.status = "all";
      if (state.filters.suite !== "all" && !suites.includes(state.filters.suite)) state.filters.suite = "all";
      if (state.filters.module !== "all" && !modules.includes(state.filters.module)) state.filters.module = "all";
      els.statusFilter.innerHTML = statusOptions.map(([value, label]) => option(value, label, state.filters.status)).join("");
      els.suiteFilter.innerHTML = [option("all", "全部批次", state.filters.suite), ...suites.map((value) => option(value, value, state.filters.suite))].join("");
      els.moduleFilter.innerHTML = [option("all", "全部模块", state.filters.module), ...modules.map((value) => option(value, value, state.filters.module))].join("");
    }

    function renderCases() {
      if (!state.current) {
        els.caseList.innerHTML = "";
        return;
      }

      const cases = filterCases(state.current.report.cases ?? []);
      if (cases.length === 0) {
        els.caseList.innerHTML = '<div class="empty">没有匹配的用例。</div>';
        return;
      }

      els.caseList.innerHTML = cases.map((testCase) => renderCaseCard(testCase, state.current.metadata.id)).join("");
    }

    function renderCaseCard(testCase, reportId) {
      const failed = isFailedStatus(testCase.status);
      const open = failed ? " open" : "";
      const screenshots = Array.isArray(testCase.screenshots) ? testCase.screenshots : [];
      return \`
        <details class="case-card \${failed ? "failed-case" : ""}"\${open}>
          <summary class="case-summary">
            <div class="case-title">
              <strong>\${escapeHtml(testCase.title || testCase.id)}</strong>
              <span>\${escapeHtml([testCase.suite, testCase.module, testCase.id].filter(Boolean).join(" / "))}</span>
            </div>
            <span class="status-pill \${escapeAttr(testCase.status)}">\${escapeHtml(statusText(testCase.status))} · \${escapeHtml(formatDuration(testCase.durationMs))}</span>
          </summary>
          <div class="case-detail">
            <div class="detail-grid">
              \${metric("失败阶段", testCase.failedStage || "无")}
              \${metric("阶段数", Array.isArray(testCase.stages) ? testCase.stages.length : 0)}
              \${metric("截图", screenshots.length)}
              \${metric("耗时", formatDuration(testCase.durationMs))}
            </div>
            \${testCase.error ? \`<pre>\${escapeHtml(testCase.error.stack || testCase.error.message || "未记录错误")}</pre>\` : ""}
            \${renderStageTable(testCase.stages)}
            \${renderScreenshots(reportId, screenshots)}
          </div>
        </details>
      \`;
    }

    function renderStageTable(stages) {
      if (!Array.isArray(stages) || stages.length === 0) {
        return '<div class="small-muted">未记录阶段结果。</div>';
      }
      return \`
        <div style="overflow-x: auto;">
          <table class="stage-table">
            <thead><tr><th>阶段</th><th>结果</th><th>耗时</th><th>错误</th></tr></thead>
            <tbody>
              \${stages.map((stage) => \`
                <tr>
                  <td>\${escapeHtml(stage.name)}</td>
                  <td><span class="status-pill \${escapeAttr(stage.status)}">\${escapeHtml(stage.status === "passed" ? "通过" : "失败")}</span></td>
                  <td>\${escapeHtml(formatDuration(stage.durationMs))}</td>
                  <td>\${escapeHtml(stage.error?.message ?? "")}</td>
                </tr>
              \`).join("")}
            </tbody>
          </table>
        </div>
      \`;
    }

    function renderScreenshots(reportId, screenshots) {
      if (!Array.isArray(screenshots) || screenshots.length === 0) {
        return "";
      }
      return \`
        <div class="screenshots">
          \${screenshots.map((screenshot) => {
            const url = attachmentUrl(reportId, screenshot.path);
            return \`
              <a class="screenshot" href="\${escapeAttr(url)}" target="_blank" rel="noreferrer">
                <img src="\${escapeAttr(url)}" alt="\${escapeAttr(screenshot.label || screenshot.name || "失败截图")}" loading="lazy" />
                <span>\${escapeHtml([screenshot.label, screenshot.stage].filter(Boolean).join(" · "))}</span>
              </a>
            \`;
          }).join("")}
        </div>
      \`;
    }

    function filterCases(cases) {
      const query = state.filters.query.trim().toLowerCase();
      return [...cases]
        .sort(compareCases)
        .filter((testCase) => {
          if (state.filters.status === "failedOnly" && !isFailedStatus(testCase.status)) return false;
          if (!["all", "failedOnly"].includes(state.filters.status) && testCase.status !== state.filters.status) return false;
          if (state.filters.suite !== "all" && testCase.suite !== state.filters.suite) return false;
          if (state.filters.module !== "all" && testCase.module !== state.filters.module) return false;
          if (!query) return true;
          return [testCase.id, testCase.title, testCase.module, testCase.suite].some((value) => String(value ?? "").toLowerCase().includes(query));
        });
    }

    function compareCases(left, right) {
      return statusRank(left.status) - statusRank(right.status)
        || String(left.suite ?? "").localeCompare(String(right.suite ?? ""), "zh-CN")
        || String(left.module ?? "").localeCompare(String(right.module ?? ""), "zh-CN")
        || String(left.id ?? "").localeCompare(String(right.id ?? ""), "zh-CN");
    }

    function statusRank(status) {
      if (isFailedStatus(status)) return 0;
      if (status === "skipped") return 2;
      return 1;
    }

    function renderEmpty(message) {
      els.summaryPanel.innerHTML = '<div class="empty">' + escapeHtml(message) + '</div>';
      els.caseList.innerHTML = "";
    }

    function renderError(message) {
      els.summaryPanel.innerHTML = '<div class="error">' + escapeHtml(message) + '</div>';
      els.caseList.innerHTML = "";
    }

    async function fetchJson(url) {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "请求失败");
      }
      return data;
    }

    function metric(label, value) {
      return \`<div class="metric"><span>\${escapeHtml(label)}</span><strong>\${escapeHtml(String(value))}</strong></div>\`;
    }

    function option(value, label, selected) {
      return \`<option value="\${escapeAttr(value)}"\${value === selected ? " selected" : ""}>\${escapeHtml(label)}</option>\`;
    }

    function reportTitle(report) {
      return formatDateTime(report.startedAt) || report.id;
    }

    function statusText(status) {
      const map = {
        passed: "通过",
        failed: "失败",
        timedOut: "超时",
        timedout: "超时",
        interrupted: "中断",
        skipped: "跳过",
      };
      return map[status] || status || "未知";
    }

    function isFailedStatus(status) {
      return ["failed", "timedOut", "timedout", "interrupted"].includes(status);
    }

    function formatDuration(value) {
      const duration = Number(value) || 0;
      if (duration >= 60_000) {
        return (duration / 60_000).toFixed(1) + "m";
      }
      return (duration / 1000).toFixed(2) + "s";
    }

    function formatDateTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    }

    function unique(values) {
      return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-CN"));
    }

    function attachmentUrl(reportId, relativePath) {
      const normalized = String(relativePath ?? "").split("/").filter(Boolean);
      return "/reports/" + encodeURIComponent(reportId) + "/" + normalized.map(encodeURIComponent).join("/");
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }
  </script>
</body>
</html>`;
}

function sendHtml(response, body, status = 200) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function resolveReportDir(reportId) {
  if (!reportId || reportId.includes("/") || reportId.includes("\\") || reportId.includes("\0")) {
    throw new HttpError(400, "报告 ID 非法");
  }
  const reportDir = path.resolve(REPORT_ROOT, reportId);
  if (!isInside(REPORT_ROOT, reportDir)) {
    throw new HttpError(403, "报告路径非法");
  }
  return reportDir;
}

function resolveInside(baseDir, ...parts) {
  const target = path.resolve(baseDir, ...parts);
  if (!isInside(baseDir, target)) {
    throw new HttpError(403, "路径非法");
  }
  return target;
}

function isInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function reportSortTime(report) {
  const startedAt = Date.parse(report.startedAt);
  if (Number.isFinite(startedAt)) {
    return startedAt;
  }
  const updatedAt = Date.parse(report.updatedAt);
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

function isFailedCaseStatus(status) {
  return ["failed", "timedOut", "timedout", "interrupted"].includes(status);
}

function contentTypeFor(targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
