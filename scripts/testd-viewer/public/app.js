const state = {
  data: null,
  view: "overview",
  selectedCaseId: "",
  selectedReportId: "",
  filters: {
    query: "",
    state: "all",
    suite: "all",
    module: "all",
    config: "all",
  },
};

const els = {
  subtitle: document.getElementById("subtitle"),
  refreshButton: document.getElementById("refresh-button"),
  syncState: document.getElementById("sync-state"),
  tabs: [...document.querySelectorAll(".tab")],
  views: {
    overview: document.getElementById("view-overview"),
    cases: document.getElementById("view-cases"),
    history: document.getElementById("view-history"),
  },
  caseSearch: document.getElementById("case-search"),
  stateFilter: document.getElementById("state-filter"),
  suiteFilter: document.getElementById("suite-filter"),
  moduleFilter: document.getElementById("module-filter"),
  configFilter: document.getElementById("config-filter"),
  caseDirectory: document.getElementById("case-directory"),
  caseDetail: document.getElementById("case-detail"),
  historyList: document.getElementById("history-list"),
  historyDetail: document.getElementById("history-detail"),
};

els.refreshButton.addEventListener("click", () => refresh());
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => selectView(tab.dataset.view));
});
for (const [key, element] of [
  ["query", els.caseSearch],
  ["state", els.stateFilter],
  ["suite", els.suiteFilter],
  ["module", els.moduleFilter],
  ["config", els.configFilter],
]) {
  element.addEventListener("input", () => {
    state.filters[key] = element.value;
    renderCases();
  });
}

refresh();
window.setInterval(() => refresh({ quiet: true }), 10_000);

async function refresh(options = {}) {
  try {
    if (!options.quiet) {
      els.syncState.textContent = "刷新中";
    }
    state.data = await fetchJson("/api/console");
    if (!state.selectedCaseId) {
      const firstIssue = state.data.overview.failedCases[0] ?? state.data.overview.notRunCases[0] ?? state.data.inventory.cases[0];
      state.selectedCaseId = firstIssue?.id ?? "";
    }
    if (!state.selectedReportId) {
      state.selectedReportId = state.data.reports[0]?.id ?? "";
    }
    els.subtitle.textContent = subtitleText();
    els.syncState.textContent = `已更新 ${formatTime(new Date().toISOString())}`;
    renderAll();
  } catch (error) {
    if (!options.quiet) {
      els.syncState.textContent = "加载失败";
      els.views.overview.innerHTML = `<div class="error">${escapeHtml(error.message ?? String(error))}</div>`;
    }
  }
}

function selectView(view) {
  state.view = view;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(els.views).forEach(([key, element]) => element.classList.toggle("active", key === view));
}

function renderAll() {
  renderOverview();
  renderFilterOptions();
  renderCases();
  renderHistory();
}

function renderOverview() {
  const data = state.data;
  if (!data) return;
  const overview = data.overview;
  const inventory = overview.inventory;
  const latest = overview.latestReport;

  els.views.overview.innerHTML = `
    <div class="metric-grid">
      ${metric("可收集 spec", inventory.totalSpecs)}
      ${metric("当前会运行", inventory.runnable)}
      ${metric("显式禁用", inventory.disabled)}
      ${metric("最新通过", inventory.latestPassed ?? 0)}
      ${metric("最新失败", inventory.latestFailed ?? 0)}
      ${metric("未运行", inventory.notRun ?? 0)}
    </div>
    <div class="dashboard-grid">
      <section class="section">
        <div class="section-header">
          <h2>模块状态</h2>
          <span class="small">${latest ? `最新报告 ${formatTime(latest.startedAt)}` : "暂无报告"}</span>
        </div>
        <div class="module-grid">
          ${overview.modules.map(renderModuleRow).join("")}
        </div>
      </section>
      <section class="section">
        <div class="section-header">
          <h2>运行观察</h2>
          <span class="small">${priorityCount(overview)} 项</span>
        </div>
        <div class="priority-list">
          ${renderPriorityList(overview)}
        </div>
      </section>
    </div>
  `;
}

