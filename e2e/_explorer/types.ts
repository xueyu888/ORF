export type UiOperation =
  | "click"
  | "doubleClick"
  | "hover"
  | "focus"
  | "insertText"
  | "pasteText"
  | "clear"
  | "pressKey"
  | "modifiedKey"
  | "selectOption"
  | "wheel"
  | "backgroundClick"
  | "refresh"
  | "back"
  | "wait"
  | "repeatedClick";

export type TargetCapability = "click" | "input" | "focus" | "keyboard" | "scroll" | "select" | "toggle";

export type PayloadKind =
  | "emptyText"
  | "asciiText"
  | "unicodeText"
  | "emojiText"
  | "whitespaceText"
  | "longText"
  | "veryLongText"
  | "structuredText"
  | "malformedText"
  | "emailLikeText"
  | "numberLikeText"
  | "multiLineText";

export type InputValueKind =
  | "empty"
  | "short"
  | "long"
  | "veryLong"
  | "emailLike"
  | "numberLike"
  | "unicode"
  | "emoji"
  | "whitespaceOnly"
  | "multiLine"
  | "structured"
  | "malformed";

export type RectBucket = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UiTarget = {
  id: string;
  routePattern: string;
  signature: string;
  selector: string;
  kind: string;
  tag: string;
  role: string;
  inputType?: string;
  textBucket: string;
  labelBucket: string;
  placeholderBucket: string;
  rect: RectBucket;
  capabilities: TargetCapability[];
};

export type EventParams = {
  payloadKind?: PayloadKind;
  key?: string;
  modifierSet?: string[];
  button?: "left" | "middle" | "right";
  direction?: "up" | "down" | "left" | "right";
  distanceBucket?: "small" | "medium" | "large";
  pointBucket?: string;
  durationMs?: number;
  count?: number;
  optionBucket?: "first" | "next" | "last";
};

export type UiEvent = {
  operation: UiOperation;
  target?: UiTarget;
  params: EventParams;
  signature: string;
};

export type NormalizedState = {
  id: string;
  fingerprint: string;
  routePattern: string;
  visibleTargetSummary: Record<string, number>;
  interactableStructure: string[];
  focusedTargetSignature: string | null;
  inputValueKinds: InputValueKind[];
  flags: {
    hasError: boolean;
    hasToast: boolean;
    hasModal: boolean;
    hasLoading: boolean;
    hasDrawer: boolean;
    isWhiteScreen: boolean;
  };
  disabledSummary: {
    enabled: number;
    disabled: number;
  };
  networkPendingSummary: string;
  mainVisibleTextHash: string;
  targetSignatures: string[];
};

export type CandidateEventRecord = {
  eventSignature: string;
  event: UiEvent;
  attempts: number;
  successCount: number;
  noChangeCount: number;
  newStateCount: number;
  errorCount: number;
  routeEscapeCount: number;
  lastReward: number;
};

export type StateNode = {
  id: string;
  fingerprint: string;
  routePattern: string;
  visits: number;
  firstSeenStep: number;
  lastSeenStep: number;
  candidateCount: number;
  testedCandidateCount: number;
  untestedCandidateCount: number;
  noChangeCount: number;
  newStateOutCount: number;
  errorCount: number;
  candidates: CandidateEventRecord[];
};

export type TransitionEdge = {
  fromStateId: string;
  toStateId: string;
  eventSignature: string;
  count: number;
  firstSeenStep: number;
  lastSeenStep: number;
  reward: number;
};

export type ExecutionIssue = {
  severity: "ordinary" | "severe";
  type: string;
  message: string;
  url?: string;
};

export type ExecutionResult = {
  ok: boolean;
  durationMs: number;
  issues: ExecutionIssue[];
  routeEscape: boolean;
  timedOut: boolean;
};

export type StepRecord = {
  step: number;
  beforeStateId: string;
  afterStateId: string;
  eventSignature: string;
  operation: UiOperation;
  targetSignature?: string;
  params: EventParams;
  reward: number;
  newState: boolean;
  newTransition: boolean;
  noChange: boolean;
  routeEscape: boolean;
  issues: ExecutionIssue[];
};

export type CoverageSummary = {
  totalSteps: number;
  executedSteps: number;
  discoveredStateCount: number;
  discoveredTransitionCount: number;
  discoveredCandidateEventCount: number;
  testedCandidateEventCount: number;
  candidateEventCoverage: number;
  discoveredCanonicalCandidateEventCount: number;
  testedCanonicalCandidateEventCount: number;
  canonicalCandidateEventCoverage: number;
  payloadKindCoverage: number;
  targetCoverage: number;
  noChangeRate: number;
  routeEscapeCount: number;
  runtimeErrorCount: number;
  severeFailureCount: number;
  discoveredSpaceExplorationScore: number;
  stateGrowthSaturation: number;
  transitionGrowthSaturation: number;
};

export type ExplorerConfig = {
  safetyProfile: string;
  targetPath: string;
  steps: number;
  seed: string;
  reportDir: string;
  maxNoChange: number;
  baseURL: string;
  allowedOrigins: string[];
  allowedPathPatterns: string[];
  blockedPathPatterns: string[];
  blockedOperationKinds: UiOperation[];
  blockedTargetTextPatterns: string[];
  maxStepDuration: number;
  resetOnRouteEscape: boolean;
  stopOnRouteEscape: boolean;
  stateAbstractor: string;
  epsilon: number;
};

export type ExplorerRunResult = {
  config: ExplorerConfig;
  seed: string;
  summary: CoverageSummary;
  newStateCurve: number[];
  newTransitionCurve: number[];
  stateTable: StateNode[];
  transitionTable: TransitionEdge[];
  frontierStates: StateNode[];
  untestedCandidateEvents: Array<{
    stateId: string;
    eventSignature: string;
    operation: UiOperation;
    targetSignature?: string;
  }>;
  canonicalCandidateEvents: string[];
  testedCanonicalCandidateEvents: string[];
  eventSequence: StepRecord[];
  replayCommand: string;
  reportPath?: string;
  htmlReportPath?: string;
};
