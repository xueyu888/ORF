import { AlertCircle, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ZodType } from "zod";
import type { ChatMessage } from "../../types/orf";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";
import { formatFileSize } from "./chatFormat";
import {
  ChatReferenceCard,
  ChatReferenceCardNotice,
  ChatReferenceCardSection,
  type ChatReferenceCardStatus,
} from "./ChatReferenceCard";

export type ChatReferenceCardNoticeTone = "loading" | "warning";
export type ChatReferenceCardAttachmentPreviewKind = "download" | "image" | "markdown" | "pdf" | "text";

export type ChatReferenceCardAttachment = {
  readonly contentUrl?: string | null;
  readonly downloadUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly id: string;
  readonly previewKind: ChatReferenceCardAttachmentPreviewKind;
  readonly previewUrl?: string | null;
};

export type ChatReferenceCardBodyBlock =
  | { readonly type: "attachments"; readonly attachments: readonly ChatReferenceCardAttachment[]; readonly title?: string }
  | { readonly type: "markdown"; readonly bodyMarkdown: string }
  | { readonly type: "notice"; readonly text: string; readonly tone?: ChatReferenceCardNoticeTone }
  | { readonly type: "section"; readonly title: string; readonly bodyMarkdown: string }
  | { readonly type: "text"; readonly text: string };

export type ChatReferenceCardAction = {
  readonly href: string;
  readonly label?: string;
};

export type ChatReferenceCardModel = {
  readonly action?: ChatReferenceCardAction | null;
  readonly badge?: ReactNode;
  readonly body?: readonly ChatReferenceCardBodyBlock[];
  readonly className?: string;
  readonly eyebrow?: ReactNode;
  readonly icon?: ReactNode;
  readonly meta?: ReactNode;
  readonly status?: ChatReferenceCardStatus;
  readonly subtitle?: ReactNode;
  readonly title: ReactNode;
};

export interface ChatReferenceCardProvider<TReference> {
  readonly namespace: string;
  readonly referenceSchema: ZodType<TReference>;
  load(reference: TReference, signal: AbortSignal): Promise<ChatReferenceCardModel | null>;
}

export type ChatReferenceCardRegistration<TReference> = {
  readonly cacheKey?: (reference: TReference) => string;
  readonly placeholder: (reference: TReference) => ChatReferenceCardModel;
  readonly provider: ChatReferenceCardProvider<TReference>;
  readonly referenceFromMessage?: (message: ChatMessage) => TReference | null;
  readonly renderMessageBody?: (message: ChatMessage) => string | null | undefined;
};

export type AnyChatReferenceCardRegistration = ChatReferenceCardRegistration<any>;

export type RegisteredChatReferenceCardRegistration = {
  readonly cacheKey?: (reference: unknown) => string;
  readonly placeholder: (reference: unknown) => ChatReferenceCardModel;
  readonly provider: ChatReferenceCardProvider<unknown>;
  readonly referenceFromMessage?: (message: ChatMessage) => unknown | null;
  readonly renderMessageBody?: (message: ChatMessage) => string | null | undefined;
};

type ChatReferenceCardResolution = {
  readonly cacheKey: string;
  readonly reference: unknown;
  readonly registration: RegisteredChatReferenceCardRegistration;
};

type ChatReferenceCardLoadState =
  | { readonly status: "error"; readonly cachedAt: number; readonly message: string; readonly model: ChatReferenceCardModel }
  | { readonly status: "loading"; readonly model: ChatReferenceCardModel }
  | { readonly status: "missing"; readonly cachedAt: number; readonly model: ChatReferenceCardModel | null }
  | { readonly status: "ready"; readonly cachedAt: number; readonly model: ChatReferenceCardModel };

const chatReferenceCardCacheMaxAgeMs = 30_000;
const chatReferenceCardRequestTimeoutMs = 8_000;
const chatReferenceCardCache = new Map<string, Exclude<ChatReferenceCardLoadState, { status: "loading" }>>();

export function defineChatReferenceCardRegistration<TReference>(
  registration: ChatReferenceCardRegistration<TReference>,
): RegisteredChatReferenceCardRegistration {
  const parseReference = (reference: unknown) => registration.provider.referenceSchema.parse(reference);
  const cacheKey = registration.cacheKey;
  return {
    cacheKey: cacheKey
      ? (reference) => cacheKey(parseReference(reference))
      : undefined,
    placeholder: (reference) => registration.placeholder(parseReference(reference)),
    provider: {
      namespace: registration.provider.namespace,
      referenceSchema: registration.provider.referenceSchema as ZodType<unknown>,
      load: (reference, signal) => registration.provider.load(parseReference(reference), signal),
    },
    referenceFromMessage: registration.referenceFromMessage
      ? (message) => registration.referenceFromMessage?.(message) ?? null
      : undefined,
    renderMessageBody: registration.renderMessageBody,
  };
}

function stableReferenceJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableReferenceJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableReferenceJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function defaultReferenceCacheKey(namespace: string, reference: unknown) {
  return `${namespace}:${stableReferenceJson(reference)}`;
}

