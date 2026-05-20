import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { outcomeBreakdown, writeExplorerReport, writeMergedExplorerReport } from "../e2e/_explorer/reporter";
import type { CoverageSummary, ExplorerConfig, ExplorerRunResult, StateNode, StepRecord, TransitionEdge } from "../e2e/_explorer/types";

test("merged explorer report recomputes novelty globally across shards", async () => {
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-reporter-"));
  const root = state("root", 0);
  const dialog = state("dialog", 1);
  const repeatedDiscovery = stepRecord({
    beforeStateId: root.id,
    afterStateId: dialog.id,
    eventSignature: "click:open-dialog",
    newState: true,
    newTransition: true,
  });

  const first = runResult("seed-a", [root, dialog], [transition(root.id, dialog.id, "click:open-dialog")], [repeatedDiscovery]);
  const second = runResult("seed-b", [root, dialog], [transition(root.id, dialog.id, "click:open-dialog")], [repeatedDiscovery]);

  const merged = await writeMergedExplorerReport([first, second], {
    reportDir,
    seed: "merged-seed",
    replayCommand: "npm run test:e2e:explorer:fast",
  });

  assert.deepEqual(merged.result.newStateCurve, [1, 1]);
  assert.deepEqual(merged.result.newTransitionCurve, [1, 1]);
  assert.equal(merged.result.summary.discoveredStateCount, 2);
  assert.equal(merged.result.summary.discoveredTransitionCount, 1);
});

test("outcome breakdown keeps chart categories mutually exclusive", () => {
  const records = [
    stepRecord({ beforeStateId: "S-a", afterStateId: "S-b", eventSignature: "click:new-state", newState: true, newTransition: true }),
    stepRecord({ beforeStateId: "S-b", afterStateId: "S-c", eventSignature: "click:new-edge", newTransition: true }),
    stepRecord({ beforeStateId: "S-c", afterStateId: "S-c", eventSignature: "click:self-loop", newTransition: true, noChange: true }),
    stepRecord({ beforeStateId: "S-c", afterStateId: "S-b", eventSignature: "click:known-change" }),
    stepRecord({
      beforeStateId: "S-b",
      afterStateId: "S-b",
      eventSignature: "click:error",
      noChange: true,
      issues: [{ severity: "ordinary", type: "probe", message: "ordinary issue" }],
    }),
  ];

  const outcome = outcomeBreakdown({ eventSequence: records });
  const mutuallyExclusiveTotal = outcome.newState + outcome.newTransition + outcome.knownChange + outcome.noChange;

  assert.equal(mutuallyExclusiveTotal, outcome.total);
  assert.equal(outcome.newState, 1);
  assert.equal(outcome.newTransition, 1);
  assert.equal(outcome.knownChange, 1);
  assert.equal(outcome.noChange, 2);
  assert.equal(outcome.issue, 1);
});

test("explorer report writes repeatable-region supplementary report when present", async () => {
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-repeatable-reporter-"));
  const result = runResult("seed-repeatable", [state("root", 0)], [], []);
  result.config.reportDir = reportDir;
  result.repeatableRegionExploration = {
    summary: {
      enabled: true,
      testObjectCount: 1,
      testedObjectCount: 1,
      skippedObjectCount: 0,
      executedSteps: 1,
      discoveredCandidateEventCount: 2,
      testedCandidateEventCount: 1,
      candidateEventCoverage: 0.5,
      noChangeRate: 1,
      stateChangeCount: 0,
      routeEscapeCount: 0,
      leftRegionCount: 0,
      runtimeErrorCount: 0,
      severeFailureCount: 0,
    },
    maxObjects: 12,
    stepsPerObject: 8,
    seed: "seed-repeatable:repeatable-region",
    objects: [],
    replayCommand: "npm run test:e2e:explorer",
  };

  const paths = await writeExplorerReport(result);

  if (!paths.repeatableRegionReportPath || !paths.repeatableRegionHtmlReportPath) {
    throw new Error("Expected repeatable-region report paths.");
  }
  assert.ok(await exists(paths.repeatableRegionReportPath));
  assert.ok(await exists(paths.repeatableRegionHtmlReportPath));
});

