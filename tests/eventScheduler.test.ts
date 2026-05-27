import assert from "node:assert/strict";
import test from "node:test";
import { CoverageGraph } from "../e2e/_explorer/coverageGraph";
import { EventScheduler } from "../e2e/_explorer/eventScheduler";
import { confidenceToFactor, getCandidateConfidence } from "../e2e/_explorer/randomStrategy";
import type { ExecutionResult, NormalizedState, UiEvent, UiTarget } from "../e2e/_explorer/types";

test("scheduler boosts untested candidates over tested no-change candidates", () => {
  const graph = new CoverageGraph();
  const scheduler = new EventScheduler({ epsilon: 0 });
  const stateA = state("A");
  const tested = event("tested", "click");
  const untested = event("untested", "click");
  graph.observeState(stateA, [tested, untested], 0);

  graph.addTransition(stateA, tested, stateA, okExecution(), 1);
  graph.addTransition(stateA, tested, stateA, okExecution(), 2);

  assert.ok(scheduler.weightEvent(stateA, untested, graph) > scheduler.weightEvent(stateA, tested, graph));
});

test("scheduler gives uncovered payload kinds extra weight", () => {
  const graph = new CoverageGraph();
  const scheduler = new EventScheduler({ epsilon: 0 });
  const stateA = state("A");
  const ascii = event("ascii", "insertText", { payloadKind: "asciiText" });
  const emoji = event("emoji", "insertText", { payloadKind: "emojiText" });
  graph.observeState(stateA, [ascii, emoji], 0);
  graph.addTransition(stateA, ascii, state("B"), okExecution(), 1);

  assert.ok(scheduler.weightEvent(stateA, emoji, graph) > scheduler.weightEvent(stateA, ascii, graph));
});

test("scheduler applies DOM target confidence only as a weighted-branch factor", () => {
  const graph = new CoverageGraph();
  const scheduler = new EventScheduler({ epsilon: 0 });
  const stateA = state("A");
  const strong = event("strong", "click", {}, 1);
  const weak = event("weak", "click", {}, 0.3);
  graph.observeState(stateA, [strong, weak], 0);

  assert.equal(getCandidateConfidence(strong), 1);
  assert.equal(getCandidateConfidence({ ...weak, confidence: undefined, target: { ...weak.target!, confidence: undefined } }), 1);
  assert.equal(confidenceToFactor(1), 1);
  assert.equal(confidenceToFactor(0.3), 0.475);
  assert.ok(scheduler.weightEvent(stateA, strong, graph) > scheduler.weightEvent(stateA, weak, graph));
});

function state(id: string): NormalizedState {
  return {
    id: `S-${id}`,
    fingerprint: `fingerprint-${id}`,
    routePattern: "/auth",
    visibleTargetSummary: {},
    interactableStructure: [],
    focusedTargetSignature: null,
    inputValueKinds: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false, isWhiteScreen: false },
    disabledSummary: { enabled: 1, disabled: 0 },
    networkPendingSummary: "none",
    mainVisibleTextHash: id,
    targetSignatures: [],
    repeatableRegionStates: [],
    repeatableRegions: [],
  };
}

function event(signature: string, operation: UiEvent["operation"], params: UiEvent["params"] = {}, confidence?: number): UiEvent {
  const target: UiTarget = {
    id: "T-a",
    routePattern: "/auth",
    signature: `target-${signature}`,
    selector: "input:nth-of-type(1)",
    kind: "input",
    tag: "input",
    role: "textbox",
    textBucket: "none",
    labelBucket: "none",
    placeholderBucket: "input",
    rect: { x: 1, y: 1, width: 1, height: 1 },
    capabilities: ["input", "focus", "keyboard"],
    confidence,
  };
  return { operation, target, params, signature, confidence };
}

function okExecution(): ExecutionResult {
  return { ok: true, durationMs: 1, issues: [], routeEscape: false, timedOut: false };
}
