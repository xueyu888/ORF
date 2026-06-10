import { useMemo } from "react";
import { apiJson, apiRequest } from "./apiClient";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import type { Feedback, FeedbackStatus } from "../types/orf";

export type CreateFeedbackInput = Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "owner"> & {
  attachments?: Array<{ file: File; id: string }>;
  initialBody: string;
};

interface FeedbackActionOptions {
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
}

export function useOrfProviderFeedbackActions({ notify, refreshTaskManagementData }: FeedbackActionOptions) {
  return useMemo(
    () => ({
      createFeedback: async (input: CreateFeedbackInput) => {
        try {
          const formData = new FormData();
          formData.set("phenomenon", input.phenomenon);
          formData.set("causeCategories", JSON.stringify(input.causeCategories));
          formData.set("impact", input.impact);
          formData.set("initialBody", input.initialBody);
          formData.set("owner", input.owner);
          for (const attachment of input.attachments ?? []) {
            formData.set(`attachment:${attachment.id}`, attachment.file);
          }

          const response = await apiJson<{ feedback: Feedback }>("/api/feedback", {
            method: "POST",
            body: formData,
          });
          await refreshTaskManagementData();
          notify("反馈已捕获");
          return response.feedback;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈保存失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
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
