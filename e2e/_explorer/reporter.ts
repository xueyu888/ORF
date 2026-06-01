import fs from "node:fs/promises";
import path from "node:path";
import { mergeExplorerResults } from "./mergeStrategy";
import type {
  CoverageSummary,
  ExplorerConfig,
  ExplorerRunResult,
  RepeatableRegionObjectResult,
  ScreenshotArtifact,
  StateNode,
  StepRecord,
  UiOperation,
} from "./types";

const reportCandidateSampleLimit = 80;
const reportTextLimit = 180;

type NoChangeEventRow = {
  stateId: string;
  eventSignature: string;
  noChangeCount: number;
  attempts: number;
};

export type ReportResult = ExplorerRunResult & {
  topNoChangeEventRows?: NoChangeEventRow[];
};

export type LiveReportStatus = "running" | "completed" | "stopped" | "failed";

export type LiveReportSnapshot = {
  status: LiveReportStatus;
  revision: number;
  updatedAt: string;
  startedAt?: string;
  runDir?: string;
  reportPath?: string;
  resultPath?: string;
  seed: string;
  latestStepCount: number;
  html: {
    testedObject: string;
    heroMetrics: string;
    score: string;
    cards: string;
    issues: string;
    coverage: string;
    curves: string;
    repeatableExploration: string;
    repeatableRegions: string;
  };
};

export type EventOutcomeBreakdown = {
  total: number;
  newState: number;
  newTransition: number;
  knownChange: number;
  noChange: number;
  issue: number;
};

export async function writeExplorerReport(result: ExplorerRunResult) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(result.config.reportDir, `${timestamp}-seed-${safeFilePart(result.seed)}`);
  await fs.mkdir(runDir, { recursive: true });
  const jsonPath = path.join(runDir, "result.json");
  const htmlPath = path.join(runDir, "report.html");
  const repeatableJsonPath = result.repeatableRegionExploration ? path.join(runDir, "repeatable-regions.json") : undefined;
  const repeatableHtmlPath = result.repeatableRegionExploration ? path.join(runDir, "repeatable-regions.html") : undefined;

  const withPaths = {
    ...result,
    reportPath: jsonPath,
    htmlReportPath: htmlPath,
    repeatableRegionReportPath: repeatableJsonPath,
    repeatableRegionHtmlReportPath: repeatableHtmlPath,
  };
  const archived = await archiveScreenshotArtifacts(withPaths, runDir);
  const reportResult = compactReportResult(archived);
  await fs.writeFile(jsonPath, JSON.stringify({ ...reportResult, ...reportResult.summary }, null, 2), "utf8");
  await fs.writeFile(htmlPath, renderHtml(reportResult), "utf8");
  if (reportResult.repeatableRegionExploration && repeatableJsonPath && repeatableHtmlPath) {
    await fs.writeFile(repeatableJsonPath, JSON.stringify(reportResult.repeatableRegionExploration, null, 2), "utf8");
    await fs.writeFile(repeatableHtmlPath, renderRepeatableRegionHtml(reportResult), "utf8");
  }
  return {
    reportPath: jsonPath,
    htmlReportPath: htmlPath,
    repeatableRegionReportPath: repeatableJsonPath,
    repeatableRegionHtmlReportPath: repeatableHtmlPath,
  };
}

export async function writeMergedExplorerReport(
  results: ExplorerRunResult[],
  options: { reportDir: string; seed: string; replayCommand: string; label?: string },
) {
  const merged = mergeExplorerResults(results, options);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(options.reportDir, `${timestamp}-parallel-seed-${safeFilePart(options.seed)}`);
  await fs.mkdir(runDir, { recursive: true });
  const jsonPath = path.join(runDir, "result.json");
  const htmlPath = path.join(runDir, "report.html");
  const repeatableJsonPath = merged.repeatableRegionExploration ? path.join(runDir, "repeatable-regions.json") : undefined;
  const repeatableHtmlPath = merged.repeatableRegionExploration ? path.join(runDir, "repeatable-regions.html") : undefined;
  const withPaths = {
    ...merged,
    reportPath: jsonPath,
    htmlReportPath: htmlPath,
    repeatableRegionReportPath: repeatableJsonPath,
    repeatableRegionHtmlReportPath: repeatableHtmlPath,
  };
  const archived = await archiveScreenshotArtifacts(withPaths, runDir);
  const reportResult = compactReportResult(archived);
  await fs.writeFile(jsonPath, JSON.stringify({ ...reportResult, ...reportResult.summary }, null, 2), "utf8");
  await fs.writeFile(htmlPath, renderHtml(reportResult), "utf8");
  if (reportResult.repeatableRegionExploration && repeatableJsonPath && repeatableHtmlPath) {
    await fs.writeFile(repeatableJsonPath, JSON.stringify(reportResult.repeatableRegionExploration, null, 2), "utf8");
    await fs.writeFile(repeatableHtmlPath, renderRepeatableRegionHtml(reportResult), "utf8");
  }
  return {
    reportPath: jsonPath,
    htmlReportPath: htmlPath,
    repeatableRegionReportPath: repeatableJsonPath,
    repeatableRegionHtmlReportPath: repeatableHtmlPath,
    result: reportResult,
  };
}

function compactReportResult(result: ExplorerRunResult): ReportResult {
  const topNoChangeEventRows = collectTopNoChangeEventRows(result.stateTable);
  const stateTable = result.stateTable.map(compactStateNode);
  const stateById = new Map(stateTable.map((state) => [state.id, state]));
  return {
    ...result,
    stateTable,
    frontierStates: result.frontierStates.map((state) => stateById.get(state.id) ?? compactStateNode(state)),
    transitionTable: result.transitionTable.map((edge) => ({ ...edge, eventSignature: trimText(edge.eventSignature) })),
    untestedCandidateEvents: result.untestedCandidateEvents.map((item) => ({
      ...item,
      eventSignature: trimText(item.eventSignature),
      targetSignature: item.targetSignature ? trimText(item.targetSignature) : undefined,
    })),
    eventSequence: result.eventSequence.map((record) => ({
      ...record,
      eventSignature: trimText(record.eventSignature),
      targetSignature: record.targetSignature ? trimText(record.targetSignature) : undefined,
      issues: record.issues.map((issue) => ({
        ...issue,
        message: trimText(issue.message, 300),
        url: issue.url ? trimText(issue.url, 240) : undefined,
      })),
    })),
    screenshotArtifacts: (result.screenshotArtifacts ?? []).map((artifact) => ({ ...artifact })),
    topNoChangeEventRows,
  };
}

async function archiveScreenshotArtifacts(result: ExplorerRunResult, runDir: string): Promise<ExplorerRunResult> {
  const archived: ScreenshotArtifact[] = [];
  for (const artifact of result.screenshotArtifacts ?? []) {
    const category = artifact.kind === "issue" ? "issues" : "states";
    const fileName = safeFilePart(artifact.fileName || `${artifact.id}.png`);
    const relativePath = path.posix.join("screenshots", category, fileName);
    const destination = path.join(runDir, "screenshots", category, fileName);
    if (artifact.path && path.resolve(artifact.path) !== path.resolve(destination)) {
      try {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(artifact.path, destination);
      } catch {
        if (!(await exists(destination))) {
          archived.push({ ...artifact, relativePath: artifact.relativePath ?? relativePath });
          continue;
        }
      }
    }
    archived.push({
      ...artifact,
      path: destination,
      relativePath,
      fileName,
    });
  }
  if (result.config.screenshotDir.includes(".tmp-screenshots")) {
    await fs.rm(result.config.screenshotDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return { ...result, screenshotArtifacts: archived };
}

function compactStateNode(state: StateNode): StateNode {
  return {
    ...state,
    fingerprint: trimText(state.fingerprint, 320),
    repeatableRegions: state.repeatableRegions.map((region) => ({
      ...region,
      itemShape: trimText(region.itemShape, 180),
      abstractionKey: trimText(region.abstractionKey, 240),
    })),
    candidates: [],
  };
}

function collectTopNoChangeEventRows(states: StateNode[]) {
  return states
    .flatMap((state) =>
      state.candidates
        .filter((candidate) => candidate.noChangeCount > 0)
        .map((candidate) => ({
          stateId: state.id,
          eventSignature: trimText(candidate.eventSignature),
          noChangeCount: candidate.noChangeCount,
          attempts: candidate.attempts,
        })),
    )
    .sort(
      (left, right) =>
        right.noChangeCount - left.noChangeCount ||
        right.attempts - left.attempts ||
        left.eventSignature.localeCompare(right.eventSignature),
    )
    .slice(0, reportCandidateSampleLimit);
}

function embeddedReportData(result: ReportResult) {
  const stateScreenshotById = new Map(
    (result.screenshotArtifacts ?? [])
      .filter((artifact) => artifact.kind === "state" && artifact.stateId)
      .map((artifact) => [artifact.stateId!, artifact.relativePath ?? artifact.path]),
  );
  const eventRecordByTransition = new Map<string, StepRecord>();
  for (const record of result.eventSequence) {
    const key = transitionEventKey(record.beforeStateId, record.afterStateId, record.eventSignature);
    if (!eventRecordByTransition.has(key)) {
      eventRecordByTransition.set(key, record);
    }
  }
  return {
    seed: result.seed,
    summary: result.summary,
    states: result.stateTable.map((state) => ({
      id: state.id,
      routePattern: state.routePattern,
      screenshot: stateScreenshotById.get(state.id),
      visits: state.visits,
      firstSeenStep: state.firstSeenStep,
      lastSeenStep: state.lastSeenStep,
      candidateCount: state.candidateCount,
      testedCandidateCount: state.testedCandidateCount,
      untestedCandidateCount: state.untestedCandidateCount,
      noChangeCount: state.noChangeCount,
      newStateOutCount: state.newStateOutCount,
      errorCount: state.errorCount,
      repeatableRegions: state.repeatableRegions,
    })),
    transitions: result.transitionTable.map((transition) => {
      const eventRecord = eventRecordByTransition.get(
        transitionEventKey(transition.fromStateId, transition.toStateId, transition.eventSignature),
      );
      return {
        fromStateId: transition.fromStateId,
        toStateId: transition.toStateId,
        eventSignature: transition.eventSignature,
        targetSignature: eventRecord?.targetSignature,
        targetLabel: targetLabelFromSignature(eventRecord?.targetSignature),
        eventLabel: eventRecord ? eventDisplayLabel(eventRecord) : undefined,
        count: transition.count,
        firstSeenStep: transition.firstSeenStep,
        lastSeenStep: transition.lastSeenStep,
        reward: transition.reward,
      };
    }),
    newStateCurve: result.newStateCurve,
    newTransitionCurve: result.newTransitionCurve,
    frontierStates: result.frontierStates.slice(0, 20).map((state) => ({
      id: state.id,
      routePattern: state.routePattern,
      visits: state.visits,
      candidateCount: state.candidateCount,
      testedCandidateCount: state.testedCandidateCount,
      untestedCandidateCount: state.untestedCandidateCount,
    })),
    untestedCandidateEvents: result.untestedCandidateEvents.slice(0, 100),
    topNoChangeEventRows: result.topNoChangeEventRows?.slice(0, 80) ?? [],
    replaySteps: result.eventSequence.map((record) => ({
      step: record.step,
      beforeStateId: record.beforeStateId,
      afterStateId: record.afterStateId,
      eventSignature: record.eventSignature,
      operation: record.operation,
      targetSignature: record.targetSignature,
      targetLabel: targetLabelFromSignature(record.targetSignature),
      eventLabel: eventDisplayLabel(record),
      newState: record.newState,
      newTransition: record.newTransition,
      noChange: record.noChange,
      routeEscape: record.routeEscape,
      issueCount: record.issues.length,
    })),
    screenshots: (result.screenshotArtifacts ?? []).map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      path: artifact.relativePath ?? artifact.path,
      stateId: artifact.stateId,
      routePattern: artifact.routePattern,
      step: artifact.step,
      issueType: artifact.issueType,
      severity: artifact.severity,
    })),
    replayCommand: result.replayCommand,
  };
}

function heroMetrics(result: ReportResult, outcome = outcomeBreakdown(result)) {
  const issueStepCount = outcome.issue;
  const successStepCount = Math.max(0, outcome.total - issueStepCount);
  return `
    <div class="meta-grid">
      ${meta("执行事件", String(result.eventSequence.length))}
      ${meta("成功事件", String(successStepCount))}
      ${meta("异常事件", String(issueStepCount))}
      ${meta("严重失败", String(result.summary.severeFailureCount))}
    </div>
  `;
}

function scorePanelContent(summary: CoverageSummary) {
  return `
    ${scoreGauge(summary.discoveredSpaceExplorationScore)}
    <h3>已发现空间探索分数</h3>
    <p class="gauge-caption">该分数只估算已发现 UI 状态空间的探索程度，不证明全系统路径已完整覆盖。</p>
  `;
}

function summaryCards(result: ReportResult) {
  const summary = result.summary;
  return `
    ${metric("状态节点", summary.discoveredStateCount, "规范化后发现的页面状态数量")}
    ${metric("状态转移", summary.discoveredTransitionCount, "执行事件后形成的状态边数量")}
    ${metric(
      "覆盖率",
      percent(summary.canonicalCandidateEventCoverage),
      `规范化候选 ${summary.testedCanonicalCandidateEventCount} / ${summary.discoveredCanonicalCandidateEventCount}`,
    )}
    ${metric("目标覆盖", percent(summary.targetCoverage), "被操作过的路径内目标 / 已发现路径内目标")}
    ${metric("状态内候选覆盖", percent(summary.candidateEventCoverage), `${summary.testedCandidateEventCount} / ${summary.discoveredCandidateEventCount}`)}
    ${metric("无变化比例", percent(summary.noChangeRate), "执行后状态未变化的事件占比")}
    ${metric("路径逃逸", summary.routeEscapeCount, "跳出安全作用域后会 reset")}
    ${metric("运行异常", summary.runtimeErrorCount, "普通异常会记录，不一定 fail")}
  `;
}

