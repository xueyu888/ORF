import type { CommentThread, Feedback, Impact, OrfUser } from "../../../types/orf";
import { impactLabel } from "../../../utils/labels";
import { feedbackIssueIdsFromText, isFeedbackIssueOpen } from "./feedbackIssue";

export type FeedbackIssueLabel = {
  key: string;
  name: string;
  tone: "accent" | "danger" | "gold" | "neutral" | "warning";
};

export type FeedbackIssueLabelIndexSortKey = "name-asc" | "feedback-desc" | "open-desc";

export type FeedbackIssueLabelIndexItem = FeedbackIssueLabel & {
  closedCount: number;
  description: string;
  feedbackCount: number;
  openCount: number;
};

export type FeedbackIssuePerson = {
  avatarUrl: string | null;
  id: string | null;
  name: string;
};

export function feedbackIssueLabels(feedback: Pick<Feedback, "causeCategories" | "impact">): FeedbackIssueLabel[] {
  const causes = Array.from(new Set(feedback.causeCategories.map((cause) => cause.trim()).filter(Boolean)));
  return [
    ...causes.map((cause) => ({
      key: `cause:${cause}`,
      name: cause,
      tone: causeLabelTone(cause),
    })),
    {
      key: `impact:${feedback.impact}`,
      name: impactLabel[feedback.impact],
      tone: impactTone(feedback.impact),
    },
  ];
}

export function feedbackIssueLabelIndexItems(
  feedbackItems: readonly Pick<Feedback, "causeCategories" | "impact" | "status">[],
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

export function feedbackIssueAssignee(feedback: Pick<Feedback, "owner" | "ownerUserId">, users: readonly OrfUser[]): FeedbackIssuePerson {
  const user = users.find((item) => item.id === feedback.ownerUserId) ?? null;
  return {
    avatarUrl: user?.avatarUrl ?? null,
    id: feedback.ownerUserId || user?.id || null,
    name: user?.name ?? feedback.owner,
  };
}

export function feedbackIssueAuthor(feedback: Pick<Feedback, "createdBy" | "owner">, users: readonly OrfUser[]): FeedbackIssuePerson {
  const user = feedback.createdBy ? users.find((item) => item.id === feedback.createdBy) ?? null : null;
  return {
    avatarUrl: user?.avatarUrl ?? null,
    id: user?.id ?? feedback.createdBy ?? null,
    name: user?.name ?? feedback.owner,
  };
}

export function feedbackIssueParticipants(input: {
  feedback: Pick<Feedback, "createdBy" | "owner" | "ownerUserId">;
  threads: readonly CommentThread[];
  users: readonly OrfUser[];
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
  feedback: Pick<Feedback, "id" | "phenomenon" | "suggestedAdjustment">;
  feedbackItems: readonly Pick<Feedback, "id" | "phenomenon">[];
  threads: readonly CommentThread[];
}) {
  const linkedIds = new Set<string>();
  for (const value of [
    input.feedback.phenomenon,
    input.feedback.suggestedAdjustment,
    ...input.threads.flatMap((thread) => thread.messages.map((message) => message.body)),
  ]) {
    for (const linkedId of feedbackIssueIdsFromText(value)) {
      if (linkedId !== input.feedback.id) linkedIds.add(linkedId);
    }
  }

  const feedbackById = new Map(input.feedbackItems.map((feedback) => [feedback.id, feedback]));
  return [...linkedIds].flatMap((linkedId) => {
    const feedback = feedbackById.get(linkedId);
    return feedback ? [feedback] : [];
  });
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

function causeLabelTone(value: string): FeedbackIssueLabel["tone"] {
  if (/管理|流程|协作/.test(value)) return "gold";
  if (/技术|系统|质量|缺陷|bug/i.test(value)) return "accent";
  if (/风险|事故|阻塞/.test(value)) return "warning";
  return "neutral";
}

function impactTone(value: Impact): FeedbackIssueLabel["tone"] {
  if (value === "Critical") return "danger";
  if (value === "High") return "warning";
  if (value === "Medium") return "accent";
  return "neutral";
}
