import { payloadKinds } from "./payloads";
import { shortHash, stableStringify } from "./stateNormalizer";
import type { EventParams, UiEvent, UiOperation, UiTarget } from "./types";

const pastePayloadKinds = new Set(["emojiText", "veryLongText", "structuredText", "malformedText", "multiLineText"]);

export function generateCandidateEvents(targets: UiTarget[]): UiEvent[] {
  const events: UiEvent[] = [];

  for (const target of targets) {
    if (target.capabilities.includes("focus")) {
      events.push(event("focus", target));
    }

    if (target.capabilities.includes("input")) {
      events.push(event("clear", target));
      events.push(event("pressKey", target, { key: "Enter" }));
      events.push(event("pressKey", target, { key: "Tab" }));
      events.push(event("pressKey", target, { key: "Backspace" }));
      events.push(event("modifiedKey", target, { modifierSet: ["Primary"], key: "A" }));
      for (const payloadKind of payloadKinds) {
        events.push(event("insertText", target, { payloadKind }));
        if (pastePayloadKinds.has(payloadKind)) {
          events.push(event("pasteText", target, { payloadKind }));
        }
      }
    }

    if (target.capabilities.includes("click") || target.capabilities.includes("toggle") || target.capabilities.includes("select")) {
      events.push(event("click", target, { button: "left" }));
      events.push(event("doubleClick", target));
      events.push(event("hover", target));
      events.push(event("pressKey", target, { key: "Enter" }));
      events.push(event("pressKey", target, { key: "Space" }));
      events.push(event("repeatedClick", target, { button: "left", count: 2 }));
      events.push(event("repeatedClick", target, { button: "left", count: 4 }));
    }

    if (target.capabilities.includes("scroll")) {
      events.push(event("wheel", target, { direction: "down", distanceBucket: "medium" }));
      events.push(event("wheel", target, { direction: "up", distanceBucket: "medium" }));
      events.push(event("wheel", target, { direction: "right", distanceBucket: "small" }));
      events.push(event("wheel", target, { direction: "left", distanceBucket: "small" }));
    }
  }

  for (const pointBucket of ["center", "top-left", "top-right", "bottom-left", "bottom-right"]) {
    events.push(event("backgroundClick", undefined, { pointBucket }));
  }
  events.push(event("wheel", undefined, { direction: "down", distanceBucket: "medium" }));
  events.push(event("wheel", undefined, { direction: "up", distanceBucket: "medium" }));
  events.push(event("refresh"));
  events.push(event("back"));
  events.push(event("wait", undefined, { durationMs: 250 }));
  events.push(event("wait", undefined, { durationMs: 600 }));

  return dedupeEvents(events);
}

function event(operation: UiOperation, target?: UiTarget, params: EventParams = {}): UiEvent {
  const signatureSource = {
    operation,
    target: target?.signature ?? "page",
    params,
  };
  const signature = `${operation}:${shortHash(stableStringify(signatureSource))}`;
  return { operation, target, params, signature };
}

function dedupeEvents(events: UiEvent[]) {
  const seen = new Set<string>();
  return events.filter((candidate) => {
    if (seen.has(candidate.signature)) {
      return false;
    }
    seen.add(candidate.signature);
    return true;
  });
}
