import type { Page } from "@playwright/test";
import { CoverageGraph } from "./coverageGraph";
import { executeEvent } from "./eventExecutor";
import { generateCandidateEvents } from "./eventGenerator";
import { CoverageGuidedRandomStrategy } from "./randomStrategy";
import { SeededRandom } from "./seededRandom";
import { isInAllowedScope, shouldRunEvent } from "./safety";
import { normalizeState } from "./stateNormalizer";
import { collectTargets } from "./targetCollector";
import { attachDiagnostics, resetToTarget, shellQuote } from "./runnerSupport";
import { shortHash, stableStringify } from "./stableHash";
import type {
  ExecutionIssue,
  ExecutionResult,
  ExplorerConfig,
  ExplorerRunResult,
  RepeatableRegionExplorationResult,
  RepeatableRegionObjectResult,
  RepeatableRegionRecord,
  RepeatableRegionStepRecord,
  RepeatableRegionTestObject,
  UiEvent,
} from "./types";

type ReplayPlan = {
  targetStateId: string;
  events: UiEvent[];
};

const scopedOperationBlocklist = new Set(["backgroundClick", "refresh", "back", "wait"]);

export async function runRepeatableRegionExplorer(
  page: Page,
  config: ExplorerConfig,
  stateExplorationResult: ExplorerRunResult,
): Promise<RepeatableRegionExplorationResult> {
  const objects = selectRepeatableRegionTestObjects(stateExplorationResult, config.repeatableRegionMaxObjects);
  const rng = new SeededRandom(`${config.seed}:repeatable-region`);
  const objectResults: RepeatableRegionObjectResult[] = [];

  for (const object of objects) {
    objectResults.push(await runObjectProbe(page, config, stateExplorationResult, object, rng));
  }

  return {
    summary: summarizeObjectResults(true, objects.length, objectResults),
    maxObjects: config.repeatableRegionMaxObjects,
    stepsPerObject: config.repeatableRegionStepsPerObject,
    seed: `${config.seed}:repeatable-region`,
    objects: objectResults,
    replayCommand: [
      `UI_EXPLORER_REPEATABLE_REGION_TESTS=1`,
      `UI_EXPLORER_REPEATABLE_REGION_MAX_OBJECTS=${config.repeatableRegionMaxObjects}`,
      `UI_EXPLORER_REPEATABLE_REGION_STEPS=${config.repeatableRegionStepsPerObject}`,
      `UI_EXPLORER_TEST_KIND=${shellQuote(config.testKind)}`,
      `UI_EXPLORER_SAFETY_PROFILE=${shellQuote(config.safetyProfile)}`,
      `UI_EXPLORER_SEED=${shellQuote(config.seed)}`,
      `UI_EXPLORER_STEPS=${config.steps}`,
      config.maxDurationMs > 0 ? `UI_EXPLORER_MAX_DURATION_MS=${config.maxDurationMs}` : "",
      `UI_EXPLORER_STATE_ABSTRACTOR=${shellQuote(config.stateAbstractor)}`,
      `UI_EXPLORER_TARGET_PATH=${shellQuote(config.targetPath)}`,
      `UI_EXPLORER_BASE_URL=${shellQuote(config.baseURL)}`,
      "npm run test:e2e:explorer",
    ].filter(Boolean).join(" "),
  };
}

export function selectRepeatableRegionTestObjects(result: ExplorerRunResult, maxObjects: number): RepeatableRegionTestObject[] {
  const objects = new Map<string, RepeatableRegionTestObject>();

  for (const state of result.stateTable) {
    for (const region of state.repeatableRegions) {
      const key = testObjectKey(region);
      const existing = objects.get(key);
      if (existing && existing.representativeStateFirstSeenStep <= state.firstSeenStep) {
        continue;
      }
      objects.set(key, {
        id: `RO-${shortHash(key)}`,
        key,
        region: cloneRegion(region),
        representativeStateId: state.id,
        representativeStateFirstSeenStep: state.firstSeenStep,
      });
    }
  }

  return Array.from(objects.values())
    .sort(
      (left, right) =>
        left.representativeStateFirstSeenStep - right.representativeStateFirstSeenStep ||
        regionRank(left.region) - regionRank(right.region) ||
        left.region.label.localeCompare(right.region.label),
    )
    .slice(0, Math.max(0, maxObjects));
}

