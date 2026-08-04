import type { LootResultClaim, LootResultClaimStatus, Result } from "../types/orf";

export type LootMetricClaimDraft = {
  claim: LootResultClaimStatus;
  evidenceText: string;
};

export type LootMetricClaimDrafts = Record<string, LootMetricClaimDraft>;

export type LootMetricChecklistSummary = {
  completed: number;
  falsified: number;
  claimed: number;
  notClaimed: number;
  total: number;
};

type ResultIdentity = Pick<Result, "id">;

export function defaultLootMetricClaimDraft(): LootMetricClaimDraft {
  return {
    claim: "notClaimed",
    evidenceText: "",
  };
}

export function reconcileLootMetricClaimDrafts(
  results: ResultIdentity[],
  current: LootMetricClaimDrafts,
): LootMetricClaimDrafts {
  const next: LootMetricClaimDrafts = {};
  for (const result of results) {
    next[result.id] = current[result.id] ?? defaultLootMetricClaimDraft();
  }
  return next;
}

export function buildLootMetricClaims(
  results: ResultIdentity[],
  drafts: LootMetricClaimDrafts,
): LootResultClaim[] {
  return results.map((result) => {
    const draft = drafts[result.id] ?? defaultLootMetricClaimDraft();
    return {
      resultId: result.id,
      claim: draft.claim,
      evidenceText:
        draft.claim === "notClaimed" ? "" : draft.evidenceText.trim(),
    };
  });
}

export function firstLootMetricClaimMissingEvidence(
  claims: LootResultClaim[],
): LootResultClaim | null {
  return (
    claims.find((claim) => claim.claim !== "notClaimed" && !claim.evidenceText) ??
    null
  );
}

export function summarizeLootMetricChecklist(
  results: ResultIdentity[],
  drafts: LootMetricClaimDrafts,
): LootMetricChecklistSummary {
  let completed = 0;
  let falsified = 0;

  for (const result of results) {
    const claim = drafts[result.id]?.claim ?? "notClaimed";
    if (claim === "completed") completed += 1;
    if (claim === "falsified") falsified += 1;
  }

  return {
    completed,
    falsified,
    claimed: completed + falsified,
    notClaimed: results.length - completed - falsified,
    total: results.length,
  };
}
