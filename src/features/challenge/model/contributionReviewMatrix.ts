import { calibratedResultPoints } from "../../../domain/orfSettlement";
import type { ContributionMemberTarget } from "../../../domain/orfObjectiveParticipants";
import type {
  ContributionAllocation,
  ContributionReviewDraftMetricRow,
  ContributionReviewMetricRow,
  ContributionReviewMetricScore,
  Result,
} from "../../../types/orf";

export const CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT = 100;

const objectiveFallbackRowId = "__objective__";

export type ContributionReviewMetric = Pick<
  Result,
  "detail" | "id" | "title" | "uncertaintyLevel" | "uncertaintyScore"
>;

export type ContributionReviewMatrixInputs = Record<string, Record<string, string>>;

export type ContributionReviewMatrixCell = {
  input: string;
  member: string;
  memberUserId: string | null;
  percent: number | null;
  targetKey: string;
};

export type ContributionReviewMatrixRow = {
  cells: ContributionReviewMatrixCell[];
  detail: string;
  id: string;
  isFallbackObjectiveRow: boolean;
  points: number;
  title: string;
  totalPercent: number;
  uncertaintyLevel: Result["uncertaintyLevel"] | null;
  valid: boolean;
  weightRatio: number;
};

export type ContributionReviewMatrixSummary = {
  allocations: ContributionAllocation[];
  hasMetricRows: boolean;
  metricScores: ContributionReviewMetricScore[];
  rows: ContributionReviewMatrixRow[];
  targetCells: ContributionReviewMatrixCell[];
  targetTotalPercent: number;
  valid: boolean;
};

export type ContributionReviewMatrixAllocationResult =
  | { allocations: ContributionAllocation[]; metricScores: ContributionReviewMetricScore[]; status: "ok" }
  | {
      error: string;
      status: "invalid";
    };
export type ContributionReviewMatrixMetricRowsResult =
  | { metricRows: ContributionReviewMetricRow[]; status: "ok" }
  | {
      error: string;
      status: "invalid";
    };

type ContributionReviewEditableRow = {
  detail: string;
  id: string;
  isFallbackObjectiveRow: boolean;
  points: number;
  title: string;
  uncertaintyLevel: Result["uncertaintyLevel"] | null;
  weightRatio: number;
};

export function contributionReviewTargetKey(target: ContributionMemberTarget) {
  return target.memberUserId?.trim() || target.member.trim();
}

export function normalizeContributionReviewMatrixInputs(input: {
  current: ContributionReviewMatrixInputs;
  objectiveTitle: string;
  results: ContributionReviewMetric[];
  targets: ContributionMemberTarget[];
}): ContributionReviewMatrixInputs {
  const next: ContributionReviewMatrixInputs = {};
  for (const row of contributionReviewEditableRows(input.results, input.objectiveTitle)) {
    next[row.id] = contributionReviewRowInputDefaults(input.targets, input.current[row.id]);
  }
  return next;
}

export function buildContributionReviewMatrix(input: {
  inputs: ContributionReviewMatrixInputs;
  objectiveTitle: string;
  results: ContributionReviewMetric[];
  targets: ContributionMemberTarget[];
}): ContributionReviewMatrixSummary {
  const rows = contributionReviewEditableRows(input.results, input.objectiveTitle).map((row) =>
    buildContributionReviewMatrixRow(row, input.targets, input.inputs[row.id] ?? {}),
  );
  const allocations = input.targets.map((target) => {
    const targetKey = contributionReviewTargetKey(target);
    const ratio = rows.reduce((sum, row) => {
      const cell = row.cells.find((item) => item.targetKey === targetKey);
      return sum + ((cell?.percent ?? 0) / CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT) * row.weightRatio;
    }, 0);
    return {
      member: target.member,
      memberUserId: target.memberUserId ?? null,
      ratio,
    };
  });

  const targetCells = input.targets.map((target, index) => {
    const allocation = allocations[index];
    return {
      input: formatContributionReviewPercent(
        allocation.ratio * CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
      ),
      member: allocation.member,
      memberUserId: allocation.memberUserId ?? null,
      percent: allocation.ratio * CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
      targetKey: contributionReviewTargetKey(target),
    };
  });

  return {
    allocations,
    hasMetricRows: input.results.length > 0,
    metricScores: rows.map((row) => ({
      allocations: row.cells.map((cell) => ({
        member: cell.member,
        memberUserId: cell.memberUserId,
        ratio: (cell.percent ?? 0) / CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
      })),
      isFallbackObjectiveRow: row.isFallbackObjectiveRow,
      metricDetail: row.detail,
      metricId: row.id,
      metricTitle: row.title,
      points: row.points,
      weightRatio: row.weightRatio,
    })),
    rows,
    targetCells,
    targetTotalPercent: targetCells.reduce((sum, cell) => sum + (cell.percent ?? 0), 0),
    valid: rows.length > 0 && rows.every((row) => row.valid),
  };
}

