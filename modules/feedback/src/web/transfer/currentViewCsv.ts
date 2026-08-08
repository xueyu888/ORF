import { feedbackImpactLabel, feedbackLifecycleLabel, feedbackPriorityLabel } from "../labels";
import type { FeedbackIssueListFilters, FeedbackIssueListItem } from "../model/issueList";

export type FeedbackIssueCsvExportInput = {
  exportedAt: string;
  filters: FeedbackIssueListFilters;
  items: readonly FeedbackIssueListItem[];
};

const feedbackIssueCsvColumns = [
  "export_version",
  "exported_at",
  "feedback_id",
  "display_id",
  "title",
  "description",
  "stage",
  "resolution",
  "state_label",
  "impact",
  "impact_label",
  "priority",
  "priority_label",
  "assignee_user_id",
  "assignee_name",
  "author_user_id",
  "author_name",
  "project_id",
  "project_name",
  "cause_categories",
  "relations",
  "comment_count",
  "unread",
  "requires_action",
  "version",
  "created_at",
  "updated_at",
  "last_activity_at",
  "filter_state",
  "filter_project",
  "filter_query",
] as const;

export function buildFeedbackIssueCurrentViewCsv(input: FeedbackIssueCsvExportInput) {
  const rows = input.items.map((item) => {
    const feedback = item.feedback;
    const priority = feedback.priority ?? "";
    return feedbackIssueCsvColumns.map((column) => {
      switch (column) {
        case "export_version":
          return "orf.feedback.current_view.v1";
        case "exported_at":
          return input.exportedAt;
        case "feedback_id":
          return feedback.id;
        case "display_id":
          return item.issueNumber;
        case "title":
          return feedback.title;
        case "description":
          return feedback.description;
        case "stage":
          return feedback.stage;
        case "resolution":
          return feedback.resolution ?? "";
        case "state_label":
          return feedbackLifecycleLabel(feedback);
        case "impact":
          return feedback.impact;
        case "impact_label":
          return feedbackImpactLabel[feedback.impact];
        case "priority":
          return priority;
        case "priority_label":
          return priority ? feedbackPriorityLabel[priority] : "未分诊";
        case "assignee_user_id":
          return feedback.assigneeUserId ?? "";
        case "assignee_name":
          return item.assigneeName;
        case "author_user_id":
          return feedback.createdBy ?? "";
        case "author_name":
          return item.authorName;
        case "project_id":
          return feedback.projectId ?? "";
        case "project_name":
          return item.projectName ?? "";
        case "cause_categories":
          return feedback.causeCategories.join(" | ");
        case "relations":
          return feedback.relations
            .map((relation) => `${relation.type}:${relation.sourceFeedbackId}->${relation.targetFeedbackId}`)
            .join(" | ");
        case "comment_count":
          return String(item.commentCount);
        case "unread":
          return feedback.unread ? "true" : "false";
        case "requires_action":
          return feedback.requiresAction ? "true" : "false";
        case "version":
          return String(feedback.version);
        case "created_at":
          return feedback.createdAt;
        case "updated_at":
          return feedback.updatedAt;
        case "last_activity_at":
          return item.lastActivityAt;
        case "filter_state":
          return input.filters.listState;
        case "filter_project":
          return input.filters.projectId;
        case "filter_query":
          return input.filters.query;
      }
    });
  });

  return "\uFEFF" + [feedbackIssueCsvColumns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function feedbackIssueCsvExportFileName(exportedAt: string) {
  const stamp = exportedAt
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace("Z", "");
  return `orf-feedback-current-view-${stamp}.csv`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
