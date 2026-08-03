import { canApplyForObjectiveChallenge } from "../../../domain/orfLifecycle";
import { isObjectiveAssignedChallenger, isObjectiveChallenger } from "../../../domain/orfObjectiveParticipants";
import { resultDetailText } from "../../../domain/orfResultDetails";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../types/orf";
import type { BountyItem, HallTab, SortKey } from "./bountyHallTypes";

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
  return leftDeadline.localeCompare(rightDeadline) || right.objectiveBasePoints - left.objectiveBasePoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
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
    isObjectiveAssignedChallenger(item.objective, currentUserId) ||
    isObjectiveChallenger(item.objective, currentUserId)
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

export function resultCountLabel(item: BountyItem) {
  return item.results.length > 0 ? `${item.results.length} 个指标` : "待定义指标";
}

export function bountyPointsLabel(item: BountyItem) {
  return item.objectiveBasePoints > 0 ? `${item.objectiveBasePoints} 分` : "待定分";
}

export function bountyTargetElement(objectiveId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-bounty-objective-id]")).find((element) => element.dataset.bountyObjectiveId === objectiveId) ??
    null
  );
}

function compareBounties(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (sortKey === "points") return right.objectiveBasePoints - left.objectiveBasePoints || compareByUrgency(left, right);
  if (sortKey === "published") return publishedSortValue(right).localeCompare(publishedSortValue(left)) || bountySortTitle(left).localeCompare(bountySortTitle(right));
  return compareByUrgency(left, right);
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
