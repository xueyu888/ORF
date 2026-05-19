import assert from "node:assert/strict";
import test from "node:test";
import { evaluationMetricCards, summarizeEvalRuns } from "../src/features/evaluation/model/evaluationSummary";
import type { EvalRun } from "../src/types/orf";

test("summarizeEvalRuns returns empty values instead of demo metrics", () => {
  const summary = summarizeEvalRuns([]);
  const cards = evaluationMetricCards(summary);

  assert.equal(summary.runCount, 0);
  assert.equal(summary.averageAccuracy, null);
  assert.equal(summary.p95Latency, null);
  assert.deepEqual(cards.map((card) => card.value), ["0", "0", "暂无数据", "暂无数据", "暂无数据", "暂无数据"]);
});

test("summarizeEvalRuns derives averages and p95 latency from eval runs", () => {
  const summary = summarizeEvalRuns([
    evalRun({ id: "run-a", accuracy: 80, hallucination: 4, latency: 1.2, cost: 0.01, status: "On Track" }),
    evalRun({ id: "run-b", accuracy: 90, hallucination: 8, latency: 3.4, cost: 0.03, status: "At Risk" }),
    evalRun({ id: "run-c", accuracy: 70, hallucination: 10, latency: 2.1, cost: 0.02, status: "Blocked" }),
  ]);
  const cards = evaluationMetricCards(summary);

  assert.equal(summary.runCount, 3);
  assert.equal(summary.atRiskCount, 2);
  assert.equal(summary.averageAccuracy, 80);
  assert.equal(summary.averageHallucination, 22 / 3);
  assert.equal(summary.p95Latency, 3.4);
  assert.equal(summary.averageCost, 0.02);
  assert.deepEqual(cards.map((card) => card.value), ["3", "2", "80%", "7.3%", "3.4s", "$0.02"]);
});

function evalRun(input: Partial<EvalRun>): EvalRun {
  return {
    id: "run",
    scenario: "Scenario",
    dataset: "dataset",
    model: "model",
    promptVersion: "prompt",
    ragVersion: "rag",
    accuracy: 0,
    hallucination: 0,
    latency: 0,
    cost: 0,
    status: "On Track",
    linkedResultId: "result",
    ...input,
  };
}
