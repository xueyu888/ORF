import {
  type OrfAttachmentReference,
  type OrfMentionReference,
  isEscapedOrfMarkdownToken,
  matchOrfAttachmentMarkdownTokens,
  matchOrfMentionMarkdownTokens,
  orfMentionMarkdownTokensToPlainText,
  replaceOrfAttachmentMarkdownTokens,
  unescapeOrfMarkdownPlainText,
} from "./orfRichTextTokens";

export type OrfRichTextPlainTextOptions = {
  attachmentText?: string | ((reference: OrfAttachmentReference) => string);
  preserveWhitespace?: boolean;
};

export {
  type OrfAttachmentReference,
  type OrfMentionReference,
  type OrfRichTextTokenMatch,
  decodeOrfRichTextUserId,
  isEscapedOrfMarkdownToken,
  matchOrfAttachmentMarkdownTokens,
  matchOrfMentionMarkdownTokens,
  orfAttachmentMarkdown,
  orfMentionMarkdown,
  orfMentionMarkdownTokensToPlainText,
  orfRichTextImageAlt,
  orfRichTextMentionLabel,
  parseOrfAttachmentMarkdownToken,
  parseOrfMentionMarkdownToken,
  replaceOrfAttachmentMarkdownTokens,
  unescapeOrfMarkdownPlainText,
} from "./orfRichTextTokens";

const markdownPlainTextInlinePattern =
  /!\[([^\]\n]*)\]\([^)]+\)|(^|[^!])\[([^\]\n]+)\]\([^)]+\)|`([^`\n]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g;

function orfAttachmentMarkdownTokensToPlainText(
  markdown: string,
  replacement: (reference: OrfAttachmentReference, token: string) => string,
) {
  return replaceOrfAttachmentMarkdownTokens(markdown, replacement);
}

function stripUnescapedInlineMarkdownSyntax(markdown: string) {
  let output = "";
  let index = 0;
  markdownPlainTextInlinePattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = markdownPlainTextInlinePattern.exec(markdown)) !== null) {
    const matchIndex = match.index;
    const linkPrefix = match[2] ?? "";
    const tokenIndex = matchIndex + linkPrefix.length;
    if (isEscapedOrfMarkdownToken(markdown, tokenIndex)) continue;
    output += markdown.slice(index, matchIndex);
    output += linkPrefix;
    output += match[1] ?? match[3] ?? match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8] ?? match[9] ?? "";
    index = matchIndex + match[0].length;
  }

  return output + markdown.slice(index);
}

export function orfRichTextMarkdownToPlainText(markdown: string, options: OrfRichTextPlainTextOptions = {}) {
  const attachmentText = options.attachmentText ?? "[附件]";
  const attachmentTokenText = (reference: OrfAttachmentReference) => {
    return typeof attachmentText === "function" ? attachmentText(reference) : attachmentText;
  };
  const withoutMentions = orfMentionMarkdownTokensToPlainText(markdown);
  let plainText = orfAttachmentMarkdownTokensToPlainText(withoutMentions, attachmentTokenText)
    .replace(/\r\n?/g, "\n")
    .replace(/^```[^\n]*\n?/gm, "")
    .replace(/```/g, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "");

  const text = unescapeOrfMarkdownPlainText(stripUnescapedInlineMarkdownSyntax(plainText));
  if (options.preserveWhitespace) {
    return text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return text.replace(/[ \t\n]+/g, " ").trim();
}

export function orfRichTextHasMeaningfulContent(markdown: string) {
  return Boolean(orfAttachmentMarkdownTokensToPlainText(markdown, () => " attachment ").trim());
}

export function extractOrfMentionReferences(markdown: string): OrfMentionReference[] {
  return matchOrfMentionMarkdownTokens(markdown).map((match) => match.reference);
}
