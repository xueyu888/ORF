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

    const titleLink = titleLinkRangeFor(body, matchIndex, rawCandidate.length, href);
    if (titleLink && titleLink.labelStart >= cursor) {
      pushTextToken(tokens, body.slice(cursor, titleLink.labelStart));
      tokens.push({ type: "link", value: titleLink.label, href });
      cursor = titleLink.urlLineEnd;
      continue;
    }

    pushTextToken(tokens, body.slice(cursor, matchIndex));
    tokens.push({ type: "link", value: linkText, href });
    pushTextToken(tokens, trailingText);
    cursor = matchIndex + rawCandidate.length;
  }

  pushTextToken(tokens, body.slice(cursor));
  return tokens;
}

function titleLinkRangeFor(body: string, matchIndex: number, rawLength: number, href: string) {
  const urlLineStart = body.lastIndexOf("\n", matchIndex - 1) + 1;
  const rawEnd = matchIndex + rawLength;
  const urlLineBreak = body.indexOf("\n", rawEnd);
  const urlLineEnd = urlLineBreak === -1 ? body.length : urlLineBreak;
  if (body.slice(rawEnd, urlLineEnd).trim()) return null;

  const sameLineLabel = titleLabelRangeFor(body, urlLineStart, matchIndex);
  if (sameLineLabel && isLikelyLinkTitle(sameLineLabel.label, href)) {
    return { ...sameLineLabel, urlLineEnd };
  }

  const previousLineEnd = urlLineStart > 0 ? urlLineStart - 1 : -1;
  if (previousLineEnd < 0) return null;

  const previousLineStart = body.lastIndexOf("\n", previousLineEnd - 1) + 1;
  const previousLineLabel = titleLabelRangeFor(body, previousLineStart, previousLineEnd);

  if (!previousLineLabel || !isLikelyLinkTitle(previousLineLabel.label, href)) return null;

  return {
    ...previousLineLabel,
    urlLineEnd,
  };
}

function titleLabelRangeFor(body: string, lineStart: number, lineEnd: number) {
  const rawLabelLine = body.slice(lineStart, lineEnd);
  const label = rawLabelLine.trim();
  if (!label) return null;

  return {
    label,
    labelStart: lineStart + rawLabelLine.length - rawLabelLine.trimStart().length,
  };
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

function isLikelyLinkTitle(label: string, href: string) {
  if (label.length < 6) return false;
  if (linkCandidatePattern.test(label)) {
    linkCandidatePattern.lastIndex = 0;
    return false;
  }
  linkCandidatePattern.lastIndex = 0;

  try {
    const url = new URL(href);
    return label !== url.hostname && label !== url.toString();
  } catch {
    return true;
  }
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
