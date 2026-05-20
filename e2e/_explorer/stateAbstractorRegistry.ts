import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeRepeatableRegions, type DomTreeNodeSnapshot } from "./repeatableRegionDetector";
import type { InputValueKind, NormalizedState, RepeatableRegionRecord } from "./types";
import { shortHash, stableStringify } from "./stableHash";

export { shortHash, stableStringify } from "./stableHash";

export type StateDomSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  focusedSignature: string | null;
  targets: Array<{
    signature: string;
    kind: string;
    disabled: boolean;
    value?: string;
  }>;
  flags: {
    hasError: boolean;
    hasToast: boolean;
    hasModal: boolean;
    hasLoading: boolean;
    hasDrawer: boolean;
  };
  bodyChildCount: number;
  networkPendingCount?: number;
  domTree?: DomTreeNodeSnapshot | null;
};

export type StateAbstraction = Omit<NormalizedState, "id" | "fingerprint" | "repeatableRegionStates" | "repeatableRegions"> &
  Partial<Pick<NormalizedState, "repeatableRegionStates" | "repeatableRegions">>;
export type StateAbstractor = (snapshot: StateDomSnapshot) => StateAbstraction;

const stateAbstractors = new Map<string, StateAbstractor>();

export function registerStateAbstractor(name: string, abstractor: StateAbstractor) {
  const key = normalizeAbstractorName(name);
  if (!key) {
    throw new Error("State abstractor name must not be empty.");
  }
  if (stateAbstractors.has(key)) {
    throw new Error(`State abstractor is already registered: ${key}`);
  }
  stateAbstractors.set(key, abstractor);
}

export function getStateAbstractor(name: string) {
  const key = normalizeAbstractorName(name);
  const abstractor = stateAbstractors.get(key);
  if (!abstractor) {
    throw new Error(`Unknown state abstractor: ${name}. Registered abstractors: ${registeredStateAbstractorNames().join(", ")}`);
  }
  return abstractor;
}

export function registeredStateAbstractorNames() {
  return Array.from(stateAbstractors.keys()).sort();
}

export async function loadStateAbstractorRegistration(moduleSpecifier: string | undefined) {
  if (!moduleSpecifier) {
    return;
  }

  await import(resolveRegistrationModule(moduleSpecifier));
}

export function abstractState(snapshot: StateDomSnapshot, abstractorName: string): NormalizedState {
  return createNormalizedState(getStateAbstractor(abstractorName)(snapshot));
}

export function createNormalizedState(state: StateAbstraction): NormalizedState {
  const completeState = {
    repeatableRegionStates: [],
    repeatableRegions: [],
    ...state,
  };
  const identityState: Partial<typeof completeState> = { ...completeState };
  delete identityState.repeatableRegions;
  const fingerprint = stableStringify(identityState);
  const id = `S-${shortHash(fingerprint)}`;
  return { id, fingerprint, ...completeState };
}

function normalStateAbstractor(snapshot: StateDomSnapshot): StateAbstraction {
  return abstractNormalState(snapshot);
}

function stateExplorationStateAbstractor(snapshot: StateDomSnapshot): StateAbstraction {
  return abstractStateExploration(snapshot);
}

function coarseStateAbstractor(snapshot: StateDomSnapshot): StateAbstraction {
  const normalState = abstractStateExploration(snapshot);
  return {
    routePattern: normalState.routePattern,
    visibleTargetSummary: normalState.visibleTargetSummary,
    interactableStructure: normalState.interactableStructure,
    focusedTargetSignature: null,
    inputValueKinds: [],
    flags: normalState.flags,
    disabledSummary: normalState.disabledSummary,
    networkPendingSummary: "coarse",
    mainVisibleTextHash: "coarse",
    targetSignatures: [],
    repeatableRegionStates: normalState.repeatableRegionStates,
    repeatableRegions: normalState.repeatableRegions,
  };
}

