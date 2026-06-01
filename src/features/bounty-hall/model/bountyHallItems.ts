import { canApplyForObjectiveChallenge } from "../../../domain/orfLifecycle";
import { hasUncalibratedResultPoints } from "../../../domain/orfSettlement";
import type { UncertaintyLevel } from "../../../types/orf";
import type { BountyItem, DifficultyFilter, HallTab, SortKey } from "./bountyHallTypes";

export const difficultyOptions: DifficultyFilter[] = ["all", "入门", "进阶", "破局", "渡劫", "飞升"];
export const hallTabs: Array<{ key: HallTab; label: string }> = [
  { key: "recruiting", label: "招募中" },
  { key: "started", label: "已开始" },
  { key: "all", label: "全部" },
];

const difficultyLabelsByRank: Record<number, UncertaintyLevel> = {
  1: "入门",
  2: "进阶",
  3: "破局",
  4: "渡劫",
  5: "飞升",
};

export function buildHallItems(input: {
  availableBounties: BountyItem[];
  publicBounties: BountyItem[];
  recruitmentItems: BountyItem[];
}) {
  if (input.publicBounties.length > 0) return input.publicBounties;

  const seen = new Set<string>();
  return [...input.recruitmentItems, ...input.availableBounties].filter((item) => {
    if (seen.has(item.objective.id)) return false;
    seen.add(item.objective.id);
    return item.isRecruitment || canApplyForObjectiveChallenge(item.objective);
  });
}

export function compareHallItems(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (left.isRecruitment !== right.isRecruitment) return left.isRecruitment ? -1 : 1;
  return compareBounties(left, right, sortKey);
}

export function compareByUrgency(left: BountyItem, right: BountyItem) {
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
}

export function isStartedBounty(item: BountyItem) {
  return item.objective.flowStatus === "reestimating" || item.challengers.length > 0;
}

export function publishedDateLabel(item: BountyItem) {
  return item.objective.publishedAt || "未记录";
}

export function searchableBountyText(item: BountyItem) {
  return [
    item.objective.title,
    item.objective.description,
    item.objective.successDefinition,
    item.definer,
    ...item.challengers,
    ...item.applications.flatMap((application) => [application.applicant, application.reason]),
    ...item.results.flatMap((result) => [result.title, result.description, result.metricRequirement]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function highestDifficultyLabel(item: BountyItem) {
  return difficultyLabelsByRank[item.difficultyRank] ?? difficultyLabel(item.result);
}

export function resultCountLabel(item: BountyItem) {
  return item.results.length > 0 ? `${item.results.length} 个指标` : "待定义指标";
}

export function bountyPointsLabel(item: BountyItem) {
  return hasUncalibratedResultPoints(item.results) ? "待校准" : `${item.uncertaintyPoints} 分`;
}

export function bountyTargetElement(objectiveId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-bounty-objective-id]")).find((element) => element.dataset.bountyObjectiveId === objectiveId) ??
    null
  );
}

function compareBounties(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (sortKey === "points") return right.uncertaintyPoints - left.uncertaintyPoints || compareByUrgency(left, right);
  if (sortKey === "difficulty") return right.difficultyRank - left.difficultyRank || compareByUrgency(left, right);
  if (sortKey === "published") return publishedSortValue(right).localeCompare(publishedSortValue(left)) || bountySortTitle(left).localeCompare(bountySortTitle(right));
  return compareByUrgency(left, right);
}

function difficultyLabel(result: BountyItem["result"]) {
  return result?.uncertaintyLevel ?? "待校准";
}

function publishedSortValue(item: BountyItem) {
  return item.objective.publishedAt || "0000-00-00";
}

function bountySortTitle(item: BountyItem) {
  return item.result?.title ?? item.objective.title;
}