function isFreshCachedState(state: Exclude<ChatReferenceCardLoadState, { status: "loading" }> | undefined) {
  return Boolean(state && Date.now() - state.cachedAt < chatReferenceCardCacheMaxAgeMs);
}

function readFreshCachedState(cacheKey: string) {
  const cached = chatReferenceCardCache.get(cacheKey);
  return isFreshCachedState(cached) ? cached : null;
}

function referenceFromSystemMetadata(
  message: ChatMessage,
  registrations: readonly RegisteredChatReferenceCardRegistration[],
): ChatReferenceCardResolution | null {
  const namespace = message.system?.referenceNamespace?.trim();
  const reference = message.system?.reference;
  if (!namespace || reference === undefined || reference === null) {
    return null;
  }

  const registration = registrations.find((candidate) => candidate.provider.namespace === namespace);
  if (!registration) {
    return null;
  }

  const parsed = registration.provider.referenceSchema.safeParse(reference);
  if (!parsed.success) {
    return null;
  }

  return {
    cacheKey: registration.cacheKey?.(parsed.data) ?? defaultReferenceCacheKey(namespace, parsed.data),
    reference: parsed.data,
    registration,
  };
}

function referenceFromRegisteredProviders(
  message: ChatMessage,
  registrations: readonly RegisteredChatReferenceCardRegistration[],
): ChatReferenceCardResolution | null {
  for (const registration of registrations) {
    const reference = registration.referenceFromMessage?.(message);
    if (!reference) {
      continue;
    }

    const parsed = registration.provider.referenceSchema.safeParse(reference);
    if (!parsed.success) {
      continue;
    }

    return {
      cacheKey: registration.cacheKey?.(parsed.data) ?? defaultReferenceCacheKey(registration.provider.namespace, parsed.data),
      reference: parsed.data,
      registration,
    };
  }
  return null;
}

export function resolveChatReferenceCard(
  message: ChatMessage,
  registrations: readonly RegisteredChatReferenceCardRegistration[],
): ChatReferenceCardResolution | null {
  return referenceFromSystemMetadata(message, registrations) ?? referenceFromRegisteredProviders(message, registrations);
}

function errorTextFromReferenceLoad(error: unknown, timedOut: boolean) {
  if (timedOut) return "引用内容读取超时，请稍后再试";
  if (error instanceof DOMException && error.name === "AbortError") return "引用内容读取已取消";
  if (!(error instanceof Error)) return "引用内容暂时无法读取，请重试";
  const message = error.message.trim();
  return /^(?:Bad Request|Internal Server Error|HTTP \d{3})$/i.test(message)
    ? "引用内容暂时无法读取，请重试"
    : message || "引用内容暂时无法读取，请重试";
}

