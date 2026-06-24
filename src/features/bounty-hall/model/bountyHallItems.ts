import { canApplyForObjectiveChallenge } from "../../../domain/orfLifecycle";
import { resultDetailText } from "../../../domain/orfResultDetails";
import { hasUncalibratedResultPoints } from "../../../domain/orfSettlement";
import type { ChallengeApplication, ObjectiveFlowStatus, UncertaintyLevel } from "../../../types/orf";
import type { BountyItem, DifficultyFilter, HallTab, SortKey } from "./bountyHallTypes";

export const difficultyOptions: DifficultyFilter[] = ["all", "简易", "入门", "进阶", "破局", "渡劫", "飞升"];
export const hallTabs: Array<{ key: HallTab; label: string }> = [
  { key: "all", label: "全部" },
  { key: "open", label: "开放中" },
  { key: "frozen", label: "已冻结" },
  { key: "submitted", label: "待验收" },
  { key: "revisionRequired", label: "待返工" },
  { key: "accepted", label: "待结算" },
  { key: "settled", label: "已结算" },
  { key: "related", label: "我的相关" },
];
export const defaultHallTab = "all" satisfies HallTab;

const lifecycleTabByFlowStatus: Partial<Record<ObjectiveFlowStatus, HallTab>> = {
  open: "open",
  applying: "open",
  recruiting: "open",
  reestimating: "open",
  frozen: "frozen",
  submitted: "submitted",
  revisionRequired: "revisionRequired",
  accepted: "accepted",
  settled: "settled",
};

const difficultyLabelsByRank: Record<number, UncertaintyLevel> = {
  1: "简易",
  2: "入门",
  3: "进阶",
  4: "破局",
  5: "渡劫",
  6: "飞升",
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

export function buildHallItemBuckets(items: BountyItem[], currentUserId: string): Record<HallTab, BountyItem[]> {
  const buckets: Record<HallTab, BountyItem[]> = {
    all: [],
    open: [],
    frozen: [],
    submitted: [],
    revisionRequired: [],
    accepted: [],
    settled: [],
    related: [],
  };

  for (const item of items) {
    buckets.all.push(item);
    const lifecycleTab = bountyHallLifecycleTab(item);
    if (lifecycleTab) buckets[lifecycleTab].push(item);
    if (isCurrentUserRelatedBounty(item, currentUserId)) buckets.related.push(item);
  }

  return buckets;
}

export function bountyHallLifecycleTab(item: BountyItem): HallTab | null {
  return lifecycleTabByFlowStatus[item.objective.flowStatus] ?? null;
}

export function preferredHallTabForBountyItem(item: BountyItem, currentUserId: string): HallTab {
  if (isCurrentUserRelatedBounty(item, currentUserId)) return "related";
  return bountyHallLifecycleTab(item) ?? defaultHallTab;
}

export function isCurrentUserRelatedBounty(item: BountyItem, currentUserId: string) {
  if (!currentUserId) return false;
  return (
    currentUserApplication(item, currentUserId, { includeDeclined: true }) !== null ||
    (item.objective.assignedChallengerUserIds ?? []).includes(currentUserId) ||
    (item.objective.challengerUserIds ?? []).includes(currentUserId)
  );
}

export function currentUserApplication(
  item: BountyItem,
  currentUserId: string,
  options: { includeDeclined?: boolean } = {},
) {
  if (!currentUserId) return null;

  const applications = item.applications.filter((application) => {
    if (application.applicantUserId !== currentUserId) return false;
    return options.includeDeclined || application.status !== "declined";
  });

  return [...applications].sort(compareChallengeApplicationsByRecency)[0] ?? null;
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
    ...item.assignedChallengers,
    ...item.challengers,
    ...item.applications.flatMap((application) => [application.applicant, application.reason]),
    ...item.results.flatMap((result) => [result.title, resultDetailText(result)]),
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

function compareChallengeApplicationsByRecency(left: ChallengeApplication, right: ChallengeApplication) {
  return challengeApplicationTime(right).localeCompare(challengeApplicationTime(left)) || right.id.localeCompare(left.id);
}

function challengeApplicationTime(application: ChallengeApplication) {
  return application.createdAt || "";
}
