import type { ContributionMemberTarget } from "../../../domain/orfObjectiveParticipants";
import type {
  ContributionAllocation,
  ContributionReviewDraftPercentAllocation,
  ContributionReviewPercentAllocation,
  Result,
} from "../../../types/orf";

export const CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT = 100;

const objectiveRowId = "__objective__";

export type ContributionReviewMetric = Pick<Result, "detail" | "id" | "title">;

export type ContributionReviewMatrixInputs = Record<string, Record<string, string>>;

export type ContributionReviewMatrixCell = {
  input: string;
  member: string;
  memberUserId: string;
  percent: number | null;
  targetKey: string;
};

export type ContributionReviewMatrixRow = {
  cells: ContributionReviewMatrixCell[];
  detail: string;
  id: string;
  title: string;
  totalPercent: number;
  valid: boolean;
};

export type ContributionReviewMatrixSummary = {
  allocations: ContributionAllocation[];
  rows: ContributionReviewMatrixRow[];
  targetCells: ContributionReviewMatrixCell[];
  targetTotalPercent: number;
  valid: boolean;
};

export type ContributionReviewMatrixPercentAllocationsResult =
  | { allocations: ContributionReviewPercentAllocation[]; status: "ok" }
  | { error: string; status: "invalid" };

export function contributionReviewTargetKey(target: ContributionMemberTarget) {
  return target.memberUserId.trim();
}

export function normalizeContributionReviewMatrixInputs(input: {
  current: ContributionReviewMatrixInputs;
  objectiveTitle: string;
  results: ContributionReviewMetric[];
  targets: ContributionMemberTarget[];
}): ContributionReviewMatrixInputs {
  return {
    [objectiveRowId]: contributionReviewRowInputDefaults(input.targets, input.current[objectiveRowId]),
  };
}

export function buildContributionReviewMatrix(input: {
  inputs: ContributionReviewMatrixInputs;
  objectiveTitle: string;
  results: ContributionReviewMetric[];
  targets: ContributionMemberTarget[];
}): ContributionReviewMatrixSummary {
  const row = buildContributionReviewMatrixRow(
    {
      detail: "",
      id: objectiveRowId,
      title: input.objectiveTitle || "目标整体",
    },
    input.targets,
    input.inputs[objectiveRowId] ?? {},
  );
  const allocations = row.cells.map((cell) => ({
    member: cell.member,
    memberUserId: cell.memberUserId,
    ratio: (cell.percent ?? 0) / CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
  }));
  const targetCells = allocations.map((allocation) => ({
    input: formatContributionReviewPercent(allocation.ratio * CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT),
    member: allocation.member,
    memberUserId: allocation.memberUserId,
    percent: allocation.ratio * CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
    targetKey: contributionReviewTargetKey(allocation),
  }));

  return {
    allocations,
    rows: [row],
    targetCells,
    targetTotalPercent: targetCells.reduce((sum, cell) => sum + (cell.percent ?? 0), 0),
    valid: row.valid,
  };
}

export function contributionReviewMatrixToPercentAllocations(
  summary: ContributionReviewMatrixSummary,
): ContributionReviewMatrixPercentAllocationsResult {
  const row = summary.rows[0];
  if (!row) {
    return { status: "invalid", error: "这个目标没有可评价的贡献对象" };
  }
  if (!summary.valid) {
    return {
      status: "invalid",
      error: "目标贡献百分比必须在 0 到 100 之间，且合计为 100%",
    };
  }

  return {
    status: "ok",
    allocations: row.cells.map((cell) => ({
      member: cell.member,
      memberUserId: cell.memberUserId,
      percent: cell.percent ?? 0,
    })),
  };
}

export function contributionReviewMatrixToDraftAllocations(
  summary: ContributionReviewMatrixSummary,
): ContributionReviewDraftPercentAllocation[] {
  const row = summary.rows[0];
  if (!row) return [];
  return row.cells.map((cell) => ({
    input: cell.input,
    member: cell.member,
    memberUserId: cell.memberUserId,
  }));
}

export function contributionReviewMatrixInputsFromAllocations(
  allocations: ContributionAllocation[],
  targets: ContributionMemberTarget[],
): ContributionReviewMatrixInputs {
  const rowInputs: Record<string, string> = {};
  for (const allocation of allocations) {
    const target = targets.find((item) => contributionReviewTargetKey(item) === contributionReviewTargetKey(allocation));
    if (!target) continue;
    rowInputs[contributionReviewTargetKey(target)] = formatContributionReviewPercent(
      allocation.ratio * CONTRIBUTION_REVIEW_MATRIX_TOTAL_PERCENT,
    );
  }
  return { [objectiveRowId]: rowInputs };
}

export function contributionReviewMatrixInputsFromDraftAllocations(
  allocations: ContributionReviewDraftPercentAllocation[],
  targets: ContributionMemberTarget[],
): ContributionReviewMatrixInputs {
  const rowInputs: Record<string, string> = {};
  for (const allocation of allocations) {
    const target = targets.find((item) => contributionReviewTargetKey(item) === contributionReviewTargetKey(allocation));
    if (!target) continue;
    rowInputs[contributionReviewTargetKey(target)] = allocation.input;
  }
  return { [objectiveRowId]: rowInputs };
}

export function formatContributionReviewPercent(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function buildContributionReviewMatrixRow(
  row: Pick<ContributionReviewMatrixRow, "detail" | "id" | "title">,
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
      memberUserId: target.memberUserId,
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
    next[targetKey] = current?.[targetKey] ?? "0";
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
