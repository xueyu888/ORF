import { payloadKinds } from "./payloads";
import { canonicalEventSignature } from "./eventIdentity";
import type {
  CandidateEventRecord,
  CoverageSummary,
  ExecutionResult,
  NormalizedState,
  StateNode,
  StepRecord,
  TransitionEdge,
  UiEvent,
  UiOperation,
} from "./types";

type TransitionUpdate = {
  newState: boolean;
  newTransition: boolean;
  reward: number;
};

type OperationStats = {
  attempts: number;
  newStateCount: number;
  noChangeCount: number;
  routeEscapeCount: number;
};

export class CoverageGraph {
  private states = new Map<string, StateNode>();
  private candidateRecords = new Map<string, Map<string, CandidateEventRecord>>();
  private transitions = new Map<string, TransitionEdge>();
  private targetInteractions = new Map<string, number>();
  private discoveredTargets = new Set<string>();
  private payloadInteractions = new Map<string, number>();
  private operationStats = new Map<UiOperation, OperationStats>();

  observeState(state: NormalizedState, candidates: UiEvent[], step: number) {
    const isNewState = !this.states.has(state.id);
    const node = this.ensureState(state, step);
    node.visits += 1;
    node.lastSeenStep = step;

    const stateCandidates = this.ensureCandidateMap(state.id);
    for (const event of candidates) {
      if (event.target) {
        this.discoveredTargets.add(event.target.signature);
      }
      if (!stateCandidates.has(event.signature)) {
        stateCandidates.set(event.signature, emptyCandidateRecord(event));
      }
    }
    this.refreshNodeCandidateStats(node);

    return { node, isNewState };
  }

  addTransition(
    before: NormalizedState,
    event: UiEvent,
    after: NormalizedState,
    execution: ExecutionResult,
    step: number,
  ): TransitionUpdate {
    this.ensureState(before, step);
    const newState = !this.states.has(after.id);
    this.ensureState(after, step);

    const candidateMap = this.ensureCandidateMap(before.id);
    const candidate = candidateMap.get(event.signature) ?? emptyCandidateRecord(event);
    candidate.attempts += 1;
    if (execution.ok) {
      candidate.successCount += 1;
    }
    if (before.id === after.id) {
      candidate.noChangeCount += 1;
    }
    if (newState) {
      candidate.newStateCount += 1;
    }
    if (execution.issues.length > 0) {
      candidate.errorCount += 1;
    }
    if (execution.routeEscape) {
      candidate.routeEscapeCount += 1;
    }
    candidateMap.set(event.signature, candidate);

    const targetWasNew = Boolean(event.target && !this.targetInteractions.has(event.target.signature));
    const payloadWasNew = Boolean(event.params.payloadKind && !this.payloadInteractions.has(event.params.payloadKind));

    const transitionKey = `${before.id}->${after.id}:${event.signature}`;
    const newTransition = !this.transitions.has(transitionKey);
    const reward = this.scoreTransition({ before, event, after, execution, newState, newTransition, targetWasNew, payloadWasNew });
    candidate.lastReward = reward;
    if (event.target) {
      this.targetInteractions.set(event.target.signature, (this.targetInteractions.get(event.target.signature) ?? 0) + 1);
    }
    if (event.params.payloadKind) {
      this.payloadInteractions.set(event.params.payloadKind, (this.payloadInteractions.get(event.params.payloadKind) ?? 0) + 1);
    }
    const edge =
      this.transitions.get(transitionKey) ??
      ({
        fromStateId: before.id,
        toStateId: after.id,
        eventSignature: event.signature,
        count: 0,
        firstSeenStep: step,
        lastSeenStep: step,
        reward,
      } satisfies TransitionEdge);
    edge.count += 1;
    edge.lastSeenStep = step;
    edge.reward = reward;
    this.transitions.set(transitionKey, edge);

    const beforeNode = this.states.get(before.id);
    if (beforeNode) {
      if (before.id === after.id) {
        beforeNode.noChangeCount += 1;
      }
      if (newState) {
        beforeNode.newStateOutCount += 1;
      }
      if (execution.issues.length > 0) {
        beforeNode.errorCount += 1;
      }
      this.refreshNodeCandidateStats(beforeNode);
    }

    const stats = this.operationStats.get(event.operation) ?? {
      attempts: 0,
      newStateCount: 0,
      noChangeCount: 0,
      routeEscapeCount: 0,
    };
    stats.attempts += 1;
    if (newState) {
      stats.newStateCount += 1;
    }
    if (before.id === after.id) {
      stats.noChangeCount += 1;
    }
    if (execution.routeEscape) {
      stats.routeEscapeCount += 1;
    }
    this.operationStats.set(event.operation, stats);

    return { newState, newTransition, reward };
  }

