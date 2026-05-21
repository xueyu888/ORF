import type { CoverageGraph } from "./coverageGraph";
import type { SeededRandom } from "./seededRandom";
import type { NormalizedState, UiEvent, UiOperation } from "./types";

export type SchedulerOptions = {
  epsilon?: number;
};

export class CoverageGuidedRandomStrategy {
  private epsilon: number;
  private recentTargetOps: string[] = [];

  constructor(options: SchedulerOptions = {}) {
    this.epsilon = options.epsilon ?? 0.2;
  }

  pick(state: NormalizedState, candidates: UiEvent[], graph: CoverageGraph, rng: SeededRandom) {
    if (candidates.length === 0) {
      return null;
    }

    if (rng.next() < this.epsilon) {
      return rng.pick(candidates);
    }

    return rng.weightedPick(candidates, (candidate) => this.weightEvent(state, candidate, graph));
  }

  weightEvent(state: NormalizedState, event: UiEvent, graph: CoverageGraph) {
    const base = baseWeight(event.operation);
    const stateNode = graph.getStateNode(state.id);
    const candidate = graph.getCandidateRecord(state.id, event.signature);
    const operationStats = graph.getOperationStats(event.operation);

    const untestedFactor = graph.hasTestedCandidate(state.id, event.signature) ? 1 : 3;
    const frontierFactor = stateNode
      ? 1 + stateNode.untestedCandidateCount / Math.max(1, stateNode.candidateCount)
      : 1.5;
    const targetFactor = event.target ? 1 + 1 / Math.sqrt(1 + graph.getTargetInteractionCount(event.target.signature)) : 1;
    const payloadFactor = event.params.payloadKind
      ? graph.getPayloadKindCount(event.params.payloadKind) === 0
        ? 2
        : 1 / Math.sqrt(1 + graph.getPayloadKindCount(event.params.payloadKind))
      : 1;
    const noveltyFactor = 1 + Math.min(2, operationStats.newStateCount / Math.max(1, operationStats.attempts));
    const noChangePenalty = 1 / Math.sqrt(1 + (candidate?.noChangeCount ?? 0) + operationStats.noChangeCount * 0.25);
    const routeEscapePenalty = 1 / (1 + (candidate?.routeEscapeCount ?? 0) + operationStats.routeEscapeCount);
    const repeatPenalty = this.recentTargetOps.includes(targetOperationKey(event)) ? 0.6 : 1;

    return Math.max(
      0.01,
      base *
        untestedFactor *
        frontierFactor *
        targetFactor *
        payloadFactor *
        noveltyFactor *
        noChangePenalty *
        routeEscapePenalty *
        repeatPenalty,
    );
  }

  update(event: UiEvent) {
    this.recentTargetOps.push(targetOperationKey(event));
    if (this.recentTargetOps.length > 8) {
      this.recentTargetOps.shift();
    }
  }
}

export class EventScheduler extends CoverageGuidedRandomStrategy {}

function targetOperationKey(event: UiEvent) {
  return `${event.operation}:${event.target?.signature ?? "page"}`;
}

function baseWeight(operation: UiOperation) {
  switch (operation) {
    case "click":
      return 5;
    case "insertText":
    case "pasteText":
      return 4;
    case "clear":
    case "focus":
      return 3;
    case "pressKey":
    case "modifiedKey":
    case "selectOption":
      return 2.5;
    case "doubleClick":
    case "repeatedClick":
      return 2;
    case "wheel":
    case "backgroundClick":
      return 1.5;
    case "hover":
    case "wait":
      return 1;
    case "refresh":
    case "back":
      return 0.7;
  }
}
