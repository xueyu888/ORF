import type {
  RecruitMemberDbSnapshot,
  RecruitMemberTarget,
  TestContext,
} from "../../recruit-member/_support/recruit-member.context";

export type { RecruitMemberDbSnapshot, RecruitMemberTarget, TestContext };

export type RecruitMemberForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  candidateEmail: string;
  candidatePassword: string;
  candidateName: string;
  candidateRole: "member";
  objectiveId: string;
  objectiveTitle: string;
};

export type RecruitmentAttemptResult = {
  status: number;
  body: unknown;
};
