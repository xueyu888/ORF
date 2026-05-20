export type CommentBodyToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const linkCandidatePattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const trailingPunctuation = ".,;:!?，。；：！？";
const closingPairs: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

export function parseCommentBodyLinks(body: string): CommentBodyToken[] {
  const tokens: CommentBodyToken[] = [];
  let cursor = 0;

  for (const match of body.matchAll(linkCandidatePattern)) {
    const rawCandidate = match[0];
    const matchIndex = match.index ?? 0;
    const { linkText, trailingText } = splitTrailingLinkText(rawCandidate);
    const href = linkHrefFor(linkText);

    if (!href) continue;

    pushTextToken(tokens, body.slice(cursor, matchIndex));
    tokens.push({ type: "link", value: linkText, href });
    pushTextToken(tokens, trailingText);
    cursor = matchIndex + rawCandidate.length;
  }

  pushTextToken(tokens, body.slice(cursor));
  return tokens;
}

function splitTrailingLinkText(candidate: string) {
  let linkText = candidate;
  let trailingText = "";

  while (linkText.length > 0) {
    const last = linkText.at(-1) ?? "";
    if (trailingPunctuation.includes(last) || last === ">") {
      trailingText = last + trailingText;
      linkText = linkText.slice(0, -1);
      continue;
    }

    const openingPair = closingPairs[last];
    if (openingPair && countChar(linkText, last) > countChar(linkText, openingPair)) {
      trailingText = last + trailingText;
      linkText = linkText.slice(0, -1);
      continue;
    }

    break;
  }

  return { linkText, trailingText };
}

function linkHrefFor(value: string) {
  const href = value.toLowerCase().startsWith("www.") ? `https://${value}` : value;

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pushTextToken(tokens: CommentBodyToken[], value: string) {
  if (!value) return;
  const previous = tokens.at(-1);
  if (previous?.type === "text") {
    previous.value += value;
    return;
  }
  tokens.push({ type: "text", value });
}

function countChar(value: string, target: string) {
  let count = 0;
  for (const char of value) {
    if (char === target) count += 1;
  }
  return count;
}
