import type { EvalRun } from "../../../types/orf";

export interface EvaluationSummary {
  runCount: number;
  atRiskCount: number;
  averageAccuracy: number | null;
  averageHallucination: number | null;
  p95Latency: number | null;
  averageCost: number | null;
}

export function summarizeEvalRuns(runs: EvalRun[]): EvaluationSummary {
  return {
    runCount: runs.length,
    atRiskCount: runs.filter((run) => run.status === "At Risk" || run.status === "Blocked").length,
    averageAccuracy: average(runs.map((run) => run.accuracy)),
    averageHallucination: average(runs.map((run) => run.hallucination)),
    p95Latency: percentile(runs.map((run) => run.latency), 0.95),
    averageCost: average(runs.map((run) => run.cost)),
  };
}

export function evaluationMetricCards(summary: EvaluationSummary) {
  return [
    { label: "评估运行", value: `${summary.runCount}`, detail: "当前数据范围" },
    { label: "风险运行", value: `${summary.atRiskCount}`, detail: "At Risk / Blocked" },
    { label: "平均准确率", value: formatPercent(summary.averageAccuracy), detail: "来自评估运行" },
    { label: "平均幻觉率", value: formatPercent(summary.averageHallucination), detail: "来自评估运行" },
    { label: "P95 时延", value: summary.p95Latency == null ? "暂无数据" : `${formatNumber(summary.p95Latency, 1)}s`, detail: "来自评估运行" },
    { label: "平均请求成本", value: summary.averageCost == null ? "暂无数据" : `$${formatNumber(summary.averageCost, 3)}`, detail: "来自评估运行" },
  ];
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}

function formatPercent(value: number | null) {
  if (value == null) {
    return "暂无数据";
  }

  return `${formatNumber(value, 1)}%`;
}

function formatNumber(value: number, fractionDigits: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}