  getStateNode(stateId: string) {
    return this.states.get(stateId) ?? null;
  }

  hasTestedCandidate(stateId: string, eventSignature: string) {
    return (this.candidateRecords.get(stateId)?.get(eventSignature)?.attempts ?? 0) > 0;
  }

  getCandidateRecord(stateId: string, eventSignature: string) {
    return this.candidateRecords.get(stateId)?.get(eventSignature) ?? null;
  }

  getTargetInteractionCount(targetSignature: string) {
    return this.targetInteractions.get(targetSignature) ?? 0;
  }

  getPayloadKindCount(payloadKind: string) {
    return this.payloadInteractions.get(payloadKind) ?? 0;
  }

  getOperationStats(operation: UiOperation): OperationStats {
    return (
      this.operationStats.get(operation) ?? {
        attempts: 0,
        newStateCount: 0,
        noChangeCount: 0,
        routeEscapeCount: 0,
      }
    );
  }

  getStateTable() {
    return Array.from(this.states.values())
      .map((node) => ({ ...node, candidates: [...node.candidates] }))
      .sort((left, right) => left.firstSeenStep - right.firstSeenStep);
  }

  getTransitionTable() {
    return Array.from(this.transitions.values()).sort((left, right) => left.firstSeenStep - right.firstSeenStep);
  }

  getFrontierStates(limit = 50) {
    return this.getStateTable()
      .filter((node) => node.untestedCandidateCount > 0)
      .sort((left, right) => {
        const leftRatio = left.untestedCandidateCount / Math.max(1, left.candidateCount);
        const rightRatio = right.untestedCandidateCount / Math.max(1, right.candidateCount);
        return rightRatio - leftRatio || right.newStateOutCount - left.newStateOutCount || left.visits - right.visits;
      })
      .slice(0, limit);
  }

  getUntestedCandidateEvents(limit = 100) {
    const result: Array<{
      stateId: string;
      eventSignature: string;
      operation: UiOperation;
      targetSignature?: string;
    }> = [];
    for (const [stateId, candidates] of this.candidateRecords) {
      for (const candidate of candidates.values()) {
        if (candidate.attempts === 0) {
          result.push({
            stateId,
            eventSignature: candidate.eventSignature,
            operation: candidate.event.operation,
            targetSignature: candidate.event.target?.signature,
          });
        }
      }
    }
    return result.slice(0, limit);
  }