function renderPriorityList(overview) {
  const items = [
    ...overview.failedCases.map((testCase) => ({ kind: "失败", testCase })),
    ...overview.notRunCases.slice(0, 8).map((testCase) => ({ kind: "未运行", testCase })),
    ...overview.slowCases.slice(0, 5).map((testCase) => ({ kind: "慢用例", testCase })),
  ];
  if (items.length === 0) {
    return '<div class="empty">最新结果没有需要优先处理的项目。</div>';
  }
  return items.slice(0, 14).map(({ kind, testCase }) => `
    <button class="priority-item" type="button" data-case-id="${escapeAttr(testCase.id)}">
      <div><span class="status-pill ${escapeAttr(testCase.runState)}">${escapeHtml(kind)}</span></div>
      <strong>${escapeHtml(testCase.title)}</strong>
      <div class="muted">${escapeHtml([testCase.module, testCase.flow].join(" / "))}</div>
    </button>
  `).join("");
}

function renderModuleRow(module) {
  const passedRatio = module.runnable ? Math.round((module.passed / module.runnable) * 100) : 0;
  return `
    <div class="module-row">
      <div>
        <strong>${escapeHtml(module.module)}</strong>
        <div class="muted">${escapeHtml(module.flow)} · ${module.total} 个 spec · ${module.runnable} 个会运行</div>
      </div>
      <div>
        <div class="small">${module.passed}/${module.runnable} 通过</div>
        <div class="progress"><span style="width:${passedRatio}%"></span></div>
      </div>
    </div>
  `;
}

function renderFilterOptions() {
  const cases = state.data?.inventory?.cases ?? [];
  const suites = unique(cases.map((testCase) => testCase.suite));
  const modules = unique(cases.map((testCase) => testCase.module));
  const stateOptions = [
    ["all", "全部状态"],
    ["runnable", "当前会运行"],
    ["disabled", "显式禁用"],
    ["passed", "最新通过"],
    ["failed", "最新失败"],
    ["not-run", "未运行"],
    ["skipped", "跳过"],
  ];
  const configOptions = [
    ["all", "全部配置"],
    ["configured", "有配置元数据"],
    ["implicit", "默认启用"],
  ];
  els.stateFilter.innerHTML = stateOptions.map(([value, label]) => option(value, label, state.filters.state)).join("");
  els.suiteFilter.innerHTML = [option("all", "全部批次", state.filters.suite), ...suites.map((value) => option(value, value, state.filters.suite))].join("");
  els.moduleFilter.innerHTML = [option("all", "全部模块", state.filters.module), ...modules.map((value) => option(value, value, state.filters.module))].join("");
  els.configFilter.innerHTML = configOptions.map(([value, label]) => option(value, label, state.filters.config)).join("");
}

function renderCases() {
  const data = state.data;
  if (!data) return;
  const cases = filteredCases(data.inventory.cases);
  const groups = groupCases(cases);
  els.caseDirectory.innerHTML = groups.length
    ? groups.map(renderCaseGroup).join("")
    : '<div class="empty">没有匹配的用例。</div>';

  for (const row of els.caseDirectory.querySelectorAll("[data-case-id]")) {
    row.addEventListener("click", () => {
      state.selectedCaseId = row.dataset.caseId;
      renderCases();
    });
  }

  for (const item of document.querySelectorAll(".priority-item[data-case-id]")) {
    item.addEventListener("click", () => {
      state.selectedCaseId = item.dataset.caseId;
      selectView("cases");
      renderCases();
    });
  }

  const selected = data.inventory.cases.find((testCase) => testCase.id === state.selectedCaseId) ?? cases[0] ?? data.inventory.cases[0];
  state.selectedCaseId = selected?.id ?? "";
  renderCaseDetail(selected);
}

function renderCaseGroup(group) {
  return `
    <section class="module-section">
      <div class="module-summary">
        <div>
          <h3>${escapeHtml(group.module)}</h3>
          <div class="muted">${escapeHtml(group.flow)}</div>
        </div>
        <div class="small">${group.cases.length} 个 · ${group.cases.filter((item) => item.enabled).length} 个会运行</div>
      </div>
      <div class="case-table">
        ${group.cases.map(renderCaseRow).join("")}
      </div>
    </section>
  `;
}

