import { useMemo } from "react";
import { hasPermission } from "../config/permissions";
import { isObjectiveReestimateWindowOpen } from "../domain/orfLifecycle";
import { isObjectiveChallenger } from "../domain/orfObjectiveParticipants";
import type { ResultDetailsInput } from "../domain/orfResultDetails";
import { apiJson, apiRequest } from "./apiClient";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import type { OrfState, OrfUser, Result, UncertaintyLevel } from "../types/orf";

type CreateResultResponse = { result: Result };
type Placement = "before" | "after";
export type MoveResultInput = { resultId: string; objectiveId: string; referenceResultId: string; placement: Placement };

interface ResultActionOptions {
  currentUser: OrfUser | null;
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
  refreshTaskManagementDataAfterCreate: (failureMessage: string) => void;
  state: OrfState;
}

export function useOrfProviderResultActions({
  currentUser,
  notify,
  refreshTaskManagementData,
  refreshTaskManagementDataAfterCreate,
  state,
}: ResultActionOptions) {
  return useMemo(
    () => ({
      createResult: async (input: Partial<Result> & Pick<Result, "objectiveId" | "title">) => {
        const payload = {
          ...input,
          source: input.source ?? "managerDefined",
          definerUserId: input.definerUserId ?? currentUser?.id ?? "",
        };
        const objective = state.objectives.find((item) => item.id === payload.objectiveId);
        const canAdjustDuringReestimate = Boolean(
            objective &&
            isObjectiveReestimateWindowOpen(objective) &&
            currentUser?.id &&
            isObjectiveChallenger(objective, currentUser.id),
        );
        const canCreateManagerDefined = payload.source !== "memberProposed" && hasPermission(currentUser, state.permissionRules, "result.create");
        const canCreateMemberProposed = payload.source === "memberProposed" && canAdjustDuringReestimate;
        if (!canCreateManagerDefined && !canCreateMemberProposed) {
          notify("没有新增指标权限");
          return null;
        }

        try {
          const data = await apiJson<CreateResultResponse>("/api/results", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          notify(payload.source === "memberProposed" ? "指标已提交" : "指标已创建");
          refreshTaskManagementDataAfterCreate(payload.source === "memberProposed" ? "指标已提交，但数据刷新失败" : "指标已创建，但数据刷新失败");
          return data.result;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      updateResultTitle: async (resultId: string, title: string) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("指标已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateResultDetails: async (resultId: string, details: ResultDetailsInput) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}/details`, {
            method: "PATCH",
            body: JSON.stringify({ detail: details.detail }),
          });
          await refreshTaskManagementData();
          notify("指标详情已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标详情更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateResultUncertaintyLevel: async (resultId: string, uncertaintyLevel: UncertaintyLevel) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}/uncertainty`, {
            method: "PATCH",
            body: JSON.stringify({ uncertaintyLevel }),
          });
          await refreshTaskManagementData();
          notify("指标积分已校准");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标积分校准失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      moveResult: (input: MoveResultInput) => {
        void apiRequest(`/api/results/${encodeURIComponent(input.resultId)}/order`, {
          method: "PATCH",
          body: JSON.stringify({ referenceResultId: input.referenceResultId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("指标位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteResult: (resultId: string) => {
        void apiRequest(`/api/results/${encodeURIComponent(resultId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("指标已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateResultConfidence: (resultId: string, confidence: number) => {
        void apiRequest(`/api/results/${encodeURIComponent(resultId)}/confidence`, {
          method: "PATCH",
          body: JSON.stringify({ confidence }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("指标信心已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标信心更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
    }),
    [currentUser, notify, refreshTaskManagementData, refreshTaskManagementDataAfterCreate, state],
  );
}
