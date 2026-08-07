import type {
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackTransitionInput,
} from "@orf/feedback-module/contracts";
import { apiJson, apiRequest } from "../../state/apiClient";
import type { Feedback } from "../../types/orf";

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

export async function createFeedback(input: CreateFeedbackInput): Promise<Feedback> {
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
  return response.feedback;
}

export async function transitionFeedback(feedbackId: string, command: FeedbackTransitionInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/transitions`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export async function updateFeedbackMetadata(feedbackId: string, input: UpdateFeedbackMetadataInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateFeedbackAssignee(feedbackId: string, assigneeUserId: string | null, expectedVersion: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/assignee`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeUserId, expectedVersion }),
  });
}

export async function addFeedbackRelation(feedbackId: string, input: AddFeedbackRelationInput): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeFeedbackRelation(feedbackId: string, relationId: string, expectedVersion: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function markFeedbackViewed(feedbackId: string, seenThroughSequence: number): Promise<void> {
  await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/view`, {
    method: "PUT",
    body: JSON.stringify({ seenThroughSequence }),
  });
}
