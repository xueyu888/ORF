import type { Result } from "../../types/orf";

export type ResultDetailsInput = {
  detail: string;
};

export function normalizeResultDetailsInput(input: ResultDetailsInput): ResultDetailsInput {
  return { detail: normalizeResultDetail(input.detail) };
}

export function resultDetailsEqual(left: ResultDetailsInput, right: ResultDetailsInput) {
  return normalizeResultDetailsInput(left).detail === normalizeResultDetailsInput(right).detail;
}

export function normalizeResultDetail(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function normalizeResultDetails(result: Pick<Result, "detail">): ResultDetailsInput {
  return { detail: normalizeResultDetail(result.detail) };
}

export function resultDetailText(result: Pick<Result, "detail">) {
  return normalizeResultDetail(result.detail);
}

export function resultDetailPreviewText(result: Pick<Result, "detail">) {
  return resultDetailText(result);
}
