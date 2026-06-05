import type { Result } from "../../types/orf";

export const resultDetailFields = [
  { key: "description", label: "说明" },
  { key: "metricRequirement", label: "要求" },
  { key: "completionStandard", label: "完成标准" },
  { key: "sampleSet", label: "样本集" },
  { key: "measurementScope", label: "测量范围" },
] as const;

export type ResultDetailKey = (typeof resultDetailFields)[number]["key"];
export type ResultDetailsInput = Record<ResultDetailKey, string>;
export type ResultDetailEntry = {
  key: ResultDetailKey;
  label: string;
  value: string;
};

const emptyResultDetails = (): ResultDetailsInput => ({
  description: "",
  metricRequirement: "",
  completionStandard: "",
  sampleSet: "",
  measurementScope: "",
});

export function normalizeResultDetailsInput(input: ResultDetailsInput): ResultDetailsInput {
  const details = emptyResultDetails();
  for (const field of resultDetailFields) {
    details[field.key] = input[field.key].trim();
  }
  return details;
}

export function resultDetailsEqual(left: ResultDetailsInput, right: ResultDetailsInput) {
  const normalizedLeft = normalizeResultDetailsInput(left);
  const normalizedRight = normalizeResultDetailsInput(right);
  return resultDetailFields.every((field) => normalizedLeft[field.key] === normalizedRight[field.key]);
}

export function generatedMetricRequirement(result: Pick<Result, "metricName">) {
  return `${result.metricName}：写清统计对象和完成标准后进入执行。`;
}

export function normalizeResultDetails(result: Pick<Result, ResultDetailKey | "metricName">): ResultDetailsInput {
  const details = emptyResultDetails();
  for (const field of resultDetailFields) {
    details[field.key] = (result[field.key] ?? "").trim();
  }

  if (details.metricRequirement === generatedMetricRequirement(result)) {
    details.metricRequirement = "";
  }

  return details;
}

export function resultDetailEntries(result: Pick<Result, ResultDetailKey | "metricName">): ResultDetailEntry[] {
  const details = normalizeResultDetails(result);
  return resultDetailFields
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: details[field.key],
    }))
    .filter((entry) => entry.value.length > 0);
}

export function hasResultDetails(result: Pick<Result, ResultDetailKey | "metricName">) {
  return resultDetailEntries(result).length > 0;
}

export function resultDetailPreviewText(result: Pick<Result, ResultDetailKey | "metricName">) {
  return resultDetailEntries(result)[0]?.value ?? "";
}
