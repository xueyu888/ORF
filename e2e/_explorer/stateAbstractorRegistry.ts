import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { InputValueKind, NormalizedState } from "./types";

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
};

export type StateAbstraction = Omit<NormalizedState, "id" | "fingerprint">;
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
  const fingerprint = stableStringify(state);
  const id = `S-${shortHash(fingerprint)}`;
  return { id, fingerprint, ...state };
}

function normalStateAbstractor(snapshot: StateDomSnapshot): StateAbstraction {
  return abstractNormalState(snapshot);
}

function coarseStateAbstractor(snapshot: StateDomSnapshot): StateAbstraction {
  const normalState = abstractNormalState(snapshot);
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
  };
}

function abstractNormalState(snapshot: StateDomSnapshot): StateAbstraction {
  const routePattern = normalizeRoutePattern(new URL(snapshot.url).pathname);
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

export function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
registerStateAbstractor("coarse", coarseStateAbstractor);
