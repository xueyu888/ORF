import type { Objective, Result } from "../../../types/orf";

export interface ResultQualityCheck {
  label: string;
  passed: boolean;
}

interface ResultQualityInput {
  objective: Objective | undefined;
  result: Result;
}

const vagueTerms = ["尽量", "大概", "较好", "明显", "适当", "若干", "相关优化"];

export function buildResultQualityChecks(input: ResultQualityInput): ResultQualityCheck[] {
  const { objective, result } = input;

  return [
    {
      label: "可度量",
      passed: hasText(result.metricName) && hasFiniteNumber(result.baseline) && hasFiniteNumber(result.current) && hasFiniteNumber(result.target),
    },
    {
      label: "有目标战利品入口",
      passed: Boolean(objective && objective.resultIds.includes(result.id)),
    },
    {
      label: "已关联目标",
      passed: Boolean(objective),
    },
    {
      label: "口径清楚",
      passed: [
        result.metricRequirement,
        result.statisticalObject,
        result.completionStandard,
        result.sampleSet,
        result.measurementScope,
      ].every(hasText),
    },
    {
      label: "无模糊词",
      passed: !containsVagueTerms([result.title, result.description, result.metricRequirement, result.completionStandard].join(" ")),
    },
  ];
}

function hasText(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function containsVagueTerms(value: string) {
  return vagueTerms.some((term) => value.includes(term));
}
