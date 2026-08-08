import { feedbackIssueListDefaultPageLimit, type FeedbackIssueListItem } from "../../contracts/issueList";
import type { FeedbackIssueReadModelData } from "../types";

export type FeedbackIssueListPageQueryInput = {
  cursor?: string | null;
  limit?: number | null;
};

export function feedbackIssueListPageQuery(query: string, input: FeedbackIssueListPageQueryInput = {}) {
  const params = new URLSearchParams(query.trim().replace(/^\?/, ""));
  const cursor = input.cursor?.trim() ?? "";
  params.set("limit", String(input.limit ?? feedbackIssueListDefaultPageLimit));
  if (cursor) {
    params.set("cursor", cursor);
  } else {
    params.delete("cursor");
  }
  return params.toString();
}

export function mergeFeedbackIssueListReadModelPages(
  previous: FeedbackIssueReadModelData,
  next: FeedbackIssueReadModelData,
): FeedbackIssueReadModelData {
  const previousList = previous.list;
  const nextList = next.list;
  if (!previousList || !nextList) return next;

  const items = mergeFeedbackIssueListItems(previousList.items, nextList.items);
  return {
    ...next,
    feedback: items.map((item) => item.feedback),
    list: {
      ...nextList,
      items,
    },
  };
}

function mergeFeedbackIssueListItems(
  previousItems: readonly FeedbackIssueListItem[],
  nextItems: readonly FeedbackIssueListItem[],
) {
  const itemsByFeedbackId = new Map<string, FeedbackIssueListItem>();
  for (const item of [...previousItems, ...nextItems]) {
    itemsByFeedbackId.set(item.feedback.id, item);
  }
  return [...itemsByFeedbackId.values()];
}
