import { AlertCircle, Loader2, NotebookPen, Tags, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";
import { getWorkLogActivity } from "../../state/apiClient";
import type { ChatMessage, WorkLogActivityItem } from "../../types/orf";
import {
  formatWorkLogDurationMinutes,
  formatWorkLogProgressEstimate,
  parseWorkLogStatusUpdateMarkdown,
  workLogEntryClassification,
  workLogStatusUpdateTemplateSections,
} from "./workLogEditorModel";
import {
  ChatReferenceCard,
  ChatReferenceCardNotice,
  ChatReferenceCardSection,
} from "../chat/ChatReferenceCard";

type WorkLogReferenceState =
  | { status: "loading"; startedAt: number }
  | { status: "ready"; entry: WorkLogActivityItem; fetchedAt: number }
  | { status: "missing"; fetchedAt: number }
  | { status: "error"; fetchedAt: number; message: string };

const workLogReferenceCacheMaxAgeMs = 30_000;
const workLogReferenceRequestTimeoutMs = 8_000;
const workLogReferenceCache = new Map<string, WorkLogReferenceState>();
const workLogReferenceRequests = new Map<string, Promise<void>>();
const workLogReferenceListeners = new Map<string, Set<() => void>>();

function notifyWorkLogReferenceListeners(entryId: string) {
  for (const listener of workLogReferenceListeners.get(entryId) ?? []) {
    listener();
  }
}

function setWorkLogReferenceCache(entryId: string, state: WorkLogReferenceState) {
  workLogReferenceCache.set(entryId, state);
  notifyWorkLogReferenceListeners(entryId);
}

function subscribeWorkLogReference(entryId: string, listener: () => void) {
  const listeners = workLogReferenceListeners.get(entryId) ?? new Set<() => void>();
  listeners.add(listener);
  workLogReferenceListeners.set(entryId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) workLogReferenceListeners.delete(entryId);
  };
}

function isFreshWorkLogReferenceState(state: WorkLogReferenceState | undefined) {
  if (!state || state.status === "loading") return false;
  return Date.now() - state.fetchedAt < workLogReferenceCacheMaxAgeMs;
}

function readWorkLogReferenceState(entryId: string): WorkLogReferenceState {
  return workLogReferenceCache.get(entryId) ?? { status: "loading", startedAt: Date.now() };
}

function withWorkLogReferenceTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("工作日志读取超时，请稍后再试"));
    }, workLogReferenceRequestTimeoutMs);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

function loadWorkLogReferenceEntry(entryId: string) {
  const cachedState = workLogReferenceCache.get(entryId);
  if (isFreshWorkLogReferenceState(cachedState) || workLogReferenceRequests.has(entryId)) return;

  if (cachedState?.status !== "ready") {
    setWorkLogReferenceCache(entryId, { status: "loading", startedAt: Date.now() });
  }

  const request = withWorkLogReferenceTimeout(getWorkLogActivity({ entryId, limit: 1 }))
    .then((response) => {
      const entry = response.entries[0] ?? null;
      setWorkLogReferenceCache(
        entryId,
        entry ? { status: "ready", entry, fetchedAt: Date.now() } : { status: "missing", fetchedAt: Date.now() },
      );
    })
    .catch((error) => {
      setWorkLogReferenceCache(entryId, {
        status: "error",
        fetchedAt: Date.now(),
        message: error instanceof Error ? error.message : "工作日志读取失败",
      });
    })
    .finally(() => {
      workLogReferenceRequests.delete(entryId);
    });

  workLogReferenceRequests.set(entryId, request);
}

function useWorkLogReferenceEntry(entryId: string | null) {
  const [state, setState] = useState<WorkLogReferenceState>(() => (
    entryId ? readWorkLogReferenceState(entryId) : { status: "missing", fetchedAt: Date.now() }
  ));

  useEffect(() => {
    if (!entryId) {
      setState({ status: "missing", fetchedAt: Date.now() });
      return undefined;
    }

    const unsubscribe = subscribeWorkLogReference(entryId, () => {
      setState(readWorkLogReferenceState(entryId));
    });
    setState(readWorkLogReferenceState(entryId));
    loadWorkLogReferenceEntry(entryId);
    return unsubscribe;
  }, [entryId]);

  return state;
}

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

