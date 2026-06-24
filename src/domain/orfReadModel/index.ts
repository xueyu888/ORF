import type {
  BountySource,
  ChallengeApplication,
  Objective,
  OrfState,
  OrfUser,
  PermissionRule,
  Result,
} from "../../types/orf";
import type { PermissionKey } from "../../config/permissions";

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
  | "projects"
  | "userProfiles"
> & {
  pendingChallengeApplications: PendingChallengeApplication[];
};

export type PendingChallengeApplication = {
  application: ChallengeApplication;
  objective: Objective;
  results: Result[];
};

export type CurrentUserAccessData = {
  user: OrfUser;
  permissionRules: PermissionRule[];
  permissions: PermissionKey[];
  capabilities: Record<PermissionKey, boolean>;
};

export type BountyHallItem = {
  applications: ChallengeApplication[];
  approvedApplicants: string[];
  assignedChallengers: string[];
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
