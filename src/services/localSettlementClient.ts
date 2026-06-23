import { localSettlementProxyBasePath } from "../domain/orfLocalSettlement";
import type {
  ContributionAllocation,
  ContributionReviewDraftMetricRow,
  ContributionReviewMetricRow,
  ContributionReviewMetricScore,
} from "../types/orf";

export type LocalSettlementSummary = {
  abstainedReviewers: string[];
  averages: Array<{
    averageRatio: number | null;
    basis: "peer" | "selfOnly" | "none";
    basisPoints?: number;
    member: string;
    memberUserId: string;
    normalizedRatio: number;
    ratingCount: number;
    relativeDeviation: number;
    relativeDeviationWarning: boolean;
  }>;
  contributionResolution: { ratios: ContributionAllocation[]; reason: string } | null;
  equalShareRatio: number;
  missingReviewers: string[];
  objectiveId: string;
  ratios: ContributionAllocation[];
  reviewers: string[];
  status: "ready" | "missing" | "conflict";
  submissions: Array<
    | {
        allocations: Array<ContributionAllocation & {
          deviationFromAverage: number | null;
          deviationWarning: boolean;
        }>;
        metricRows?: ContributionReviewMetricRow[];
        metricScores?: ContributionReviewMetricScore[];
        receivedAt?: string;
        reviewer: string;
        reviewerUserId: string;
        status: "scored";
        submittedAt: string;
      }
    | {
        abstentionReason: string;
        receivedAt?: string;
        reviewer: string;
        reviewerUserId: string;
        status: "abstained";
        submittedAt: string;
      }
  >;
};

export type LocalSettlementReview =
  | {
      allocations: ContributionAllocation[];
      metricRows?: ContributionReviewMetricRow[];
      metricScores?: ContributionReviewMetricScore[];
      receivedAt?: string;
      reviewer: string;
      reviewerUserId: string;
      status: "scored";
      submittedAt: string;
    }
  | {
      abstentionReason: string;
      receivedAt?: string;
      reviewer: string;
      reviewerUserId: string;
      status: "abstained";
      submittedAt: string;
    };

export type LocalSettlementDraft =
  | {
      metricRows: ContributionReviewDraftMetricRow[];
      reviewer: string;
      reviewerUserId: string;
      status: "scored";
      updatedAt: string;
    }
  | {
      abstentionReason: string;
      reviewer: string;
      reviewerUserId: string;
      status: "abstained";
      updatedAt: string;
    };

const localSettlementRequestTimeoutMs = 3000;

export class LocalSettlementUnavailableError extends Error {
  readonly baseUrl: string;

  constructor(baseUrl: string, cause?: unknown) {
    super(`Local settlement service is not reachable at ${baseUrl}`, { cause });
    this.name = "LocalSettlementUnavailableError";
    this.baseUrl = baseUrl;
  }
}

export class LocalSettlementResponseError extends Error {
  readonly baseUrl: string;
  readonly status: number;

  constructor(baseUrl: string, status: number, message: string) {
    super(message || `Local settlement service returned ${status}`);
    this.name = "LocalSettlementResponseError";
    this.baseUrl = baseUrl;
    this.status = status;
  }
}

export function localSettlementBaseUrl() {
  return localSettlementProxyBasePath;
}

export async function assertLocalSettlementAvailable() {
  await requestLocalSettlement("/health");
}

export async function fetchLocalSettlementSummary(input: { objectiveId: string; participantUserIds?: string[] }) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/summary`, {
    body: JSON.stringify({ participantUserIds: input.participantUserIds }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return response.json() as Promise<LocalSettlementSummary>;
}

export async function fetchMyLocalSettlementReview(input: { objectiveId: string }) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/reviews/me`);
  return response.json() as Promise<{ draft: LocalSettlementDraft | null; objectiveId: string; review: LocalSettlementReview | null }>;
}

export async function saveLocalSettlementReviewDraft(input: {
  abstentionReason?: string;
  kind: "score" | "abstain";
  metricRows?: ContributionReviewDraftMetricRow[];
  objectiveId: string;
}) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/reviews/draft`, {
    body: JSON.stringify(input.kind === "abstain"
      ? { abstentionReason: input.abstentionReason ?? "", kind: "abstain" }
      : { kind: "score", metricRows: input.metricRows ?? [] }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  return response.json() as Promise<{ draft: LocalSettlementDraft | null; objectiveId: string }>;
}

export async function clearLocalSettlementReviewDraft(input: { objectiveId: string }) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/reviews/draft`, {
    method: "DELETE",
  });
  return response.json() as Promise<{ objectiveId: string; ok: true }>;
}

export async function submitLocalContributionReview(input: {
  abstentionReason?: string;
  kind: "score" | "abstain";
  metricRows?: ContributionReviewMetricRow[];
  objectiveId: string;
}) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/reviews/submit`, {
    body: JSON.stringify(input.kind === "abstain"
      ? { abstentionReason: input.abstentionReason ?? "", kind: "abstain" }
      : { kind: "score", metricRows: input.metricRows ?? [] }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return response.json() as Promise<{ ok: true; payloadHash: string; receivedAt: string; review: LocalSettlementReview }>;
}

async function requestLocalSettlement(path: string, init?: RequestInit) {
  const baseUrl = localSettlementBaseUrl();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), localSettlementRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    throw new LocalSettlementUnavailableError(baseUrl, error);
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new LocalSettlementResponseError(baseUrl, response.status, await readLocalSettlementErrorMessage(response));
  }
  return response;
}

async function readLocalSettlementErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return response.statusText;
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : text;
  } catch {
    return text;
  }
}
