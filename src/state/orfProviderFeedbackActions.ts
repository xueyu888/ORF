import { useMemo } from "react";
import type {
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackTransitionInput,
} from "@orf/feedback-module/contracts";
import { apiJson, apiRequest } from "./apiClient";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import type { Feedback } from "../types/orf";

export type CreateFeedbackInput = {
  assigneeUserId?: string | null;
  attachments?: Array<{ file: File; id: string }>;
  causeCategories: string[];
  description: string;
  impact: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title: string;
};
export type UpdateFeedbackMetadataInput = {
  causeCategories?: string[];
  description?: string;
  expectedVersion: number;
  impact?: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title?: string;
};
export type AddFeedbackRelationInput = {
  expectedVersion: number;
  targetFeedbackId: string;
  type: FeedbackRelationType;
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
          formData.set("title", input.title);
          formData.set("causeCategories", JSON.stringify(input.causeCategories));
          formData.set("impact", input.impact);
          formData.set("description", input.description);
          formData.set("priority", input.priority ?? "");
          formData.set("assigneeUserId", input.assigneeUserId ?? "");
          formData.set("projectId", input.projectId ?? "");
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
      transitionFeedback: async (feedbackId: string, command: FeedbackTransitionInput) => {
        try {
          await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/transitions`, {
            method: "POST",
            body: JSON.stringify(command),
          });
          await refreshTaskManagementData();
          notify("反馈状态已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈状态更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateFeedbackMetadata: async (feedbackId: string, input: UpdateFeedbackMetadataInput) => {
        try {
          await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/metadata`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("反馈属性已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈属性更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateFeedbackAssignee: async (feedbackId: string, assigneeUserId: string | null, expectedVersion: number) => {
        try {
          await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/assignee`, {
            method: "PATCH",
            body: JSON.stringify({ assigneeUserId, expectedVersion }),
          });
          await refreshTaskManagementData();
          notify("反馈处理人已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈处理人更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      addFeedbackRelation: async (feedbackId: string, input: AddFeedbackRelationInput) => {
        try {
          await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("反馈关系已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈关系更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      removeFeedbackRelation: async (feedbackId: string, relationId: string, expectedVersion: number) => {
        try {
          await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations/${encodeURIComponent(relationId)}`, {
            method: "DELETE",
            body: JSON.stringify({ expectedVersion }),
          });
          await refreshTaskManagementData();
          notify("反馈关系已移除");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈关系移除失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
    }),
    [notify, refreshTaskManagementData],
  );
}
