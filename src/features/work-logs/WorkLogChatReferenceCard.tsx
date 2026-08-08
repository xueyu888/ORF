import { NotebookPen, Tags, Target } from "lucide-react";
import { z } from "zod";
import { getWorkLogActivity } from "../../state/apiClient";
import type { ChatMessage, WorkLogActivityItem } from "../../types/orf";
import type {
  ChatReferenceCardBodyBlock,
  ChatReferenceCardModel,
  ChatReferenceCardRegistration,
} from "../chat/chatReferenceCardProvider";
import {
  formatWorkLogDurationMinutes,
  formatWorkLogProgressEstimate,
  parseWorkLogStatusUpdateMarkdown,
  workLogEntryClassification,
  workLogStatusUpdateTemplateSections,
} from "./workLogEditorModel";

const workLogChatReferenceSchema = z.object({
  authorName: z.string().optional(),
  entryId: z.string().trim().min(1),
  href: z.string().optional(),
  title: z.string().optional(),
  version: z.literal(1),
  workDate: z.string().optional(),
});

type WorkLogChatReference = z.infer<typeof workLogChatReferenceSchema>;

function workLogEntryIdFromMessage(message: ChatMessage) {
  const targetId = message.system?.targetId?.trim();
  if (targetId) return targetId;

  const href = message.system?.targetHref?.trim();
  if (!href) return null;
  try {
    return new URL(href, "http://orf.local").searchParams.get("entry")?.trim() || null;
  } catch {
    return null;
  }
}

function workLogSubmittedReferenceFromMessage(message: ChatMessage): WorkLogChatReference | null {
  if (
    message.source !== "system" ||
    message.system?.kind !== "worklog.submitted" ||
    message.system.targetType !== "workLog"
  ) {
    return null;
  }

  const entryId = workLogEntryIdFromMessage(message);
  if (!entryId) return null;
  return {
    authorName: message.system.metadata?.authorName?.trim() || message.system.actorName?.trim() || undefined,
    entryId,
    href: message.system.targetHref?.trim() || undefined,
    title: message.system.metadata?.classificationTitle?.trim() || message.system.targetTitle?.trim() || undefined,
    version: 1,
    workDate: message.system.metadata?.workDate?.trim() || undefined,
  };
}

function workLogReferenceHref(reference: WorkLogChatReference, entry: WorkLogActivityItem | null) {
  const href = reference.href?.trim();
  if (href) return href;
  if (!entry) return null;
  return `/work-logs?date=${encodeURIComponent(entry.workDate)}&view=today&entry=${encodeURIComponent(entry.id)}`;
}

function formatWorkLogReferenceTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fallbackWorkLogTitle(reference: WorkLogChatReference) {
  return reference.title?.trim() || "工作日志";
}

function fallbackWorkLogAuthor(reference: WorkLogChatReference) {
  return reference.authorName?.trim() || "成员";
}

function fallbackWorkLogDate(reference: WorkLogChatReference) {
  return reference.workDate?.trim() || "";
}

function WorkLogReferenceIcon({ entry }: { entry: WorkLogActivityItem | null }) {
  if (!entry) return <NotebookPen className="h-4 w-4" />;
  const classification = workLogEntryClassification(entry);
  if (classification.kind === "objective") return <Target className="h-4 w-4" />;
  if (classification.kind === "category") return <Tags className="h-4 w-4" />;
  return <NotebookPen className="h-4 w-4" />;
}

function WorkLogReferenceMeta({ entry }: { entry: WorkLogActivityItem }) {
  const duration = formatWorkLogDurationMinutes(entry.durationMinutes);
  const progress = formatWorkLogProgressEstimate(entry.remainingEstimatePercent);
  if (!duration && !progress) return null;
  return (
    <>
      {progress && <span>{progress}</span>}
      {duration && <span>{duration}</span>}
    </>
  );
}

