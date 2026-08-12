import { useEffect, useState } from "react";
import { firstWebLinkInChatMessage, type ChatWebLinkTitle } from "../../domain/chatWebLinkTitle";
import { apiJson } from "../../state/apiClient";
import type { ChatMessage } from "../../types/orf";

const titleRequestTimeoutMs = 3_000;
const titleRequests = new Map<string, Promise<ChatWebLinkTitle | null>>();
type ResolvedLinkTitle = { requestUrl: string; result: ChatWebLinkTitle };

function loadTitle(url: string) {
  const existing = titleRequests.get(url);
  if (existing) return existing;

  const query = new URLSearchParams({ url });
  const request = apiJson<ChatWebLinkTitle>(`/api/chat/link-title?${query.toString()}`, {
    signal: AbortSignal.timeout(titleRequestTimeoutMs),
  }).catch(() => null);
  titleRequests.set(url, request);
  return request;
}

export function ChatWebLinkTitle({ message }: { message: ChatMessage }) {
  const url = message.source === "user" ? firstWebLinkInChatMessage(message.body) : null;
  const [resolved, setResolved] = useState<ResolvedLinkTitle | null>(null);

  useEffect(() => {
    let active = true;
    setResolved(null);
    if (!url) return () => { active = false; };

    void loadTitle(url).then((title) => {
      if (active && title) setResolved({ requestUrl: url, result: title });
    });
    return () => { active = false; };
  }, [url]);

  if (!resolved || resolved.requestUrl !== url) return null;
  return (
    <a className="orf-chat-web-link-title" href={resolved.result.url} rel="noreferrer noopener" target="_blank">
      {resolved.result.title}
    </a>
  );
}
