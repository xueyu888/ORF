import { Globe2 } from "lucide-react";
import { z } from "zod";
import { firstWebLinkInChatMessage, type ChatWebLinkPreview } from "../../domain/chatWebLinkPreview";
import { apiJson } from "../../state/apiClient";
import type { ChatReferenceCardModel, ChatReferenceCardRegistration } from "./chatReferenceCardProvider";

const webLinkReferenceSchema = z.object({ url: z.string().url() });
type WebLinkReference = z.infer<typeof webLinkReferenceSchema>;

function hostnameFromUrl(url: string) {
  return new URL(url).hostname.replace(/^www\./iu, "");
}

function placeholder(reference: WebLinkReference): ChatReferenceCardModel {
  return {
    action: { href: reference.url, label: "打开网页" },
    badge: <span>网页</span>,
    className: "orf-chat-web-link-preview",
    icon: <Globe2 className="h-4 w-4" />,
    subtitle: "正在读取网页摘要",
    title: hostnameFromUrl(reference.url),
  };
}

function previewModel(preview: ChatWebLinkPreview): ChatReferenceCardModel {
  const showHostname = preview.hostname.toLocaleLowerCase() !== preview.siteName.toLocaleLowerCase();
  return {
    action: { href: preview.url, label: "打开网页" },
    badge: <span>网页</span>,
    body: preview.description
      ? [{ type: "text", text: preview.description }]
      : undefined,
    className: "orf-chat-web-link-preview",
    icon: <Globe2 className="h-4 w-4" />,
    meta: showHostname ? preview.hostname : undefined,
    subtitle: preview.siteName,
    title: preview.title,
  };
}

async function loadPreview(reference: WebLinkReference, signal: AbortSignal) {
  try {
    const query = new URLSearchParams({ url: reference.url });
    return previewModel(await apiJson<ChatWebLinkPreview>(`/api/chat/link-preview?${query.toString()}`, { signal }));
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

export const chatWebLinkPreviewRegistration: ChatReferenceCardRegistration<WebLinkReference> = {
  cacheKey: ({ url }) => url,
  placeholder,
  provider: {
    load: loadPreview,
    namespace: "web-link-preview",
    referenceSchema: webLinkReferenceSchema,
  },
  referenceFromMessage: (message) => {
    if (message.source !== "user") return null;
    const url = firstWebLinkInChatMessage(message.body);
    return url ? { url } : null;
  },
};