function workLogReferenceSubtitle(reference: WorkLogChatReference, entry: WorkLogActivityItem | null) {
  const authorName = entry?.authorCurrentName ?? entry?.authorNameSnapshot ?? fallbackWorkLogAuthor(reference);
  const workDate = entry?.workDate ?? fallbackWorkLogDate(reference);
  return [authorName, workDate].filter(Boolean).join(" · ");
}

function workLogReferenceBodyBlocks(entry: WorkLogActivityItem): ChatReferenceCardBodyBlock[] {
  const templateBody = parseWorkLogStatusUpdateMarkdown(entry.bodyMarkdown);
  const visibleSections = templateBody
    ? workLogStatusUpdateTemplateSections
        .map((section) => ({ ...section, bodyMarkdown: templateBody[section.key].trim() }))
        .filter((section) => section.bodyMarkdown)
    : [];

  if (templateBody && visibleSections.length > 0) {
    return visibleSections.map((section) => ({
      bodyMarkdown: section.bodyMarkdown,
      title: section.label,
      type: "section" as const,
    }));
  }

  return [{ bodyMarkdown: entry.bodyMarkdown, type: "markdown" }];
}

function workLogReferencePlaceholder(reference: WorkLogChatReference): ChatReferenceCardModel {
  const actionHref = workLogReferenceHref(reference, null);
  return {
    action: actionHref ? { href: actionHref, label: "打开完整日志" } : null,
    className: "orf-chat-work-log-reference-card",
    eyebrow: "工作日志",
    icon: <WorkLogReferenceIcon entry={null} />,
    status: "loading",
    subtitle: workLogReferenceSubtitle(reference, null),
    title: fallbackWorkLogTitle(reference),
  };
}

function workLogMissingReferenceModel(reference: WorkLogChatReference): ChatReferenceCardModel {
  return {
    ...workLogReferencePlaceholder(reference),
    body: [{ text: "这条工作日志已删除或当前不可见", tone: "warning", type: "notice" }],
    status: "missing",
  };
}

async function loadWorkLogReferenceModel(
  reference: WorkLogChatReference,
  signal: AbortSignal,
): Promise<ChatReferenceCardModel> {
  const response = await getWorkLogActivity({ entryId: reference.entryId, limit: 1, signal });
  const entry = response.entries[0] ?? null;
  if (!entry) {
    return workLogMissingReferenceModel(reference);
  }

  const classification = workLogEntryClassification(entry);
  return {
    action: { href: workLogReferenceHref(reference, entry) ?? "", label: "打开完整日志" },
    badge: <WorkLogReferenceMeta entry={entry} />,
    body: workLogReferenceBodyBlocks(entry),
    className: "orf-chat-work-log-reference-card",
    eyebrow: "工作日志",
    icon: <WorkLogReferenceIcon entry={entry} />,
    meta: `更新于 ${formatWorkLogReferenceTime(entry.updatedAt)}`,
    status: "ready",
    subtitle: workLogReferenceSubtitle(reference, entry),
    title: classification.title ?? fallbackWorkLogTitle(reference),
  };
}

function isWorkLogSubmittedChatMessage(message: ChatMessage) {
  return Boolean(workLogSubmittedReferenceFromMessage(message));
}

function workLogSubmittedActorName(message: ChatMessage) {
  return (
    message.system?.metadata?.authorName?.trim() ||
    message.system?.actorName?.trim() ||
    "成员"
  );
}

function renderWorkLogSubmittedSystemMessageBody(message: ChatMessage): string | null | undefined {
  if (isWorkLogSubmittedChatMessage(message)) {
    return `${workLogSubmittedActorName(message)}发布了新的工作日志`;
  }
  return undefined;
}

export const workLogChatReferenceCardRegistration: ChatReferenceCardRegistration<WorkLogChatReference> = {
  cacheKey: (reference) => `workLog:${reference.entryId}`,
  placeholder: workLogReferencePlaceholder,
  provider: {
    namespace: "workLog",
    referenceSchema: workLogChatReferenceSchema,
    load: loadWorkLogReferenceModel,
  },
  referenceFromMessage: workLogSubmittedReferenceFromMessage,
  renderMessageBody: renderWorkLogSubmittedSystemMessageBody,
};