async function runObjectProbe(
  page: Page,
  config: ExplorerConfig,
  stateExplorationResult: ExplorerRunResult,
  object: RepeatableRegionTestObject,
  rng: SeededRandom,
): Promise<RepeatableRegionObjectResult> {
  const diagnostics = attachDiagnostics(page.context(), page);
  const graph = new CoverageGraph();
  const scheduler = new CoverageGuidedRandomStrategy({ epsilon: config.epsilon });
  const records: RepeatableRegionStepRecord[] = [];
  const discoveredCandidateEvents = new Set<string>();
  const testedCandidateEvents = new Set<string>();

  try {
    const plan = buildReplayPlan(stateExplorationResult, object.representativeStateId);
    if (!object.region.selector) {
      return skippedObject(object, "该可重复区域没有稳定 DOM 选择器，无法限定组件作用域。");
    }
    if (!plan) {
      return skippedObject(object, "无法从主探索记录中恢复到该区域所在状态。");
    }
    const restored = await restoreObjectState(page, config, object, plan);
    if (!restored.ok) {
      return skippedObject(object, restored.reason);
    }

    for (let step = 0; step < config.repeatableRegionStepsPerObject; step += 1) {
      if (!(await regionVisible(page, object.region))) {
        const rerestored = await restoreObjectState(page, config, object, plan);
        if (!rerestored.ok) {
          break;
        }
      }

      const before = await normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor);
      const targets = await collectTargets(page, { rootSelector: object.region.selector });
      const candidates = generateCandidateEvents(targets).filter((candidate) => isScopedComponentEvent(candidate, config));
      for (const candidate of candidates) {
        discoveredCandidateEvents.add(candidate.signature);
      }
      graph.observeState(before, candidates, step);

      if (candidates.length === 0) {
        break;
      }

      const event = scheduler.pick(before, candidates, graph, rng);
      if (!event) {
        break;
      }

      const diagnosticCursor = diagnostics.cursor();
      const execution = await executeEvent(page, event, config);
      const mergedExecution = mergeExecutionIssues(execution, diagnostics.readSince(diagnosticCursor));
      const after = await normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor).catch(() => before);
      const leftRegion = mergedExecution.routeEscape || !(await regionVisible(page, object.region));
      graph.addTransition(before, event, after, mergedExecution, step);
      scheduler.update(event);
      testedCandidateEvents.add(event.signature);

      records.push({
        step,
        beforeStateId: before.id,
        afterStateId: after.id,
        eventSignature: event.signature,
        operation: event.operation,
        targetSignature: event.target?.signature,
        params: event.params,
        noChange: before.id === after.id,
        routeEscape: mergedExecution.routeEscape,
        leftRegion,
        issues: mergedExecution.issues,
      });

      if (leftRegion || after.flags.isWhiteScreen || mergedExecution.issues.some((issue) => issue.severity === "severe")) {
        const rerestored = await restoreObjectState(page, config, object, plan);
        if (!rerestored.ok) {
          break;
        }
      }
    }
  } finally {
    diagnostics.detach();
  }

  const result = objectResult(object, discoveredCandidateEvents.size, testedCandidateEvents.size, records);
  if (result.executedSteps === 0) {
    result.skippedReason =
      result.discoveredCandidateEventCount === 0 ? "组件内没有可执行候选事件。" : "未能执行组件内候选事件。";
  }
  return result;
}

function buildReplayPlan(result: ExplorerRunResult, targetStateId: string): ReplayPlan | null {
  const initialStateId = result.eventSequence[0]?.beforeStateId ?? result.stateTable[0]?.id;
  if (!initialStateId) {
    return null;
  }
  if (initialStateId === targetStateId) {
    return { targetStateId, events: [] };
  }

  const eventByStateAndSignature = new Map<string, UiEvent>();
  for (const state of result.stateTable) {
    for (const candidate of state.candidates) {
      eventByStateAndSignature.set(`${state.id}:${candidate.eventSignature}`, candidate.event);
    }
  }

  const outgoing = new Map<string, Array<{ toStateId: string; event: UiEvent }>>();
  for (const transition of result.transitionTable) {
    const event = eventByStateAndSignature.get(`${transition.fromStateId}:${transition.eventSignature}`);
    if (!event) {
      continue;
    }
    outgoing.set(transition.fromStateId, [...(outgoing.get(transition.fromStateId) ?? []), { toStateId: transition.toStateId, event }]);
  }

  const queue = [initialStateId];
  const visited = new Set([initialStateId]);
  const previous = new Map<string, { stateId: string; event: UiEvent }>();

  while (queue.length > 0) {
    const stateId = queue.shift()!;
    for (const edge of outgoing.get(stateId) ?? []) {
      if (visited.has(edge.toStateId)) {
        continue;
      }
      visited.add(edge.toStateId);
      previous.set(edge.toStateId, { stateId, event: edge.event });
      if (edge.toStateId === targetStateId) {
        return { targetStateId, events: pathEvents(previous, initialStateId, targetStateId) };
      }
      queue.push(edge.toStateId);
    }
  }

  return null;
}

function pathEvents(previous: Map<string, { stateId: string; event: UiEvent }>, initialStateId: string, targetStateId: string) {
  const events: UiEvent[] = [];
  let current = targetStateId;
  while (current !== initialStateId) {
    const item = previous.get(current);
    if (!item) {
      return [];
    }
    events.unshift(item.event);
    current = item.stateId;
  }
  return events;
}

async function restoreObjectState(
  page: Page,
  config: ExplorerConfig,
  object: RepeatableRegionTestObject,
  plan: ReplayPlan,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await resetToTarget(page, config);
  for (const event of plan.events) {
    const execution = await executeEvent(page, event, config);
    if (execution.routeEscape && config.resetOnRouteEscape) {
      return { ok: false, reason: "恢复代表状态时发生路径逃逸。" };
    }
    if (execution.issues.some((issue) => issue.severity === "severe")) {
      return { ok: false, reason: "恢复代表状态时遇到严重异常。" };
    }
  }

  return (await regionVisible(page, object.region))
    ? { ok: true }
    : { ok: false, reason: "已恢复到代表状态，但目标可重复区域当前不可见。" };
}

