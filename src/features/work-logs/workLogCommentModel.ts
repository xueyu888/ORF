import type { CommentThread, WorkLogActivityItem, WorkLogEntry } from "../../types/orf";
import { workLogEntryTargetLabel } from "./workLogEditorModel";

type WorkLogCommentEntry = WorkLogEntry | WorkLogActivityItem;

export type WorkLogCommentTarget = {
  id: string;
  title: string;
  type: "workLog";
};

export function workLogCommentTargetForEntry(entry: WorkLogCommentEntry): WorkLogCommentTarget {
  const authorName = "authorCurrentName" in entry
    ? entry.authorCurrentName ?? entry.authorNameSnapshot
    : entry.authorNameSnapshot;
  return {
    id: entry.id,
    title: `${authorName} · ${entry.workDate} · ${workLogEntryTargetLabel(entry)}`,
    type: "workLog",
  };
}

export function workLogCommentThreadsForEntry(threads: readonly CommentThread[], entryId: string) {
  return threads.filter((thread) => thread.targetType === "workLog" && thread.targetId === entryId);
}

export function workLogCommentCountForEntry(threads: readonly CommentThread[], entryId: string) {
  return workLogCommentThreadsForEntry(threads, entryId).reduce((count, thread) => count + thread.messages.length, 0);
}
