import fs from "node:fs/promises";
import path from "node:path";
import { canonicalEventSignature } from "./eventIdentity";
import { payloadKinds } from "./payloads";
import type {
  CandidateEventRecord,
  CoverageSummary,
  ExplorerConfig,
  ExplorerRunResult,
  StateNode,
  StepRecord,
  TransitionEdge,
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

type ReportResult = ExplorerRunResult & {
  topNoChangeEventRows?: NoChangeEventRow[];
};

export async function writeExplorerReport(result: ExplorerRunResult) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(result.config.reportDir, `${timestamp}-seed-${safeFilePart(result.seed)}`);
  await fs.mkdir(runDir, { recursive: true });
  const jsonPath = path.join(runDir, "result.json");
  const htmlPath = path.join(runDir, "report.html");

  const withPaths = { ...result, reportPath: jsonPath, htmlReportPath: htmlPath };
  const reportResult = compactReportResult(withPaths);
  await fs.writeFile(jsonPath, JSON.stringify({ ...reportResult, ...reportResult.summary }, null, 2), "utf8");
  await fs.writeFile(htmlPath, renderHtml(reportResult), "utf8");
  return { reportPath: jsonPath, htmlReportPath: htmlPath };
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
  const withPaths = { ...merged, reportPath: jsonPath, htmlReportPath: htmlPath };
  const reportResult = compactReportResult(withPaths);
  await fs.writeFile(jsonPath, JSON.stringify({ ...reportResult, ...reportResult.summary }, null, 2), "utf8");
  await fs.writeFile(htmlPath, renderHtml(reportResult), "utf8");
  return { reportPath: jsonPath, htmlReportPath: htmlPath, result: reportResult };
}

