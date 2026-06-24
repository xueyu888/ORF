import type { CommentThread, Feedback, Impact, OrfUser } from "../../../types/orf";
import { impactLabel } from "../../../utils/labels";
import { feedbackIssueIdsFromText } from "./feedbackIssue";

export type FeedbackIssueLabel = {
  key: string;
  name: string;
  tone: "accent" | "danger" | "gold" | "neutral" | "warning";
};

export type FeedbackIssuePerson = {
  avatarUrl: string | null;
  id: string | null;
  name: string;
};

export function feedbackIssueLabels(feedback: Pick<Feedback, "causeCategories" | "impact">): FeedbackIssueLabel[] {
  const causes = feedback.causeCategories.map((cause) => cause.trim()).filter(Boolean);
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