  summarize(totalSteps: number, records: StepRecord[]): CoverageSummary {
    const canonicalCoverage = this.getCanonicalCandidateCoverage();
    const discoveredCandidateEventCount = Array.from(this.candidateRecords.values()).reduce(
      (sum, candidates) => sum + candidates.size,
      0,
    );
    const testedCandidateEventCount = Array.from(this.candidateRecords.values()).reduce((sum, candidates) => {
      return sum + Array.from(candidates.values()).filter((candidate) => candidate.attempts > 0).length;
    }, 0);
    const executedSteps = records.length;
    const candidateEventCoverage = ratio(testedCandidateEventCount, discoveredCandidateEventCount);
    const canonicalCandidateEventCoverage = ratio(
      canonicalCoverage.tested.length,
      canonicalCoverage.discovered.length,
    );
    const targetCoverage = ratio(this.targetInteractions.size, this.discoveredTargets.size);
    const payloadKindCoverage = ratio(this.payloadInteractions.size, payloadKinds.length);
    const noChangeRate = ratio(records.filter((record) => record.noChange).length, executedSteps);
    const routeEscapeCount = records.filter((record) => record.routeEscape).length;
    const runtimeErrorCount = records.reduce((sum, record) => sum + record.issues.length, 0);
    const severeFailureCount = records.reduce(
      (sum, record) => sum + record.issues.filter((issue) => issue.severity === "severe").length,
      0,
    );
    const stateGrowthSaturation = growthSaturation(records.map((record) => record.newState));
    const transitionGrowthSaturation = growthSaturation(records.map((record) => record.newTransition));
    const discoveredSpaceExplorationScore =
      100 *
      (0.3 * candidateEventCoverage +
        0.2 * targetCoverage +
        0.2 * payloadKindCoverage +
        0.15 * transitionGrowthSaturation +
        0.15 * stateGrowthSaturation);

    return {
      totalSteps,
      executedSteps,
      discoveredStateCount: this.states.size,
      discoveredTransitionCount: this.transitions.size,
      discoveredCandidateEventCount,
      testedCandidateEventCount,
      candidateEventCoverage,
      discoveredCanonicalCandidateEventCount: canonicalCoverage.discovered.length,
      testedCanonicalCandidateEventCount: canonicalCoverage.tested.length,
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
  }

  getCanonicalCandidateCoverage() {
    const discovered = new Set<string>();
    const tested = new Set<string>();
    for (const candidates of this.candidateRecords.values()) {
      for (const candidate of candidates.values()) {
        const signature = canonicalEventSignature(candidate.event);
        discovered.add(signature);
        if (candidate.attempts > 0) {
          tested.add(signature);
        }
      }
    }
    return {
      discovered: Array.from(discovered).sort(),
      tested: Array.from(tested).sort(),
    };
  }

  newStateCurve(records: StepRecord[]) {
    return cumulative(records.map((record) => record.newState));
  }

  newTransitionCurve(records: StepRecord[]) {
    return cumulative(records.map((record) => record.newTransition));
  }

  private ensureState(state: NormalizedState, step: number) {
    const existing = this.states.get(state.id);
    if (existing) {
      return existing;
    }
    const node: StateNode = {
      id: state.id,
      fingerprint: state.fingerprint,
      routePattern: state.routePattern,
      visits: 0,
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
    this.states.set(state.id, node);
    return node;
  }

  private ensureCandidateMap(stateId: string) {
    const existing = this.candidateRecords.get(stateId);
    if (existing) {
      return existing;
    }
    const candidates = new Map<string, CandidateEventRecord>();
    this.candidateRecords.set(stateId, candidates);
    return candidates;
  }

  private refreshNodeCandidateStats(node: StateNode) {
    const candidates = Array.from(this.ensureCandidateMap(node.id).values());
    node.candidates = candidates;
    node.candidateCount = candidates.length;
    node.testedCandidateCount = candidates.filter((candidate) => candidate.attempts > 0).length;
    node.untestedCandidateCount = node.candidateCount - node.testedCandidateCount;
  }

  private scoreTransition(input: {
    before: NormalizedState;
    event: UiEvent;
    after: NormalizedState;
    execution: ExecutionResult;
    newState: boolean;
    newTransition: boolean;
    targetWasNew: boolean;
    payloadWasNew: boolean;
  }) {
    let reward = 0;
    if (input.newState) {
      reward += 10;
    }
    if (input.newTransition) {
      reward += 5;
    }
    if (input.targetWasNew) {
      reward += 2;
    }
    if (input.payloadWasNew) {
      reward += 3;
    }
    if (input.execution.issues.length > 0) {
      reward += input.execution.issues.some((issue) => issue.severity === "severe") ? 8 : 2;
    }
    if (input.before.id === input.after.id) {
      reward -= 2;
    }
    if (input.execution.routeEscape) {
      reward -= 10;
    }
    if (input.execution.timedOut) {
      reward -= 4;
    }
    return reward;
  }
}

function emptyCandidateRecord(event: UiEvent): CandidateEventRecord {
  return {
    eventSignature: event.signature,
    event,
    attempts: 0,
    successCount: 0,
    noChangeCount: 0,
    newStateCount: 0,
    errorCount: 0,
    routeEscapeCount: 0,
    lastReward: 0,
  };
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
