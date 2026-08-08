import type { FeedbackRelationType } from "../../contracts";
import {
  feedbackIssueAssignee,
  feedbackIssueAuthor,
  feedbackIssueLabels,
  isFeedbackIssueOpen,
  type FeedbackIssueLabel,
  type FeedbackIssuePerson,
} from "../../contracts/issueList";
import type { FeedbackWebCommentThread, FeedbackWebIssue, FeedbackWebRelation, FeedbackWebUser } from "../types";
export {
  feedbackIssueAssignee,
  feedbackIssueAuthor,
  feedbackIssueLabels,
  type FeedbackIssueLabel,
  type FeedbackIssuePerson,
} from "../../contracts/issueList";

export type FeedbackIssueLabelIndexSortKey = "name-asc" | "feedback-desc" | "open-desc";

export type FeedbackIssueLabelIndexItem = FeedbackIssueLabel & {
  closedCount: number;
  description: string;
  feedbackCount: number;
  openCount: number;
};

export type FeedbackIssueLinkedFeedback = {
  direction: "incoming" | "outgoing" | "undirected";
  id: string;
  relationId: string;
  title: string;
  type: FeedbackRelationType;
};

export function feedbackIssueLabelIndexItems(
  feedbackItems: readonly Pick<FeedbackWebIssue, "causeCategories" | "impact" | "stage">[],
  sort: FeedbackIssueLabelIndexSortKey = "name-asc",
): FeedbackIssueLabelIndexItem[] {
  const labelsByKey = new Map<string, FeedbackIssueLabelIndexItem>();

  for (const feedback of feedbackItems) {
    const open = isFeedbackIssueOpen(feedback);
    for (const label of feedbackIssueLabels(feedback)) {
      const item = labelsByKey.get(label.key) ?? {
        ...label,
        closedCount: 0,
        description: feedbackIssueLabelDescription(label),
        feedbackCount: 0,
        openCount: 0,
      };
      item.feedbackCount += 1;
      if (open) {
        item.openCount += 1;
      } else {
        item.closedCount += 1;
      }
      labelsByKey.set(label.key, item);
    }
  }

  return [...labelsByKey.values()].sort((left, right) => compareFeedbackIssueLabelIndexItems(left, right, sort));
}

export function feedbackIssueParticipants(input: {
  feedback: Pick<FeedbackWebIssue, "assigneeUserId" | "createdBy">;
  threads: readonly FeedbackWebCommentThread[];
  users: readonly FeedbackWebUser[];
}) {
  const people = new Map<string, FeedbackIssuePerson>();
  const userById = new Map(input.users.map((user) => [user.id, user]));

  addPerson(people, feedbackIssueAuthor(input.feedback, input.users));
  addPerson(people, feedbackIssueAssignee(input.feedback, input.users));
  for (const message of input.threads.flatMap((thread) => thread.messages)) {
    const user = message.authorUserId ? userById.get(message.authorUserId) ?? null : null;
    addPerson(people, {
      avatarUrl: user?.avatarUrl ?? message.authorAvatarUrl ?? null,
      id: message.authorUserId ?? null,
      name: user?.name ?? message.author,
    });
  }

  return [...people.values()];
}

export function feedbackIssueLinkedFeedback(input: {
  feedback: Pick<FeedbackWebIssue, "id" | "relations">;
  feedbackItems: readonly Pick<FeedbackWebIssue, "id" | "title">[];
}): FeedbackIssueLinkedFeedback[] {
  const feedbackById = new Map(input.feedbackItems.map((feedback) => [feedback.id, feedback]));
  return input.feedback.relations.flatMap((relation) => {
    const targetId = feedbackRelationOtherFeedbackId(relation, input.feedback.id);
    if (!targetId) return [];
    const target = feedbackById.get(targetId);
    if (!target) return [];
    return [{
      direction: relation.type === "related" ? "undirected" : relation.sourceFeedbackId === input.feedback.id ? "outgoing" : "incoming",
      id: target.id,
      relationId: relation.id,
      title: target.title,
      type: relation.type,
    }];
  });
}

function feedbackRelationOtherFeedbackId(relation: FeedbackWebRelation, feedbackId: string) {
  if (relation.sourceFeedbackId === feedbackId) return relation.targetFeedbackId;
  if (relation.targetFeedbackId === feedbackId) return relation.sourceFeedbackId;
  return null;
}

function addPerson(people: Map<string, FeedbackIssuePerson>, person: FeedbackIssuePerson) {
  const key = person.id ? `id:${person.id}` : `name:${person.name.trim().toLocaleLowerCase()}`;
  if (!key || people.has(key)) return;
  people.set(key, person);
}

function feedbackIssueLabelDescription(label: FeedbackIssueLabel) {
  if (label.key.startsWith("impact:")) {
    return "影响等级标签，由反馈影响字段派生。";
  }
  return "反馈原因标签，由反馈分类字段派生。";
}

function compareFeedbackIssueLabelIndexItems(left: FeedbackIssueLabelIndexItem, right: FeedbackIssueLabelIndexItem, sort: FeedbackIssueLabelIndexSortKey) {
  if (sort === "feedback-desc") {
    return compareNumberDescending(left.feedbackCount, right.feedbackCount) || compareText(left.name, right.name);
  }
  if (sort === "open-desc") {
    return compareNumberDescending(left.openCount, right.openCount) || compareText(left.name, right.name);
  }
  return compareText(left.name, right.name);
}

function compareNumberDescending(left: number, right: number) {
  return right - left;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-CN");
}
