export type FeedbackTextToken =
  | { type: "text"; text: string }
  | { type: "internalLink"; href: string; text: string }
  | { type: "externalLink"; href: string; text: string };

const linkPattern = /https?:\/\/[^\s<>()]+|\/(?!\/)[^\s<>()]+/g;
const trailingPunctuationPattern = /[.,;:!?，。；：！？）\]\}]+$/;

export function parseFeedbackTextLinks(text: string): FeedbackTextToken[] {
  const tokens: FeedbackTextToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(linkPattern)) {
    const rawValue = match[0] ?? "";
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ type: "text", text: text.slice(cursor, start) });
    }

    const trailing = rawValue.match(trailingPunctuationPattern)?.[0] ?? "";
    const href = trailing ? rawValue.slice(0, -trailing.length) : rawValue;
    if (href.startsWith("/")) {
      tokens.push({ type: "internalLink", href, text: href });
    } else {
      tokens.push({ type: "externalLink", href, text: href });
    }
    if (trailing) {
      tokens.push({ type: "text", text: trailing });
    }

    cursor = start + rawValue.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", text: text.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", text }];
}
