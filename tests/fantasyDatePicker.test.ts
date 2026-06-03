import assert from "node:assert/strict";
import test from "node:test";
import { buildFantasyDateGrid, fantasyMonthLabel } from "../src/components/FantasyDatePicker";

test("fantasy date picker builds a stable Monday-first month grid", () => {
  const grid = buildFantasyDateGrid(new Date(2026, 5, 1), "2026-06-16", "2026-06-10");

  assert.equal(grid.length, 42);
  assert.equal(grid[0]?.value, "2026-06-01");
  assert.equal(grid[41]?.value, "2026-07-12");
  assert.equal(grid.find((cell) => cell.value === "2026-06-16")?.isSelected, true);
  assert.equal(grid.find((cell) => cell.value === "2026-06-09")?.disabled, true);
  assert.equal(grid.find((cell) => cell.value === "2026-06-10")?.disabled, false);
  assert.equal(grid.find((cell) => cell.value === "2026-07-01")?.inMonth, false);
});

test("fantasy date picker month labels use the ORF deadline display format", () => {
  assert.equal(fantasyMonthLabel(new Date(2026, 5, 1)), "2026年06月");
});