function mergeExplorerResults(
  results: ExplorerRunResult[],
  options: { reportDir: string; seed: string; replayCommand: string; label?: string },
): ExplorerRunResult {
  if (results.length === 0) {
    throw new Error("Cannot merge an empty UI explorer result set.");
  }

  const first = results[0];
  const stateMap = new Map<string, StateNode>();
  const edgeMap = new Map<string, TransitionEdge>();
  const discoveredTargets = new Set<string>();
  const interactedTargets = new Set<string>();
  const payloadKindsHit = new Set<string>();
  const canonicalCandidateEvents = new Set<string>();
  const testedCanonicalCandidateEvents = new Set<string>();
  const untestedFallback = new Map<string, ExplorerRunResult["untestedCandidateEvents"][number]>();
  const records: StepRecord[] = [];
  let stepOffset = 0;
  let fallbackTargetCoverageWeighted = 0;
  let fallbackPayloadCoverageWeighted = 0;
  let fallbackCoverageWeight = 0;

  for (const result of results) {
    const stateIdsInShard = new Set(result.stateTable.map((state) => state.id));
    for (const state of result.stateTable) {
      const existing = stateMap.get(state.id);
      if (!existing) {
        stateMap.set(state.id, cloneStateNode(state));
      } else {
        existing.visits += state.visits;
        existing.firstSeenStep = Math.min(existing.firstSeenStep, state.firstSeenStep);
        existing.lastSeenStep = Math.max(existing.lastSeenStep, state.lastSeenStep);
        existing.noChangeCount += state.noChangeCount;
        existing.newStateOutCount += state.newStateOutCount;
        existing.errorCount += state.errorCount;
        if (existing.candidates.length > 0 && state.candidates.length > 0) {
          existing.candidates = mergeCandidateRecords(existing.candidates, state.candidates);
        } else if (existing.candidates.length === 0 && state.candidates.length > 0) {
          existing.candidates = mergeCandidateRecords([], state.candidates);
        } else {
          existing.candidateCount = Math.max(existing.candidateCount, state.candidateCount);
          existing.testedCandidateCount = Math.min(
            existing.candidateCount,
            existing.testedCandidateCount + state.testedCandidateCount,
          );
          existing.untestedCandidateCount = Math.max(0, existing.candidateCount - existing.testedCandidateCount);
        }
      }
    }

    for (const transition of result.transitionTable) {
      const key = `${transition.fromStateId}->${transition.toStateId}:${transition.eventSignature}`;
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, { ...transition });
      } else {
        existing.count += transition.count;
        existing.firstSeenStep = Math.min(existing.firstSeenStep, transition.firstSeenStep);
        existing.lastSeenStep = Math.max(existing.lastSeenStep, transition.lastSeenStep);
        existing.reward = Math.max(existing.reward, transition.reward);
      }
    }

    for (const state of result.stateTable) {
      for (const candidate of state.candidates) {
        const canonicalSignature = canonicalEventSignature(candidate.event);
        canonicalCandidateEvents.add(canonicalSignature);
        if (candidate.attempts > 0) {
          testedCanonicalCandidateEvents.add(canonicalSignature);
        }
        if (candidate.event.target) {
          discoveredTargets.add(candidate.event.target.signature);
          if (candidate.attempts > 0) {
            interactedTargets.add(candidate.event.target.signature);
          }
        }
        if (candidate.event.params.payloadKind && candidate.attempts > 0) {
          payloadKindsHit.add(candidate.event.params.payloadKind);
        }
      }
    }
    for (const signature of result.canonicalCandidateEvents ?? []) {
      canonicalCandidateEvents.add(signature);
    }
    for (const signature of result.testedCanonicalCandidateEvents ?? []) {
      testedCanonicalCandidateEvents.add(signature);
    }

    for (const item of result.untestedCandidateEvents) {
      untestedFallback.set(`${item.stateId}:${item.eventSignature}`, item);
    }

    fallbackTargetCoverageWeighted += result.summary.targetCoverage * result.summary.executedSteps;
    fallbackPayloadCoverageWeighted += result.summary.payloadKindCoverage * result.summary.executedSteps;
    fallbackCoverageWeight += result.summary.executedSteps;

    for (const record of result.eventSequence) {
      records.push({
        ...record,
        step: stepOffset + record.step,
        newState: record.newState && stateIdsInShard.has(record.afterStateId),
      });
    }
    stepOffset += result.eventSequence.length;
  }

  for (const state of stateMap.values()) {
    if (state.candidates.length > 0) {
      refreshCandidateStats(state);
    } else {
      state.untestedCandidateCount = Math.max(0, state.candidateCount - state.testedCandidateCount);
    }
  }

  const stateTable = Array.from(stateMap.values()).sort((left, right) => left.firstSeenStep - right.firstSeenStep);
  const transitionTable = Array.from(edgeMap.values()).sort((left, right) => left.firstSeenStep - right.firstSeenStep);
  const discoveredCandidateEventCount = stateTable.reduce((sum, state) => sum + state.candidateCount, 0);
  const testedCandidateEventCount = stateTable.reduce((sum, state) => sum + state.testedCandidateCount, 0);
  const totalSteps = results.reduce((sum, result) => sum + result.summary.totalSteps, 0);
  const executedSteps = records.length;
  const routeEscapeCount = records.filter((record) => record.routeEscape).length;
  const runtimeErrorCount = records.reduce((sum, record) => sum + record.issues.length, 0);
  const severeFailureCount = records.reduce(
    (sum, record) => sum + record.issues.filter((issue) => issue.severity === "severe").length,
    0,
  );
  const candidateEventCoverage = ratio(testedCandidateEventCount, discoveredCandidateEventCount);
  const fallbackDiscoveredCanonicalCandidateEventCount = results.reduce(
    (sum, result) => sum + (result.summary.discoveredCanonicalCandidateEventCount ?? 0),
    0,
  );
  const fallbackTestedCanonicalCandidateEventCount = results.reduce(
    (sum, result) => sum + (result.summary.testedCanonicalCandidateEventCount ?? 0),
    0,
  );
  const discoveredCanonicalCandidateEventCount =
    canonicalCandidateEvents.size || fallbackDiscoveredCanonicalCandidateEventCount || discoveredCandidateEventCount;
  const testedCanonicalCandidateEventCount =
    testedCanonicalCandidateEvents.size || fallbackTestedCanonicalCandidateEventCount || testedCandidateEventCount;
  const canonicalCandidateEventCoverage = ratio(
    testedCanonicalCandidateEventCount,
    discoveredCanonicalCandidateEventCount,
  );
  const payloadKindCoverage =
    payloadKindsHit.size > 0 ? ratio(payloadKindsHit.size, payloadKinds.length) : ratio(fallbackPayloadCoverageWeighted, fallbackCoverageWeight);
  const targetCoverage =
    discoveredTargets.size > 0 ? ratio(interactedTargets.size, discoveredTargets.size) : ratio(fallbackTargetCoverageWeighted, fallbackCoverageWeight);
  const noChangeRate = ratio(records.filter((record) => record.noChange).length, executedSteps);
  const stateGrowthSaturation = growthSaturation(records.map((record) => record.newState));
  const transitionGrowthSaturation = growthSaturation(records.map((record) => record.newTransition));
  const discoveredSpaceExplorationScore =
    100 *
    (0.3 * candidateEventCoverage +
      0.2 * targetCoverage +
      0.2 * payloadKindCoverage +
      0.15 * transitionGrowthSaturation +
      0.15 * stateGrowthSaturation);
  const summary: CoverageSummary = {
    totalSteps,
    executedSteps,
    discoveredStateCount: stateTable.length,
    discoveredTransitionCount: transitionTable.length,
    discoveredCandidateEventCount,
    testedCandidateEventCount,
    candidateEventCoverage,
    discoveredCanonicalCandidateEventCount,
    testedCanonicalCandidateEventCount,
    canonicalCandidateEventCoverage,
    payloadKindCoverage,
    targetCoverage,
    noChangeRate,
    routeEscapeCount,
    runtimeErrorCount,
    severeFailureCount,
    discoveredSpaceExplorationScore,
    stateGrowthSaturation,
    transitionGrowthSaturation,
  };
  const config: ExplorerConfig = {
    ...first.config,
    steps: totalSteps,
    seed: options.seed,
    reportDir: options.reportDir,
  };

  return {
    config,
    seed: options.seed,
    summary,
    newStateCurve: cumulative(records.map((record) => record.newState)),
    newTransitionCurve: cumulative(records.map((record) => record.newTransition)),
    stateTable,
    transitionTable,
    frontierStates: frontierStates(stateTable),
    untestedCandidateEvents: untestedCandidateEvents(stateTable, Array.from(untestedFallback.values())),
    canonicalCandidateEvents: Array.from(canonicalCandidateEvents).sort(),
    testedCanonicalCandidateEvents: Array.from(testedCanonicalCandidateEvents).sort(),
    eventSequence: records,
    replayCommand: options.replayCommand,
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
    topNoChangeEventRows,
  };
}

