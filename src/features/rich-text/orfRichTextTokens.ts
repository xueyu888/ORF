export type OrfAttachmentReference =
  | { alt: string; attachmentId: string; kind: "attached" }
  | { alt: string; kind: "pending"; pendingAttachmentId: string };

export type OrfMentionReference = {
  label: string;
  userId: string;
};

export type OrfRichTextTokenMatch<TReference> = {
  index: number;
  reference: TReference;
  token: string;
};

const attachmentTokenPattern = /!\[([^\]\n]*)\]\((orf-attachment|orf-pending-attachment):([A-Za-z0-9_-]+)\)/g;
const mentionTokenPattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;
const markdownPlainTextEscapePattern = /\\([\\`*_[\]()!|~#>+\-.])/g;

export function decodeOrfRichTextUserId(rawUserId: string) {
  try {
    return decodeURIComponent(rawUserId);
  } catch {
    return rawUserId;
  }
}

export function isEscapedOrfMarkdownToken(value: string, index: number) {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

export function unescapeOrfMarkdownPlainText(value: string) {
  return value.replace(markdownPlainTextEscapePattern, "$1");
}

export function orfRichTextMentionLabel(label: string) {
  return label.replace(/[\]\r\n]/g, " ").trim() || "成员";
}

export function orfRichTextImageAlt(alt: string) {
  return alt.replace(/[\]\r\n]/g, " ").trim() || "附件";
}

export function orfMentionMarkdown(reference: OrfMentionReference) {
  return `@[${orfRichTextMentionLabel(reference.label)}](orf-user:${encodeURIComponent(reference.userId)})`;
}

export function orfAttachmentMarkdown(reference: OrfAttachmentReference) {
  const alt = orfRichTextImageAlt(reference.alt);
  if (reference.kind === "pending") {
    return `![${alt}](orf-pending-attachment:${reference.pendingAttachmentId})`;
  }
  return `![${alt}](orf-attachment:${reference.attachmentId})`;
}

export function parseOrfAttachmentMarkdownToken(value: string): OrfAttachmentReference | null {
  const match = /^!\[([^\]\n]*)\]\((orf-attachment|orf-pending-attachment):([A-Za-z0-9_-]+)\)$/.exec(value.trim());
  if (!match) return null;
  const alt = orfRichTextImageAlt(match[1] ?? "");
  const id = match[3] ?? "";
  return match[2] === "orf-pending-attachment"
    ? { alt, kind: "pending", pendingAttachmentId: id }
    : { alt, attachmentId: id, kind: "attached" };
}

export function parseOrfMentionMarkdownToken(value: string): OrfMentionReference | null {
  const match = /^@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)$/.exec(value.trim());
  if (!match) return null;
  return {
    label: orfRichTextMentionLabel(match[1] ?? "成员"),
    userId: decodeOrfRichTextUserId(match[2] ?? ""),
  };
}

export function matchOrfAttachmentMarkdownTokens(markdown: string): OrfRichTextTokenMatch<OrfAttachmentReference>[] {
  attachmentTokenPattern.lastIndex = 0;
  return [...markdown.matchAll(attachmentTokenPattern)].flatMap((match) => {
    const index = match.index ?? 0;
    if (isEscapedOrfMarkdownToken(markdown, index)) return [];
    const reference = parseOrfAttachmentMarkdownToken(match[0]);
    if (!reference) return [];
    return [{ index, reference, token: match[0] }];
  });
}

export function matchOrfMentionMarkdownTokens(markdown: string): OrfRichTextTokenMatch<OrfMentionReference>[] {
  mentionTokenPattern.lastIndex = 0;
  return [...markdown.matchAll(mentionTokenPattern)].flatMap((match) => {
    const index = match.index ?? 0;
    if (isEscapedOrfMarkdownToken(markdown, index)) return [];
    const reference = parseOrfMentionMarkdownToken(match[0]);
    if (!reference) return [];
    return [{ index, reference, token: match[0] }];
  });
}

export function orfMentionMarkdownTokensToPlainText(markdown: string) {
  let output = "";
  let index = 0;

  for (const match of matchOrfMentionMarkdownTokens(markdown)) {
    output += markdown.slice(index, match.index);
    output += `@${match.reference.label}`;
    index = match.index + match.token.length;
  }

  return output + markdown.slice(index);
}

export function replaceOrfAttachmentMarkdownTokens(
  markdown: string,
  replacement: (reference: OrfAttachmentReference, token: string) => string,
) {
  let output = "";
  let index = 0;

  for (const match of matchOrfAttachmentMarkdownTokens(markdown)) {
    output += markdown.slice(index, match.index);
    output += replacement(match.reference, match.token);
    index = match.index + match.token.length;
  }

  return output + markdown.slice(index);
}
