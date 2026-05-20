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
  const recordsByWorker: Array<StepRecord & { workerIndex: number; localStep: number }> = [];
  let fallbackTargetCoverageWeighted = 0;
  let fallbackPayloadCoverageWeighted = 0;
  let fallbackCoverageWeight = 0;

  for (const [workerIndex, result] of results.entries()) {
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
      recordsByWorker.push({
        ...record,
        workerIndex,
        localStep: record.step,
      });
    }
  }

  const records = recomputeMergedRecords(recordsByWorker);

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

function recomputeMergedRecords(records: Array<StepRecord & { workerIndex: number; localStep: number }>): StepRecord[] {
  const seenStates = new Set<string>();
  const seenTransitions = new Set<string>();
  const ordered = [...records].sort(
    (left, right) => left.localStep - right.localStep || left.workerIndex - right.workerIndex,
  );

  return ordered.map((record, index) => {
    seenStates.add(record.beforeStateId);
    const transitionKey = `${record.beforeStateId}->${record.afterStateId}:${record.eventSignature}`;
    const newState = !seenStates.has(record.afterStateId);
    const newTransition = !seenTransitions.has(transitionKey);
    seenStates.add(record.afterStateId);
    seenTransitions.add(transitionKey);

    const { workerIndex: _workerIndex, localStep: _localStep, ...stepRecord } = record;
    return {
      ...stepRecord,
      step: index,
      newState,
      newTransition,
    };
  });
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
    states: result.stateTable.map((state) => ({
      id: state.id,
      routePattern: state.routePattern,
      visits: state.visits,
      firstSeenStep: state.firstSeenStep,
      lastSeenStep: state.lastSeenStep,
      candidateCount: state.candidateCount,
      testedCandidateCount: state.testedCandidateCount,
      untestedCandidateCount: state.untestedCandidateCount,
      noChangeCount: state.noChangeCount,
      newStateOutCount: state.newStateOutCount,
      errorCount: state.errorCount,
    })),
    transitions: result.transitionTable.map((transition) => ({
      fromStateId: transition.fromStateId,
      toStateId: transition.toStateId,
      eventSignature: transition.eventSignature,
      count: transition.count,
      firstSeenStep: transition.firstSeenStep,
      lastSeenStep: transition.lastSeenStep,
      reward: transition.reward,
    })),
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
  const legacyConfig = result.config as ExplorerConfig & { stateMode?: string };
  const safetyProfile = result.config.safetyProfile ?? "legacy";
  const stateAbstractor = result.config.stateAbstractor ?? legacyConfig.stateMode ?? "normal";

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
      grid-template-rows: auto minmax(0, 1fr) auto;
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
    .graph-hint {
      position: absolute;
      left: 18px;
      top: 18px;
      width: 176px;
      padding: 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #e4e9f2;
      box-shadow: 0 12px 30px rgba(16, 24, 40, 0.12);
      z-index: 2;
      font-size: 13px;
      color: #344054;
    }
    .graph-hint h3 {
      margin: 0 0 10px;
      font-size: 15px;
    }
    .graph-hint p {
      margin: 8px 0 0;
      line-height: 1.4;
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
    .graph-legend-line {
      width: 18px;
      height: 2px;
      background: #98a2b3;
    }
    .graph-legend-line.path { background: var(--amber); }
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
    .graph-node.path rect {
      fill: #eaf4ff;
      stroke: var(--blue);
    }
    .graph-node.connected rect {
      fill: #f8fbff;
      stroke: #8aa0bd;
      stroke-width: 2.4;
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
      .cards, .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
      .cards, .meta-grid { grid-template-columns: 1fr; }
      .outcome-cards { grid-template-columns: 1fr; }
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
          ${meta("安全边界", safetyProfile)}
          ${meta("目标路径", result.config.targetPath)}
          ${meta("状态抽象", stateAbstractor)}
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
      ${metric("目标覆盖", percent(summary.targetCoverage), "被操作过的路径内目标 / 已发现路径内目标")}
      ${metric("输入类别覆盖", percent(summary.payloadKindCoverage), "已覆盖 payloadKind / 总 payloadKind")}
      ${metric("路径逃逸", summary.routeEscapeCount, "跳出安全作用域后会 reset")}
      ${metric("运行异常", summary.runtimeErrorCount, "普通异常会记录，不一定 fail")}
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
          <div class="graph-hint">
            <h3>交互提示</h3>
            <p>点击节点选择状态，最多选择两个状态。</p>
            <p>选择两个状态后，高亮两点间最短路径。</p>
            <p>点击边可以查看事件转移。</p>
          </div>
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
            <div><span class="graph-legend-dot"></span>未选中状态</div>
            <div><span class="graph-legend-dot selected"></span>已选中状态</div>
            <div><span class="graph-legend-line"></span>事件转移</div>
            <div><span class="graph-legend-line path"></span>最短路径</div>
          </div>
        </aside>
      </div>
      <div class="graph-path-panel">
        <div class="graph-path-header">
          <h3>最短路径</h3>
          <span class="muted">基于本次已记录的状态转移计算</span>
        </div>
        <div id="graphPathDetails"></div>
      </div>
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
          <span><i class="dot" style="background: var(--cyan)"></i>已知变化</span>
          <span><i class="dot" style="background: var(--amber)"></i>无变化</span>
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
    <script>${graphClientScript()}</script>
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
};

type ReportGraphState = {
  id: string;
  routePattern?: string;
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
  count?: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  reward?: number;
};

type ReportGraphEdge = {
  from: string;
  to: string;
  eventSignature: string;
  count?: number;
  firstSeenStep?: number;
  lastSeenStep?: number;
  reward?: number;
  operation: string;
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
  const edges: ReportGraphEdge[] = Array.isArray(payload.transitions)
    ? payload.transitions.map((edge, index) => ({
        from: String(edge.fromStateId ?? ""),
        to: String(edge.toStateId ?? ""),
        eventSignature: String(edge.eventSignature ?? ""),
        count: edge.count,
        firstSeenStep: edge.firstSeenStep,
        lastSeenStep: edge.lastSeenStep,
        reward: edge.reward,
        operation: operationOf(edge.eventSignature),
        _key: [index, edge.fromStateId ?? "", edge.toStateId ?? "", edge.eventSignature ?? ""].join("::"),
      }))
    : [];

  let positions = new Map<string, ReportGraphPoint>();
  let selected: string[] = [];
  let hovered: string | null = null;
  let selectedEdge: string | null = null;
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

  function stateById(id: string) {
    return states.find((state) => state.id === id);
  }

  function edgeKey(edge: ReportGraphEdge) {
    return edge._key;
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
    const term = String(stateSearch?.value || "").trim().toLowerCase();
    if (!term) {
      return new Set(states.map((state) => state.id));
    }
    return new Set(
      states
        .filter((state) => `${state.id ?? ""} ${state.routePattern ?? ""}`.toLowerCase().includes(term))
        .map((state) => state.id),
    );
  }

  function filteredEdges() {
    const operation = String(eventFilter?.value || "");
    const visibleStates = filteredStateIds();
    return edges.filter(
      (edge) => visibleStates.has(edge.from) && visibleStates.has(edge.to) && (!operation || edge.operation === operation),
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

  function buildIncoming() {
    const incoming = new Map<string, ReportGraphEdge[]>();
    for (const edge of edges) {
      if (!incoming.has(edge.to)) {
        incoming.set(edge.to, []);
      }
      incoming.get(edge.to)!.push(edge);
    }
    return incoming;
  }

  function layoutStates() {
    positions = new Map<string, ReportGraphPoint>();
    if (!states.length) {
      return;
    }

    const root = states[0].id;
    const depth = new Map<string, number>();
    const adjacency = buildAdjacency(false);
    const incoming = buildIncoming();
    const queue = [root];
    depth.set(root, 0);

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      for (const edge of adjacency.get(current) || []) {
        if (depth.has(edge.to)) {
          continue;
        }
        depth.set(edge.to, (depth.get(current) || 0) + 1);
        queue.push(edge.to);
      }
    }

    const reachedMaxDepth = Math.max(0, ...Array.from(depth.values()));
    const unreachableDepth = reachedMaxDepth + 1;
    const layers = new Map<number, ReportGraphState[]>();
    for (const state of states) {
      const stateDepth = depth.get(state.id) ?? unreachableDepth;
      if (!layers.has(stateDepth)) {
        layers.set(stateDepth, []);
      }
      layers.get(stateDepth)!.push(state);
    }

    const sortedDepths = Array.from(layers.keys()).sort((left, right) => left - right);

    function stateSort(left: ReportGraphState, right: ReportGraphState) {
      return (
        (left.firstSeenStep ?? 0) - (right.firstSeenStep ?? 0) ||
        String(left.id ?? "").localeCompare(String(right.id ?? ""))
      );
    }

    function parentAngle(state: ReportGraphState) {
      const parents = (incoming.get(state.id) || [])
        .map((edge) => positions.get(edge.from)?.angle)
        .filter((angle): angle is number => typeof angle === "number");
      if (parents.length === 0) {
        return Number.POSITIVE_INFINITY;
      }
      return parents.reduce((sum, angle) => sum + angle, 0) / parents.length;
    }

    positions.set(root, {
      x: 0,
      y: 0,
      depth: 0,
      unreachable: false,
      angle: -Math.PI / 2,
    });

    let previousRadius = 0;
    for (const layerDepth of sortedDepths.filter((item) => item !== 0)) {
      const layerStates = (layers.get(layerDepth) ?? []).slice().sort((left, right) => {
        const leftParentAngle = parentAngle(left);
        const rightParentAngle = parentAngle(right);
        if (leftParentAngle !== rightParentAngle) {
          return leftParentAngle - rightParentAngle;
        }
        return stateSort(left, right);
      });
      const depthIndex = Math.max(1, layerDepth);
      const requiredRadius = (layerStates.length * 42) / (Math.PI * 2);
      const radius = Math.max(190 + (depthIndex - 1) * 130, previousRadius + 105, requiredRadius);
      const angleOffset = -Math.PI / 2 + depthIndex * 0.41;
      const angleStep = (Math.PI * 2) / Math.max(1, layerStates.length);

      layerStates.forEach((state, index) => {
        const angle = angleOffset + index * angleStep;
        positions.set(state.id, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          depth: layerDepth,
          unreachable: !depth.has(state.id),
          angle,
        });
      });
      previousRadius = radius;
    }
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
    const operations = Array.from(new Set(edges.map((edge) => edge.operation).filter(Boolean))).sort();
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

  function render() {
    clearSvg();
    graphEmpty.textContent = "";

    if (!states.length) {
      graphEmpty.textContent = "本次报告没有状态图数据。";
      renderDetails();
      renderPath(null);
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
    const visibleStates = filteredStateIds();
    const visibleEdges = filteredEdges();
    const visibleEdgeKeys = new Set(visibleEdges.map(edgeKey));
    const directStateIds = new Set();
    const directEdgeKeys = new Set();
    const focusStateIds = new Set();
    const focusEdgeKeys = new Set();
    const hasFocus = selected.length === 1 || selected.length === 2;

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
      const isSelectedEdge = selectedEdge === key;
      const isPath = pathEdges.has(key);
      const isDirect = directEdgeKeys.has(key);
      const isCross = edge.from === edge.to || Math.abs((to.depth || 0) - (from.depth || 0)) !== 1;
      const dimmed = !visible || (hasFocus && !focusEdgeKeys.has(key));
      const pathShape = edgePath(edge, from, to);
      const line = svgElement("path", {
        d: pathShape.d,
        class: `graph-edge${isCross ? " cross" : ""}${isPath ? " path" : ""}${isDirect ? " connected" : ""}${isSelectedEdge ? " selected" : ""}${dimmed ? " dimmed" : ""}`,
      });
      edgeLayer.append(line);

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

      if (visible && isSelectedEdge) {
        const label = svgElement("text", {
          x: pathShape.labelX,
          y: pathShape.labelY,
          class: "graph-edge-label selected",
        });
        label.textContent = operationLabel(edge.operation);
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
      const visible = visibleStates.has(state.id);
      const dimmed = !visible || (hasFocus && !focusStateIds.has(state.id));
      const group = svgElement("g", {
        class: `graph-node${isSelected ? " selected" : ""}${isPath ? " path" : ""}${isDirect ? " connected" : ""}${dimmed ? " dimmed" : ""}`,
        transform: `translate(${point.x} ${point.y})`,
        tabindex: "0",
      });
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

    renderSummary();
    renderDetails();
    renderPath(path);
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
      details.innerHTML = `
        <div class="graph-state-title">${escapeHtmlLocal(operationLabel(edge.operation))}</div>
        <div class="muted"><code>${escapeHtmlLocal(edge.eventSignature)}</code></div>
        <dl class="graph-detail-list">
          <dt>起点</dt><dd><code>${escapeHtmlLocal(edge.from)}</code></dd>
          <dt>终点</dt><dd><code>${escapeHtmlLocal(edge.to)}</code></dd>
          <dt>出现次数</dt><dd>${edge.count ?? 0}</dd>
          <dt>首次步数</dt><dd>${edge.firstSeenStep ?? ""}</dd>
          <dt>末次步数</dt><dd>${edge.lastSeenStep ?? ""}</dd>
          <dt>奖励</dt><dd>${edge.reward ?? ""}</dd>
        </dl>
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
                  <div><strong>${escapeHtmlLocal(operationLabel(edgeItem.operation))}</strong></div>
                  <div class="muted">to <code>${escapeHtmlLocal(edgeItem.to)}</code></div>
                  <code class="muted">${escapeHtmlLocal(edgeItem.eventSignature)}</code>
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
        steps.push(`<span class="graph-path-event" title="${escapeHtmlLocal(edge.eventSignature)}">${escapeHtmlLocal(operationLabel(edge.operation))}</span>`);
      }
    });
    pathDetails.innerHTML = `<div class="graph-path-steps">${steps.join("")}</div>`;
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