function renderCaseRow(testCase) {
  const active = testCase.id === state.selectedCaseId ? " active" : "";
  return `
    <button class="case-row${active}" type="button" data-case-id="${escapeAttr(testCase.id)}">
      <span class="case-title">
        <strong>${escapeHtml(testCase.title)}</strong>
        <span>${escapeHtml(testCase.specPath)}</span>
      </span>
      <span class="status-pill ${escapeAttr(testCase.runState)}">${escapeHtml(statusText(testCase.runState))}</span>
      <span class="status-pill ${testCase.configured ? "passed" : "not-run"}">${testCase.configured ? "有配置" : "默认启用"}</span>
      <span class="small">${testCase.latestResult ? formatDuration(testCase.latestResult.durationMs) : "-"}</span>
    </button>
  `;
}

function renderCaseDetail(testCase) {
  if (!testCase) {
    els.caseDetail.innerHTML = '<div class="empty">选择一个用例查看详情。</div>';
    return;
  }
  const result = testCase.latestResult;
  els.caseDetail.innerHTML = `
    <h2 class="detail-title">${escapeHtml(testCase.title)}</h2>
    <div><span class="status-pill ${escapeAttr(testCase.runState)}">${escapeHtml(statusText(testCase.runState))}</span></div>
    <div class="detail-list">
      ${detailLine("用例 ID", testCase.id)}
      ${detailLine("批次", testCase.suite)}
      ${detailLine("模块", testCase.module)}
      ${detailLine("流程", testCase.flow)}
      ${detailLine("spec", testCase.specPath)}
      ${detailLine("文档", testCase.doc || "未配置")}
      ${detailLine("配置来源", testCase.configured ? "testd.config.ts" : "默认启用")}
      ${detailLine("追溯", testCase.traceability || "未配置")}
    </div>
    ${result?.error ? `<pre>${escapeHtml(result.error.stack || result.error.message || "未记录错误")}</pre>` : ""}
    ${renderStages(result?.stages)}
    ${renderScreenshots(state.data.latestReport?.metadata?.id, result?.screenshots)}
  `;
}

function renderStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return '<div class="muted">最新报告未记录阶段结果。</div>';
  }
  return `
    <div style="overflow-x:auto">
      <table class="stage-table">
        <thead><tr><th>阶段</th><th>结果</th><th>耗时</th></tr></thead>
        <tbody>
          ${stages.map((stage) => `
            <tr>
              <td>${escapeHtml(stage.name)}</td>
              <td>${escapeHtml(stage.status === "passed" ? "通过" : "失败")}</td>
              <td>${escapeHtml(formatDuration(stage.durationMs))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderScreenshots(reportId, screenshots) {
  if (!reportId || !Array.isArray(screenshots) || screenshots.length === 0) {
    return "";
  }
  return `
    <div class="screenshots">
      ${screenshots.map((screenshot) => {
        const url = attachmentUrl(reportId, screenshot.path);
        return `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(url)}" alt="${escapeAttr(screenshot.label || "失败截图")}" /></a>`;
      }).join("")}
    </div>
  `;
}

function renderHistory() {
  const reports = state.data?.reports ?? [];
  if (!reports.length) {
    els.historyList.innerHTML = '<div class="empty">暂无历史报告。</div>';
    els.historyDetail.innerHTML = "";
    return;
  }
  if (!state.selectedReportId) {
    state.selectedReportId = reports[0].id;
  }
  els.historyList.innerHTML = `<div class="history-items">${reports.map(renderHistoryItem).join("")}</div>`;
  for (const item of els.historyList.querySelectorAll("[data-report-id]")) {
    item.addEventListener("click", async () => {
      state.selectedReportId = item.dataset.reportId;
      await renderSelectedReport();
      renderHistory();
    });
  }
  renderSelectedReport();
}

async function renderSelectedReport() {
  const reportId = state.selectedReportId;
  if (!reportId) return;
  let report = state.data.latestReport?.metadata?.id === reportId ? state.data.latestReport : null;
  if (!report) {
    report = await fetchJson(`/api/reports/${encodeURIComponent(reportId)}`);
  }
  const metadata = report.metadata;
  const failedCases = (report.report.cases ?? []).filter((testCase) => isFailedState(testCase.status));
  els.historyDetail.innerHTML = `
    <div class="section-header" style="padding:0 0 10px;border-bottom:0">
      <h2>${escapeHtml(formatTime(metadata.startedAt) || metadata.id)}</h2>
      <span class="status-pill ${escapeAttr(metadata.status)}">${escapeHtml(statusText(metadata.status))}</span>
    </div>
    <div class="metric-grid" style="grid-template-columns:repeat(4,minmax(0,1fr));box-shadow:none">
      ${metric("总数", metadata.total)}
      ${metric("通过", metadata.passed)}
      ${metric("失败", metadata.failed)}
      ${metric("耗时", formatDuration(metadata.durationMs))}
    </div>
    <div class="priority-list">
      ${failedCases.length ? failedCases.map((testCase) => `<div class="priority-item"><strong>${escapeHtml(testCase.title)}</strong><div class="muted">${escapeHtml(testCase.id)}</div></div>`).join("") : '<div class="empty">这次报告没有失败用例。</div>'}
    </div>
  `;
}

function renderHistoryItem(report) {
  const active = report.id === state.selectedReportId ? " active" : "";
  return `
    <button class="history-item${active}" type="button" data-report-id="${escapeAttr(report.id)}">
      <strong>${escapeHtml(formatTime(report.startedAt) || report.id)}</strong>
      <span class="muted">${escapeHtml(statusText(report.status))} · ${report.passed}/${report.total} 通过 · ${escapeHtml(formatDuration(report.durationMs))}</span>
    </button>
  `;
}

function filteredCases(cases) {
  const query = state.filters.query.trim().toLowerCase();
  return cases.filter((testCase) => {
    if (state.filters.state === "runnable" && !testCase.enabled) return false;
    if (state.filters.state === "disabled" && testCase.enabled) return false;
    if (state.filters.state === "failed" && !isFailedState(testCase.runState)) return false;
    if (!["all", "runnable", "disabled", "failed"].includes(state.filters.state) && testCase.runState !== state.filters.state) return false;
    if (state.filters.suite !== "all" && testCase.suite !== state.filters.suite) return false;
    if (state.filters.module !== "all" && testCase.module !== state.filters.module) return false;
    if (state.filters.config === "configured" && !testCase.configured) return false;
    if (state.filters.config === "implicit" && testCase.configured) return false;
    if (!query) return true;
    return [testCase.id, testCase.title, testCase.module, testCase.flow, testCase.specPath].some((value) => String(value ?? "").toLowerCase().includes(query));
  });
}

function groupCases(cases) {
  const map = new Map();
  for (const testCase of cases) {
    const key = `${testCase.suite}/${testCase.module}/${testCase.flow}`;
    const group = map.get(key) ?? { suite: testCase.suite, module: testCase.module, flow: testCase.flow, cases: [] };
    group.cases.push(testCase);
    map.set(key, group);
  }
  return [...map.values()];
}

function priorityCount(overview) {
  return overview.failedCases.length + overview.notRunCases.length + overview.slowCases.length;
}

function subtitleText() {
  const summary = state.data?.inventory?.summary;
  if (!summary) return "读取 TestD spec、配置覆盖和测试报告。";
  return `${summary.totalSpecs} 个 spec，${summary.runnable} 个当前会运行，${summary.configured} 个有配置元数据。`;
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
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function detailLine(label, value) {
  return `<div class="detail-line"><span>${escapeHtml(label)}</span><span>${escapeHtml(value || "-")}</span></div>`;
}

function option(value, label, selected) {
  return `<option value="${escapeAttr(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function statusText(status) {
  const map = {
    runnable: "会运行",
    disabled: "已禁用",
    "not-run": "未运行",
    passed: "通过",
    failed: "失败",
    timedOut: "超时",
    timedout: "超时",
    interrupted: "中断",
    skipped: "跳过",
  };
  return map[status] || status || "未知";
}

function isFailedState(status) {
  return ["failed", "timedOut", "timedout", "interrupted"].includes(status);
}

function formatDuration(value) {
  const duration = Number(value) || 0;
  if (duration >= 60_000) return `${(duration / 60_000).toFixed(1)}m`;
  return `${(duration / 1000).toFixed(2)}s`;
}

function formatTime(value) {
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
  return `/reports/${encodeURIComponent(reportId)}/${normalized.map(encodeURIComponent).join("/")}`;
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
