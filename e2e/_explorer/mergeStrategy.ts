import { canonicalEventSignature } from "./eventIdentity";
import { payloadKinds } from "./payloads";
import { shortHash, stableStringify } from "./stableHash";
import type {
  CandidateEventRecord,
  CoverageSummary,
  ExplorerConfig,
  ExplorerRunResult,
  NormalizedState,
  RepeatableRegionExplorationResult,
  RepeatableRegionObjectResult,
  StateNode,
  StepRecord,
  TransitionEdge,
} from "./types";

export type StateAbstraction = Omit<NormalizedState, "id" | "fingerprint" | "repeatableRegionStates" | "repeatableRegions"> &
  Partial<Pick<NormalizedState, "repeatableRegionStates" | "repeatableRegions">>;

export function createNormalizedState(state: StateAbstraction): NormalizedState {
  const completeState = completeStateAbstraction(state);
  const fingerprint = fingerprintStateAbstraction(completeState);
  const id = `S-${shortHash(fingerprint)}`;
  return { id, fingerprint, ...completeState };
}

export function fingerprintStateAbstraction(state: StateAbstraction) {
  const completeState = completeStateAbstraction(state);
  const identityState: Partial<typeof completeState> = { ...completeState };
  delete identityState.repeatableRegions;
  return stableStringify(identityState);
}

export function mergeExplorerResults(
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
        existing.repeatableRegionStates = Array.from(new Set([...existing.repeatableRegionStates, ...state.repeatableRegionStates])).sort();
        existing.repeatableRegions = mergeRepeatableRegions(existing.repeatableRegions, state.repeatableRegions);
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
  const repeatableRegionCount = new Set(
    stateTable.flatMap((state) => state.repeatableRegions.map((region) => region.signature)),
  ).size;
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
    repeatableRegionCount,
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
    screenshotArtifacts: results.flatMap((result) => result.screenshotArtifacts ?? []),
    replayCommand: options.replayCommand,
    repeatableRegionExploration: mergeRepeatableRegionExplorations(results, options.seed, options.replayCommand),
  };
}

function completeStateAbstraction(state: StateAbstraction): Omit<NormalizedState, "id" | "fingerprint"> {
  return {
    repeatableRegionStates: [],
    repeatableRegions: [],
    ...state,
  };
}

function mergeRepeatableRegionExplorations(
  results: ExplorerRunResult[],
  seed: string,
  replayCommand: string,
): RepeatableRegionExplorationResult | undefined {
  const explorations = results
    .map((result) => result.repeatableRegionExploration)
    .filter((result): result is RepeatableRegionExplorationResult => Boolean(result));
  if (explorations.length === 0) {
    return undefined;
  }

  const objectMap = new Map<string, RepeatableRegionObjectResult>();
  for (const exploration of explorations) {
    for (const objectResult of exploration.objects) {
      const existing = objectMap.get(objectResult.object.key);
      if (!existing) {
        objectMap.set(objectResult.object.key, cloneRepeatableObjectResult(objectResult));
        continue;
      }
      existing.object.representativeStateFirstSeenStep = Math.min(
        existing.object.representativeStateFirstSeenStep,
        objectResult.object.representativeStateFirstSeenStep,
      );
      existing.skippedReason =
        existing.executedSteps === 0 && objectResult.executedSteps === 0
          ? existing.skippedReason ?? objectResult.skippedReason
          : undefined;
      existing.discoveredCandidateEventCount += objectResult.discoveredCandidateEventCount;
      existing.testedCandidateEventCount += objectResult.testedCandidateEventCount;
      existing.executedSteps += objectResult.executedSteps;
      existing.noChangeCount += objectResult.noChangeCount;
      existing.stateChangeCount += objectResult.stateChangeCount;
      existing.routeEscapeCount += objectResult.routeEscapeCount;
      existing.leftRegionCount += objectResult.leftRegionCount;
      existing.runtimeErrorCount += objectResult.runtimeErrorCount;
      existing.severeFailureCount += objectResult.severeFailureCount;
      existing.events.push(...objectResult.events.map((event) => ({ ...event, step: existing.events.length + event.step })));
    }
  }

  const objects = Array.from(objectMap.values()).sort(
    (left, right) =>
      left.object.representativeStateFirstSeenStep - right.object.representativeStateFirstSeenStep ||
      left.object.id.localeCompare(right.object.id),
  );
  const executedSteps = objects.reduce((sum, object) => sum + object.executedSteps, 0);
  const discoveredCandidateEventCount = objects.reduce((sum, object) => sum + object.discoveredCandidateEventCount, 0);
  const testedCandidateEventCount = objects.reduce((sum, object) => sum + object.testedCandidateEventCount, 0);
  const skippedObjectCount = objects.filter((object) => object.skippedReason).length;
  const testedObjectCount = objects.filter((object) => !object.skippedReason && object.executedSteps > 0).length;

  return {
    summary: {
      enabled: true,
      testObjectCount: objects.length,
      testedObjectCount,
      skippedObjectCount,
      executedSteps,
      discoveredCandidateEventCount,
      testedCandidateEventCount,
      candidateEventCoverage: ratio(testedCandidateEventCount, discoveredCandidateEventCount),
      noChangeRate: ratio(objects.reduce((sum, object) => sum + object.noChangeCount, 0), executedSteps),
      stateChangeCount: objects.reduce((sum, object) => sum + object.stateChangeCount, 0),
      routeEscapeCount: objects.reduce((sum, object) => sum + object.routeEscapeCount, 0),
      leftRegionCount: objects.reduce((sum, object) => sum + object.leftRegionCount, 0),
      runtimeErrorCount: objects.reduce((sum, object) => sum + object.runtimeErrorCount, 0),
      severeFailureCount: objects.reduce((sum, object) => sum + object.severeFailureCount, 0),
    },
    maxObjects: explorations.reduce((max, exploration) => Math.max(max, exploration.maxObjects), 0),
    stepsPerObject: explorations.reduce((max, exploration) => Math.max(max, exploration.stepsPerObject), 0),
    seed,
    objects,
    replayCommand,
  };
}

function cloneRepeatableObjectResult(result: RepeatableRegionObjectResult): RepeatableRegionObjectResult {
  return {
    ...result,
    object: {
      ...result.object,
      region: {
        ...result.object.region,
        businessTags: [...result.object.region.businessTags],
        hierarchyLayers: [...result.object.region.hierarchyLayers],
      },
    },
    events: result.events.map((event) => ({ ...event, issues: event.issues.map((issue) => ({ ...issue })) })),
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

function cloneStateNode(state: StateNode): StateNode {
  return {
    ...state,
    repeatableRegionStates: [...state.repeatableRegionStates],
    repeatableRegions: state.repeatableRegions.map((region) => ({ ...region })),
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

function mergeRepeatableRegions(left: StateNode["repeatableRegions"], right: StateNode["repeatableRegions"]) {
  const regions = new Map<string, StateNode["repeatableRegions"][number]>();
  for (const region of [...left, ...right]) {
    regions.set(region.signature, { ...region });
  }
  return Array.from(regions.values()).sort((leftRegion, rightRegion) =>
    leftRegion.abstractionKey.localeCompare(rightRegion.abstractionKey),
  );
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