function compactStateNode(state: StateNode): StateNode {
  return {
    ...state,
    fingerprint: trimText(state.fingerprint, 320),
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
  return {
    seed: result.seed,
    summary: result.summary,
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
    replayCommand: result.replayCommand,
  };
}

function renderHtml(result: ReportResult) {
  const data = JSON.stringify(embeddedReportData(result)).replace(/</g, "\\u003c");
  const summary = result.summary;
  const operationRows = operationBreakdown(result);
  const outcome = outcomeBreakdown(result);
  const topFrontiers = result.frontierStates.slice(0, 12);
  const topUntested = result.untestedCandidateEvents.slice(0, 30);
  const latestStepCount = result.eventSequence.length;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UI 随机探索报告</title>
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
    .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
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
    @media (max-width: 960px) {
      .hero, .section-grid, .split, .explain { grid-template-columns: 1fr; }
      .cards, .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bar-row { grid-template-columns: 118px 1fr 54px; }
    }
    @media (max-width: 560px) {
      main { padding-inline: 12px; }
      .cards, .meta-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Coverage-Guided UI Random Explorer</div>
        <h1>通用 UI 随机探索报告</h1>
        <p class="muted">这份报告展示随机探索在“已发现 UI 状态空间”中的覆盖情况。它以可视化为主，下面再给出原始数据、前沿状态和复现命令。</p>
        <div class="meta-grid">
          ${meta("目标路径", result.config.targetPath)}
          ${meta("随机种子", result.seed)}
          ${meta("执行步数", `${summary.executedSteps} / ${summary.totalSteps}`)}
          ${meta("严重失败", String(summary.severeFailureCount))}
        </div>
      </div>
      <div class="panel score-panel">
        ${scoreGauge(summary.discoveredSpaceExplorationScore)}
        <h3>已发现空间探索分数</h3>
        <p class="gauge-caption">该分数只估算已发现 UI 状态空间的探索程度，不证明全系统路径已完整覆盖。</p>
      </div>
    </section>

    <section class="cards">
      ${metric("状态节点", summary.discoveredStateCount, "规范化后发现的页面状态数量")}
      ${metric("状态转移", summary.discoveredTransitionCount, "执行事件后形成的状态边数量")}
      ${metric("状态内候选覆盖", percent(summary.candidateEventCoverage), `${summary.testedCandidateEventCount} / ${summary.discoveredCandidateEventCount}`)}
      ${metric(
        "规范化候选覆盖",
        percent(summary.canonicalCandidateEventCoverage),
        `${summary.testedCanonicalCandidateEventCount} / ${summary.discoveredCanonicalCandidateEventCount}`,
      )}
      ${metric("无变化比例", percent(summary.noChangeRate), "执行后状态未变化的事件占比")}
      ${metric("目标覆盖", percent(summary.targetCoverage), "被操作过的目标 / 已发现目标")}
      ${metric("输入类别覆盖", percent(summary.payloadKindCoverage), "已覆盖 payloadKind / 总 payloadKind")}
      ${metric("路径逃逸", summary.routeEscapeCount, "跳出安全作用域后会 reset")}
      ${metric("运行异常", summary.runtimeErrorCount, "普通异常会记录，不一定 fail")}
    </section>

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
          <span><i class="dot" style="background: var(--amber)"></i>无变化</span>
          <span><i class="dot" style="background: var(--red)"></i>异常</span>
        </div>
      </div>
    </section>

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

    <h2>操作分布</h2>
    <section class="panel chart">
      <h3>随机事件类型</h3>
      <div class="bars">
        ${operationRows.map((row) => progressRow(operationLabel(row.operation), row.count / Math.max(1, latestStepCount), "slate", `${row.count} 次`)).join("")}
      </div>
    </section>

    <h2>未探索前沿</h2>
    <section class="section-grid">
      <div class="panel chart">
        <h3>前沿状态 Top ${topFrontiers.length}</h3>
        <div class="frontier-list">
          ${topFrontiers.map((state) => frontierItem(state)).join("")}
        </div>
      </div>
      <div class="panel chart">
        <h3>如何解读前沿</h3>
        <p class="muted">前沿状态是已经发现、但仍有大量候选事件没有执行的状态。它们代表下一轮探索最值得投入预算的区域。</p>
        <div class="notice compact">“状态内候选覆盖”是严格口径；“规范化候选覆盖”会跨状态合并同类组件和同类操作，更适合判断底层事件族是否已经探索过。</div>
      </div>
    </section>

    <h2>详细数据</h2>
    <section class="split">
      <div>
        <h3>状态覆盖表</h3>
        ${stateTable(result.stateTable)}
      </div>
      <div>
        <h3>未测试候选事件</h3>
        ${untestedTable(topUntested)}
      </div>
    </section>

    <h2>无变化事件与异常</h2>
    <section class="split">
      <div>
        <h3>Top 无变化事件</h3>
        ${topNoChangeEvents(result)}
      </div>
      <div>
        <h3>运行异常</h3>
        ${runtimeErrors(result)}
      </div>
    </section>

    <h2>解释与复现</h2>
    <section class="explain">
      <div class="panel">
        <h3>这不是业务 E2E</h3>
        <p class="muted compact">事件生成层只认识 Operation、Target、Params，不理解登录、注册、悬赏、结算等业务语义。</p>
      </div>
      <div class="panel">
        <h3>这不是完整路径覆盖证明</h3>
        <p class="muted compact">分数只估算已发现 UI 状态空间的探索程度，隐藏状态和未发现入口不能被证明覆盖。</p>
      </div>
      <div class="panel">
        <h3>后续可接 A 层</h3>
        <p class="muted compact">后续可以增加 PatternMatcher，把随机轨迹后验匹配到业务测试集合 A。</p>
      </div>
    </section>
    <h3 style="margin-top: 18px">复现命令</h3>
    <pre>${escapeHtml(result.replayCommand)}</pre>
    <script type="application/json" id="ui-explorer-result">${data}</script>
  </main>
</body>
</html>`;
}

function meta(label: string, value: string) {
  return `<div class="meta"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function metric(label: string, value: string | number, hint: string) {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function scoreGauge(score: number) {
  const clamped = Math.max(0, Math.min(100, score));
  return `<div class="gauge" style="--score:${(clamped / 100) * 360}deg"><div class="gauge-value">${clamped.toFixed(0)}</div></div>`;
}

function progressRow(label: string, value: number, color: string, valueLabel = percent(value)) {
  const clamped = Math.max(0, Math.min(1, value));
  return `<div class="bar-row"><div class="chart-label">${escapeHtml(label)}</div><div class="bar"><span class="${escapeHtml(color)}" style="width:${clamped * 100}%"></span></div><strong>${escapeHtml(valueLabel)}</strong></div>`;
}

function stackedOutcome(outcome: ReturnType<typeof outcomeBreakdown>) {
  const total = Math.max(1, outcome.total);
  const segments = [
    { value: outcome.newState, color: "var(--green)", label: "新状态" },
    { value: outcome.newTransitionOnly, color: "var(--blue)", label: "新转移" },
    { value: outcome.noChange, color: "var(--amber)", label: "无变化" },
    { value: outcome.issue, color: "var(--red)", label: "异常" },
  ];
  return `<div class="bar" style="height: 22px; display:flex">
    ${segments
      .map(
        (segment) =>
          `<span title="${escapeHtml(segment.label)} ${segment.value}" style="width:${(segment.value / total) * 100}%; background:${segment.color}"></span>`,
      )
      .join("")}
  </div>
  <div class="cards" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px">
    ${metric("新状态", outcome.newState, "产生新状态节点")}
    ${metric("仅新转移", outcome.newTransitionOnly, "未产生新状态但产生新边")}
    ${metric("无变化", outcome.noChange, "状态未变化")}
    ${metric("异常", outcome.issue, "含普通或严重异常")}
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

function frontierItem(state: StateNode) {
  const ratio = state.untestedCandidateCount / Math.max(1, state.candidateCount);
  return `<div class="frontier-item">
    <div><div class="frontier-id">${escapeHtml(state.id)}</div><div class="frontier-route">${escapeHtml(state.routePattern)}</div></div>
    <div class="bar"><span class="amber" style="width:${ratio * 100}%"></span></div>
    <strong>${state.untestedCandidateCount}/${state.candidateCount}</strong>
  </div>`;
}

function stateTable(states: StateNode[]) {
  return `<div class="table-wrap"><table><thead><tr><th>状态</th><th>路径</th><th>访问</th><th>候选</th><th>已测</th><th>未测</th><th>新状态输出</th><th>异常</th></tr></thead><tbody>
    ${states
      .slice(0, 100)
      .map(
        (state) =>
          `<tr><td><code>${escapeHtml(state.id)}</code></td><td>${escapeHtml(state.routePattern)}</td><td>${state.visits}</td><td>${state.candidateCount}</td><td>${state.testedCandidateCount}</td><td>${state.untestedCandidateCount}</td><td>${state.newStateOutCount}</td><td>${state.errorCount}</td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}

function untestedTable(items: ExplorerRunResult["untestedCandidateEvents"]) {
  return `<div class="table-wrap"><table><thead><tr><th>状态</th><th>操作</th><th>事件</th><th>目标</th></tr></thead><tbody>
    ${items
      .map(
        (item) =>
          `<tr><td><code>${escapeHtml(item.stateId)}</code></td><td><span class="pill">${escapeHtml(operationLabel(item.operation))}</span></td><td><code>${escapeHtml(item.eventSignature)}</code></td><td><code>${escapeHtml(item.targetSignature ?? "page")}</code></td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}

function topNoChangeEvents(result: ReportResult) {
  const rows =
    result.topNoChangeEventRows ??
    collectTopNoChangeEventRows(result.stateTable)
      .sort((left, right) => right.noChangeCount - left.noChangeCount)
      .slice(0, 30);
  return `<div class="table-wrap"><table><thead><tr><th>状态</th><th>事件</th><th>无变化</th><th>尝试</th></tr></thead><tbody>
    ${rows
      .map(
        (row) =>
          `<tr><td><code>${escapeHtml(row.stateId)}</code></td><td><code>${escapeHtml(row.eventSignature)}</code></td><td>${row.noChangeCount}</td><td>${row.attempts}</td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}

function runtimeErrors(result: ExplorerRunResult) {
  const issues = result.eventSequence.flatMap((record) =>
    record.issues.map((issue) => ({ step: record.step, operation: record.operation, event: record.eventSignature, issue })),
  );
  return `<div class="table-wrap"><table><thead><tr><th>步数</th><th>级别</th><th>类型</th><th>说明</th><th>事件</th></tr></thead><tbody>
    ${issues.length === 0 ? `<tr><td colspan="5" class="muted">本次没有记录异常。</td></tr>` : ""}
    ${issues
      .slice(0, 100)
      .map(
        ({ step, event, issue }) =>
          `<tr><td>${step}</td><td>${escapeHtml(severityLabel(issue.severity))}</td><td>${escapeHtml(issue.type)}</td><td>${escapeHtml(issue.message)}</td><td><code>${escapeHtml(event)}</code></td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}

function cloneStateNode(state: StateNode): StateNode {
  return {
    ...state,
    candidates: state.candidates.map((candidate) => ({
      ...candidate,
      event: {
        ...candidate.event,
        params: { ...candidate.event.params },
        target: candidate.event.target ? { ...candidate.event.target, capabilities: [...candidate.event.target.capabilities] } : undefined,
      },
    })),
  };
}

function mergeCandidateRecords(left: CandidateEventRecord[], right: CandidateEventRecord[]) {
  const records = new Map<string, CandidateEventRecord>();
  for (const candidate of [...left, ...right]) {
    const existing = records.get(candidate.eventSignature);
    if (!existing) {
      records.set(candidate.eventSignature, {
        ...candidate,
        event: {
          ...candidate.event,
          params: { ...candidate.event.params },
          target: candidate.event.target ? { ...candidate.event.target, capabilities: [...candidate.event.target.capabilities] } : undefined,
        },
      });
      continue;
    }
    existing.attempts += candidate.attempts;
    existing.successCount += candidate.successCount;
    existing.noChangeCount += candidate.noChangeCount;
    existing.newStateCount += candidate.newStateCount;
    existing.errorCount += candidate.errorCount;
    existing.routeEscapeCount += candidate.routeEscapeCount;
    existing.lastReward = Math.max(existing.lastReward, candidate.lastReward);
  }
  return Array.from(records.values());
}

function refreshCandidateStats(state: StateNode) {
  state.candidateCount = state.candidates.length;
  state.testedCandidateCount = state.candidates.filter((candidate) => candidate.attempts > 0).length;
  state.untestedCandidateCount = state.candidateCount - state.testedCandidateCount;
}

function frontierStates(states: StateNode[]) {
  return states
    .filter((state) => state.untestedCandidateCount > 0)
    .sort((left, right) => {
      const leftRatio = left.untestedCandidateCount / Math.max(1, left.candidateCount);
      const rightRatio = right.untestedCandidateCount / Math.max(1, right.candidateCount);
      return rightRatio - leftRatio || right.newStateOutCount - left.newStateOutCount || left.visits - right.visits;
    })
    .slice(0, 50);
}

function untestedCandidateEvents(states: StateNode[], fallback: ExplorerRunResult["untestedCandidateEvents"] = []) {
  const fromCandidates = states
    .flatMap((state) =>
      state.candidates
        .filter((candidate) => candidate.attempts === 0)
        .map((candidate) => ({
          stateId: state.id,
          eventSignature: candidate.eventSignature,
          operation: candidate.event.operation,
          targetSignature: candidate.event.target?.signature,
        })),
    )
    .slice(0, 100);
  return fromCandidates.length > 0 ? fromCandidates : fallback.slice(0, 100);
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function growthSaturation(values: boolean[]) {
  if (values.length === 0) {
    return 0;
  }
  const tailLength = Math.max(1, Math.ceil(values.length * 0.2));
  const tail = values.slice(-tailLength);
  const newRate = tail.filter(Boolean).length / tail.length;
  return Math.max(0, Math.min(1, 1 - newRate / 0.2));
}

function cumulative(values: boolean[]) {
  let count = 0;
  return values.map((value) => {
    if (value) {
      count += 1;
    }
    return count;
  });
}

function operationBreakdown(result: ExplorerRunResult) {
  const counts = new Map<UiOperation, number>();
  for (const record of result.eventSequence) {
    counts.set(record.operation, (counts.get(record.operation) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([operation, count]) => ({ operation, count }))
    .sort((left, right) => right.count - left.count);
}

function outcomeBreakdown(result: ExplorerRunResult) {
  const total = result.eventSequence.length;
  const newState = result.eventSequence.filter((record) => record.newState).length;
  const newTransitionOnly = result.eventSequence.filter((record) => !record.newState && record.newTransition).length;
  const noChange = result.eventSequence.filter((record) => record.noChange).length;
  const issue = result.eventSequence.filter((record) => record.issues.length > 0).length;
  return { total, newState, newTransitionOnly, noChange, issue };
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
    wheel: "滚轮",
    backgroundClick: "背景点击",
    refresh: "刷新",
    back: "后退",
    wait: "等待",
    repeatedClick: "连续点击",
  };
  return labels[operation];
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