async function regionVisible(page: Page, region: RepeatableRegionRecord) {
  if (!region.selector) {
    return false;
  }
  return page
    .locator(region.selector)
    .first()
    .isVisible({ timeout: 200 })
    .catch(() => false);
}

function isScopedComponentEvent(event: UiEvent, config: ExplorerConfig) {
  if (!event.target || scopedOperationBlocklist.has(event.operation)) {
    return false;
  }
  return shouldRunEvent(event, config);
}

function mergeExecutionIssues(execution: ExecutionResult, diagnosticIssues: ExecutionIssue[]): ExecutionResult {
  const merged: ExecutionResult = {
    ...execution,
    issues: [...execution.issues, ...diagnosticIssues],
    ok: execution.ok && diagnosticIssues.every((issue) => issue.severity !== "severe"),
  };
  if (merged.routeEscape) {
    merged.issues = merged.issues.map((issue) =>
      issue.severity === "severe" ? { ...issue, severity: "ordinary", type: `route-escape-${issue.type}` } : issue,
    );
    merged.ok = true;
  }
  return merged;
}

function testObjectKey(region: RepeatableRegionRecord) {
  return stableStringify({
    routePattern: region.routePattern,
    signature: region.signature,
    kind: region.kind,
    presence: region.presence,
    businessTags: region.businessTags,
    hierarchyLayers: region.hierarchyLayers,
  });
}

function regionRank(region: RepeatableRegionRecord) {
  if (region.kind === "comment") {
    return 0;
  }
  if (region.kind === "hierarchy") {
    return 1;
  }
  return 2;
}

function skippedObject(object: RepeatableRegionTestObject, skippedReason: string): RepeatableRegionObjectResult {
  return {
    object,
    skippedReason,
    discoveredCandidateEventCount: 0,
    testedCandidateEventCount: 0,
    executedSteps: 0,
    noChangeCount: 0,
    stateChangeCount: 0,
    routeEscapeCount: 0,
    leftRegionCount: 0,
    runtimeErrorCount: 0,
    severeFailureCount: 0,
    events: [],
  };
}

function objectResult(
  object: RepeatableRegionTestObject,
  discoveredCandidateEventCount: number,
  testedCandidateEventCount: number,
  records: RepeatableRegionStepRecord[],
): RepeatableRegionObjectResult {
  return {
    object,
    discoveredCandidateEventCount,
    testedCandidateEventCount,
    executedSteps: records.length,
    noChangeCount: records.filter((record) => record.noChange).length,
    stateChangeCount: records.filter((record) => !record.noChange).length,
    routeEscapeCount: records.filter((record) => record.routeEscape).length,
    leftRegionCount: records.filter((record) => record.leftRegion).length,
    runtimeErrorCount: records.reduce((sum, record) => sum + record.issues.length, 0),
    severeFailureCount: records.reduce(
      (sum, record) => sum + record.issues.filter((issue) => issue.severity === "severe").length,
      0,
    ),
    events: records,
  };
}

function summarizeObjectResults(
  enabled: boolean,
  testObjectCount: number,
  results: RepeatableRegionObjectResult[],
): RepeatableRegionExplorationResult["summary"] {
  const executedSteps = results.reduce((sum, result) => sum + result.executedSteps, 0);
  const discoveredCandidateEventCount = results.reduce((sum, result) => sum + result.discoveredCandidateEventCount, 0);
  const testedCandidateEventCount = results.reduce((sum, result) => sum + result.testedCandidateEventCount, 0);
  const skippedObjectCount = results.filter((result) => result.skippedReason).length;
  const testedObjectCount = results.filter((result) => !result.skippedReason && result.executedSteps > 0).length;
  return {
    enabled,
    testObjectCount,
    testedObjectCount,
    skippedObjectCount,
    executedSteps,
    discoveredCandidateEventCount,
    testedCandidateEventCount,
    candidateEventCoverage: ratio(testedCandidateEventCount, discoveredCandidateEventCount),
    noChangeRate: ratio(results.reduce((sum, result) => sum + result.noChangeCount, 0), executedSteps),
    stateChangeCount: results.reduce((sum, result) => sum + result.stateChangeCount, 0),
    routeEscapeCount: results.reduce((sum, result) => sum + result.routeEscapeCount, 0),
    leftRegionCount: results.reduce((sum, result) => sum + result.leftRegionCount, 0),
    runtimeErrorCount: results.reduce((sum, result) => sum + result.runtimeErrorCount, 0),
    severeFailureCount: results.reduce((sum, result) => sum + result.severeFailureCount, 0),
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function cloneRegion(region: RepeatableRegionRecord): RepeatableRegionRecord {
  return {
    ...region,
    businessTags: [...region.businessTags],
    hierarchyLayers: [...region.hierarchyLayers],
  };
}
