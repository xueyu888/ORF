import assert from "node:assert/strict";
import test from "node:test";
import { initialOrfState } from "../src/data/initialOrfState";

test("initial feedback fixtures keep feedback source internal", () => {
  const sources = new Set(initialOrfState.feedback.map((feedback) => feedback.source));

  assert.deepEqual([...sources], ["Team review"]);
});
