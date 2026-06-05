import { useMemo } from "react";
import { apiRequest } from "./apiClient";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import type { Feedback, FeedbackStatus } from "../types/orf";

interface FeedbackActionOptions {
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
}

export function useOrfProviderFeedbackActions({ notify, refreshTaskManagementData }: FeedbackActionOptions) {
  return useMemo(
    () => ({
      createFeedback: async (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "suggestedAdjustment" | "owner">) => {
        try {
          await apiRequest("/api/feedback", {
            method: "POST",
            body: JSON.stringify({
              phenomenon: input.phenomenon,
              causeCategories: input.causeCategories,
              impact: input.impact,
              suggestedAdjustment: input.suggestedAdjustment,
              owner: input.owner,
            }),
          });
          await refreshTaskManagementData();
          notify("反馈已捕获");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈保存失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => {
        void apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("反馈状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "反馈状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
    }),
    [notify, refreshTaskManagementData],
  );
}
