import assert from "node:assert/strict";
import test from "node:test";
import { createUiEvent, generateCandidateEvents } from "../e2e/_explorer/eventGenerator";
import { payloadKinds } from "../e2e/_explorer/payloads";
import type { UiTarget } from "../e2e/_explorer/types";

test("event generator uses the reduced single input payload set", () => {
  const events = generateCandidateEvents([inputTarget()]);
  const insertPayloads = events
    .filter((event) => event.operation === "insertText")
    .map((event) => event.params.payloadKind)
    .sort();
  const pastePayloads = events
    .filter((event) => event.operation === "pasteText")
    .map((event) => event.params.payloadKind)
    .sort();

  assert.deepEqual(insertPayloads, [...payloadKinds].sort());
  assert.deepEqual(payloadKinds, ["asciiText"]);
  assert.deepEqual(pastePayloads, []);
});

test("event generator uses DOM-inferred actions when present", () => {
  const events = generateCandidateEvents([
    {
      ...inputTarget(),
      actions: [{ type: "click" }, { type: "pressEnter" }, { type: "pressSpace" }],
      confidence: 0.8,
      reason: ["role:button"],
    },
  ]);
  const targetEvents = events.filter((event) => event.target);

  assert.deepEqual(
    targetEvents.map((event) => `${event.operation}:${event.params.key ?? event.params.button ?? ""}`).sort(),
    ["click:left", "pressKey:Enter", "pressKey:Space"],
  );
  assert.equal(targetEvents.some((event) => event.operation === "doubleClick"), false);
  assert.equal(targetEvents.some((event) => event.operation === "repeatedClick"), false);
});

test("event confidence is carried without changing event identity", () => {
  const highConfidence = createUiEvent("click", { ...inputTarget(), confidence: 1 }, { button: "left" });
  const lowConfidence = createUiEvent("click", { ...inputTarget(), confidence: 0.3 }, { button: "left" });

  assert.equal(highConfidence.confidence, 1);
  assert.equal(lowConfidence.confidence, 0.3);
  assert.equal(highConfidence.signature, lowConfidence.signature);
});

function inputTarget(): UiTarget {
  return {
    id: "T-input",
    routePattern: "/auth",
    signature: "input:textbox:email",
    selector: "input:nth-of-type(1)",
    kind: "input:textbox:email",
    tag: "input",
    role: "textbox",
    inputType: "email",
    textBucket: "none",
    labelBucket: "none",
    placeholderBucket: "email",
    rect: { x: 1, y: 1, width: 2, height: 1 },
    capabilities: ["focus", "input", "keyboard"],
  };
}
