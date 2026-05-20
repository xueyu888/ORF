import assert from "node:assert/strict";
import test from "node:test";
import { selectRepeatableRegionTestObjects } from "../e2e/_explorer/repeatableRegionRunner";
import type {
  CoverageSummary,
  ExplorerConfig,
  ExplorerRunResult,
  RepeatableRegionRecord,
  StateNode,
} from "../e2e/_explorer/types";

test("repeatable region test objects dedupe same scope but keep business variants and nested hierarchy scopes", () => {
  const commentPending = region("comment-panel", "comment", ["status:pendingRecruitment"], [], "section.comment");
  const commentChallenging = {
    ...commentPending,
    abstractionKey: "comment:challenging",
    businessTags: ["status:challenging"],
  };
  const objectiveList = region("objective-list", "hierarchy", [], ["objective"], "section.objectives");
  const taskList = region("task-list", "hierarchy", [], ["task"], "section.tasks");
  const result = runResult([
    state("root", 0, []),
    state("pending-a", 1, [commentPending]),
    state("pending-b", 2, [commentPending]),
    state("challenging", 3, [commentChallenging]),
    state("hierarchy", 4, [objectiveList, taskList]),
  ]);

  const objects = selectRepeatableRegionTestObjects(result, 20);

  assert.equal(objects.length, 4);
  assert.equal(objects.filter((object) => object.region.kind === "comment").length, 2);
  assert.deepEqual(
    objects.filter((object) => object.region.kind === "hierarchy").map((object) => object.region.hierarchyLayers[0]).sort(),
    ["objective", "task"],
  );
});

function runResult(states: StateNode[]): ExplorerRunResult {
  return {
    config: config(),
    seed: "seed",
    summary: summary(states),
    newStateCurve: [],
    newTransitionCurve: [],
    stateTable: states,
    transitionTable: [],
    frontierStates: [],
    untestedCandidateEvents: [],
    canonicalCandidateEvents: [],
    testedCanonicalCandidateEvents: [],
    eventSequence: [],
    screenshotArtifacts: [],
    replayCommand: "npm run test:e2e:explorer",
  };
}

function config(): ExplorerConfig {
  return {
    testKind: "stateExploration",
    safetyProfile: "authenticatedApp",
    targetPath: "/tasks",
    steps: 1,
    maxDurationMs: 0,
    seed: "seed",
    reportDir: ".artifacts/ui-explorer",
    maxNoChange: 30,
    baseURL: "http://127.0.0.1:5173",
    allowedOrigins: ["http://127.0.0.1:5173"],
    allowedPathPatterns: ["/tasks"],
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

function summary(states: StateNode[]): CoverageSummary {
  return {
    totalSteps: 0,
    executedSteps: 0,
    discoveredStateCount: states.length,
    discoveredTransitionCount: 0,
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
    repeatableRegionCount: states.flatMap((state) => state.repeatableRegions).length,
  };
}

function state(id: string, step: number, repeatableRegions: RepeatableRegionRecord[]): StateNode {
  return {
    id: `S-${id}`,
    fingerprint: `fingerprint-${id}`,
    routePattern: "/tasks",
    visits: 1,
    firstSeenStep: step,
    lastSeenStep: step,
    candidateCount: 0,
    testedCandidateCount: 0,
    untestedCandidateCount: 0,
    noChangeCount: 0,
    newStateOutCount: 0,
    errorCount: 0,
    repeatableRegionStates: repeatableRegions.map((region) => region.abstractionKey),
    repeatableRegions,
    candidates: [],
  };
}

function region(
  label: string,
  kind: RepeatableRegionRecord["kind"],
  businessTags: string[],
  hierarchyLayers: string[],
  selector: string,
): RepeatableRegionRecord {
  return {
    id: `R-${label}`,
    signature: `repeatable:${label}`,
    abstractionKey: `${label}:${businessTags.join(".")}:${hierarchyLayers.join(".")}`,
    routePattern: "/tasks",
    selector,
    kind,
    label,
    presence: "some",
    itemShape: `${label}:shape`,
    businessTags,
    hierarchyLayers,
  };
}