test("explorer report archives screenshots into report folder", async () => {
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-screenshot-reporter-"));
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-screenshot-source-"));
  const sourcePath = path.join(sourceDir, "state.png");
  await fs.writeFile(sourcePath, "png");
  const result = runResult("seed-screenshot", [state("root", 0)], [], []);
  result.config.reportDir = reportDir;
  result.screenshotArtifacts = [
    {
      id: "shot-state",
      kind: "state",
      path: sourcePath,
      fileName: "state.png",
      stateId: "S-root",
      routePattern: "/auth",
      step: 0,
    },
  ];

  const paths = await writeExplorerReport(result);
  const runDir = path.dirname(paths.reportPath);
  const archivedPath = path.join(runDir, "screenshots", "states", "state.png");

  assert.ok(await exists(archivedPath));
  const json = JSON.parse(await fs.readFile(paths.reportPath, "utf8"));
  assert.equal(json.screenshotArtifacts[0].relativePath, "screenshots/states/state.png");
});

test("explorer report prioritizes result summary and embeds path replay data", async () => {
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-report-layout-"));
  const root = state("root", 0);
  const next = state("next", 1);
  const result = runResult(
    "seed-layout",
    [root, next],
    [transition(root.id, next.id, "click:open")],
    [stepRecord({ beforeStateId: root.id, afterStateId: next.id, eventSignature: "click:open", newState: true })],
  );
  result.config.reportDir = reportDir;

  const paths = await writeExplorerReport(result);
  const html = await fs.readFile(paths.htmlReportPath, "utf8");
  const graphIndex = html.indexOf("<h2>状态图</h2>");
  const settingsIndex = html.indexOf("<h2>测试环境与复现</h2>");
  const safetyIndex = html.indexOf("安全边界");

  assert.ok(html.includes("被测对象"));
  assert.ok(html.includes("被测工程"));
  assert.ok(html.includes("入口 URL"));
  assert.ok(html.includes("SEED"));
  assert.ok(html.includes("成功事件"));
  assert.ok(html.includes("异常事件"));
  assert.ok(html.includes("探索路径回放"));
  assert.ok(html.includes("退出回放"));
  assert.ok(html.includes('"replaySteps"'));
  assert.ok(graphIndex >= 0);
  assert.ok(settingsIndex > graphIndex);
  assert.ok(safetyIndex > settingsIndex);
  assert.ok(html.includes("Base URL"));
  assert.ok(html.includes("浏览器"));
  assert.ok(html.includes("Node.js"));
  assert.equal(html.includes("<h2>详细数据</h2>"), false);
  assert.equal(html.includes("<h2>无变化事件</h2>"), false);
  assert.equal(html.includes("<h2>状态截图</h2>"), false);
  assert.equal(html.includes("这不是业务 E2E"), false);
});

test("explorer report describes issues in human terms and links them to graph replay", async () => {
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "orf-ui-report-issues-"));
  const root = state("root", 0);
  const result = runResult("seed-issues", [root], [], [
    stepRecord({
      step: 7,
      beforeStateId: root.id,
      afterStateId: root.id,
      eventSignature: "click:stale-target",
      noChange: true,
      issues: [{ severity: "ordinary", type: "timeout", message: "locator.click: Timeout 1500ms exceeded" }],
    }),
  ]);
  result.config.reportDir = reportDir;

  const paths = await writeExplorerReport(result);
  const html = await fs.readFile(paths.htmlReportPath, "utf8");

  assert.ok(html.includes("本次发现 1 个异常步骤"));
  assert.ok(html.includes("操作超时"));
  assert.ok(html.includes("在状态图中定位"));
  assert.ok(html.includes('data-replay-step="7"'));
  assert.equal(html.includes("locator.click: Timeout 1500ms exceeded"), false);
});

