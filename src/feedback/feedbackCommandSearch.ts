import { feedbackIssueHref } from "@orf/feedback-module/web";
import type { RegisteredWebModuleCommandSearch } from "../config/webModuleRegistry";
import { searchFeedbackReferences } from "../state/apiClient";

export const feedbackWebModuleCommandSearch = {
  minQueryLength: 2,
  canSearch({ currentUser }) {
    return currentUser?.status === "active" || currentUser?.role === "admin";
  },
  async search(query, options) {
    const response = await searchFeedbackReferences(query, options);
    return response.feedback.map((item) => ({
      label: item.title,
      path: feedbackIssueHref(item.id),
      searchText: `${item.id} ${item.title}`,
      type: "Feedback",
    }));
  },
} satisfies RegisteredWebModuleCommandSearch;
