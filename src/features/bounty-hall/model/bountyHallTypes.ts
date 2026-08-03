import type { BountyHallItem } from "../../../state/apiClient";

export type SortKey = "deadline" | "points" | "published";
export type HallTab = "all" | "open" | "frozen" | "submitted" | "revisionRequired" | "accepted" | "settled" | "related";

export type BountyItem = BountyHallItem;

export type ChallengeAction = "apply" | "accept";
export type ChallengeConfirmTarget = {
  action: ChallengeAction;
  blocked: boolean;
  item: BountyItem;
};
