export type ChatWebLinkTitle = {
  title: string;
  url: string;
};

const webLinkPattern = /https?:\/\/[^\s<>"']+/giu;
const trailingPunctuationPattern = /[)\]}>.,!?;:，。！？；：]+$/u;

export function firstWebLinkInChatMessage(body: string): string | null {
  for (const match of body.matchAll(webLinkPattern)) {
    const candidate = match[0].replace(trailingPunctuationPattern, "");
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch {
      // Continue to the next URL-like token in the message.
    }
  }
  return null;
}