function runResult(seed: string, states: StateNode[], transitions: TransitionEdge[], records: StepRecord[]): ExplorerRunResult {
  return {
    config: config(seed, records.length),
    seed,
    summary: summary(records, states, transitions),
    newStateCurve: cumulative(records.map((record) => record.newState)),
    newTransitionCurve: cumulative(records.map((record) => record.newTransition)),
    stateTable: states,
    transitionTable: transitions,
    frontierStates: [],
    untestedCandidateEvents: [],
    canonicalCandidateEvents: [],
    testedCanonicalCandidateEvents: [],
    eventSequence: records,
    screenshotArtifacts: [],
    replayCommand: "npm run test:e2e:explorer",
  };
}

function config(seed: string, steps: number): ExplorerConfig {
  return {
    testKind: "stateExploration",
    safetyProfile: "auth",
    targetPath: "/auth",
    steps,
    maxDurationMs: 0,
    seed,
    reportDir: ".artifacts/ui-explorer",
    maxNoChange: 30,
    baseURL: "http://127.0.0.1:5673",
    allowedOrigins: ["http://127.0.0.1:5673"],
    allowedPathPatterns: ["/auth"],
    blockedPathPatterns: [],
    blockedOperationKinds: [],
    blockedTargetTextPatterns: [],
    maxStepDuration: 1000,
    resetOnRouteEscape: true,
    stopOnRouteEscape: false,
    stateAbstractor: "stateExploration",
    epsilon: 0.1,
    runRepeatableRegionTests: true,
    repeatableRegionMaxObjects: 12,
    repeatableRegionStepsPerObject: 8,
    screenshotDir: ".artifacts/ui-explorer/.tmp-screenshots/test",
    stateScreenshotLimit: 200,
    issueScreenshotLimit: 80,
  };
}

function summary(records: StepRecord[], states: StateNode[], transitions: TransitionEdge[]): CoverageSummary {
  return {
    totalSteps: records.length,
    executedSteps: records.length,
    discoveredStateCount: states.length,
    discoveredTransitionCount: transitions.length,
    discoveredCandidateEventCount: 0,
    testedCandidateEventCount: 0,
    candidateEventCoverage: 0,
    discoveredCanonicalCandidateEventCount: 0,
    testedCanonicalCandidateEventCount: 0,
    canonicalCandidateEventCoverage: 0,
    payloadKindCoverage: 0,
    targetCoverage: 0,
    noChangeRate: 0,
    routeEscapeCount: 0,
    runtimeErrorCount: 0,
    severeFailureCount: 0,
    discoveredSpaceExplorationScore: 0,
    stateGrowthSaturation: 0,
    transitionGrowthSaturation: 0,
    repeatableRegionCount: 0,
  };
}

function state(name: string, step: number): StateNode {
  return {
    id: `S-${name}`,
    fingerprint: `fingerprint-${name}`,
    routePattern: "/auth",
    visits: 1,
    firstSeenStep: step,
    lastSeenStep: step,
    candidateCount: 0,
    testedCandidateCount: 0,
    untestedCandidateCount: 0,
    noChangeCount: 0,
    newStateOutCount: 0,
    errorCount: 0,
    repeatableRegionStates: [],
    repeatableRegions: [],
    candidates: [],
  };
}

function transition(fromStateId: string, toStateId: string, eventSignature: string): TransitionEdge {
  return {
    fromStateId,
    toStateId,
    eventSignature,
    count: 1,
    firstSeenStep: 0,
    lastSeenStep: 0,
    reward: 15,
  };
}

function stepRecord(overrides: Partial<StepRecord>): StepRecord {
  const beforeStateId = overrides.beforeStateId ?? "S-before";
  const afterStateId = overrides.afterStateId ?? "S-after";
  return {
    step: overrides.step ?? 0,
    beforeStateId,
    afterStateId,
    eventSignature: overrides.eventSignature ?? "click:event",
    operation: overrides.operation ?? "click",
    targetSignature: overrides.targetSignature,
    params: overrides.params ?? {},
    reward: overrides.reward ?? 0,
    newState: overrides.newState ?? false,
    newTransition: overrides.newTransition ?? false,
    noChange: overrides.noChange ?? beforeStateId === afterStateId,
    routeEscape: overrides.routeEscape ?? false,
    issues: overrides.issues ?? [],
  };
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

async function exists(file: string) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}
