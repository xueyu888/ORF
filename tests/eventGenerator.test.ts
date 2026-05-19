import assert from "node:assert/strict";
import test from "node:test";
import { generateCandidateEvents } from "../e2e/_explorer/eventGenerator";
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

function inputTarget(): UiTarget {
  return {
    id: "T-input",
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