function coverageProgressSection(result: ReportResult) {
  const summary = result.summary;
  const outcome = outcomeBreakdown(result);
  return `
    <h2>覆盖进度</h2>
    <section class="section-grid">
      <div class="panel chart">
        <h3>核心覆盖指标</h3>
        <div class="bars">
          ${progressRow("状态内候选覆盖", summary.candidateEventCoverage, "blue")}
          ${progressRow("规范化候选覆盖", summary.canonicalCandidateEventCoverage, "cyan")}
          ${progressRow("目标组件覆盖", summary.targetCoverage, "cyan")}
          ${progressRow("输入类别覆盖", summary.payloadKindCoverage, "green")}
          ${progressRow("状态增长饱和", summary.stateGrowthSaturation, "amber")}
          ${progressRow("转移增长饱和", summary.transitionGrowthSaturation, "violet")}
        </div>
      </div>
      <div class="panel chart">
        <h3>事件结果概览</h3>
        ${stackedOutcome(outcome)}
        <div class="legend" style="margin-top: 14px">
          <span><i class="dot" style="background: var(--green)"></i>新状态</span>
          <span><i class="dot" style="background: var(--blue)"></i>新转移</span>
          <span><i class="dot" style="background: var(--cyan)"></i>已知变化</span>
          <span><i class="dot" style="background: var(--amber)"></i>无变化</span>
        </div>
      </div>
    </section>
  `;
}

function explorationCurveSection(result: ReportResult) {
  return `
    <h2>探索曲线</h2>
    <section class="split">
      <div class="panel chart">
        <h3>累计新状态</h3>
        ${curveSvg(result.newStateCurve, "var(--green)")}
      </div>
      <div class="panel chart">
        <h3>累计新转移</h3>
        ${curveSvg(result.newTransitionCurve, "var(--blue)")}
      </div>
    </section>
  `;
}

export function liveReportSnapshot(
  result: ExplorerRunResult,
  status: LiveReportStatus,
  options: { revision: number; startedAt?: number; runDir?: string; reportPath?: string; resultPath?: string },
): LiveReportSnapshot {
  const reportResult = compactReportResult(result);
  const repeatableRegions = uniqueRepeatableRegions(reportResult.stateTable).slice(0, 16);
  return {
    status,
    revision: options.revision,
    updatedAt: new Date().toISOString(),
    startedAt: options.startedAt ? new Date(options.startedAt).toISOString() : undefined,
    runDir: options.runDir,
    reportPath: options.reportPath,
    resultPath: options.resultPath,
    seed: reportResult.seed,
    latestStepCount: reportResult.eventSequence.length,
    html: {
      testedObject: testedObjectStrip(reportResult),
      heroMetrics: heroMetrics(reportResult),
      score: scorePanelContent(reportResult.summary),
      cards: summaryCards(reportResult),
      issues: issueOverviewSection(reportResult),
      coverage: coverageProgressSection(reportResult),
      curves: explorationCurveSection(reportResult),
      repeatableExploration: repeatableRegionExplorationSection(reportResult),
      repeatableRegions: repeatableRegionSection(repeatableRegions),
    },
  };
}

export function renderLiveReportHtml(result: ExplorerRunResult, snapshot: LiveReportSnapshot) {
  return renderHtml(compactReportResult(result), { liveSnapshot: snapshot });
}

function liveReportClientScript() {
  return `
    const liveState = { timer: null, lastRevision: -1 };
    const liveStatusLabels = { running: "运行中", completed: "已完成", stopped: "已停止", failed: "失败" };
    function readInitialLiveSnapshot() {
      try {
        return JSON.parse(document.getElementById("live-initial")?.textContent || "{}");
      } catch {
        return null;
      }
    }
    function setLiveHtml(id, value) {
      const element = document.getElementById(id);
      if (element) element.innerHTML = value || "";
    }
    function applyLiveSnapshot(snapshot) {
      if (!snapshot || snapshot.revision === liveState.lastRevision) return;
      liveState.lastRevision = snapshot.revision;
      const status = document.getElementById("liveStatus");
      if (status) {
        status.textContent = liveStatusLabels[snapshot.status] || snapshot.status || "未知";
        status.className = "live-status " + (snapshot.status || "running");
      }
      const updatedAt = document.getElementById("liveUpdatedAt");
      if (updatedAt) updatedAt.textContent = snapshot.updatedAt ? "实时区更新：" + new Date(snapshot.updatedAt).toLocaleString() : "";
      const revision = document.getElementById("liveRevision");
      if (revision) revision.textContent = "revision " + String(snapshot.revision ?? 0);
      setLiveHtml("liveTestedObject", snapshot.html?.testedObject);
      setLiveHtml("liveHeroMetrics", snapshot.html?.heroMetrics);
      setLiveHtml("liveScore", snapshot.html?.score);
      setLiveHtml("liveCards", snapshot.html?.cards);
      setLiveHtml("liveIssues", snapshot.html?.issues);
      setLiveHtml("liveCoverage", snapshot.html?.coverage);
      setLiveHtml("liveCurves", snapshot.html?.curves);
      setLiveHtml("liveRepeatableExploration", snapshot.html?.repeatableExploration);
      setLiveHtml("liveRepeatableRegions", snapshot.html?.repeatableRegions);
    }
    async function refreshLiveSnapshot() {
      try {
        const response = await fetch("live-summary.json?ts=" + Date.now(), { cache: "no-store" });
        if (!response.ok) return;
        applyLiveSnapshot(await response.json());
      } catch {
        // File-system opens cannot poll live-summary.json. The embedded snapshot remains usable.
      }
    }
    const liveReloadButton = document.getElementById("liveReloadReport");
    liveReloadButton?.addEventListener("click", () => window.location.reload());
    applyLiveSnapshot(readInitialLiveSnapshot());
    liveState.timer = window.setInterval(refreshLiveSnapshot, 1000);
    refreshLiveSnapshot();
  `;
}