function abstractNormalState(snapshot: StateDomSnapshot): StateAbstraction {
  const routePattern = normalizeRoutePattern(new URL(snapshot.url).pathname);
  const repeatable = repeatableRegionAnalysis(snapshot, routePattern);
  const inputValueKinds = snapshot.targets
    .map((target) => (target.value === undefined ? null : classifyInputValue(target.value)))
    .filter((value): value is InputValueKind => value !== null)
    .sort();
  const visibleTargetSummary = snapshot.targets.reduce<Record<string, number>>((summary, target) => {
    summary[target.kind] = (summary[target.kind] ?? 0) + 1;
    return summary;
  }, {});
  const enabled = snapshot.targets.filter((target) => !target.disabled).length;
  const disabled = snapshot.targets.length - enabled;
  const targetSignatures = Array.from(
    new Set(snapshot.targets.map((target) => sanitizeSignature(target.signature) ?? target.signature)),
  ).sort();
  const sanitizedText = sanitizeVisibleText(snapshot.visibleText);

  return {
    routePattern,
    visibleTargetSummary,
    interactableStructure: Object.entries(visibleTargetSummary)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => `${kind}:${count}`),
    focusedTargetSignature: sanitizeSignature(snapshot.focusedSignature),
    inputValueKinds,
    flags: {
      ...snapshot.flags,
      isWhiteScreen: sanitizedText.length === 0 && snapshot.targets.length === 0 && snapshot.bodyChildCount <= 1,
    },
    disabledSummary: { enabled, disabled },
    networkPendingSummary: networkPendingBucket(snapshot.networkPendingCount ?? 0),
    mainVisibleTextHash: shortHash(sanitizedText),
    targetSignatures,
    repeatableRegionStates: fullRepeatableRegionStates(repeatable.regions),
    repeatableRegions: repeatable.regions,
  };
}

function abstractStateExploration(snapshot: StateDomSnapshot): StateAbstraction {
  const routePattern = normalizeRoutePattern(new URL(snapshot.url).pathname);
  const repeatable = repeatableRegionAnalysis(snapshot, routePattern);
  const visibleTargetSummary = snapshot.targets.reduce<Record<string, number>>((summary, target) => {
    summary[target.kind] = 1;
    return summary;
  }, {});
  const enabledCount = snapshot.targets.filter((target) => !target.disabled).length;
  const disabledCount = snapshot.targets.length - enabledCount;
  const collapsedText = repeatable.collapsedVisibleText || snapshot.visibleText;
  const sanitizedText = sanitizeVisibleText(collapsedText);

  return {
    routePattern,
    visibleTargetSummary,
    interactableStructure: Object.keys(visibleTargetSummary)
      .sort()
      .map((kind) => `${kind}:present`),
    focusedTargetSignature: null,
    inputValueKinds: [],
    flags: {
      ...snapshot.flags,
      isWhiteScreen: sanitizedText.length === 0 && snapshot.targets.length === 0 && snapshot.bodyChildCount <= 1,
    },
    disabledSummary: { enabled: enabledCount > 0 ? 1 : 0, disabled: disabledCount > 0 ? 1 : 0 },
    networkPendingSummary: networkPendingBucket(snapshot.networkPendingCount ?? 0),
    mainVisibleTextHash: stateExplorationTextMarker(sanitizedText),
    targetSignatures: [],
    repeatableRegionStates: stateExplorationRepeatableRegionStates(repeatable.regions),
    repeatableRegions: repeatable.regions,
  };
}

