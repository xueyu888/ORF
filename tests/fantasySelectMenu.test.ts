import assert from "node:assert/strict";
import test from "node:test";
import { filterFantasySelectOptions, hasFantasySelectOptionSearchMatch, type FantasySelectOption } from "../src/components/FantasySelectMenu";

const options: Array<FantasySelectOption<string>> = [
  { label: "全部成员", value: "all", alwaysVisible: true },
  { label: "冯成", value: "feng-cheng" },
  { label: "m1", value: "m1" },
  { label: "zrx", value: "zrx" },
];

test("filterFantasySelectOptions keeps always visible options while narrowing matches", () => {
  const filtered = filterFantasySelectOptions(options, "zr");

  assert.deepEqual(filtered.map((option) => option.label), ["全部成员", "zrx"]);
});

test("filterFantasySelectOptions matches option labels and values case-insensitively", () => {
  const filtered = filterFantasySelectOptions([
    { label: "全部周期", value: "all", alwaysVisible: true },
    { label: "2026 Q2", value: "cycle-2026-q2" },
    { label: "2027 Q1", value: "cycle-2027-q1" },
  ], " Q2 ");

  assert.deepEqual(filtered.map((option) => option.value), ["all", "cycle-2026-q2"]);
});

test("hasFantasySelectOptionSearchMatch distinguishes pinned options from real search matches", () => {
  assert.equal(hasFantasySelectOptionSearchMatch(options, "zrx"), true);
  assert.equal(hasFantasySelectOptionSearchMatch(options, "missing"), false);
});