function workLogReferenceHref(message: ChatMessage, entry: WorkLogActivityItem | null) {
  const href = message.system?.targetHref?.trim();
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

function fallbackWorkLogTitle(message: ChatMessage) {
  return message.system?.metadata?.classificationTitle?.trim() || message.system?.targetTitle || "工作日志";
}

function fallbackWorkLogAuthor(message: ChatMessage) {
  return message.system?.metadata?.authorName?.trim() || message.system?.actorName || "成员";
}

function fallbackWorkLogDate(message: ChatMessage) {
  return message.system?.metadata?.workDate?.trim() || "";
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

function WorkLogReferenceMarkdown({ body }: { body: string }) {
  return (
    <OrfRichTextMarkdownViewer
      body={body}
      compact
    />
  );
}

function WorkLogReferenceBody({ entry }: { entry: WorkLogActivityItem }) {
  const templateBody = parseWorkLogStatusUpdateMarkdown(entry.bodyMarkdown);
  const visibleSections = templateBody
    ? workLogStatusUpdateTemplateSections
        .map((section) => ({ ...section, bodyMarkdown: templateBody[section.key].trim() }))
        .filter((section) => section.bodyMarkdown)
    : [];

  if (templateBody && visibleSections.length > 0) {
    return (
      <>
        {visibleSections.map((section) => (
          <ChatReferenceCardSection key={section.key} title={section.label}>
            <WorkLogReferenceMarkdown body={section.bodyMarkdown} />
          </ChatReferenceCardSection>
        ))}
      </>
    );
  }

  return <WorkLogReferenceMarkdown body={entry.bodyMarkdown} />;
}

export function isWorkLogSubmittedChatMessage(message: ChatMessage) {
  return (
    message.source === "system" &&
    message.system?.kind === "worklog.submitted" &&
    message.system.targetType === "workLog" &&
    Boolean(workLogEntryIdFromMessage(message))
  );
}

export function WorkLogChatReferenceCard({ message }: { message: ChatMessage }) {
  const systemTargetHref = message.system?.targetHref ?? "";
  const systemTargetId = message.system?.targetId ?? "";
  const entryId = useMemo(() => workLogEntryIdFromMessage(message), [message, systemTargetHref, systemTargetId]);
  const state = useWorkLogReferenceEntry(entryId);

  const entry = state.status === "ready" ? state.entry : null;
  const classification = entry ? workLogEntryClassification(entry) : null;
  const title = classification?.title ?? fallbackWorkLogTitle(message);
  const authorName = entry?.authorCurrentName ?? entry?.authorNameSnapshot ?? fallbackWorkLogAuthor(message);
  const workDate = entry?.workDate ?? fallbackWorkLogDate(message);
  const subtitle = [authorName, workDate].filter(Boolean).join(" · ");
  const href = workLogReferenceHref(message, entry);

  return (
    <ChatReferenceCard
      actionHref={href}
      actionLabel="打开完整日志"
      badge={entry ? <WorkLogReferenceMeta entry={entry} /> : null}
      className="orf-chat-work-log-reference-card"
      eyebrow="工作日志"
      icon={state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WorkLogReferenceIcon entry={entry} />}
      meta={entry ? `更新于 ${formatWorkLogReferenceTime(entry.updatedAt)}` : null}
      status={state.status === "loading" ? "loading" : state.status}
      subtitle={subtitle}
      title={title}
    >
      {state.status === "loading" && (
        <ChatReferenceCardNotice>正在读取工作日志内容</ChatReferenceCardNotice>
      )}
      {state.status === "missing" && (
        <ChatReferenceCardNotice icon={<AlertCircle className="h-3.5 w-3.5" />}>
          这条工作日志已删除或当前不可见
        </ChatReferenceCardNotice>
      )}
      {state.status === "error" && (
        <ChatReferenceCardNotice icon={<AlertCircle className="h-3.5 w-3.5" />}>
          {state.message}
        </ChatReferenceCardNotice>
      )}
      {state.status === "ready" && <WorkLogReferenceBody entry={state.entry} />}
    </ChatReferenceCard>
  );
}
