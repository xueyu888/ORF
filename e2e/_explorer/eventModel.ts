import { payloadKinds } from "./payloads";
import { shortHash, stableStringify } from "./stableHash";
import type { EventParams, PayloadKind, TargetAction, UiEvent, UiOperation, UiTarget } from "./types";

const pastePayloadKinds = new Set<PayloadKind>([
  "emojiText",
  "veryLongText",
  "structuredText",
  "malformedText",
  "multiLineText",
]);

export function generateInteractionEvents(targets: UiTarget[]): UiEvent[] {
  return dedupeEvents([...targets.flatMap(eventsForTarget), ...pageLevelEvents()]);
}

export function eventsForTarget(target: UiTarget): UiEvent[] {
  if (target.actions?.length) {
    return eventsForInferredActions(target, target.actions);
  }

  const events: UiEvent[] = [];

  if (target.capabilities.includes("focus")) {
    events.push(createUiEvent("focus", target));
  }

  if (target.capabilities.includes("input")) {
    events.push(createUiEvent("clear", target));
    events.push(createUiEvent("pressKey", target, { key: "Enter" }));
    events.push(createUiEvent("pressKey", target, { key: "Tab" }));
    events.push(createUiEvent("pressKey", target, { key: "Backspace" }));
    events.push(createUiEvent("modifiedKey", target, { modifierSet: ["Primary"], key: "A" }));
    for (const payloadKind of payloadKinds) {
      events.push(createUiEvent("insertText", target, { payloadKind }));
      if (pastePayloadKinds.has(payloadKind)) {
        events.push(createUiEvent("pasteText", target, { payloadKind }));
      }
    }
  }

  if (target.capabilities.includes("click") || target.capabilities.includes("toggle") || target.capabilities.includes("select")) {
    events.push(createUiEvent("click", target, { button: "left" }));
    events.push(createUiEvent("doubleClick", target));
    events.push(createUiEvent("hover", target));
    events.push(createUiEvent("pressKey", target, { key: "Enter" }));
    events.push(createUiEvent("pressKey", target, { key: "Space" }));
    events.push(createUiEvent("repeatedClick", target, { button: "left", count: 2 }));
    events.push(createUiEvent("repeatedClick", target, { button: "left", count: 4 }));
  }

  if (target.capabilities.includes("select")) {
    events.push(createUiEvent("selectOption", target, { optionBucket: "first" }));
    events.push(createUiEvent("selectOption", target, { optionBucket: "next" }));
    events.push(createUiEvent("selectOption", target, { optionBucket: "last" }));
  }

  if (target.capabilities.includes("scroll")) {
    events.push(createUiEvent("wheel", target, { direction: "down", distanceBucket: "medium" }));
    events.push(createUiEvent("wheel", target, { direction: "up", distanceBucket: "medium" }));
    events.push(createUiEvent("wheel", target, { direction: "right", distanceBucket: "small" }));
    events.push(createUiEvent("wheel", target, { direction: "left", distanceBucket: "small" }));
  }

  return events;
}

function eventsForInferredActions(target: UiTarget, actions: TargetAction[]) {
  const events: UiEvent[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "click":
      case "toggle":
        events.push(createUiEvent("click", target, { button: "left" }));
        break;
      case "pressEnter":
        events.push(createUiEvent("pressKey", target, { key: "Enter" }));
        break;
      case "pressSpace":
        events.push(createUiEvent("pressKey", target, { key: "Space" }));
        break;
      case "focus":
        events.push(createUiEvent("focus", target));
        break;
      case "typeText":
        for (const payloadKind of payloadKinds) {
          events.push(createUiEvent("insertText", target, { payloadKind }));
          if (pastePayloadKinds.has(payloadKind)) {
            events.push(createUiEvent("pasteText", target, { payloadKind }));
          }
        }
        break;
      case "clearText":
        events.push(createUiEvent("clear", target));
        break;
      case "selectOption":
        events.push(createUiEvent("selectOption", target, { optionBucket: "first" }));
        events.push(createUiEvent("selectOption", target, { optionBucket: "next" }));
        events.push(createUiEvent("selectOption", target, { optionBucket: "last" }));
        break;
      case "hover":
        events.push(createUiEvent("hover", target));
        break;
      case "blur":
      case "scrollIntoView":
        break;
    }
  }

  return dedupeEvents(events);
}

export function pageLevelEvents(): UiEvent[] {
  const events: UiEvent[] = [];
  for (const pointBucket of ["center", "top-left", "top-right", "bottom-left", "bottom-right"]) {
    events.push(createUiEvent("backgroundClick", undefined, { pointBucket }));
  }
  events.push(createUiEvent("wheel", undefined, { direction: "down", distanceBucket: "medium" }));
  events.push(createUiEvent("wheel", undefined, { direction: "up", distanceBucket: "medium" }));
  events.push(createUiEvent("refresh"));
  events.push(createUiEvent("back"));
  events.push(createUiEvent("wait", undefined, { durationMs: 250 }));
  events.push(createUiEvent("wait", undefined, { durationMs: 600 }));
  return events;
}

export function createUiEvent(operation: UiOperation, target?: UiTarget, params: EventParams = {}): UiEvent {
  const signatureSource = {
    operation,
    target: target?.signature ?? "page",
    params,
  };
  const signature = `${operation}:${shortHash(stableStringify(signatureSource))}`;
  const event: UiEvent = { operation, target, params, signature };
  if (target?.confidence !== undefined) {
    event.confidence = target.confidence;
  }
  return event;
}

export function dedupeEvents(events: UiEvent[]) {
  const seen = new Set<string>();
  return events.filter((candidate) => {
    if (seen.has(candidate.signature)) {
      return false;
    }
    seen.add(candidate.signature);
    return true;
  });
}
