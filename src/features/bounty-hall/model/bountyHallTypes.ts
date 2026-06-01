import type { BountyHallItem } from "../../../state/apiClient";
import type { UncertaintyLevel } from "../../../types/orf";

export type DifficultyFilter = "all" | UncertaintyLevel;
export type SortKey = "deadline" | "points" | "difficulty" | "published";
export type HallTab = "recruiting" | "started" | "all";

export type BountyItem = BountyHallItem;

export type ChallengeAction = "apply" | "accept";
export type ChallengeConfirmTarget = {
  action: ChallengeAction;
  blocked: boolean;
  item: BountyItem;
};