function useChatReferenceCardModel(resolution: ChatReferenceCardResolution) {
  const placeholder = useMemo(
    () => resolution.registration.placeholder(resolution.reference),
    [resolution],
  );
  const [state, setState] = useState<ChatReferenceCardLoadState>(() => (
    readFreshCachedState(resolution.cacheKey) ?? { status: "loading", model: placeholder }
  ));
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => {
    chatReferenceCardCache.delete(resolution.cacheKey);
    setRequestVersion((value) => value + 1);
  }, [resolution.cacheKey]);

  useEffect(() => {
    const cached = readFreshCachedState(resolution.cacheKey);
    if (cached) {
      setState(cached);
      return undefined;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, chatReferenceCardRequestTimeoutMs);

    setState({ status: "loading", model: placeholder });
    void resolution.registration.provider
      .load(resolution.reference, controller.signal)
      .then((model) => {
        if (!model) {
          const loadedState = { status: "missing", cachedAt: Date.now(), model: null } as const;
          chatReferenceCardCache.set(resolution.cacheKey, loadedState);
          setState(loadedState);
          return;
        }
        const status = model.status === "missing" ? "missing" : "ready";
        const loadedState = { status, cachedAt: Date.now(), model } as Exclude<ChatReferenceCardLoadState, { status: "loading" }>;
        chatReferenceCardCache.set(resolution.cacheKey, loadedState);
        setState(loadedState);
      })
      .catch((error) => {
        if (controller.signal.aborted && !timedOut) {
          return;
        }
        const loadedState = {
          status: "error",
          cachedAt: Date.now(),
          message: errorTextFromReferenceLoad(error, timedOut),
          model: placeholder,
        } satisfies Exclude<ChatReferenceCardLoadState, { status: "loading" }>;
        chatReferenceCardCache.set(resolution.cacheKey, loadedState);
        setState(loadedState);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [placeholder, requestVersion, resolution]);

  return { retry, state };
}

function renderNoticeIcon(tone: ChatReferenceCardNoticeTone | undefined) {
  if (tone === "warning") return <AlertCircle className="h-3.5 w-3.5" />;
  return undefined;
}

function attachmentPreviewHref(attachment: ChatReferenceCardAttachment) {
  return attachment.previewUrl?.trim() || attachment.contentUrl?.trim() || attachment.downloadUrl;
}

function attachmentIcon(attachment: ChatReferenceCardAttachment) {
  if (attachment.previewKind === "image") return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function ChatReferenceCardAttachmentItem({ attachment }: { attachment: ChatReferenceCardAttachment }) {
  const href = attachmentPreviewHref(attachment);
  const isImagePreview = attachment.previewKind === "image" && Boolean(attachment.previewUrl?.trim());
  return (
    <a className="orf-chat-reference-card-attachment" href={href} rel="noreferrer noopener" target="_blank">
      <span className="orf-chat-reference-card-attachment-preview">
        {isImagePreview ? <img alt="" loading="lazy" src={attachment.previewUrl ?? ""} /> : attachmentIcon(attachment)}
      </span>
      <span className="orf-chat-reference-card-attachment-main">
        <span className="orf-chat-reference-card-attachment-name">{attachment.fileName}</span>
        <span className="orf-chat-reference-card-attachment-meta">{formatFileSize(attachment.fileSize)}</span>
      </span>
    </a>
  );
}

function ChatReferenceCardAttachmentBlock({ block }: { block: Extract<ChatReferenceCardBodyBlock, { type: "attachments" }> }) {
  const attachments = block.attachments.filter((attachment) => attachment.downloadUrl.trim() && attachment.fileName.trim());
  if (attachments.length === 0) return null;
  return (
    <ChatReferenceCardSection title={block.title ?? "附件"}>
      <div className="orf-chat-reference-card-attachments">
        {attachments.map((attachment) => <ChatReferenceCardAttachmentItem key={attachment.id} attachment={attachment} />)}
      </div>
    </ChatReferenceCardSection>
  );
}

function renderReferenceCardBodyBlock(block: ChatReferenceCardBodyBlock, index: number) {
  if (block.type === "attachments") {
    return <ChatReferenceCardAttachmentBlock key={`${block.type}-${index}`} block={block} />;
  }
  if (block.type === "notice") {
    return (
      <ChatReferenceCardNotice key={`${block.type}-${index}`} icon={renderNoticeIcon(block.tone)}>
        {block.text}
      </ChatReferenceCardNotice>
    );
  }
  if (block.type === "section") {
    return (
      <ChatReferenceCardSection key={`${block.type}-${index}`} title={block.title}>
        <OrfRichTextMarkdownViewer body={block.bodyMarkdown} compact />
      </ChatReferenceCardSection>
    );
  }
  if (block.type === "text") {
    return <p className="orf-chat-reference-card-text" key={`${block.type}-${index}`}>{block.text}</p>;
  }
  return <OrfRichTextMarkdownViewer key={`${block.type}-${index}`} body={block.bodyMarkdown} compact />;
}

function ChatReferenceCardModelView({
  collapseKey,
  model,
  onRetry,
  state,
}: {
  collapseKey: string;
  model: ChatReferenceCardModel;
  onRetry: () => void;
  state: ChatReferenceCardLoadState;
}) {
  const status = state.status === "ready" ? model.status ?? "ready" : state.status;
  const blocks = model.body ?? [];
  const action = model.action ?? null;
  return (
    <ChatReferenceCard
      actionHref={action?.href}
      actionLabel={action?.label}
      badge={model.badge}
      bodyCollapseKey={`${collapseKey}:${state.status}`}
      className={model.className}
      eyebrow={model.eyebrow}
      icon={state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : model.icon}
      meta={model.meta}
      status={status}
      subtitle={model.subtitle}
      title={model.title}
    >
      {state.status === "loading" && blocks.length === 0 && (
        <ChatReferenceCardNotice>正在读取引用内容</ChatReferenceCardNotice>
      )}
      {state.status === "error" && (
        <ChatReferenceCardNotice
          actionLabel="重试"
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          onAction={onRetry}
        >
          {state.message}
        </ChatReferenceCardNotice>
      )}
      {blocks.map(renderReferenceCardBodyBlock)}
    </ChatReferenceCard>
  );
}

export function ChatReferenceCardProviderHost({
  resolution,
}: {
  resolution: ChatReferenceCardResolution;
}) {
  const { retry, state } = useChatReferenceCardModel(resolution);
  if (!state.model) return null;
  return (
    <ChatReferenceCardModelView
      collapseKey={resolution.cacheKey}
      model={state.model}
      onRetry={retry}
      state={state}
    />
  );
}

export function renderChatReferenceCardFromRegistrations(
  message: ChatMessage,
  registrations: readonly RegisteredChatReferenceCardRegistration[],
): ReactNode {
  const resolution = resolveChatReferenceCard(message, registrations);
  return resolution ? <ChatReferenceCardProviderHost resolution={resolution} /> : null;
}

export function renderChatSystemMessageBodyFromRegistrations(
  message: ChatMessage,
  registrations: readonly RegisteredChatReferenceCardRegistration[],
): string | null | undefined {
  for (const registration of registrations) {
    const body = registration.renderMessageBody?.(message);
    if (body !== undefined) {
      return body;
    }
  }
  return undefined;
}
