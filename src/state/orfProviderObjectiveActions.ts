import { useMemo } from "react";
import { hasPermission } from "../config/permissions";
import { isObjectiveChallenger, objectiveChallengerCount, objectiveChallengerTargets } from "../domain/orfObjectiveParticipants";
import { canAcceptObjectiveChallengeEntryForActor, canApplyToObjectiveChallengeEntry } from "../domain/orfChallengeEntry";
import { fetchLocalSettlementSummary, submitLocalEncryptedContributionReview } from "../services/localSettlementClient";
import { apiJson, apiRequest } from "./apiClient";
import {
  bountyMutationFailureMessage,
  businessMutationFailureMessage,
  commentMutationFailureMessage,
  localSettlementMutationFailureMessage,
} from "./orfProviderMutationMessages";
import type {
  ContributionAllocation,
  LootResultClaim,
  ObjectiveAcceptedResult,
  Objective,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  ObjectiveTrialReviewStatus,
  OrfProject,
  OrfState,
  OrfUser,
  ResultAcceptedResult,
} from "../types/orf";

export type CreateObjectiveInput = Pick<Objective, "title" | "whyItMatters" | "cycle" | "boundary"> &
  Partial<Pick<Objective, "finalDueAt" | "projectId">>;
export type CreateProjectInput = Pick<OrfProject, "name">;
export type SubmitLootInput = {
  objectiveId: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
  author?: string;
};
export type ReviewObjectiveLootInput = {
  acceptedResult?: ObjectiveAcceptedResult;
  lootId?: string;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
  reason?: string;
  settlementParticipantUserIds?: string[];
};
export type ReviewObjectiveTrialReviewInput = {
  status: Exclude<ObjectiveTrialReviewStatus, "requested">;
  commanderFeedback: string;
};
export type SubmitContributionReviewInput =
  | { allocations: ContributionAllocation[]; kind: "score" }
  | { abstentionReason: string; kind: "abstain" };
export type RequestObjectiveAlignmentInput = {
  kind: ObjectiveAlignmentRequestKind;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  note?: string | null;
};
export type ReviewObjectiveAlignmentInput = {
  status: Extract<ObjectiveAlignmentRequestStatus, "scheduled" | "completed" | "needsWork" | "cancelled">;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  commanderFeedback?: string | null;
};

type CreateObjectiveResponse = { objective: Objective };
type CreateProjectResponse = { project: OrfProject };

interface ObjectiveActionOptions {
  currentUser: OrfUser | null;
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
  refreshTaskManagementDataAfterCreate: (failureMessage: string) => void;
  state: OrfState;
}

function withObjectiveChallengerUserIds(
  ratios: ContributionAllocation[],
  objective: Pick<OrfState["objectives"][number], "challengers" | "challengerUserIds">,
) {
  const userIdByMember = new Map(
    objectiveChallengerTargets(objective).map((target) => [target.member, target.memberUserId ?? null]),
  );
  return ratios.map((ratio) => ({
    ...ratio,
    memberUserId: ratio.memberUserId ?? userIdByMember.get(ratio.member) ?? null,
  }));
}