export function classifyInputValue(value: string): InputValueKind {
  if (value.length === 0) {
    return "empty";
  }
  if (/^\s+$/.test(value)) {
    return "whitespaceOnly";
  }
  if (value.includes("\n")) {
    return "multiLine";
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "emailLike";
  }
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return "numberLike";
  }
  if (/<script\b/i.test(value) || /[{[(<][^}\])>]*$/.test(value)) {
    return "malformed";
  }
  if (/^\s*[{[]/.test(value) || /^https?:\/\//i.test(value) || /<\/?[a-z][\s\S]*>/i.test(value)) {
    return "structured";
  }
  if (/\p{Extended_Pictographic}/u.test(value)) {
    return "emoji";
  }
  if (/[^\u0000-\u007f]/.test(value)) {
    return "unicode";
  }
  if (value.length > 500) {
    return "veryLong";
  }
  if (value.length > 100) {
    return "long";
  }
  return "short";
}

export function normalizeRoutePattern(pathname: string) {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/[0-9a-f]{8,}/gi, ":hex")
    .replace(/\b\d+\b/g, ":num")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

export function sanitizeVisibleText(text: string) {
  return text
    .replace(/https?:\/\/\S+/gi, " url ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " email ")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, " uuid ")
    .replace(/[0-9a-f]{12,}/gi, " token ")
    .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\b/g, " date ")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " time ")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function sanitizeSignature(signature: string | null) {
  return signature
    ?.replace(/https?:\/\/\S+/gi, "url")
    .replace(/[0-9a-f]{8,}/gi, "hex")
    .replace(/\d+/g, "0") ?? null;
}

function targetFamilySignature(signature: string | null) {
  return sanitizeSignature(signature)
    ?.replace(/rect:[^|]+/g, "rect:*")
    .replace(/index:[^|]+/g, "index:*") ?? null;
}

function repeatableRegionAnalysis(snapshot: StateDomSnapshot, routePattern: string) {
  return analyzeRepeatableRegions(snapshot.domTree ?? null, routePattern);
}

function fullRepeatableRegionStates(regions: RepeatableRegionRecord[]) {
  return regions.map((region) => region.abstractionKey).sort();
}

function stateExplorationRepeatableRegionStates(regions: RepeatableRegionRecord[]) {
  const meaningful = regions.filter((region) => region.kind === "comment" || region.businessTags.length > 0 || region.hierarchyLayers.length > 0);
  if (meaningful.length === 0) {
    return [];
  }

  const byRoute = new Map<string, RepeatableRegionRecord[]>();
  for (const region of meaningful) {
    byRoute.set(region.routePattern, [...(byRoute.get(region.routePattern) ?? []), region]);
  }

  return Array.from(byRoute.entries())
    .map(([routePattern, routeRegions]) => {
      const commentPresence = unionSorted(routeRegions.filter((region) => region.kind === "comment").map((region) => region.presence));
      const businessTags = unionSorted(routeRegions.flatMap((region) => region.businessTags));
      const hierarchyLayers = unionSorted(routeRegions.flatMap((region) => region.hierarchyLayers));
      return stableStringify({
        routePattern,
        commentPresence,
        businessTags,
        hierarchyLayers,
        hasTaggedRepeatableRegion: businessTags.length > 0,
        hasHierarchyRepeatableRegion: hierarchyLayers.length > 0,
      });
    })
    .sort();
}

function stateExplorationTextMarker(text: string) {
  const markers = [
    /\berror\b|错误|失败|无权限|invalid|failed/i.test(text) ? "error" : "",
    /暂无评论|暂无回复|no comments|no replies/i.test(text) ? "empty-comment" : "",
    /待征召|征召中|招募中/.test(text) ? "status:pendingRecruitment" : "",
    /挑战中|进行中/.test(text) ? "status:challenging" : "",
    /已完成|完成/.test(text) ? "status:completed" : "",
    /已关闭|关闭/.test(text) ? "status:closed" : "",
    /评审中|审核中/.test(text) ? "status:reviewing" : "",
    /已解决|resolved/i.test(text) ? "status:resolved" : "",
  ].filter(Boolean);
  return markers.length > 0 ? markers.sort().join("|") : "stable";
}

function unionSorted<T extends string>(values: T[]) {
  return Array.from(new Set(values)).sort();
}

function networkPendingBucket(count: number) {
  if (count <= 0) {
    return "none";
  }
  if (count <= 2) {
    return "low";
  }
  if (count <= 8) {
    return "medium";
  }
  return "high";
}

function normalizeAbstractorName(name: string) {
  return name.trim();
}

function resolveRegistrationModule(moduleSpecifier: string) {
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return pathToFileURL(path.resolve(process.cwd(), moduleSpecifier)).href;
  }
  return moduleSpecifier;
}

registerStateAbstractor("normal", normalStateAbstractor);
registerStateAbstractor("stateExploration", stateExplorationStateAbstractor);
registerStateAbstractor("coarse", coarseStateAbstractor);
