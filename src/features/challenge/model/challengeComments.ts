import type { CommentTargetType, CommentThread } from "../../../types/orf";
import type { ChallengeCommentTarget, ChallengeTarget } from "./types";

export function commentTargetForChallengeTarget(target: ChallengeTarget): ChallengeCommentTarget {
  if (target.type === "objective") return { type: "objective", id: target.id, title: target.title };
  if (target.type === "bounty") return { type: "result", id: target.id, title: target.title };
  if (target.type === "action") return { type: "task", id: target.id, title: target.title };
  return { type: "subtask", id: target.id, title: target.title };
}

export function commentCountsByTarget(threads: CommentThread[]) {
  const counts = new Map<string, number>();

  for (const thread of threads) {
    if (thread.messages.length === 0) {
      continue;
    }

    const key = commentTargetKey(thread.targetType, thread.targetId);
    counts.set(key, (counts.get(key) ?? 0) + thread.messages.length);
  }

  return counts;
}

export function commentCountFor(counts: Map<string, number>, targetType: CommentTargetType, targetId: string) {
  return counts.get(commentTargetKey(targetType, targetId)) ?? 0;
}

export function commentTargetKey(targetType: CommentTargetType, targetId: string) {
  return `${targetType}:${targetId}`;
}

export function submittedLootIdsFromComments(threads: CommentThread[]) {
  const ids = new Set<string>();

  for (const thread of threads) {
    if (thread.targetType === "result" && thread.messages.some((message) => message.body.startsWith("战利品提交："))) {
      ids.add(thread.targetId);
    }
  }

  return ids;
}