export function useOrfProviderObjectiveActions({
  currentUser,
  notify,
  refreshTaskManagementData,
  refreshTaskManagementDataAfterCreate,
  state,
}: ObjectiveActionOptions) {
  return useMemo(
    () => ({
      createProject: async (input: CreateProjectInput) => {
        if (currentUser?.role !== "admin") {
          notify("只有指挥官可以创建项目");
          return null;
        }

        try {
          const data = await apiJson<CreateProjectResponse>("/api/projects", {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("项目已创建");
          await refreshTaskManagementData();
          return data.project;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "项目创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      deleteProject: async (projectId: string) => {
        if (currentUser?.role !== "admin") {
          notify("只有指挥官可以删除项目");
          return false;
        }

        try {
          await apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
          await refreshTaskManagementData();
          notify("项目已删除，目标已移到未归属");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "项目删除失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createObjective: async (input: CreateObjectiveInput) => {
        if (!hasPermission(currentUser, state.permissionRules, "objective.create")) {
          notify("没有新建目标权限");
          return null;
        }

        try {
          const data = await apiJson<CreateObjectiveResponse>("/api/objectives", {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("目标已创建");
          refreshTaskManagementDataAfterCreate("目标已创建，但数据刷新失败");
          return data.objective;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      setObjectiveProject: async (objectiveId: string, projectId: string | null) => {
        if (currentUser?.role !== "admin") {
          notify("只有指挥官可以调整目标项目");
          return false;
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/project`, {
            method: "PATCH",
            body: JSON.stringify({ projectId }),
          });
          await refreshTaskManagementData();
          notify(projectId ? "目标已放入项目" : "目标已移出项目");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标项目调整失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      publishObjective: async (objectiveId: string) => {
        if (!hasPermission(currentUser, state.permissionRules, "objective.create")) {
          notify("没有新建目标权限");
          return false;
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/publish`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("目标已发布到悬赏大厅");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标发布失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      recruitObjectiveChallengers: async (objectiveId: string, members: string[]) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/recruitments`, {
            method: "POST",
            body: JSON.stringify({ members }),
          });
          await refreshTaskManagementData();
          notify("挑战者已征召");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "征召失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      approveChallengeApplication: async (objectiveId: string, applicationId: string) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(applicationId)}/approve`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("挑战申请已确认，目标进入重估");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "确认挑战申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      rejectChallengeApplication: async (objectiveId: string, applicationId: string) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(applicationId)}/reject`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("挑战申请已拒绝");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "拒绝挑战申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      applyForBounty: async (objectiveId: string, reason: string) => {
        if (currentUser?.role !== "member") {
          notify("只有普通成员可以申请挑战");
          return false;
        }
        const applicationReason = reason.trim();
        if (!applicationReason) {
          notify("请先填写申请理由");
          return false;
        }
        const objective = state.objectives.find((item) => item.id === objectiveId);
        if (objective && !canApplyToObjectiveChallengeEntry(objective, currentUser.id)) {
          notify("这个目标暂时不能申请挑战");
          return false;
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications`, {
            method: "POST",
            body: JSON.stringify({ reason: applicationReason }),
          });
          notify("挑战申请已提交，等待指挥官确认");
          return true;
        } catch (error) {
          notify(bountyMutationFailureMessage(error, "申请挑战失败"));
          return false;
        }
      },
      acceptBountyChallenge: async (objectiveId: string) => {
        if (currentUser?.role !== "member") {
          notify("只有普通成员可以接受挑战");
          return false;
        }
        const objective = state.objectives.find((item) => item.id === objectiveId);
        if (objective && !canAcceptObjectiveChallengeEntryForActor(objective, currentUser.id)) {
          notify("这个目标暂时不能接受挑战");
          return false;
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge`, { method: "PATCH" });
          notify("已接受挑战");
          return true;
        } catch (error) {
          notify(bountyMutationFailureMessage(error, "接受挑战失败"));
          return false;
        }
      },
      freezeObjective: async (objectiveId: string) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/freeze`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("目标已冻结");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "冻结目标失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveLoot: async (objectiveId: string, input: ReviewObjectiveLootInput) => {
        try {
          const { settlementParticipantUserIds, ...reviewInput } = input;
          const objective = state.objectives.find((item) => item.id === objectiveId);
          const participantCount = settlementParticipantUserIds?.length ?? (objective ? objectiveChallengerCount(objective) : 0);
          const localSummary = objective && participantCount > 1 && !reviewInput.contributionResolution
            ? await fetchLocalSettlementSummary({ objectiveId, participantUserIds: settlementParticipantUserIds })
            : null;
          const settlementInput =
            objective && localSummary?.status === "ready" && localSummary.contributionResolution
              ? {
                  ...reviewInput,
                  contributionResolution: {
                    ...localSummary.contributionResolution,
                    ratios: withObjectiveChallengerUserIds(localSummary.contributionResolution.ratios, objective),
                  },
                }
              : reviewInput;
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/review`, {
            method: "POST",
            body: JSON.stringify(settlementInput),
          });
          await refreshTaskManagementData();
          notify("战利品已验收结算");
          return true;
        } catch (error) {
          notify(localSettlementMutationFailureMessage(error, "战利品验收失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      submitContributionReview: async (objectiveId: string, input: SubmitContributionReviewInput) => {
        try {
          const objective = state.objectives.find((item) => item.id === objectiveId);
          if (!objective || !currentUser) {
            notify("匿名互评提交失败：目标或当前用户不可用");
            return false;
          }
          await submitLocalEncryptedContributionReview(input.kind === "abstain"
            ? {
                abstentionReason: input.abstentionReason,
                challengers: objective.challengers,
                kind: "abstain",
                objectiveId,
                objectiveTitle: objective.title,
                reviewer: currentUser.name,
              }
            : {
                allocations: input.allocations,
                challengers: objective.challengers,
                kind: "score",
                objectiveId,
                objectiveTitle: objective.title,
                reviewer: currentUser.name,
              });
          notify("匿名互评已通过 ORF 提交到共享结算服务");
          return true;
        } catch (error) {
          notify(localSettlementMutationFailureMessage(error, "匿名互评提交失败"));
          return false;
        }
      },
      updateObjectiveTitle: async (objectiveId: string, title: string) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("目标已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateObjectiveFinalDueAt: async (objectiveId: string, finalDueAt: string) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
            method: "PATCH",
            body: JSON.stringify({ finalDueAt }),
          });
          await refreshTaskManagementData();
          notify("截止日期已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "截止日期更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      deleteObjective: (objectiveId: string) => {
        void apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("目标已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "目标删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      submitLoot: async (input: SubmitLootInput) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(input.objectiveId)}/loot`, {
            method: "POST",
            body: JSON.stringify({
              body: input.body,
              resultClaims: input.resultClaims,
              selfTestReportUrl: input.selfTestReportUrl,
              selfTestReportBody: input.selfTestReportBody,
            }),
          });
          await refreshTaskManagementData();
          notify("战利品已提交，请申请验收对齐并定好会议室");
          return true;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "战利品提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      submitObjectiveTrialReview: async (input: SubmitLootInput) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(input.objectiveId)}/trial-reviews`, {
            method: "POST",
            body: JSON.stringify({
              body: input.body,
              resultClaims: input.resultClaims,
              selfTestReportUrl: input.selfTestReportUrl,
              selfTestReportBody: input.selfTestReportBody,
            }),
          });
          await refreshTaskManagementData();
          notify("试验收已提交");
          return true;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "试验收提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveTrialReview: async (objectiveId: string, trialReviewId: string, input: ReviewObjectiveTrialReviewInput) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/trial-reviews/${encodeURIComponent(trialReviewId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("试验收反馈已提交");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "试验收反馈提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      requestObjectiveAlignment: async (objectiveId: string, input: RequestObjectiveAlignmentInput) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/alignment-requests`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify(input.kind === "reestimateCompletion" ? "已申请重估对齐，请约时间并定好会议室" : "已申请验收对齐，请约时间并定好会议室");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "对齐申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveAlignment: async (objectiveId: string, requestId: string, input: ReviewObjectiveAlignmentInput) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/alignment-requests/${encodeURIComponent(requestId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify(input.status === "completed" ? "对齐已完成" : "对齐反馈已提交");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "对齐处理失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
    }),
    [currentUser, notify, refreshTaskManagementData, refreshTaskManagementDataAfterCreate, state],
  );
}
