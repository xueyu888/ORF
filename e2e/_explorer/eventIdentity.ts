import { shortHash, stableStringify } from "./stateNormalizer";
import type { EventParams, UiEvent, UiTarget } from "./types";

export function canonicalEventSignature(event: UiEvent) {
  const source = {
    operation: event.operation,
    target: canonicalTargetSignature(event.target),
    params: canonicalParams(event.params),
  };
  return `${event.operation}:${shortHash(stableStringify(source))}`;
}

export function canonicalTargetSignature(target?: UiTarget) {
  if (!target) {
    return "page";
  }
  return stableStringify({
    kind: target.kind,
    tag: target.tag,
    role: target.role,
    inputType: target.inputType ?? "none",
    text: target.textBucket,
    label: target.labelBucket,
    placeholder: target.placeholderBucket,
    capabilities: [...target.capabilities].sort(),
  });
}

function canonicalParams(params: EventParams) {
  return {
    payloadKind: params.payloadKind,
    key: params.key,
    modifierSet: params.modifierSet ? [...params.modifierSet].sort() : undefined,
    button: params.button,
    direction: params.direction,
    distanceBucket: params.distanceBucket,
    pointBucket: params.pointBucket,
    durationBucket: durationBucket(params.durationMs),
    count: params.count,
  };
}

function durationBucket(durationMs?: number) {
  if (durationMs === undefined) {
    return undefined;
  }
  if (durationMs <= 300) {
    return "short";
  }
  if (durationMs <= 800) {
    return "medium";
  }
  return "long";
}
