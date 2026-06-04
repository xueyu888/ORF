import type {
  BountySource,
  ChallengeApplication,
  Objective,
  OrfState,
  Result,
} from "../../types/orf";

export type TaskManagementData = Pick<
  OrfState,
  | "objectives"
  | "results"
  | "tasks"
  | "evidence"
  | "feedback"
  | "comments"
  | "objectiveLoot"
  | "objectiveTrialReviews"
  | "objectiveAlignmentRequests"
  | "pointLedger"
  | "permissionRules"
>;

export type BountyHallItem = {
  applications: ChallengeApplication[];
  approvedApplicants: string[];
  challengers: string[];
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isCurrentChallenger: boolean;
  isRecruitment: boolean;
  objective: Objective;
  pendingApplications: ChallengeApplication[];
  result: Result | null;
  results: Result[];
  source: BountySource;
};

export type BountyHallData = {
  publicItems: BountyHallItem[];
  recruitmentItems: BountyHallItem[];
  availableItems: BountyHallItem[];
  objectiveOptions: Objective[];
  contribution: { points: number };
};

export type MyChallengesScope = "mine" | "all";