function renderHtml(result: ReportResult, options: { liveSnapshot?: LiveReportSnapshot } = {}) {
  const data = JSON.stringify(embeddedReportData(result)).replace(/</g, "\\u003c");
  const liveData = options.liveSnapshot ? JSON.stringify(options.liveSnapshot).replace(/</g, "\\u003c") : undefined;
  const summary = result.summary;
  const outcome = outcomeBreakdown(result);
  const repeatableRegions = uniqueRepeatableRegions(result.stateTable).slice(0, 16);
  const dynamic = options.liveSnapshot?.html;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.liveSnapshot ? "UI 随机探索实时报告" : "UI 随机探索报告"}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #162033;
      --muted: #65758b;
      --line: #d9e2ec;
      --panel: #ffffff;
      --page: #f4f7fb;
      --blue: #2563eb;
      --cyan: #0891b2;
      --green: #16a34a;
      --amber: #d97706;
      --red: #dc2626;
      --violet: #7c3aed;
      --slate: #475569;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(180deg, #eef5ff 0, rgba(238, 245, 255, 0) 320px),
        var(--page);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    main { max-width: 1240px; margin: 0 auto; padding: 28px 20px 56px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 32px; line-height: 1.15; margin-bottom: 10px; }
    h2 { font-size: 21px; margin: 34px 0 14px; }
    h3 { font-size: 16px; margin-bottom: 10px; }
    p { line-height: 1.65; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr);
      gap: 18px;
      align-items: stretch;
    }
    .panel {
      background: rgba(255, 255, 255, .92);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, .06);
    }
    .hero-copy { padding: 24px; }
    .eyebrow { color: var(--blue); font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .live-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin: 12px 0 16px;
      color: var(--muted);
      font-size: 13px;
    }
    .live-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 800;
    }
    .live-status::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green);
    }
    .live-status.stopped::before,
    .live-status.completed::before { background: var(--blue); }
    .live-status.failed::before { background: var(--red); }
    .live-reload {
      height: 32px;
      border: 1px solid #d7deea;
      border-radius: 8px;
      padding: 0 10px;
      background: #fff;
      color: #1f2937;
      cursor: pointer;
      font-size: 13px;
    }
    .subject-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      margin: 14px 0 18px;
      padding: 12px;
      border: 1px solid #dbe4f0;
      border-radius: 8px;
      background: rgba(255, 255, 255, .74);
    }
    .subject-item { min-width: 0; }
    .subject-label { color: var(--muted); font-size: 12px; }
    .subject-value {
      margin-top: 4px;
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      overflow-wrap: anywhere;
    }
    .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .settings-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .meta { padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .meta .label, .metric .label, .chart-label { color: var(--muted); font-size: 12px; }
    .meta .value { margin-top: 6px; font-size: 16px; font-weight: 800; word-break: break-word; }
    .score-panel { padding: 22px; display: grid; place-items: center; text-align: center; }
    .gauge {
      --score: 0deg;
      width: 188px;
      aspect-ratio: 1;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: conic-gradient(var(--blue) var(--score), #dbe7f7 0);
      position: relative;
      margin: 4px auto 18px;
    }
    .gauge::after {
      content: "";
      position: absolute;
      inset: 18px;
      background: #fff;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px #e2e8f0;
    }
    .gauge-value { position: relative; z-index: 1; font-size: 42px; font-weight: 900; }
    .gauge-caption { color: var(--muted); line-height: 1.5; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    .metric { padding: 15px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric .value { font-size: 26px; font-weight: 900; margin: 5px 0; }
    .metric .hint { color: var(--muted); font-size: 12px; line-height: 1.45; }
    .section-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, .72fr); gap: 14px; }
    .chart { padding: 18px; }
    .bars { display: grid; gap: 14px; }
    .bar-row { display: grid; grid-template-columns: 150px 1fr 64px; gap: 10px; align-items: center; }
    .bar {
      height: 12px;
      background: #e7eef8;
      border-radius: 999px;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(148, 163, 184, .28);
    }
    .bar span { display: block; height: 100%; width: 0; background: var(--blue); }
    .bar span.green { background: var(--green); }
    .bar span.amber { background: var(--amber); }
    .bar span.cyan { background: var(--cyan); }
    .bar span.violet { background: var(--violet); }
    .curve-wrap { display: grid; gap: 12px; }
    .curve-card { padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .curve-card svg { width: 100%; height: 142px; display: block; }
    .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 12px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px; }
    .frontier-list { display: grid; gap: 10px; }
    .frontier-item { display: grid; grid-template-columns: 72px 1fr 72px; gap: 10px; align-items: center; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .frontier-id { font-weight: 800; font-size: 12px; }
    .frontier-route { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .issue-scroll {
      max-height: min(720px, 72vh);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding-right: 6px;
    }
    .issue-grid { display: grid; gap: 12px; }
    .issue-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px 14px;
      padding: 14px;
      border: 1px solid #fecaca;
      border-left: 4px solid var(--red);
      border-radius: 8px;
      background: #fffafa;
    }
    .issue-card h3 { margin: 0 0 6px; }
    .issue-card p { margin-bottom: 0; }
    .issue-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      color: #475569;
      font-size: 12px;
    }
    .issue-meta span {
      padding: 4px 7px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid #e5eaf2;
    }
    .issue-actions {
      display: grid;
      gap: 8px;
      align-content: start;
      justify-items: end;
    }
    .issue-actions button,
    .issue-actions a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid #d7deea;
      background: #fff;
      color: #1f2937;
      text-decoration: none;
      font-size: 13px;
      cursor: pointer;
    }
    .issue-actions button {
      background: var(--blue);
      border-color: var(--blue);
      color: #fff;
      font-weight: 800;
    }
    .screenshot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .screenshot-card {
      display: block;
      overflow: hidden;
      border: 1px solid #dbe4f0;
      border-radius: 8px;
      background: #fff;
      text-decoration: none;
      color: inherit;
    }
    .screenshot-card img {
      display: block;
      width: 100%;
      height: 118px;
      object-fit: cover;
      object-position: top;
      background: #f8fafc;
      border-bottom: 1px solid #e5edf7;
    }
    .screenshot-card div {
      padding: 8px 9px;
      font-size: 12px;
      line-height: 1.45;
    }
    .outcome-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    table { width: 100%; border-collapse: collapse; min-width: 760px; }
    th, td { border-bottom: 1px solid #edf2f7; padding: 9px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 800; color: #334155; position: sticky; top: 0; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-weight: 700; font-size: 12px; }
    .notice { padding: 14px 16px; border-left: 4px solid var(--amber); background: #fff7ed; border-radius: 8px; color: #7c2d12; }
    .explain { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .explain .panel { padding: 15px; }
    pre { background: #111827; color: #f8fafc; padding: 14px; border-radius: 8px; overflow: auto; white-space: pre-wrap; }
    .muted { color: var(--muted); }
    .compact { margin-bottom: 0; }
    body.graph-fullscreen-open { overflow: hidden; }
    .graph-workbench {
      margin-top: 14px;
      min-width: 0;
    }
    .graph-workbench.graph-fullscreen {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      gap: 12px;
      margin: 0;
      padding: 16px;
      background: #f4f7fb;
    }
    .graph-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .graph-fullscreen .graph-toolbar { margin-bottom: 0; }
    .graph-toolbar input,
    .graph-toolbar select {
      height: 38px;
      border: 1px solid #d6deea;
      border-radius: 8px;
      background: #fff;
      color: #1f2937;
      padding: 0 12px;
      outline: none;
    }
    .graph-toolbar input { width: min(360px, 100%); }
    .graph-toolbar select { width: 160px; }
    .graph-toolbar button {
      height: 36px;
      border: 1px solid #d7deea;
      border-radius: 8px;
      padding: 0 12px;
      background: #fff;
      color: #1f2937;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    }
    .graph-toolbar button:hover {
      border-color: #b8c7dc;
      background: #f8fbff;
    }
    #graphFullscreen {
      background: var(--blue);
      border-color: var(--blue);
      color: #fff;
      font-weight: 800;
    }
    .graph-selection-pill {
      height: 32px;
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid #9bc2ff;
      background: #eef6ff;
      color: #0f62d6;
      font-size: 12px;
      font-weight: 800;
    }
    .graph-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 14px;
      height: 640px;
      min-height: 0;
      align-items: stretch;
    }
    .graph-fullscreen .graph-layout {
      height: auto;
      min-height: 0;
    }
    .graph-area {
      position: relative;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      border-radius: 10px;
      user-select: none;
      -webkit-user-select: none;
      background:
        radial-gradient(circle, rgba(16, 24, 40, 0.12) 1px, transparent 1px) 0 0 / 22px 22px,
        linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
      box-shadow: inset 0 0 0 1px #edf1f7;
    }
    #stateGraph {
      width: 100%;
      height: 100%;
      min-height: 0;
      display: block;
      cursor: grab;
    }
    #stateGraph:active { cursor: grabbing; }
    .graph-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--muted);
      pointer-events: none;
      text-align: center;
    }
    .graph-zoom {
      position: absolute;
      right: 18px;
      bottom: 14px;
      display: flex;
      align-items: center;
      overflow: hidden;
      border: 1px solid #d8e0eb;
      border-radius: 9px;
      background: #fff;
      box-shadow: 0 8px 22px rgba(16, 24, 40, 0.12);
    }
    .graph-zoom button,
    .graph-zoom span {
      min-width: 42px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .graph-zoom span {
      min-width: 58px;
      border-left: 1px solid #e3e8f0;
      border-right: 1px solid #e3e8f0;
      color: #344054;
      font-size: 13px;
    }
    .graph-side {
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
      overflow: hidden;
    }
    .graph-panel-heading,
    #graphDetails,
    .graph-legend,
    .graph-path-panel {
      border-radius: 10px;
      background: #fff;
      border: 1px solid #e5eaf2;
      box-shadow: 0 14px 34px rgba(16, 24, 40, 0.08);
    }
    .graph-panel-heading {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
    }
    .graph-panel-heading h3,
    .graph-path-panel h3,
    .graph-legend h3 {
      margin: 0;
      font-size: 16px;
    }
    #closeGraphDetails {
      width: 30px;
      height: 30px;
      border: 0;
      padding: 0;
      font-size: 22px;
      color: #667085;
      box-shadow: none;
    }
    #graphDetails {
      overflow: auto;
      padding: 14px;
    }
    .graph-state-title {
      font-weight: 900;
      font-size: 18px;
      margin-bottom: 4px;
      word-break: break-all;
    }
    .graph-state-screenshot {
      display: block;
      margin-top: 12px;
      border: 1px solid #d9e2ee;
      border-radius: 8px;
      overflow: hidden;
      background: #f8fafc;
    }
    .graph-state-screenshot img {
      display: block;
      width: 100%;
      max-height: 190px;
      object-fit: cover;
      object-position: top;
    }
    .graph-detail-list {
      display: grid;
      grid-template-columns: 106px minmax(0, 1fr);
      margin: 12px 0 0;
      font-size: 13px;
      line-height: 1.4;
    }
    .graph-detail-list dt,
    .graph-detail-list dd {
      margin: 0;
      padding: 9px 0;
      border-bottom: 1px solid #edf1f7;
    }
    .graph-detail-list dt { color: #475467; }
    .graph-detail-list dd {
      text-align: right;
      font-weight: 700;
      min-width: 0;
      word-break: break-word;
    }
    .graph-edge-list { margin-top: 14px; }
    .graph-edge-list h3 {
      font-size: 15px;
      margin: 0 0 8px;
    }
    .graph-edge-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 8px;
      padding: 7px 9px;
      margin-top: 6px;
      border: 1px solid #dbe4f0;
      border-radius: 7px;
      font-size: 13px;
    }
    .graph-edge-item code { word-break: break-all; }
    .graph-edge-ladder {
      display: grid;
      grid-template-columns: minmax(0, .7fr) minmax(130px, 1fr) minmax(0, .7fr);
      gap: 8px;
      align-items: stretch;
      margin-top: 14px;
    }
    .graph-ladder-state {
      display: grid;
      place-items: center;
      min-width: 0;
      padding: 10px 8px;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      background: #eff6ff;
      color: #0f62d6;
      font-size: 12px;
      font-weight: 800;
      word-break: break-all;
    }
    .graph-ladder-events {
      display: grid;
      gap: 6px;
      align-content: center;
    }
    .graph-ladder-rung {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      min-height: 30px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #1f2937;
      cursor: default;
      text-align: left;
    }
    .graph-ladder-rung::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 2px solid #94a3b8;
      z-index: 0;
    }
    .graph-ladder-rung span,
    .graph-ladder-rung small {
      position: relative;
      z-index: 1;
      background: #fff;
      padding: 2px 5px;
      border-radius: 999px;
    }
    .graph-legend {
      padding: 14px;
      font-size: 13px;
      color: #475467;
    }
    .graph-legend div {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .graph-legend-dot {
      width: 15px;
      height: 15px;
      border: 2px solid #98a2b3;
      border-radius: 50%;
    }
    .graph-legend-dot.selected {
      border-color: var(--blue);
      box-shadow: inset 0 0 0 3px #fff;
      background: #dbeafe;
    }
    .graph-legend-dot.start {
      border-color: var(--green);
      background: #dcfce7;
    }
    .graph-legend-line {
      width: 18px;
      height: 2px;
      background: #98a2b3;
    }
    .graph-legend-line.path { background: var(--amber); }
    .graph-replay-panel {
      margin-top: 14px;
      padding: 14px 16px;
      border-radius: 10px;
      background: #fff;
      border: 1px solid #e5eaf2;
      box-shadow: 0 14px 34px rgba(16, 24, 40, 0.08);
    }
    .graph-replay-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .graph-replay-controls button {
      height: 34px;
      border: 1px solid #d7deea;
      border-radius: 8px;
      padding: 0 11px;
      background: #fff;
      color: #1f2937;
      cursor: pointer;
    }
    .graph-replay-controls button.primary {
      background: var(--blue);
      border-color: var(--blue);
      color: #fff;
      font-weight: 800;
    }
    .graph-replay-controls button.active {
      background: var(--red);
      border-color: var(--red);
      color: #fff;
    }
    .graph-replay-range {
      flex: 1 1 260px;
      min-width: 180px;
      accent-color: var(--blue);
    }
    .graph-replay-label {
      min-width: 132px;
      color: #334155;
      font-size: 13px;
      font-weight: 800;
      text-align: right;
    }
    .graph-replay-details {
      margin-top: 10px;
      color: #475569;
      font-size: 13px;
      line-height: 1.55;
      word-break: break-word;
    }
    .graph-path-panel {
      margin-top: 14px;
      padding: 14px 16px;
    }
    .graph-fullscreen .graph-path-panel {
      margin-top: 0;
      max-height: 132px;
      overflow: auto;
    }
    .graph-path-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .graph-path-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      font-size: 13px;
    }
    .graph-path-state,
    .graph-path-event {
      padding: 7px 10px;
      border-radius: 8px;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .graph-path-state {
      border: 1px solid #b7d4ff;
      background: #eef6ff;
      color: #0f62d6;
      font-weight: 800;
    }
    .graph-path-event {
      background: #fff7ed;
      color: #c05600;
    }
    .graph-node rect {
      fill: #fbfdff;
      stroke: #c8d5e6;
      stroke-width: 2;
      filter: drop-shadow(0 5px 10px rgba(16, 24, 40, 0.12));
    }
    .graph-node text {
      font-size: 12px;
      font-weight: 800;
      fill: #111827;
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .graph-node .graph-node-subtitle {
      font-size: 11px;
      font-weight: 600;
      fill: #667085;
    }
    .graph-node.selected rect {
      fill: #e7f1ff;
      stroke: var(--blue);
      stroke-width: 3;
    }
    .graph-node.start rect {
      fill: #ecfdf3;
      stroke: var(--green);
      stroke-width: 3;
    }
    .graph-node.replay rect {
      fill: #fef2f2;
      stroke: var(--red);
      stroke-width: 3;
    }
    .graph-node.path rect {
      fill: #eaf4ff;
      stroke: var(--blue);
    }
    .graph-node.connected rect {
      fill: #f8fbff;
      stroke: #8aa0bd;
      stroke-width: 2.4;
    }
    .graph-node-dot {
      fill: #ffffff;
      stroke: #64748b;
      stroke-width: 1.8;
      cursor: pointer;
      filter: drop-shadow(0 2px 4px rgba(15, 23, 42, .12));
    }
    .graph-node-dot.selected {
      fill: #eff6ff;
      stroke: var(--blue);
      stroke-width: 2.5;
    }
    .graph-node-dot.path {
      fill: #fffbeb;
      stroke: var(--amber);
      stroke-width: 2.2;
    }
    .graph-node-dot.start {
      fill: #dcfce7;
      stroke: var(--green);
      stroke-width: 2.6;
    }
    .graph-node-dot.replay {
      fill: var(--red);
      stroke: #fff;
      stroke-width: 2.6;
    }
    .graph-branch-label {
      fill: #334155;
      font-size: 13px;
      font-weight: 800;
      paint-order: stroke;
      stroke: #fff;
      stroke-width: 6px;
      stroke-linejoin: round;
      text-anchor: middle;
      pointer-events: none;
    }
    .graph-node.dimmed { opacity: 0.2; }
    .graph-edge {
      fill: none;
      pointer-events: none;
      stroke: #64748b;
      stroke-width: 1.8;
      marker-end: url(#graph-arrow);
    }
    .graph-edge.cross {
      stroke: #cbd5e1;
      stroke-width: 1.3;
      stroke-dasharray: 7 6;
      marker-end: url(#graph-arrow-cross);
    }
    .graph-edge.path {
      stroke: var(--amber);
      stroke-width: 3;
      stroke-dasharray: none;
      marker-end: url(#graph-arrow-path);
    }
    .graph-edge.connected {
      stroke: var(--amber);
      stroke-width: 2.6;
      marker-end: url(#graph-arrow-path);
    }
    .graph-edge.selected {
      stroke: var(--blue);
      stroke-width: 3;
      stroke-dasharray: none;
      marker-end: url(#graph-arrow-selected);
    }
    .graph-edge.replay {
      stroke: var(--red);
      stroke-width: 3.2;
      stroke-dasharray: none;
      opacity: 1;
      marker-end: url(#graph-arrow-replay);
    }
    .graph-edge.dimmed { opacity: 0.16; }
    .graph-edge-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 14;
      cursor: pointer;
    }
    .graph-edge-label {
      display: none;
      font-size: 12px;
      fill: #1f2937;
      paint-order: stroke;
      stroke: #fff;
      stroke-width: 5px;
      stroke-linejoin: round;
      pointer-events: none;
    }
    .graph-edge-label.selected { display: block; }
    @media (max-width: 960px) {
      .hero, .section-grid, .split, .explain, .graph-layout { grid-template-columns: 1fr; }
      .subject-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cards, .meta-grid, .settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .outcome-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bar-row { grid-template-columns: 118px 1fr 54px; }
      .graph-layout { height: auto; }
      .graph-area { height: 620px; }
      .graph-side {
        height: auto;
        grid-template-rows: auto auto auto;
      }
      .graph-fullscreen .graph-layout {
        height: auto;
        overflow: auto;
      }
    }
    @media (max-width: 560px) {
      main { padding-inline: 12px; }
      .subject-strip { grid-template-columns: 1fr; }
      .cards, .meta-grid, .settings-grid { grid-template-columns: 1fr; }
      .outcome-cards { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Coverage-Guided UI Random Explorer</div>
        <h1>${options.liveSnapshot ? "通用 UI 随机探索实时报告" : "通用 UI 随机探索报告"}</h1>
        ${
          options.liveSnapshot
            ? `<div class="live-strip">
          <span id="liveStatus" class="live-status">运行中</span>
          <span id="liveUpdatedAt">等待实时区刷新</span>
          <span id="liveRevision">revision 0</span>
          <button id="liveReloadReport" class="live-reload" type="button">更新完整报告</button>
        </div>`
            : ""
        }
        <p class="muted">${
          options.liveSnapshot
            ? "这份报告保持完整报告结构。结果指标、异常、覆盖进度、探索曲线和可重复组件信息会实时刷新；状态图和测试环境等完整报告内容通过“更新完整报告”或测试结束后的最终文件查看。"
            : "这份报告优先回答本次随机探索测到了多少、哪些状态被发现、有没有异常、覆盖程度如何。配置和实现口径放在报告后部，避免干扰结果判断。"
        }</p>
        <div id="liveTestedObject">${dynamic?.testedObject ?? testedObjectStrip(result)}</div>
        <div id="liveHeroMetrics">${dynamic?.heroMetrics ?? heroMetrics(result, outcome)}</div>
      </div>
      <div class="panel score-panel">
        <div id="liveScore">${dynamic?.score ?? scorePanelContent(summary)}</div>
      </div>
    </section>

    <section id="liveCards" class="cards">
      ${dynamic?.cards ?? summaryCards(result)}
    </section>

    <h2>状态图</h2>
    <section class="graph-workbench">
      <div class="graph-toolbar">
        <input id="graphStateSearch" type="search" placeholder="搜索状态或路径，例如 S- 或 /tasks" />
        <select id="graphEventFilter" aria-label="过滤事件">
          <option value="">全部事件</option>
        </select>
        <button id="graphFitView" type="button">适配视图</button>
        <button id="graphFullscreen" type="button">全屏</button>
        <button id="graphClearSelection" type="button">清空选择</button>
        <span class="graph-selection-pill" id="graphSelectionPill">已选中 0/2</span>
      </div>
      <div class="graph-layout">
        <section class="graph-area">
          <svg id="stateGraph" role="img" aria-label="UI 随机探索状态图"></svg>
          <div id="graphEmpty" class="graph-empty"></div>
          <div class="graph-zoom">
            <button id="graphZoomOut" type="button" aria-label="缩小">−</button>
            <span id="graphZoomValue">100%</span>
            <button id="graphZoomIn" type="button" aria-label="放大">＋</button>
          </div>
        </section>
        <aside class="graph-side">
          <div class="graph-panel-heading">
            <h3>状态详情</h3>
            <button id="closeGraphDetails" type="button" aria-label="关闭详情">×</button>
          </div>
          <div id="graphDetails"></div>
          <div class="graph-legend">
            <h3>图例</h3>
            <div><span class="graph-legend-dot start"></span>起点状态</div>
            <div><span class="graph-legend-dot"></span>未选中状态</div>
            <div><span class="graph-legend-dot selected"></span>已选中状态</div>
            <div><span class="graph-legend-line"></span>事件转移</div>
            <div><span class="graph-legend-line path"></span>最短路径</div>
          </div>
        </aside>
      </div>
      <div class="graph-replay-panel">
        <div class="graph-path-header">
          <h3>探索路径回放</h3>
          <span class="muted">按实际执行步骤依次高亮状态和转移</span>
        </div>
        <div class="graph-replay-controls">
          <button id="graphReplayPrev" type="button">上一步</button>
          <button id="graphReplayPlay" class="primary" type="button">回放</button>
          <button id="graphReplayNext" type="button">下一步</button>
          <button id="graphReplayClear" type="button">退出回放</button>
          <input id="graphReplayRange" class="graph-replay-range" type="range" min="0" max="0" value="0" />
          <span id="graphReplayLabel" class="graph-replay-label">0 / 0</span>
        </div>
        <div id="graphReplayDetails" class="graph-replay-details"></div>
      </div>
      <div class="graph-path-panel">
        <div class="graph-path-header">
          <h3>最短路径</h3>
          <span class="muted">基于本次已记录的状态转移计算</span>
        </div>
        <div id="graphPathDetails"></div>
      </div>
    </section>

    <h2>异常情况</h2>
    <div id="liveIssues">${dynamic?.issues ?? issueOverviewSection(result)}</div>

    <div id="liveCoverage">${dynamic?.coverage ?? coverageProgressSection(result)}</div>
    <div id="liveCurves">${dynamic?.curves ?? explorationCurveSection(result)}</div>

    <div id="liveRepeatableExploration">${dynamic?.repeatableExploration ?? repeatableRegionExplorationSection(result)}</div>
    <div id="liveRepeatableRegions">${dynamic?.repeatableRegions ?? repeatableRegionSection(repeatableRegions)}</div>

    <h2>测试环境与复现</h2>
    ${environmentSection(result)}
    <h3 style="margin-top: 18px">复现命令</h3>
    <pre>${escapeHtml(result.replayCommand)}</pre>
    <script type="application/json" id="ui-explorer-result">${data}</script>
    <script>${graphClientScript()}</script>
    ${liveData ? `<script type="application/json" id="live-initial">${liveData}</script><script>${liveReportClientScript()}</script>` : ""}
  </main>
</body>
</html>`;
}

function renderRepeatableRegionHtml(result: ReportResult) {
  const exploration = result.repeatableRegionExploration;
  const summary = exploration?.summary;
  const data = JSON.stringify(exploration ?? {}).replace(/</g, "\\u003c");
  const objects = exploration?.objects ?? [];
  const eventRows = objects.flatMap((object) =>
    object.events.slice(0, 20).map((event) => ({
      object,
      event,
    })),
  );

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>可重复组件局部测试报告</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #162033;
      --muted: #65758b;
      --line: #d9e2ec;
      --panel: #ffffff;
      --page: #f4f7fb;
      --blue: #2563eb;
      --cyan: #0891b2;
      --green: #16a34a;
      --amber: #d97706;
      --red: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--page);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 44px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(28px, 4vw, 44px); letter-spacing: 0; }
    h2 { margin: 28px 0 12px; font-size: 22px; }
    h3 { font-size: 16px; margin-bottom: 10px; }
    .muted { color: var(--muted); }
    .compact { font-size: 14px; }
    .hero, .cards, .split { display: grid; gap: 14px; }
    .hero { grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.75fr); align-items: stretch; }
    .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .panel, .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 16px 36px rgba(30, 41, 59, 0.05);
    }
    .panel { padding: 18px; }
    .metric { padding: 16px; }
    .label, .hint { color: var(--muted); font-size: 13px; }
    .value { font-size: 30px; font-weight: 800; color: #0f172a; line-height: 1.1; }
    .hero-copy { display: grid; gap: 16px; }
    .eyebrow { color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      width: max-content;
      border-radius: 999px;
      padding: 6px 10px;
      font-weight: 700;
      background: #e0f2fe;
      color: #075985;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 700; white-space: nowrap; }
    code, pre { font-family: "SFMono-Regular", Consolas, monospace; }
    code { color: #334155; }
    pre { overflow-x: auto; background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 8px; font-size: 12px; }
    .notice { border-left: 4px solid var(--amber); padding: 12px 14px; background: #fff7ed; color: #7c2d12; border-radius: 6px; }
    .severity-severe { color: var(--red); font-weight: 800; }
    .severity-ordinary { color: var(--amber); font-weight: 700; }
    @media (max-width: 900px) {
      .hero, .split { grid-template-columns: 1fr; }
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      main { padding-inline: 12px; }
      .cards { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Repeatable Region Explorer</div>
        <h1>可重复组件局部测试报告</h1>
        <p class="muted">这份报告只覆盖状态探索阶段识别出的可重复组件，并把事件限制在组件 DOM 作用域内。它不展示状态图，因为这里关注的是局部组件稳定性和边界逃逸，而不是全局状态空间拓扑。</p>
        <div class="status-pill">${escapeHtml(summary ? "已执行" : "无专项测试数据")}</div>
      </div>
      <div class="panel">
        <h3>局部测试结论</h3>
        <p class="compact muted">测试对象：${escapeHtml(String(summary?.testObjectCount ?? 0))}</p>
        <p class="compact muted">已测对象：${escapeHtml(String(summary?.testedObjectCount ?? 0))}</p>
        <p class="compact muted">严重失败：${escapeHtml(String(summary?.severeFailureCount ?? 0))}</p>
      </div>
    </section>

    <section class="cards" style="margin-top: 14px">
      ${metric("测试对象", summary?.testObjectCount ?? 0, "去重后的可重复组件测试对象")}
      ${metric("已测对象", summary?.testedObjectCount ?? 0, "成功恢复并执行过事件的对象")}
      ${metric("执行事件", summary?.executedSteps ?? 0, "组件作用域内执行的事件数量")}
      ${metric("严重失败", summary?.severeFailureCount ?? 0, "pageerror 或白屏等严重问题")}
      ${metric("候选覆盖", percent(summary?.candidateEventCoverage ?? 0), `${summary?.testedCandidateEventCount ?? 0} / ${summary?.discoveredCandidateEventCount ?? 0}`)}
      ${metric("无变化比例", percent(summary?.noChangeRate ?? 0), "执行后全局归一化状态未变化")}
      ${metric("离开组件", summary?.leftRegionCount ?? 0, "事件后目标区域不可见或发生路径逃逸")}
      ${metric("运行异常", summary?.runtimeErrorCount ?? 0, "普通异常会记录，不一定 fail")}
    </section>

    <h2>测试对象</h2>
    <section class="panel">
      ${repeatableObjectTable(objects)}
    </section>

    <h2>事件样本</h2>
    <section class="panel">
      ${repeatableEventTable(eventRows)}
    </section>

    <h2>边界说明</h2>
    <section class="split">
      <div class="panel">
        <h3>为什么没有状态图</h3>
        <p class="muted compact">第二阶段不是全局状态发现，而是在已知可重复区域内验证局部事件。状态图会暗示全局路径覆盖，和这里的测试目标不一致。</p>
      </div>
      <div class="panel">
        <h3>层级组件如何去重</h3>
        <p class="muted compact">目标、指标、任务、子任务只有在 DOM 中形成不同的可重复区域时才会成为独立测试对象；同一作用域内的多个实例不会重复展开。</p>
      </div>
    </section>

    <h2>关联设置</h2>
    <section class="panel">
      <p class="compact muted">种子：${escapeHtml(result.seed)}</p>
      <p class="compact muted">主流程步数：${escapeHtml(`${result.summary.executedSteps} / ${result.summary.totalSteps}`)}</p>
      <p class="compact muted">状态抽象：${escapeHtml(result.config.stateAbstractor)}</p>
    </section>

    <h3 style="margin-top: 18px">复现命令</h3>
    <pre>${escapeHtml(exploration?.replayCommand ?? result.replayCommand)}</pre>
    <script type="application/json" id="repeatable-region-result">${data}</script>
  </main>
</body>
</html>`;
}

function graphClientScript() {
  return `var __name = typeof __name === "function" ? __name : function(value) { return value; };(${reportGraphClient.toString()})();`;
}

type ReportGraphPayload = {
  seed?: string;
  states?: ReportGraphState[];
  transitions?: ReportGraphTransition[];
  replaySteps?: ReportGraphReplayStep[];
  screenshots?: Array<{
    id?: string;
    kind?: string;
    path?: string;
    stateId?: string;
    routePattern?: string;
    step?: number;
    issueType?: string;
    severity?: string;
  }>;
};

type ReportGraphReplayStep = {
  step?: number;
  beforeStateId?: string;
  afterStateId?: string;
  eventSignature?: string;
  operation?: string;
  targetSignature?: string;
  targetLabel?: string;
  eventLabel?: string;
  newState?: boolean;
  newTransition?: boolean;
  noChange?: boolean;
  routeEscape?: boolean;
  issueCount?: number;
};

type ReportGraphState = {
  id: string;
  routePattern?: string;
  screenshot?: string;
  repeatableRegions?: Array<{
    kind?: string;
    businessTags?: string[];
    hierarchyLayers?: string[];
    presence?: string;
  }>;
  visits?: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  candidateCount?: number;
  testedCandidateCount?: number;
  untestedCandidateCount?: number;
  noChangeCount?: number;
  newStateOutCount?: number;
  errorCount?: number;
};

type ReportGraphTransition = {
  fromStateId?: string;
  toStateId?: string;
  eventSignature?: string;
  targetSignature?: string;
  targetLabel?: string;
  eventLabel?: string;
  count?: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  reward?: number;
};

type ReportGraphEdge = {
  from: string;
  to: string;
  events: ReportGraphEvent[];
  count: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  reward?: number;
  operation: string;
  _key: string;
};

type ReportGraphEvent = {
  eventSignature: string;
  count?: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  reward?: number;
  operation: string;
  targetSignature?: string;
  targetLabel?: string;
  eventLabel?: string;
  _key: string;
};

type ReportGraphPoint = {
  x: number;
  y: number;
  depth: number;
  unreachable: boolean;
  angle: number;
};

type ReportGraphPath = {
  from: string;
  to: string;
  states: string[];
  edges: ReportGraphEdge[];
  found: boolean;
};

function reportGraphClient() {
  const dataElement = document.getElementById("ui-explorer-result") as HTMLScriptElement;
  const workbench = document.querySelector(".graph-workbench") as HTMLElement;
  const graph = document.getElementById("stateGraph") as unknown as SVGSVGElement;
  const graphEmpty = document.getElementById("graphEmpty") as HTMLElement;
  const details = document.getElementById("graphDetails") as HTMLElement;
  const pathDetails = document.getElementById("graphPathDetails") as HTMLElement;
  const stateSearch = document.getElementById("graphStateSearch") as HTMLInputElement | null;
  const eventFilter = document.getElementById("graphEventFilter") as HTMLSelectElement | null;
  const selectionPill = document.getElementById("graphSelectionPill") as HTMLElement | null;
  const zoomValue = document.getElementById("graphZoomValue") as HTMLElement | null;
  const fitViewButton = document.getElementById("graphFitView") as HTMLButtonElement | null;
  const fullscreenButton = document.getElementById("graphFullscreen") as HTMLButtonElement | null;
  const clearSelectionButton = document.getElementById("graphClearSelection") as HTMLButtonElement | null;
  const zoomInButton = document.getElementById("graphZoomIn") as HTMLButtonElement | null;
  const zoomOutButton = document.getElementById("graphZoomOut") as HTMLButtonElement | null;
  const closeDetailsButton = document.getElementById("closeGraphDetails") as HTMLButtonElement | null;
  const replayPrevButton = document.getElementById("graphReplayPrev") as HTMLButtonElement | null;
  const replayPlayButton = document.getElementById("graphReplayPlay") as HTMLButtonElement | null;
  const replayNextButton = document.getElementById("graphReplayNext") as HTMLButtonElement | null;
  const replayClearButton = document.getElementById("graphReplayClear") as HTMLButtonElement | null;
  const replayRange = document.getElementById("graphReplayRange") as HTMLInputElement | null;
  const replayLabel = document.getElementById("graphReplayLabel") as HTMLElement | null;
  const replayDetails = document.getElementById("graphReplayDetails") as HTMLElement | null;

  if (!dataElement || !workbench || !graph || !graphEmpty || !details || !pathDetails) {
    return;
  }

  let payload: ReportGraphPayload = {};
  try {
    payload = JSON.parse(dataElement.textContent || "{}") as ReportGraphPayload;
  } catch {
    graphEmpty.textContent = "报告数据解析失败。";
    return;
  }

  const operationLabels: Record<string, string> = {
    click: "点击",
    doubleClick: "双击",
    hover: "悬停",
    focus: "聚焦",
    insertText: "输入文本",
    pasteText: "粘贴文本",
    clear: "清空",
    pressKey: "按键",
    modifiedKey: "组合键",
    selectOption: "选择选项",
    wheel: "滚轮",
    backgroundClick: "背景点击",
    refresh: "刷新",
    back: "后退",
    wait: "等待",
    repeatedClick: "连续点击",
  };
  const svgNS = "http://www.w3.org/2000/svg";
  const nodeWidth = 108;
  const nodeHeight = 58;
  const states: ReportGraphState[] = Array.isArray(payload.states)
    ? payload.states.slice().sort((left, right) => {
        return (
          (left.firstSeenStep ?? 0) - (right.firstSeenStep ?? 0) ||
          String(left.id ?? "").localeCompare(String(right.id ?? ""))
        );
      })
    : [];
  const rawEdges: Array<ReportGraphEvent & { from: string; to: string }> = Array.isArray(payload.transitions)
    ? payload.transitions.map((edge, index) => ({
        from: String(edge.fromStateId ?? ""),
        to: String(edge.toStateId ?? ""),
        eventSignature: String(edge.eventSignature ?? ""),
        targetSignature: edge.targetSignature,
        targetLabel: edge.targetLabel,
        eventLabel: edge.eventLabel,
        count: edge.count,
        firstSeenStep: edge.firstSeenStep,
        lastSeenStep: edge.lastSeenStep,
        reward: edge.reward,
        operation: operationOf(edge.eventSignature),
        _key: [index, edge.fromStateId ?? "", edge.toStateId ?? "", edge.eventSignature ?? ""].join("::"),
      }))
    : [];
  const edges: ReportGraphEdge[] = aggregateGraphEdges(rawEdges);
  const rootStateId = states[0]?.id ?? "";
  const replaySteps: ReportGraphReplayStep[] = Array.isArray(payload.replaySteps)
    ? payload.replaySteps
        .filter((step) => step.beforeStateId && step.afterStateId)
        .sort((left, right) => (left.step ?? 0) - (right.step ?? 0))
    : [];

  let positions = new Map<string, ReportGraphPoint>();
  let selected: string[] = [];
  let hovered: string | null = null;
  let selectedEdge: string | null = null;
  let replayIndex = -1;
  let replayTimer: number | null = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let isPanning = false;
  let panStart: { x: number; y: number } | null = null;

  function operationOf(signature?: string) {
    const value = String(signature || "");
    return value.includes(":") ? value.split(":")[0] : value || "event";
  }

  function operationLabel(operation: string) {
    return operationLabels[operation] || operation;
  }

  function edgeDisplayLabel(edge: ReportGraphEdge) {
    if (edge.events.length === 1) {
      return eventDisplayLabel(edge.events[0]);
    }
    const targetLabels = uniqueText(edge.events.map((event) => event.targetLabel).filter(Boolean) as string[]);
    if (targetLabels.length > 0) {
      const suffix = targetLabels.length > 2 ? "等" : "";
      return `${edge.events.length} 个事件：${targetLabels.slice(0, 2).join("、")}${suffix}`;
    }
    return `${edge.events.length} 个事件`;
  }

  function eventDisplayLabel(event: Pick<ReportGraphEvent, "operation" | "targetLabel" | "eventLabel">) {
    if (event.eventLabel) {
      return event.eventLabel;
    }
    const operation = operationLabel(event.operation);
    return event.targetLabel ? `${operation}：${event.targetLabel}` : operation;
  }

  function edgeDisplayTitle(edge: ReportGraphEdge) {
    return edge.events.map((event) => `${eventDisplayLabel(event)}\n${event.eventSignature}`).join("\n\n");
  }

  function uniqueText(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function edgeVisibleEvents(edge: ReportGraphEdge) {
    const operation = String(eventFilter?.value || "");
    return operation ? edge.events.filter((event) => event.operation === operation) : edge.events;
  }

  function escapeHtmlLocal(value: unknown) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function truncate(value: unknown, limit: number) {
    const text = String(value ?? "");
    return text.length > limit ? text.slice(0, limit) + "..." : text;
  }

  function hashText(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return hash;
  }

  function stateById(id: string) {
    return states.find((state) => state.id === id);
  }

  function routeBranchKey(state: ReportGraphState) {
    const route = String(state.routePattern || "/");
    const parts = route.split("/").filter(Boolean);
    if (parts.length === 0) {
      return "/";
    }
    if ((parts[0] === "objectives" || parts[0] === "feedback") && parts.length > 1) {
      return `/${parts[0]}/detail`;
    }
    return `/${parts[0]}`;
  }

  function stateSemanticKey(state: ReportGraphState) {
    const regions = Array.isArray(state.repeatableRegions) ? state.repeatableRegions : [];
    const tags = Array.from(new Set(regions.flatMap((region) => region.businessTags || []))).sort();
    const layers = Array.from(new Set(regions.flatMap((region) => region.hierarchyLayers || []))).sort();
    const kinds = Array.from(new Set(regions.map((region) => region.kind).filter(Boolean))).sort();
    return [routeBranchKey(state), tags.join("."), layers.join("."), kinds.join(".")].filter(Boolean).join("|");
  }

  function branchLabel(key: string) {
    if (key === "/") {
      return "入口";
    }
    return key.replace("/detail", "/详情");
  }

  function edgeKey(edge: ReportGraphEdge) {
    return edge._key;
  }

  function replayStepEdgeKey(step: ReportGraphReplayStep | null) {
    if (!step?.beforeStateId || !step.afterStateId) {
      return "";
    }
    return `${step.beforeStateId}->${step.afterStateId}`;
  }

  function currentReplayStep() {
    if (replayIndex < 0 || replayIndex >= replaySteps.length) {
      return null;
    }
    return replaySteps[replayIndex];
  }

  function stopReplay() {
    if (replayTimer !== null) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    renderReplay();
  }

  function clearReplay() {
    if (replayTimer !== null) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    replayIndex = -1;
    render();
  }

  function setReplayIndex(index: number, shouldRender = true) {
    if (replaySteps.length === 0) {
      replayIndex = -1;
    } else {
      replayIndex = Math.max(0, Math.min(replaySteps.length - 1, index));
    }
    if (shouldRender) {
      render();
    } else {
      renderReplay();
    }
  }

  function advanceReplay(delta: number) {
    stopReplay();
    setReplayIndex(replayIndex < 0 ? 0 : replayIndex + delta);
  }

  function showReplayStepByStepNumber(stepNumber: number) {
    const index = replaySteps.findIndex((step) => Number(step.step) === stepNumber);
    if (index < 0) {
      return;
    }
    selected = [];
    selectedEdge = null;
    hovered = null;
    if (replayTimer !== null) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    replayIndex = index;
    workbench.scrollIntoView({ behavior: "smooth", block: "start" });
    render();
  }

  function toggleReplay() {
    if (replaySteps.length === 0) {
      renderReplay();
      return;
    }
    if (replayTimer !== null) {
      stopReplay();
      return;
    }
    if (replayIndex < 0 || replayIndex >= replaySteps.length - 1) {
      replayIndex = 0;
    }
    replayTimer = window.setInterval(() => {
      if (replayIndex >= replaySteps.length - 1) {
        stopReplay();
        return;
      }
      setReplayIndex(replayIndex + 1);
    }, 900);
    renderReplay();
    render();
  }

  function aggregateGraphEdges(items: Array<ReportGraphEvent & { from: string; to: string }>) {
    const byPair = new Map<string, ReportGraphEdge>();
    for (const item of items) {
      const key = `${item.from}->${item.to}`;
      const existing = byPair.get(key);
      const event = {
        eventSignature: item.eventSignature,
        count: item.count,
        firstSeenStep: item.firstSeenStep,
        lastSeenStep: item.lastSeenStep,
        reward: item.reward,
        operation: item.operation,
        targetSignature: item.targetSignature,
        targetLabel: item.targetLabel,
        eventLabel: item.eventLabel,
        _key: item._key,
      };
      if (!existing) {
        byPair.set(key, {
          from: item.from,
          to: item.to,
          events: [event],
          count: item.count ?? 0,
          firstSeenStep: item.firstSeenStep,
          lastSeenStep: item.lastSeenStep,
          reward: item.reward,
          operation: item.operation,
          _key: key,
        });
        continue;
      }
      existing.events.push(event);
      existing.count += item.count ?? 0;
      existing.firstSeenStep = Math.min(existing.firstSeenStep ?? Number.MAX_SAFE_INTEGER, item.firstSeenStep ?? Number.MAX_SAFE_INTEGER);
      existing.lastSeenStep = Math.max(existing.lastSeenStep ?? 0, item.lastSeenStep ?? 0);
      existing.reward = Math.max(existing.reward ?? Number.NEGATIVE_INFINITY, item.reward ?? Number.NEGATIVE_INFINITY);
      existing.operation = existing.events.length > 1 ? "multi" : existing.operation;
    }
    return Array.from(byPair.values()).sort(
      (left, right) =>
        (left.firstSeenStep ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenStep ?? Number.MAX_SAFE_INTEGER) ||
        left._key.localeCompare(right._key),
    );
  }

  function clearSvg() {
    while (graph.firstChild) {
      graph.removeChild(graph.firstChild);
    }
  }

  function svgElement(tag: string, attrs: Record<string, string | number> = {}) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function filteredStateIds() {
    const term = searchTerm();
    if (!term) {
      return new Set(states.map((state) => state.id));
    }
    return new Set(
      states
        .filter((state) => `${state.id ?? ""} ${state.routePattern ?? ""}`.toLowerCase().includes(term))
        .map((state) => state.id),
    );
  }

  function searchTerm() {
    return String(stateSearch?.value || "").trim().toLowerCase();
  }

  function filteredEdges() {
    const operation = String(eventFilter?.value || "");
    const visibleStates = filteredStateIds();
    return edges.filter(
      (edge) =>
        visibleStates.has(edge.from) &&
        visibleStates.has(edge.to) &&
        (!operation || edge.events.some((event) => event.operation === operation)),
    );
  }

  function buildAdjacency(includeSelfLoops: boolean) {
    const adjacency = new Map<string, ReportGraphEdge[]>();
    for (const edge of edges) {
      if (!includeSelfLoops && edge.from === edge.to) {
        continue;
      }
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, []);
      }
      adjacency.get(edge.from)!.push(edge);
    }
    for (const list of adjacency.values()) {
      list.sort((left, right) => {
        const leftState = stateById(left.to);
        const rightState = stateById(right.to);
        return (
          (leftState?.firstSeenStep ?? Number.MAX_SAFE_INTEGER) -
            (rightState?.firstSeenStep ?? Number.MAX_SAFE_INTEGER) ||
          String(left.to).localeCompare(String(right.to))
        );
      });
    }
    return adjacency;
  }

  function discoveryTreeEdgeKeys() {
    const treeEdges = new Set<string>();
    const incoming = new Set<string>();
    const sortedEdges = edges
      .filter((edge) => edge.from !== edge.to)
      .slice()
      .sort(
        (left, right) =>
          (left.firstSeenStep ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenStep ?? Number.MAX_SAFE_INTEGER) ||
          String(left.to).localeCompare(String(right.to)),
      );

    for (const edge of sortedEdges) {
      if (incoming.has(edge.to)) {
        continue;
      }
      incoming.add(edge.to);
      treeEdges.add(edgeKey(edge));
    }
    return treeEdges;
  }

  function layoutStates() {
    positions = new Map<string, ReportGraphPoint>();
    if (!states.length) {
      return;
    }

    const root = states[0].id;
    const graphDepth = new Map<string, number>();
    const adjacency = buildAdjacency(false);
    const queue = [root];
    graphDepth.set(root, 0);

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      for (const edge of adjacency.get(current) || []) {
        if (graphDepth.has(edge.to)) {
          continue;
        }
        graphDepth.set(edge.to, (graphDepth.get(current) || 0) + 1);
        queue.push(edge.to);
      }
    }

    const branchGroups = new Map<string, ReportGraphState[]>();
    for (const state of states) {
      if (state.id === root) {
        continue;
      }
      const key = routeBranchKey(state);
      branchGroups.set(key, [...(branchGroups.get(key) || []), state]);
    }
    positions.set(root, { x: 0, y: 0, depth: 0, unreachable: false, angle: -Math.PI / 2 });

    function stateSort(left: ReportGraphState, right: ReportGraphState) {
      return (
        (left.firstSeenStep ?? 0) - (right.firstSeenStep ?? 0) ||
        String(left.id ?? "").localeCompare(String(right.id ?? ""))
      );
    }

    const sortedBranches = Array.from(branchGroups.entries()).sort((left, right) => {
      const leftFirst = Math.min(...left[1].map((state) => state.firstSeenStep ?? Number.MAX_SAFE_INTEGER));
      const rightFirst = Math.min(...right[1].map((state) => state.firstSeenStep ?? Number.MAX_SAFE_INTEGER));
      return leftFirst - rightFirst || left[0].localeCompare(right[0]);
    });
    const branchCount = Math.max(1, sortedBranches.length);
    const startAngle = -Math.PI / 2;
    const branchAngleStep = (Math.PI * 2) / branchCount;

    sortedBranches.forEach(([branchKey, branchStates], branchIndex) => {
      const angle = startAngle + branchIndex * branchAngleStep;
      const semanticGroups = new Map<string, ReportGraphState[]>();
      for (const state of branchStates) {
        const key = stateSemanticKey(state) || branchKey;
        semanticGroups.set(key, [...(semanticGroups.get(key) || []), state]);
      }
      const sortedSemanticGroups = Array.from(semanticGroups.entries()).sort((left, right) => {
        const leftFirst = Math.min(...left[1].map((state) => state.firstSeenStep ?? Number.MAX_SAFE_INTEGER));
        const rightFirst = Math.min(...right[1].map((state) => state.firstSeenStep ?? Number.MAX_SAFE_INTEGER));
        return leftFirst - rightFirst || left[0].localeCompare(right[0]);
      });
      const sector = Math.min(branchAngleStep * 0.72, Math.PI / 3);
      sortedSemanticGroups.forEach(([semanticKey, semanticStates], semanticIndex) => {
        const groupOffset =
          sortedSemanticGroups.length <= 1 ? 0 : (semanticIndex / (sortedSemanticGroups.length - 1) - 0.5) * sector;
        const groupAngle = angle + groupOffset;
        const dir = { x: Math.cos(groupAngle), y: Math.sin(groupAngle) };
        const normal = { x: -Math.sin(groupAngle), y: Math.cos(groupAngle) };
        const sortedStates = semanticStates.slice().sort(stateSort);
        const laneCount = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(sortedStates.length / 2))));
        const baseRadius = 230 + semanticIndex * 18;
        const branchSpacing = states.length > 500 ? 68 : 92;
        const laneSpacing = states.length > 500 ? 44 : 68;
        sortedStates.forEach((state, index) => {
          const segment = Math.floor(index / laneCount);
          const lane = index % laneCount;
          const centeredLane = lane - (laneCount - 1) / 2;
          const semanticOffset = Math.abs(hashText(semanticKey)) % 3;
          const distance = baseRadius + segment * branchSpacing + semanticOffset * 12;
          positions.set(state.id, {
            x: dir.x * distance + normal.x * centeredLane * laneSpacing,
            y: dir.y * distance + normal.y * centeredLane * laneSpacing,
            depth: graphDepth.get(state.id) ?? segment + 1,
            unreachable: !graphDepth.has(state.id),
            angle: groupAngle,
          });
        });
      });
    });
  }

  function graphViewportSize() {
    return {
      width: Math.max(graph.clientWidth || 900, 900),
      height: Math.max(graph.clientHeight || 560, 560),
    };
  }

  function fitToView() {
    if (!positions.size) {
      transform = { x: 0, y: 0, scale: 1 };
      return;
    }
    const size = graphViewportSize();
    const points = Array.from(positions.values());
    const minX = Math.min(...points.map((point) => point.x - nodeWidth / 2));
    const maxX = Math.max(...points.map((point) => point.x + nodeWidth / 2));
    const minY = Math.min(...points.map((point) => point.y - nodeHeight / 2));
    const maxY = Math.max(...points.map((point) => point.y + nodeHeight / 2));
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const scale = Math.min(1.1, Math.max(0.02, Math.min((size.width - 80) / graphWidth, (size.height - 80) / graphHeight)));
    transform = {
      x: size.width / 2 - (minX + graphWidth / 2) * scale,
      y: size.height / 2 - (minY + graphHeight / 2) * scale,
      scale,
    };
  }

  function setZoom(nextScale: number) {
    transform.scale = Math.min(2.5, Math.max(0.02, nextScale));
    render();
  }

  function boundaryPoint(from: ReportGraphPoint, to: ReportGraphPoint) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) {
      return { x: from.x, y: from.y };
    }
    const halfW = nodeWidth / 2;
    const halfH = nodeHeight / 2;
    const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    return {
      x: from.x + dx * scale,
      y: from.y + dy * scale,
    };
  }

  function edgeParallelOffset(edge: ReportGraphEdge) {
    const pairKey = edge.from === edge.to ? `${edge.from}::loop` : [edge.from, edge.to].sort().join("::");
    const siblings = edges.filter((item) => {
      const itemKey = item.from === item.to ? `${item.from}::loop` : [item.from, item.to].sort().join("::");
      return itemKey === pairKey;
    });
    if (siblings.length <= 1) {
      return 0;
    }
    const index = siblings.findIndex((item) => edgeKey(item) === edgeKey(edge));
    return (index - (siblings.length - 1) / 2) * 18;
  }

  function edgePath(edge: ReportGraphEdge, from: ReportGraphPoint, to: ReportGraphPoint) {
    if (edge.from === edge.to) {
      const loopOffset = edgeParallelOffset(edge);
      const x1 = from.x + nodeWidth / 2;
      const y1 = from.y - 12 + loopOffset;
      const x2 = from.x - nodeWidth / 2;
      const y2 = from.y - 12 + loopOffset;
      const c1x = from.x + nodeWidth;
      const c2x = from.x - nodeWidth;
      const cy = from.y - nodeHeight - 26 + loopOffset;
      return {
        d: `M ${x1} ${y1} C ${c1x} ${cy}, ${c2x} ${cy}, ${x2} ${y2}`,
        labelX: from.x,
        labelY: cy - 4,
      };
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const start = boundaryPoint(from, to);
    const end = boundaryPoint(to, from);
    const parallelOffset = edgeParallelOffset(edge);
    const offsetX = (-dy / distance) * parallelOffset;
    const offsetY = (dx / distance) * parallelOffset;
    const x1 = start.x + offsetX;
    const y1 = start.y + offsetY;
    const x2 = end.x + offsetX;
    const y2 = end.y + offsetY;
    return {
      d: `M ${x1} ${y1} L ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 4,
    };
  }

  function shortestPath(from: string, to: string): ReportGraphPath {
    const adjacency = buildAdjacency(true);
    const queue = [from];
    const visited = new Set([from]);
    const previous = new Map<string, { state: string; edge: ReportGraphEdge }>();

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (current === to) {
        break;
      }
      for (const edge of adjacency.get(current) || []) {
        if (visited.has(edge.to)) {
          continue;
        }
        visited.add(edge.to);
        previous.set(edge.to, { state: current, edge });
        queue.push(edge.to);
      }
    }

    if (!visited.has(to)) {
      return { from, to, states: [], edges: [], found: false };
    }

    const pathStates = [to];
    const pathEdges: ReportGraphEdge[] = [];
    let current = to;
    while (current !== from) {
      const item = previous.get(current);
      if (!item) {
        break;
      }
      pathEdges.unshift(item.edge);
      pathStates.unshift(item.state);
      current = item.state;
    }
    return { from, to, states: pathStates, edges: pathEdges, found: true };
  }

  function selectedPath(): ReportGraphPath | null {
    if (selected.length !== 2) {
      return null;
    }
    return shortestPath(selected[0], selected[1]);
  }

  function populateEventFilter() {
    if (!eventFilter) {
      return;
    }
    const current = eventFilter.value;
    const operations = Array.from(new Set(rawEdges.map((edge) => edge.operation).filter(Boolean))).sort();
    eventFilter.innerHTML = '<option value="">全部事件</option>';
    for (const operation of operations) {
      const option = document.createElement("option");
      option.value = operation;
      option.textContent = operationLabel(operation);
      eventFilter.append(option);
    }
    if (operations.includes(current)) {
      eventFilter.value = current;
    }
  }

  function renderBranchLabels(layer: SVGElement) {
    const branchPoints = new Map<string, ReportGraphPoint[]>();
    for (const state of states) {
      const point = positions.get(state.id);
      if (!point) {
        continue;
      }
      const key = routeBranchKey(state);
      branchPoints.set(key, [...(branchPoints.get(key) || []), point]);
    }

    for (const [key, points] of branchPoints) {
      if (points.length === 0) {
        continue;
      }
      const angle = points.reduce((sum, point) => sum + point.angle, 0) / points.length;
      const farthest = points.reduce((max, point) => Math.max(max, Math.hypot(point.x, point.y)), 0);
      const x = Math.cos(angle) * (farthest + 72);
      const y = Math.sin(angle) * (farthest + 72);
      const label = svgElement("text", { x, y, class: "graph-branch-label" });
      label.textContent = `${branchLabel(key)} (${points.length})`;
      layer.append(label);
    }
  }

  function render() {
    clearSvg();
    graphEmpty.textContent = "";

    if (!states.length) {
      graphEmpty.textContent = "本次报告没有状态图数据。";
      renderDetails();
      renderPath(null);
      renderReplay(null);
      return;
    }

    const size = graphViewportSize();
    graph.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);

    const defs = svgElement("defs");
    const markers = [
      ["graph-arrow", "#64748b"],
      ["graph-arrow-cross", "#cbd5e1"],
      ["graph-arrow-path", "#d97706"],
      ["graph-arrow-selected", "#2563eb"],
      ["graph-arrow-replay", "#dc2626"],
    ];
    for (const [id, fill] of markers) {
      const marker = svgElement("marker", {
        id,
        viewBox: "0 0 10 10",
        refX: "9",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse",
      });
      marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill }));
      defs.append(marker);
    }
    graph.append(defs);

    const viewport = svgElement("g", {
      transform: `translate(${transform.x} ${transform.y}) scale(${transform.scale})`,
    });
    graph.append(viewport);

    const path = selectedPath();
    const pathStates = new Set(path?.states || []);
    const pathEdges = new Set((path?.edges || []).map(edgeKey));
    const activeReplayStep = currentReplayStep();
    const activeReplayEdgeKey = replayStepEdgeKey(activeReplayStep);
    const activeReplayStates = new Set(
      activeReplayStep ? [activeReplayStep.beforeStateId, activeReplayStep.afterStateId].filter(Boolean) : [],
    );
    const visibleStates = filteredStateIds();
    const visibleEdges = filteredEdges();
    const visibleEdgeKeys = new Set(visibleEdges.map(edgeKey));
    const treeEdgeKeys = discoveryTreeEdgeKeys();
    const directStateIds = new Set();
    const directEdgeKeys = new Set();
    const focusStateIds = new Set();
    const focusEdgeKeys = new Set();
    const hasFocus = selected.length === 1 || selected.length === 2;
    const hasGraphFilter = Boolean(searchTerm() || eventFilter?.value);
    const discoveryTreeMode = !hasFocus && !hasGraphFilter;
    const overviewMode = states.length > 120 && discoveryTreeMode;

    if (selected.length === 1) {
      const stateId = selected[0];
      directStateIds.add(stateId);
      focusStateIds.add(stateId);
      for (const edge of edges) {
        if (edge.from !== stateId && edge.to !== stateId) {
          continue;
        }
        directEdgeKeys.add(edgeKey(edge));
        focusEdgeKeys.add(edgeKey(edge));
        directStateIds.add(edge.from);
        directStateIds.add(edge.to);
        focusStateIds.add(edge.from);
        focusStateIds.add(edge.to);
      }
    } else if (selected.length === 2) {
      if (path?.found) {
        for (const stateId of pathStates) {
          focusStateIds.add(stateId);
        }
        for (const key of pathEdges) {
          focusEdgeKeys.add(key);
        }
      } else {
        for (const stateId of selected) {
          focusStateIds.add(stateId);
        }
      }
    }

    const edgeLayer = svgElement("g");
    viewport.append(edgeLayer);
    for (const edge of edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) {
        continue;
      }
      const key = edgeKey(edge);
      const visible = visibleEdgeKeys.has(key);
      const isTreeEdge = treeEdgeKeys.has(key);
      const isReplayEdge = key === activeReplayEdgeKey;
      if (discoveryTreeMode && !isTreeEdge && !isReplayEdge) {
        continue;
      }
      const isSelectedEdge = selectedEdge === key;
      const isPath = pathEdges.has(key);
      const isDirect = directEdgeKeys.has(key);
      const isCross = edge.from === edge.to || Math.abs((to.depth || 0) - (from.depth || 0)) !== 1;
      const dimmed = !visible || (hasFocus && !focusEdgeKeys.has(key)) || Boolean(activeReplayStep && !isReplayEdge);
      const pathShape = edgePath(edge, from, to);
      const line = svgElement("path", {
        d: pathShape.d,
        class: `graph-edge${isCross ? " cross" : ""}${overviewMode ? " cross" : ""}${isPath ? " path" : ""}${isDirect ? " connected" : ""}${isSelectedEdge ? " selected" : ""}${isReplayEdge ? " replay" : ""}${dimmed ? " dimmed" : ""}`,
      });
      edgeLayer.append(line);

      if (!overviewMode || hasFocus || visibleEdges.length < 700) {
        const hitLine = svgElement("path", {
          d: pathShape.d,
          class: "graph-edge-hit",
          tabindex: "0",
        });
        hitLine.addEventListener("click", (event) => {
          event.stopPropagation();
          selectedEdge = selectedEdge === key ? null : key;
          render();
        });
        edgeLayer.append(hitLine);
      }

      if (visible && isSelectedEdge) {
        const label = svgElement("text", {
          x: pathShape.labelX,
          y: pathShape.labelY,
          class: "graph-edge-label selected",
        });
        label.textContent = edgeDisplayLabel(edge);
        edgeLayer.append(label);
      }
    }

    const nodeLayer = svgElement("g");
    viewport.append(nodeLayer);
    for (const state of states) {
      const point = positions.get(state.id);
      if (!point) {
        continue;
      }
      const isSelected = selected.includes(state.id);
      const isPath = pathStates.has(state.id);
      const isDirect = directStateIds.has(state.id);
      const isStart = state.id === rootStateId;
      const isReplayState = activeReplayStates.has(state.id);
      const visible = visibleStates.has(state.id);
      const dimmed = !visible || (hasFocus && !focusStateIds.has(state.id)) || Boolean(activeReplayStep && !isReplayState);
      const group = svgElement("g", {
        class: `graph-node${isStart ? " start" : ""}${isSelected ? " selected" : ""}${isPath ? " path" : ""}${isDirect ? " connected" : ""}${isReplayState ? " replay" : ""}${dimmed ? " dimmed" : ""}`,
        transform: `translate(${point.x} ${point.y})`,
        tabindex: "0",
      });
      const renderDot = overviewMode && !isSelected && !isPath && !isDirect && !isReplayState;
      if (renderDot) {
        const dot = svgElement("circle", {
          r: isStart ? 7 : state.errorCount ? 6.5 : 5,
          class: `graph-node-dot${isStart ? " start" : ""}${isSelected ? " selected" : ""}${isPath ? " path" : ""}${isReplayState ? " replay" : ""}`,
        });
        group.append(dot);
        const title = svgElement("title");
        title.textContent = `${state.id} ${state.routePattern || ""}`;
        group.append(title);
      } else {
        group.append(
          svgElement("rect", {
            x: -nodeWidth / 2,
            y: -nodeHeight / 2,
            width: nodeWidth,
            height: nodeHeight,
            rx: 8,
          }),
        );
        const title = svgElement("text", { y: -8, class: "graph-node-title" });
        title.textContent = truncate(state.id, 18);
        group.append(title);
        const subtitle = svgElement("text", { y: 13, class: "graph-node-subtitle" });
        subtitle.textContent = truncate(state.routePattern || `step ${state.firstSeenStep ?? ""}`, 18);
        group.append(subtitle);
      }
      group.addEventListener("mouseenter", () => {
        if (hovered === state.id) {
          return;
        }
        hovered = state.id;
        renderDetails();
      });
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSelected(state.id);
      });
      nodeLayer.append(group);
    }

    const labelLayer = svgElement("g");
    viewport.append(labelLayer);
    renderBranchLabels(labelLayer);

    renderSummary();
    renderDetails();
    renderPath(path);
    renderReplay(activeReplayStep);
  }

  function toggleSelected(id: string) {
    selectedEdge = null;
    if (selected.includes(id)) {
      selected = selected.filter((item) => item !== id);
    } else if (selected.length < 2) {
      selected = selected.concat(id);
    } else {
      selected = [selected[1], id];
    }
    render();
  }

  function renderSummary() {
    if (selectionPill) {
      selectionPill.textContent = `已选中 ${selected.length}/2`;
      selectionPill.title = `${states.length} 状态 / ${edges.length} 转移 / seed ${payload.seed ?? ""}`;
    }
    if (zoomValue) {
      zoomValue.textContent = `${Math.round(transform.scale * 100)}%`;
    }
  }

  function renderDetails() {
    const edge = selectedEdge ? edges.find((item) => edgeKey(item) === selectedEdge) : null;
    if (edge) {
      const events = edgeVisibleEvents(edge);
      details.innerHTML = `
        <div class="graph-state-title">${escapeHtmlLocal(edgeDisplayLabel(edge))}</div>
        <div class="muted"><code>${escapeHtmlLocal(edge.from)}</code> → <code>${escapeHtmlLocal(edge.to)}</code></div>
        <dl class="graph-detail-list">
          <dt>起点</dt><dd><code>${escapeHtmlLocal(edge.from)}</code></dd>
          <dt>终点</dt><dd><code>${escapeHtmlLocal(edge.to)}</code></dd>
          <dt>事件种类</dt><dd>${events.length}</dd>
          <dt>出现次数</dt><dd>${events.reduce((sum, item) => sum + (item.count ?? 0), 0)}</dd>
          <dt>首次步数</dt><dd>${edge.firstSeenStep ?? ""}</dd>
          <dt>末次步数</dt><dd>${edge.lastSeenStep ?? ""}</dd>
          <dt>奖励</dt><dd>${edge.reward ?? ""}</dd>
        </dl>
        <div class="graph-edge-ladder">
          <div class="graph-ladder-state"><code>${escapeHtmlLocal(edge.from)}</code></div>
          <div class="graph-ladder-events">
            ${events
              .map(
                (event) => `
                  <button type="button" class="graph-ladder-rung" title="${escapeHtmlLocal(event.eventSignature)}">
                    <span>${escapeHtmlLocal(eventDisplayLabel(event))}</span>
                    <small>${event.count ?? 0} 次</small>
                  </button>
                `,
              )
              .join("")}
          </div>
          <div class="graph-ladder-state"><code>${escapeHtmlLocal(edge.to)}</code></div>
        </div>
      `;
      return;
    }

    const stateId = selected[selected.length - 1] || hovered;
    const state = stateId ? stateById(stateId) : null;
    if (!state) {
      details.innerHTML = '<p class="muted">选择或悬停一个状态，点击边查看事件转移。</p>';
      return;
    }

    const inEdges = edges.filter((edgeItem) => edgeItem.to === state.id);
    const outEdges = edges.filter((edgeItem) => edgeItem.from === state.id);
    details.innerHTML = `
      <div class="graph-state-title">${escapeHtmlLocal(state.id)}</div>
      <div class="muted">${escapeHtmlLocal(state.routePattern || "")}</div>
      ${
        state.screenshot
          ? `<a class="graph-state-screenshot" href="${escapeHtmlLocal(state.screenshot)}" target="_blank" rel="noreferrer"><img src="${escapeHtmlLocal(state.screenshot)}" alt="${escapeHtmlLocal(state.id)} 状态截图" /></a>`
          : ""
      }
      <dl class="graph-detail-list">
        <dt>访问次数</dt><dd>${state.visits ?? 0}</dd>
        <dt>首次步数</dt><dd>${state.firstSeenStep ?? ""}</dd>
        <dt>末次步数</dt><dd>${state.lastSeenStep ?? ""}</dd>
        <dt>候选事件</dt><dd>${state.candidateCount ?? 0}</dd>
        <dt>已测候选</dt><dd>${state.testedCandidateCount ?? 0}</dd>
        <dt>未测候选</dt><dd>${state.untestedCandidateCount ?? 0}</dd>
        <dt>出站转移</dt><dd>${outEdges.length}</dd>
        <dt>入站转移</dt><dd>${inEdges.length}</dd>
        <dt>无变化</dt><dd>${state.noChangeCount ?? 0}</dd>
        <dt>异常</dt><dd>${state.errorCount ?? 0}</dd>
      </dl>
      <div class="graph-edge-list">
        <h3>出边</h3>
        ${
          outEdges
            .slice(0, 12)
            .map(
              (edgeItem) => `
                <div class="graph-edge-item">
                  <div><strong>${escapeHtmlLocal(edgeDisplayLabel(edgeItem))}</strong></div>
                  <div class="muted">to <code>${escapeHtmlLocal(edgeItem.to)}</code></div>
                  <code class="muted">${escapeHtmlLocal(edgeDisplayLabel(edgeItem))}</code>
                </div>
              `,
            )
            .join("") || '<p class="muted">没有出边。</p>'
        }
      </div>
    `;
  }

  function renderPath(path: ReportGraphPath | null) {
    if (selected.length !== 2) {
      pathDetails.innerHTML = '<p class="muted compact">选择两个状态后显示最短路径。</p>';
      return;
    }
    if (!path?.found) {
      pathDetails.innerHTML = `<p class="muted compact">未找到从 <code>${escapeHtmlLocal(selected[0])}</code> 到 <code>${escapeHtmlLocal(selected[1])}</code> 的路径。</p>`;
      return;
    }
    const steps: string[] = [];
    path.states.forEach((stateId, index) => {
      steps.push(`<span class="graph-path-state">${escapeHtmlLocal(stateId)}</span>`);
      const edge = path.edges[index];
      if (edge) {
        steps.push(`<span class="graph-path-event" title="${escapeHtmlLocal(edgeDisplayTitle(edge))}">${escapeHtmlLocal(edgeDisplayLabel(edge))}</span>`);
      }
    });
    pathDetails.innerHTML = `<div class="graph-path-steps">${steps.join("")}</div>`;
  }

  function renderReplay(step = currentReplayStep()) {
    const hasSteps = replaySteps.length > 0;
    const isPlaying = replayTimer !== null;
    if (replayPrevButton) {
      replayPrevButton.disabled = !hasSteps || replayIndex <= 0;
    }
    if (replayNextButton) {
      replayNextButton.disabled = !hasSteps || replayIndex >= replaySteps.length - 1;
    }
    if (replayClearButton) {
      replayClearButton.disabled = replayIndex < 0 && !isPlaying;
    }
    if (replayPlayButton) {
      replayPlayButton.disabled = !hasSteps;
      replayPlayButton.textContent = isPlaying ? "暂停" : "回放";
      replayPlayButton.classList.toggle("active", isPlaying);
    }
    if (replayRange) {
      replayRange.disabled = !hasSteps;
      replayRange.max = String(Math.max(0, replaySteps.length - 1));
      replayRange.value = String(Math.max(0, replayIndex));
    }
    if (replayLabel) {
      replayLabel.textContent = hasSteps ? `${Math.max(0, replayIndex + 1)} / ${replaySteps.length}` : "0 / 0";
    }
    if (!replayDetails) {
      return;
    }
    if (!step) {
      replayDetails.innerHTML = hasSteps
        ? '<p class="muted compact">点击“回放”或“下一步”开始按执行顺序高亮状态路径。</p>'
        : '<p class="muted compact">本次报告没有可回放步骤。</p>';
      return;
    }
    const resultLabel = step.routeEscape
      ? "路径逃逸"
      : step.issueCount
        ? `异常 ${step.issueCount}`
        : step.noChange
          ? "无变化"
          : step.newState
            ? "新状态"
            : step.newTransition
              ? "新转移"
              : "已知变化";
    replayDetails.innerHTML = `
      <strong>步骤 ${escapeHtmlLocal(step.step ?? replayIndex)}</strong>
      <span class="muted"> ${escapeHtmlLocal(resultLabel)}</span><br />
      <code>${escapeHtmlLocal(step.beforeStateId)}</code>
      → <span class="pill">${escapeHtmlLocal(step.eventLabel || operationLabel(String(step.operation || "event")))}</span>
      → <code>${escapeHtmlLocal(step.afterStateId)}</code><br />
      <code>${escapeHtmlLocal(step.eventSignature || "")}</code>
    `;
  }

  function setGraphFullscreen(enabled: boolean) {
    workbench.classList.toggle("graph-fullscreen", enabled);
    document.body.classList.toggle("graph-fullscreen-open", enabled);
    if (fullscreenButton) {
      fullscreenButton.textContent = enabled ? "退出全屏" : "全屏";
    }
    requestAnimationFrame(() => {
      fitToView();
      render();
    });
  }

  if (stateSearch) {
    stateSearch.addEventListener("input", render);
  }
  if (eventFilter) {
    eventFilter.addEventListener("change", render);
  }
  if (fitViewButton) {
    fitViewButton.addEventListener("click", () => {
      fitToView();
      render();
    });
  }
  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", () => {
      setGraphFullscreen(!workbench.classList.contains("graph-fullscreen"));
    });
  }
  if (clearSelectionButton) {
    clearSelectionButton.addEventListener("click", () => {
      selected = [];
      selectedEdge = null;
      render();
    });
  }
  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => setZoom(transform.scale + 0.12));
  }
  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => setZoom(transform.scale - 0.12));
  }
  if (closeDetailsButton) {
    closeDetailsButton.addEventListener("click", () => {
      selected = [];
      selectedEdge = null;
      hovered = null;
      render();
    });
  }
  if (replayPrevButton) {
    replayPrevButton.addEventListener("click", () => advanceReplay(-1));
  }
  if (replayNextButton) {
    replayNextButton.addEventListener("click", () => advanceReplay(1));
  }
  if (replayPlayButton) {
    replayPlayButton.addEventListener("click", toggleReplay);
  }
  if (replayClearButton) {
    replayClearButton.addEventListener("click", clearReplay);
  }
  if (replayRange) {
    replayRange.addEventListener("input", () => {
      stopReplay();
      setReplayIndex(Number(replayRange.value || "0"));
    });
  }
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-replay-step]") : null;
    if (!target) {
      return;
    }
    const step = Number((target as HTMLElement).dataset.replayStep);
    if (Number.isFinite(step)) {
      showReplayStepByStepNumber(step);
    }
  });

  graph.addEventListener("click", () => {
    hovered = null;
    selectedEdge = null;
    renderDetails();
    render();
  });
  graph.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(".graph-node") || target?.closest?.(".graph-edge-hit")) {
      return;
    }
    event.preventDefault();
    isPanning = true;
    panStart = { x: event.clientX - transform.x, y: event.clientY - transform.y };
  });
  graph.addEventListener("selectstart", (event) => {
    event.preventDefault();
  });
  graph.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      setZoom(transform.scale + direction * 0.08);
    },
    { passive: false },
  );

  window.addEventListener("mousemove", (event) => {
    if (!isPanning || !panStart) {
      return;
    }
    event.preventDefault();
    transform.x = event.clientX - panStart.x;
    transform.y = event.clientY - panStart.y;
    render();
  });
  window.addEventListener("mouseup", () => {
    isPanning = false;
    panStart = null;
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && workbench.classList.contains("graph-fullscreen")) {
      setGraphFullscreen(false);
    } else if (event.key === "Escape" && replayIndex >= 0) {
      clearReplay();
    }
  });
  window.addEventListener("resize", () => {
    layoutStates();
    fitToView();
    render();
  });

  populateEventFilter();
  layoutStates();
  fitToView();
  render();
}

function meta(label: string, value: string) {
  return `<div class="meta"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function metric(label: string, value: string | number, hint: string) {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function testedObjectStrip(result: ReportResult) {
  const testKind = result.config.testKind ?? "stateExploration";
  return `
    <section class="subject-strip" aria-label="被测对象">
      ${subjectItem("被测工程", projectLabel())}
      ${subjectItem("被测应用", "ORF 前端主应用")}
      ${subjectItem("入口 URL", targetEntryUrl(result.config))}
      ${subjectItem("测试类型", testKindLabel(testKind))}
      ${subjectItem("SEED", result.seed)}
    </section>
  `;
}

function subjectItem(label: string, value: string) {
  return `<div class="subject-item"><div class="subject-label">${escapeHtml(label)}</div><div class="subject-value">${escapeHtml(value)}</div></div>`;
}

function environmentSection(result: ReportResult) {
  const legacyConfig = result.config as ExplorerConfig & { stateMode?: string };
  const safetyProfile = result.config.safetyProfile ?? "legacy";
  const testKind = result.config.testKind ?? "stateExploration";
  const stateAbstractor = result.config.stateAbstractor ?? legacyConfig.stateMode ?? "stateExploration";
  return `
    <section class="panel chart">
      <h3>被测对象</h3>
      <div class="settings-grid">
        ${meta("被测工程", projectLabel())}
        ${meta("被测应用", "ORF 前端主应用")}
        ${meta("入口 URL", targetEntryUrl(result.config))}
        ${meta("目标路径", result.config.targetPath)}
        ${meta("随机种子", result.seed)}
        ${meta("测试类型", testKindLabel(testKind))}
        ${meta("报告生成时间", new Date().toISOString())}
      </div>
      <h3 style="margin-top: 18px">测试环境</h3>
      <div class="settings-grid">
        ${meta("Base URL", result.config.baseURL)}
        ${meta("浏览器", "chromium / Desktop Chrome")}
        ${meta("Node.js", process.version)}
        ${meta("包管理器", packageManagerLabel())}
        ${meta("执行步数", `${result.summary.executedSteps} / ${result.summary.totalSteps}`)}
        ${meta("时间预算", durationBudgetLabel(result.config.maxDurationMs))}
        ${meta("单步超时", `${result.config.maxStepDuration} ms`)}
        ${meta("安全边界", safetyProfile)}
        ${meta("状态抽象", stateAbstractor)}
        ${meta("可重复组件测试", result.config.runRepeatableRegionTests ? "开启" : "关闭")}
        ${meta("允许来源", compactList(result.config.allowedOrigins))}
        ${meta("允许路径", compactList(result.config.allowedPathPatterns))}
        ${meta("禁用操作", compactList(result.config.blockedOperationKinds))}
        ${meta("禁用目标文本", compactList(result.config.blockedTargetTextPatterns))}
      </div>
    </section>
  `;
}

function projectLabel() {
  const name = process.env.npm_package_name || "orf";
  const version = process.env.npm_package_version;
  return version ? `${name}@${version}` : name;
}

function packageManagerLabel() {
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) {
    return "npm";
  }
  return userAgent.split(" ")[0] || "npm";
}

function targetEntryUrl(config: ExplorerConfig) {
  try {
    return new URL(config.targetPath, config.baseURL).toString();
  } catch {
    return `${config.baseURL}${config.targetPath}`;
  }
}

function compactList(values: string[]) {
  if (values.length === 0) {
    return "-";
  }
  const visible = values.slice(0, 4).join(", ");
  return values.length > 4 ? `${visible}, +${values.length - 4}` : visible;
}

function durationBudgetLabel(maxDurationMs: number | undefined) {
  if (!maxDurationMs || maxDurationMs <= 0) {
    return "未设置";
  }
  if (maxDurationMs % 60_000 === 0) {
    return `${maxDurationMs / 60_000} 分钟`;
  }
  if (maxDurationMs % 1000 === 0) {
    return `${maxDurationMs / 1000} 秒`;
  }
  return `${maxDurationMs} ms`;
}

function uniqueRepeatableRegions(states: StateNode[]) {
  const regions = new Map<string, StateNode["repeatableRegions"][number]>();
  for (const state of states) {
    for (const region of state.repeatableRegions) {
      regions.set(region.signature, region);
    }
  }
  return Array.from(regions.values()).sort(
    (left, right) =>
      left.routePattern.localeCompare(right.routePattern) ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label),
  );
}

function repeatableRegionSection(regions: StateNode["repeatableRegions"]) {
  if (regions.length === 0) {
    return "";
  }
  return `
    <h2>可重复区域</h2>
    <section class="panel chart">
      <h3>状态探索识别到的可重复增长组件</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>类型</th><th>路径</th><th>组件名</th><th>父组件</th><th>标签</th><th>存在性</th><th>业务标签</th><th>层级</th></tr></thead>
        <tbody>
          ${regions
            .map(
              (region) =>
                `<tr><td>${escapeHtml(repeatableRegionKindLabel(region.kind))}</td><td><code>${escapeHtml(region.routePattern)}</code></td><td>${escapeHtml(region.componentName ?? region.label)}</td><td>${escapeHtml(region.parentComponentName ?? "-")}</td><td>${escapeHtml(region.label)}</td><td>${escapeHtml(region.presence === "some" ? "有" : "无")}</td><td>${escapeHtml(region.businessTags.join(", ") || "-")}</td><td>${escapeHtml(region.hierarchyLayers.join(", ") || "-")}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table></div>
      <p class="muted compact">这些区域在状态探索中按存在性、业务标签和层级存在性参与状态合并；具体条目数量不直接制造新状态。</p>
    </section>
  `;
}

function repeatableRegionExplorationSection(result: ReportResult) {
  const exploration = result.repeatableRegionExploration;
  if (!exploration) {
    return "";
  }
  const summary = exploration.summary;
  const href = result.repeatableRegionHtmlReportPath ? path.basename(result.repeatableRegionHtmlReportPath) : "repeatable-regions.html";
  return `
    <h2>可重复组件局部测试</h2>
    <section class="panel chart">
      <h3>主探索后的组件内专项测试</h3>
      <div class="cards" style="margin-top: 8px">
        ${metric("测试对象", summary.testObjectCount, "按组件作用域和业务标签去重")}
        ${metric("已测对象", summary.testedObjectCount, "已恢复代表状态并执行过事件")}
        ${metric("执行事件", summary.executedSteps, "组件作用域内事件")}
        ${metric("离开组件", summary.leftRegionCount, "事件后目标区域不可见或路径逃逸")}
      </div>
      <p class="muted compact" style="margin-top: 12px">专项报告不展示状态图，只展示组件对象、局部事件和边界逃逸情况。</p>
      <p style="margin-top: 10px"><a href="${escapeHtml(href)}">打开可重复组件局部测试报告</a></p>
    </section>
  `;
}

function issueOverviewSection(result: ReportResult) {
  const issueScreenshotsByStep = new Map(
    (result.screenshotArtifacts ?? [])
      .filter((artifact) => artifact.kind === "issue" && artifact.step !== undefined)
      .map((artifact) => [artifact.step!, artifact.relativePath ?? artifact.path]),
  );
  const issueRows = result.eventSequence
    .filter((record) => record.issues.length > 0)
    .map((record) => ({
      record,
      primaryIssue: record.issues.find((issue) => issue.severity === "severe") ?? record.issues[0]!,
      screenshot: issueScreenshotsByStep.get(record.step),
    }));

  if (issueRows.length === 0) {
    return `
      <section class="panel chart">
        <h3>没有发现异常</h3>
        <p class="muted compact">本次执行过程中没有记录超时、页面错误或白屏。</p>
      </section>
    `;
  }

  return `
    <section class="panel chart">
      <h3>本次发现 ${issueRows.length} 个异常步骤</h3>
      <p class="muted">异常已按“在哪个状态、执行什么操作、发生什么问题”整理。点击“在状态图中定位”会把状态图切到对应步骤。</p>
      <div class="issue-scroll">
      <div class="issue-grid">
        ${issueRows
          .map(({ record, primaryIssue, screenshot }) => {
            const title = humanIssueTitle(primaryIssue.type);
            const description = humanIssueDescription(primaryIssue.type);
            const targetLabel = targetLabelFromSignature(record.targetSignature);
            return `
              <article class="issue-card">
                <div>
                  <h3>步骤 ${record.step}：${escapeHtml(eventDisplayLabel(record))}时${escapeHtml(title)}</h3>
                  <p>${escapeHtml(description)}</p>
                  <div class="issue-meta">
                    <span>状态 <code>${escapeHtml(record.beforeStateId)}</code></span>
                    <span>对象：${escapeHtml(targetLabel ?? "无固定对象")}</span>
                    <span>结果：${escapeHtml(stepOutcomeLabel(record))}</span>
                    <span>级别：${escapeHtml(severityLabel(primaryIssue.severity))}</span>
                    <span>路径：${escapeHtml(stateRouteLabel(result, record.beforeStateId))}</span>
                  </div>
                </div>
                <div class="issue-actions">
                  <button type="button" data-replay-step="${record.step}">在状态图中定位</button>
                  ${screenshot ? `<a href="${escapeHtml(screenshot)}" target="_blank" rel="noreferrer">查看截图</a>` : ""}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      </div>
    </section>
  `;
}

function humanIssueTitle(type: string) {
  if (type === "timeout") {
    return "操作超时";
  }
  if (type === "pageerror") {
    return "页面脚本报错";
  }
  if (type === "blank-screen") {
    return "页面变成空白";
  }
  return "出现异常";
}

function humanIssueDescription(type: string) {
  if (type === "timeout") {
    return "自动化操作在限定时间内没有完成。常见原因是目标元素被遮挡、弹窗还没关闭、页面还在更新，或者随机选择到了已经失效的元素。";
  }
  if (type === "pageerror") {
    return "页面运行时抛出了脚本错误，需要结合状态截图和操作步骤排查前端代码。";
  }
  if (type === "blank-screen") {
    return "操作后页面主要内容消失，属于需要优先排查的稳定性问题。";
  }
  return "执行这一步时记录到异常，建议先在状态图中定位对应状态和操作。";
}

function stepOutcomeLabel(record: StepRecord) {
  if (record.routeEscape) {
    return "离开安全路径";
  }
  if (record.noChange) {
    return "状态未变化";
  }
  if (record.newState) {
    return "进入新状态";
  }
  if (record.newTransition) {
    return "产生新转移";
  }
  return "进入已知状态";
}

function stateRouteLabel(result: ReportResult, stateId: string) {
  return result.stateTable.find((state) => state.id === stateId)?.routePattern ?? "-";
}

function repeatableObjectTable(objects: RepeatableRegionObjectResult[]) {
  if (objects.length === 0) {
    return `<p class="muted compact">没有可重复组件测试对象。</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr><th>对象</th><th>类型</th><th>路径</th><th>组件名</th><th>父组件</th><th>标签</th><th>存在性</th><th>业务标签</th><th>层级</th><th>事件</th><th>异常</th><th>状态</th></tr></thead>
    <tbody>
      ${objects
        .map((object) => {
          const region = object.object.region;
          const status = object.skippedReason ? `跳过：${object.skippedReason}` : "已测试";
          return `<tr>
            <td><code>${escapeHtml(object.object.id)}</code></td>
            <td>${escapeHtml(repeatableRegionKindLabel(region.kind))}</td>
            <td><code>${escapeHtml(region.routePattern)}</code></td>
            <td>${escapeHtml(region.componentName ?? region.label)}</td>
            <td>${escapeHtml(region.parentComponentName ?? "-")}</td>
            <td>${escapeHtml(region.label)}</td>
            <td>${escapeHtml(region.presence === "some" ? "有" : "无")}</td>
            <td>${escapeHtml(region.businessTags.join(", ") || "-")}</td>
            <td>${escapeHtml(region.hierarchyLayers.join(", ") || "-")}</td>
            <td>${escapeHtml(`${object.executedSteps} / ${object.discoveredCandidateEventCount}`)}</td>
            <td>${escapeHtml(`${object.runtimeErrorCount} / ${object.severeFailureCount}`)}</td>
            <td>${escapeHtml(status)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table></div>`;
}

function repeatableEventTable(
  rows: Array<{ object: RepeatableRegionObjectResult; event: RepeatableRegionObjectResult["events"][number] }>,
) {
  if (rows.length === 0) {
    return `<p class="muted compact">没有组件内事件样本。</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr><th>对象</th><th>步骤</th><th>操作</th><th>事件</th><th>结果</th><th>异常</th></tr></thead>
    <tbody>
      ${rows
        .slice(0, 160)
        .map(({ object, event }) => {
          const result = event.routeEscape
            ? "路径逃逸"
            : event.leftRegion
              ? "离开组件"
              : event.noChange
                ? "无变化"
                : "状态变化";
          return `<tr>
            <td><code>${escapeHtml(object.object.id)}</code></td>
            <td>${event.step}</td>
            <td>${escapeHtml(operationLabel(event.operation))}</td>
            <td><code>${escapeHtml(trimText(event.eventSignature, 120))}</code></td>
            <td>${escapeHtml(result)}</td>
            <td>${repeatableIssueCells(event.issues)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table></div>`;
}

function repeatableIssueCells(issues: RepeatableRegionObjectResult["events"][number]["issues"]) {
  if (issues.length === 0) {
    return "-";
  }
  return issues
    .slice(0, 3)
    .map(
      (issue) =>
        `<span class="severity-${escapeHtml(issue.severity)}">${escapeHtml(severityLabel(issue.severity))}</span> ${escapeHtml(issue.type)}`,
    )
    .join("<br />");
}

function testKindLabel(kind: string) {
  return kind === "repeatableRegion" ? "可重复组件局部测试" : "状态探索测试";
}

function repeatableRegionKindLabel(kind: string) {
  if (kind === "comment") {
    return "评论";
  }
  if (kind === "hierarchy") {
    return "层级结构";
  }
  return "列表";
}

function scoreGauge(score: number) {
  const clamped = Math.max(0, Math.min(100, score));
  return `<div class="gauge" style="--score:${(clamped / 100) * 360}deg"><div class="gauge-value">${clamped.toFixed(0)}</div></div>`;
}

function progressRow(label: string, value: number, color: string, valueLabel = percent(value)) {
  const clamped = Math.max(0, Math.min(1, value));
  return `<div class="bar-row"><div class="chart-label">${escapeHtml(label)}</div><div class="bar"><span class="${escapeHtml(color)}" style="width:${clamped * 100}%"></span></div><strong>${escapeHtml(valueLabel)}</strong></div>`;
}

function stackedOutcome(outcome: EventOutcomeBreakdown) {
  const total = Math.max(1, outcome.total);
  const segments = [
    { value: outcome.newState, color: "var(--green)", label: "新状态" },
    { value: outcome.newTransition, color: "var(--blue)", label: "新转移" },
    { value: outcome.knownChange, color: "var(--cyan)", label: "已知变化" },
    { value: outcome.noChange, color: "var(--amber)", label: "无变化" },
  ];
  return `<div class="bar" style="height: 22px; display:flex">
    ${segments
      .map(
        (segment) =>
          `<span title="${escapeHtml(segment.label)} ${segment.value}" style="width:${(segment.value / total) * 100}%; background:${segment.color}"></span>`,
      )
      .join("")}
  </div>
  <div class="outcome-cards">
    ${metric("新状态", outcome.newState, "产生新状态节点")}
    ${metric("新转移", outcome.newTransition, "进入已知状态但形成新边")}
    ${metric("已知变化", outcome.knownChange, "状态变化但不是新状态或新边")}
    ${metric("无变化", outcome.noChange, "执行后状态未变化")}
    ${metric("异常事件", outcome.issue, "含普通或严重异常，可与其他结果重叠")}
  </div>`;
}

function curveSvg(values: number[], color: string) {
  const width = 720;
  const height = 180;
  const padding = 20;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - (value / max) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = points.length > 0 ? `${points[0]} ${points.join(" ")} ${width - padding},${height - padding} ${padding},${height - padding}` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="探索曲线">
    <path d="M ${padding} ${height - padding} H ${width - padding}" stroke="#cbd5e1" />
    <path d="M ${padding} ${padding} V ${height - padding}" stroke="#cbd5e1" />
    <polygon points="${escapeHtml(area)}" fill="${color}" opacity="0.13"></polygon>
    <polyline points="${escapeHtml(points.join(" "))}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <text x="${padding}" y="${padding - 4}" fill="#64748b" font-size="12">max ${max}</text>
    <text x="${width - padding - 70}" y="${height - 6}" fill="#64748b" font-size="12">${values.length} steps</text>
  </svg>`;
}

export function outcomeBreakdown(result: Pick<ExplorerRunResult, "eventSequence">): EventOutcomeBreakdown {
  const total = result.eventSequence.length;
  const newState = result.eventSequence.filter((record) => record.newState).length;
  const newTransition = result.eventSequence.filter((record) => !record.newState && record.newTransition && !record.noChange).length;
  const knownChange = result.eventSequence.filter((record) => !record.newState && !record.newTransition && !record.noChange).length;
  const noChange = result.eventSequence.filter((record) => record.noChange).length;
  const issue = result.eventSequence.filter((record) => record.issues.length > 0).length;
  return { total, newState, newTransition, knownChange, noChange, issue };
}

function operationLabel(operation: UiOperation) {
  const labels: Record<UiOperation, string> = {
    click: "点击",
    doubleClick: "双击",
    hover: "悬停",
    focus: "聚焦",
    insertText: "输入文本",
    pasteText: "粘贴文本",
    clear: "清空",
    pressKey: "按键",
    modifiedKey: "组合键",
    selectOption: "选择选项",
    wheel: "滚轮",
    backgroundClick: "背景点击",
    refresh: "刷新",
    back: "后退",
    wait: "等待",
    repeatedClick: "连续点击",
  };
  return labels[operation];
}

function eventDisplayLabel(record: Pick<StepRecord, "operation" | "params" | "targetSignature">) {
  const operation = eventOperationLabel(record);
  const target = targetLabelFromSignature(record.targetSignature);
  return target ? `${operation}：${target}` : operation;
}

function eventOperationLabel(record: Pick<StepRecord, "operation" | "params">) {
  const base = operationLabel(record.operation);
  if (record.operation === "repeatedClick" && record.params.count) {
    return `${base} ${record.params.count} 次`;
  }
  if (record.operation === "pressKey" && record.params.key) {
    return `${base} ${record.params.key}`;
  }
  if (record.operation === "modifiedKey" && record.params.key) {
    const modifiers = record.params.modifierSet?.join("+");
    return modifiers ? `${base} ${modifiers}+${record.params.key}` : `${base} ${record.params.key}`;
  }
  if (record.operation === "insertText" || record.operation === "pasteText") {
    return record.params.payloadKind ? `${base} ${record.params.payloadKind}` : base;
  }
  if (record.operation === "wheel" && record.params.direction) {
    return `${base} ${record.params.direction}`;
  }
  return base;
}

function targetLabelFromSignature(signature?: string) {
  const parts = parseTargetSignature(signature);
  if (!parts) {
    return undefined;
  }
  const kind = targetKindLabel(parts);
  const text = firstMeaningful(parts.label, parts.text, parts.placeholder);
  if (text) {
    return `${kind}「${trimTargetText(text)}」`;
  }
  const route = firstMeaningful(parts.route);
  const index = firstMeaningful(parts.index);
  const fallback = [route, index ? `序号 ${index}` : undefined].filter(Boolean).join("，");
  return fallback ? `${kind}（${fallback}）` : kind;
}

function parseTargetSignature(signature?: string) {
  if (!signature) {
    return undefined;
  }
  const parts: Record<string, string> = {};
  for (const segment of signature.split("|")) {
    const separator = segment.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    parts[segment.slice(0, separator)] = segment.slice(separator + 1);
  }
  return parts;
}

function targetKindLabel(parts: Record<string, string>) {
  const role = firstMeaningful(parts.role);
  const tag = firstMeaningful(parts.tag);
  const type = firstMeaningful(parts.type);
  if (role === "button" || tag === "button") {
    return "按钮";
  }
  if (role === "link" || tag === "a") {
    return "链接";
  }
  if (role === "textbox" || tag === "input" || tag === "textarea") {
    return type && type !== "text" ? `${type} 输入框` : "输入框";
  }
  if (role === "select" || tag === "select") {
    return "下拉框";
  }
  if (role === "article" || tag === "article") {
    return "卡片";
  }
  if (role === "dialog") {
    return "弹窗";
  }
  if (tag === "aside" || tag === "main" || tag === "section") {
    return "区域";
  }
  return role ?? tag ?? "组件";
}

function firstMeaningful(...values: Array<string | undefined>) {
  return values.find((value) => value && value !== "none");
}

function trimTargetText(value: string) {
  return trimText(value.replace(/\s+/g, " ").trim(), 48);
}

function transitionEventKey(fromStateId: string, toStateId: string, eventSignature: string) {
  return `${fromStateId}->${toStateId}:${eventSignature}`;
}

function severityLabel(severity: string) {
  return severity === "severe" ? "严重" : "普通";
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function trimText(value: string, limit = reportTextLimit) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
}

async function exists(filePath: string) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
