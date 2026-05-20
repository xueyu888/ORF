import assert from "node:assert/strict";
import test from "node:test";
import { CoverageGraph } from "../e2e/_explorer/coverageGraph";
import type { ExecutionResult, NormalizedState, UiEvent, UiTarget } from "../e2e/_explorer/types";

test("coverage graph tracks states, transitions, and candidate coverage", () => {
  const graph = new CoverageGraph();
  const stateA = state("A");
  const stateB = state("B");
  const eventA = event("click:target-a");
  const eventB = event("insert:target-a", { payloadKind: "asciiText" });

  graph.observeState(stateA, [eventA, eventB], 0);
  const update = graph.addTransition(stateA, eventA, stateB, okExecution(), 1);
  graph.observeState(stateB, [], 1);

  assert.equal(update.newState, true);
  assert.equal(update.newTransition, true);
  const summary = graph.summarize(2, [
    {
      step: 1,
      beforeStateId: stateA.id,
      afterStateId: stateB.id,
      eventSignature: eventA.signature,
      operation: eventA.operation,
      targetSignature: eventA.target?.signature,
      params: eventA.params,
      reward: update.reward,
      newState: update.newState,
      newTransition: update.newTransition,
      noChange: false,
      routeEscape: false,
      issues: [],
    },
  ]);

  assert.equal(summary.discoveredStateCount, 2);
  assert.equal(summary.discoveredTransitionCount, 1);
  assert.equal(summary.discoveredCandidateEventCount, 2);
  assert.equal(summary.testedCandidateEventCount, 1);
  assert.equal(summary.candidateEventCoverage, 0.5);
  assert.equal(summary.discoveredCanonicalCandidateEventCount, 2);
  assert.equal(summary.testedCanonicalCandidateEventCount, 1);
  assert.equal(summary.canonicalCandidateEventCoverage, 0.5);
  assert.equal(graph.getUntestedCandidateEvents()[0]?.eventSignature, eventB.signature);
});

test("coverage graph reports canonical candidate coverage across states", () => {
  const graph = new CoverageGraph();
  const stateA = state("A", "/tasks");
  const stateB = state("B", "/bounties");
  const clickA = event("click:tasks-settings", {}, "/tasks");
  const clickB = event("click:bounties-settings", {}, "/bounties");

  graph.observeState(stateA, [clickA], 0);
  graph.observeState(stateB, [clickB], 1);
  graph.addTransition(stateA, clickA, stateB, okExecution(), 2);

  const summary = graph.summarize(3, []);

  assert.equal(summary.discoveredCandidateEventCount, 2);
  assert.equal(summary.testedCandidateEventCount, 1);
  assert.equal(summary.targetCoverage, 0.5);
  assert.equal(summary.discoveredCanonicalCandidateEventCount, 1);
  assert.equal(summary.testedCanonicalCandidateEventCount, 1);
  assert.equal(summary.canonicalCandidateEventCoverage, 1);
});

function state(id: string, routePattern = "/auth"): NormalizedState {
  return {
    id: `S-${id}`,
    fingerprint: `fingerprint-${id}`,
    routePattern,
    visibleTargetSummary: {},
    interactableStructure: [],
    focusedTargetSignature: null,
    inputValueKinds: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false, isWhiteScreen: false },
    disabledSummary: { enabled: 1, disabled: 0 },
    networkPendingSummary: "none",
    mainVisibleTextHash: id,
    targetSignatures: [],
  };
}

function event(signature: string, params: UiEvent["params"] = {}, routePattern = "/auth"): UiEvent {
  const target: UiTarget = {
    id: "T-a",
    routePattern,
    signature: `route:${routePattern}|target-a`,
    selector: "button:nth-of-type(1)",
    kind: "button",
    tag: "button",
    role: "button",
    textBucket: "button",
    labelBucket: "none",
    placeholderBucket: "none",
    rect: { x: 1, y: 1, width: 1, height: 1 },
    capabilities: ["click"],
  };
  return { operation: params.payloadKind ? "insertText" : "click", target, params, signature };
}

function okExecution(): ExecutionResult {
  return { ok: true, durationMs: 1, issues: [], routeEscape: false, timedOut: false };
}