export function contributionReviewMatrixToAllocations(
  summary: ContributionReviewMatrixSummary,
): ContributionReviewMatrixAllocationResult {
  if (summary.rows.length === 0) {
    return { status: "invalid", error: "这个目标没有可评价的指标" };
  }
  if (!summary.valid) {
    return {
      status: "invalid",
      error: "每个指标的贡献百分比都必须在 0 到 100 之间，且合计为 100%",
    };
  }

  return { status: "ok", allocations: summary.allocations, metricScores: summary.metricScores };
}

export function contributionReviewMatrixToMetricRows(
  summary: ContributionReviewMatrixSummary,
): ContributionReviewMatrixMetricRowsResult {
  if (summary.rows.length === 0) {
    return { status: "invalid", error: "这个目标没有可评价的指标" };
  }
  if (!summary.valid) {
    return {
      status: "invalid",
      error: "每个指标行都必须填写 0 到 100 的整数，且合计为 100%",
    };
  }

  return {
    status: "ok",
    metricRows: summary.rows.map((row) => ({
      allocations: row.cells.map((cell) => ({
        member: cell.member,
        memberUserId: cell.memberUserId,
        percent: cell.percent ?? 0,
      })),
      isFallbackObjectiveRow: row.isFallbackObjectiveRow,
      metricDetail: row.detail,
      metricId: row.id,
      metricTitle: row.title,
      points: row.points,
    })),
  };
}

export function contributionReviewMatrixToDraftMetricRows(
  summary: ContributionReviewMatrixSummary,
): ContributionReviewDraftMetricRow[] {
  return summary.rows.map((row) => ({
    allocations: row.cells.map((cell) => ({
      input: cell.input,
      member: cell.member,
      memberUserId: cell.memberUserId,
    })),
    isFallbackObjectiveRow: row.isFallbackObjectiveRow,
    metricDetail: row.detail,
    metricId: row.id,
    metricTitle: row.title,
    points: row.points,
  }));
}

export function formatContributionReviewPercent(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function contributionReviewEditableRows(
  results: ContributionReviewMetric[],
  objectiveTitle: string,
): ContributionReviewEditableRow[] {
  if (results.length === 0) {
    return [
      {
        detail: "",
        id: objectiveFallbackRowId,
        isFallbackObjectiveRow: true,
        points: 1,
        title: objectiveTitle || "目标整体",
        uncertaintyLevel: null,
        weightRatio: 1,
      },
    ];
  }

  const pointsByResultId = new Map(results.map((result) => [result.id, calibratedResultPoints(result)]));
  const totalPoints = [...pointsByResultId.values()].reduce((sum, points) => sum + points, 0);
  const equalWeight = totalPoints <= 0 ? 1 / results.length : null;
  return results.map((result) => {
    const points = pointsByResultId.get(result.id) ?? 0;
    return {
      detail: result.detail,
      id: result.id,
      isFallbackObjectiveRow: false,
      points,
      title: result.title,
      uncertaintyLevel: result.uncertaintyLevel ?? null,
      weightRatio: equalWeight ?? points / totalPoints,
    };
  });
}

function buildContributionReviewMatrixRow(
  row: ContributionReviewEditableRow,
  targets: ContributionMemberTarget[],
  inputs: Record<string, string>,
): ContributionReviewMatrixRow {
  const cells = targets.map((target) => {
    const targetKey = contributionReviewTargetKey(target);
    const input = inputs[targetKey] ?? "0";
    const percent = parseContributionReviewPercent(input);
    return {
      input,
      member: target.member,
      memberUserId: target.memberUserId ?? null,
      percent,
      targetKey,
    };
  });
  const totalPercent = cells.reduce((sum, cell) => sum + (cell.percent ?? 0), 0);
  return {
    ...row,
    cells,
    totalPercent,
    valid:
      cells.length > 0 &&
      cells.every((cell) => cell.percent !== null) &&
      totalPercent === CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
  };
}

function contributionReviewRowInputDefaults(
  targets: ContributionMemberTarget[],
  current: Record<string, string> | undefined,
) {
  const next: Record<string, string> = {};
  if (targets.length === 0) return next;

  targets.forEach((target) => {
    const targetKey = contributionReviewTargetKey(target);
    if (current?.[targetKey] !== undefined) {
      next[targetKey] = current[targetKey]!;
      return;
    }
    next[targetKey] = "0";
  });
  return next;
}

function parseContributionReviewPercent(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^(0|[1-9]\d*)$/.test(normalized)) return null;

  const percent = Number(normalized);
  if (
    !Number.isFinite(percent) ||
    !Number.isInteger(percent) ||
    percent < 0 ||
    percent > CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT
  ) {
    return null;
  }
  return percent;
}
