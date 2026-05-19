import assert from "node:assert/strict";
import test from "node:test";
import { SeededRandom } from "../e2e/_explorer/seededRandom";

test("seeded random produces reproducible sequences for the same seed", () => {
  const first = new SeededRandom("ui-explorer-seed");
  const second = new SeededRandom("ui-explorer-seed");

  assert.deepEqual(
    Array.from({ length: 12 }, () => first.next()),
    Array.from({ length: 12 }, () => second.next()),
  );
});

test("weighted pick is reproducible with a fixed seed", () => {
  const first = new SeededRandom("weighted");
  const second = new SeededRandom("weighted");
  const items = ["a", "b", "c"];
  const weightFor = (item: string) => (item === "c" ? 10 : 1);

  assert.deepEqual(
    Array.from({ length: 8 }, () => first.weightedPick(items, weightFor)),
    Array.from({ length: 8 }, () => second.weightedPick(items, weightFor)),
  );
});
