import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { outcomeBreakdown, writeMergedExplorerReport } from "../e2e/_explorer/reporter";
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
    replayCommand: "npm run test:e2e:explorer",
  };
}

function config(seed: string, steps: number): ExplorerConfig {
  return {
    targetPath: "/auth",
    steps,
    seed,
    reportDir: ".artifacts/ui-explorer",
    maxNoChange: 30,
    baseURL: "http://127.0.0.1:5673",
    allowedOrigins: ["http://127.0.0.1:5673"],
    allowedPathPatterns: ["/auth"],
    blockedPathPatterns: [],
    blockedOperationKinds: [],
    maxStepDuration: 1000,
    resetOnRouteEscape: true,
    stopOnRouteEscape: false,
    stateMode: "normal",
    epsilon: 0.1,
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
