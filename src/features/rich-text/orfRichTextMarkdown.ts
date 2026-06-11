import type { JSONContent } from "@tiptap/core";

export type OrfAttachmentReference =
  | { alt: string; attachmentId: string; kind: "attached" }
  | { alt: string; kind: "pending"; pendingAttachmentId: string };

export type OrfMentionReference = {
  label: string;
  userId: string;
};

export type OrfRichTextMarkdownParseOptions = {
  attachmentPreviewUrlForReference?: (reference: OrfAttachmentReference) => string | null | undefined;
};

export type OrfRichTextPlainTextOptions = {
  attachmentText?: string | ((reference: OrfAttachmentReference) => string);
};

export type OrfRichTextTokenMatch<TReference> = {
  index: number;
  reference: TReference;
  token: string;
};

const attachmentTokenPattern = /!\[([^\]\n]*)\]\((orf-attachment|orf-pending-attachment):([A-Za-z0-9_-]+)\)/g;
const mentionTokenPattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;
const inlineTokenPattern =
  /!\[([^\]\n]*)\]\((orf-attachment|orf-pending-attachment):([A-Za-z0-9_-]+)\)|@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)|\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+|\/(?!\/)[^)\s<]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;

export function decodeOrfRichTextUserId(rawUserId: string) {
  try {
    return decodeURIComponent(rawUserId);
  } catch {
    return rawUserId;
  }
}

export function orfRichTextMentionLabel(label: string) {
  return label.replace(/[\]\r\n]/g, " ").trim() || "成员";
}

export function orfRichTextImageAlt(alt: string) {
  return alt.replace(/[\]\r\n]/g, " ").trim() || "图片";
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
  return [...markdown.matchAll(attachmentTokenPattern)].flatMap((match) => {
    const reference = parseOrfAttachmentMarkdownToken(match[0]);
    if (!reference) return [];
    return [{ index: match.index ?? 0, reference, token: match[0] }];
  });
}

export function matchOrfMentionMarkdownTokens(markdown: string): OrfRichTextTokenMatch<OrfMentionReference>[] {
  return [...markdown.matchAll(mentionTokenPattern)].flatMap((match) => {
    const reference = parseOrfMentionMarkdownToken(match[0]);
    if (!reference) return [];
    return [{ index: match.index ?? 0, reference, token: match[0] }];
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

export function orfRichTextMarkdownToPlainText(markdown: string, options: OrfRichTextPlainTextOptions = {}) {
  const attachmentText = options.attachmentText ?? "[图片]";
  const attachmentTokenText = (token: string) => {
    const reference = parseOrfAttachmentMarkdownToken(token);
    if (!reference) return "";
    return typeof attachmentText === "function" ? attachmentText(reference) : attachmentText;
  };

  return orfMentionMarkdownTokensToPlainText(markdown)
    .replace(attachmentTokenPattern, attachmentTokenText)
    .replace(/\r\n?/g, "\n")
    .replace(/!\[([^\]\n]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
    .replace(/^```[^\n]*\n?/gm, "")
    .replace(/```/g, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t\n]+/g, " ")
    .trim();
}

export function orfRichTextHasMeaningfulContent(markdown: string) {
  return Boolean(markdown.replace(attachmentTokenPattern, " image ").trim());
}

export function orfMarkdownToTiptapDoc(
  markdown: string,
  mentionUsersById: Map<string, { name: string }> = new Map(),
  options: OrfRichTextMarkdownParseOptions = {},
): JSONContent {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const content = blocks.flatMap((block) => markdownBlockToTiptapNodes(block, mentionUsersById, options));
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

function markdownBlockToTiptapNodes(
  block: string,
  mentionUsersById: Map<string, { name: string }>,
  options: OrfRichTextMarkdownParseOptions,
): JSONContent[] {
  const lines = block.split("\n");
  const codeBlock = markdownCodeBlockToTiptapNode(lines);
  if (codeBlock) return [codeBlock];

  if (lines.length === 1) {
    const heading = markdownHeadingToTiptapNode(lines[0] ?? "", mentionUsersById);
    if (heading) return [heading];
  }

  const blockquote = markdownBlockquoteToTiptapNode(lines, mentionUsersById, options);
  if (blockquote) return [blockquote];

  const list = markdownListToTiptapNode(lines, mentionUsersById);
  if (list) return [list];

  const nodes: JSONContent[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    nodes.push({
      type: "paragraph",
      content: inlineMarkdownToTiptapContent(paragraphLines.join("\n"), mentionUsersById),
    });
    paragraphLines = [];
  };

  for (const line of lines) {
    const attachment = parseOrfAttachmentMarkdownToken(line);
    if (attachment) {
      flushParagraph();
      nodes.push(orfAttachmentReferenceToNode(attachment, options));
      continue;
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  return nodes.length > 0 ? nodes : [{ type: "paragraph" }];
}

function markdownCodeBlockToTiptapNode(lines: string[]): JSONContent | null {
  if (lines.length < 2) return null;
  const start = lines[0]?.match(/^\s{0,3}```([A-Za-z0-9_-]*)\s*$/);
  if (!start || !/^\s{0,3}```\s*$/.test(lines[lines.length - 1] ?? "")) return null;
  const language = start[1]?.trim() ?? "";
  const text = lines.slice(1, -1).join("\n");
  return {
    type: "codeBlock",
    attrs: { language: language || null },
    content: text ? [{ type: "text", text }] : undefined,
  };
}

function markdownHeadingToTiptapNode(line: string, mentionUsersById: Map<string, { name: string }>): JSONContent | null {
  const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!heading) return null;
  return {
    type: "heading",
    attrs: { level: Math.min(3, heading[1]?.length ?? 3) },
    content: inlineMarkdownToTiptapContent(heading[2] ?? "", mentionUsersById),
  };
}

function markdownBlockquoteToTiptapNode(
  lines: string[],
  mentionUsersById: Map<string, { name: string }>,
  options: OrfRichTextMarkdownParseOptions,
): JSONContent | null {
  if (lines.length === 0 || !lines.every((line) => /^\s{0,3}>\s?/.test(line))) return null;
  const innerBlock = lines.map((line) => line.replace(/^\s{0,3}>\s?/, "")).join("\n");
  return {
    type: "blockquote",
    content: markdownBlockToTiptapNodes(innerBlock, mentionUsersById, options),
  };
}

function markdownListToTiptapNode(lines: string[], mentionUsersById: Map<string, { name: string }>): JSONContent | null {
  if (lines.length === 0) return null;
  const unorderedItems = lines.map((line) => line.match(/^\s*[-*+]\s+(.+)$/));
  if (unorderedItems.every(Boolean)) {
    return {
      type: "bulletList",
      content: unorderedItems.map((item) => markdownListItemToTiptapNode(item?.[1] ?? "", mentionUsersById)),
    };
  }

  const orderedItems = lines.map((line) => line.match(/^\s*\d+[.)]\s+(.+)$/));
  if (orderedItems.every(Boolean)) {
    return {
      type: "orderedList",
      content: orderedItems.map((item) => markdownListItemToTiptapNode(item?.[1] ?? "", mentionUsersById)),
    };
  }

  return null;
}

function markdownListItemToTiptapNode(value: string, mentionUsersById: Map<string, { name: string }>): JSONContent {
  return {
    type: "listItem",
    content: [{ type: "paragraph", content: inlineMarkdownToTiptapContent(value, mentionUsersById) }],
  };
}

function inlineMarkdownToTiptapContent(value: string, mentionUsersById: Map<string, { name: string }>, depth = 0) {
  if (depth > 8) return value ? textWithMarksAndHardBreaks(value) : undefined;

  const content: JSONContent[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(inlineTokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      appendTextWithHardBreaks(content, value.slice(lastIndex, index));
    }

    if (match[2] === "orf-attachment" || match[2] === "orf-pending-attachment") {
      appendTextWithHardBreaks(content, token);
    } else if (match[5]) {
      const rawUserId = match[5] ?? "";
      const userId = decodeOrfRichTextUserId(rawUserId);
      content.push({
        type: "orfMention",
        attrs: {
          id: userId,
          label: orfRichTextMentionLabel(mentionUsersById.get(userId)?.name ?? match[4] ?? "成员"),
        },
      });
    } else if (match[6] && match[7]) {
      appendInlineMarkdownWithMark(content, match[6], mentionUsersById, { type: "link", attrs: { href: match[7] } }, depth + 1);
    } else if (match[8]) {
      content.push({ type: "text", text: match[8], marks: [{ type: "code" }] });
    } else if (match[9] || match[10]) {
      appendInlineMarkdownWithMark(content, match[9] ?? match[10] ?? "", mentionUsersById, { type: "bold" }, depth + 1);
    } else if (match[11]) {
      appendInlineMarkdownWithMark(content, match[11], mentionUsersById, { type: "strike" }, depth + 1);
    } else if (match[12] || match[13]) {
      appendInlineMarkdownWithMark(content, match[12] ?? match[13] ?? "", mentionUsersById, { type: "italic" }, depth + 1);
    } else {
      appendTextWithHardBreaks(content, token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    appendTextWithHardBreaks(content, value.slice(lastIndex));
  }

  return content.length > 0 ? content : undefined;
}

function textWithMarksAndHardBreaks(value: string, marks: NonNullable<JSONContent["marks"]> = []) {
  const content: JSONContent[] = [];
  appendTextWithHardBreaks(content, value, marks);
  return content;
}

function appendInlineMarkdownWithMark(
  content: JSONContent[],
  value: string,
  mentionUsersById: Map<string, { name: string }>,
  mark: NonNullable<JSONContent["marks"]>[number],
  depth: number,
) {
  const nodes = inlineMarkdownToTiptapContent(value, mentionUsersById, depth) ?? [];
  for (const node of nodes) {
    content.push(addMarkToInlineNode(node, mark));
  }
}

function addMarkToInlineNode(node: JSONContent, mark: NonNullable<JSONContent["marks"]>[number]): JSONContent {
  if (node.type !== "text") return node;
  const marks = node.marks ?? [];
  if (marks.some((item) => item.type === mark.type)) return node;
  return { ...node, marks: [...marks, mark] };
}

function appendTextWithHardBreaks(content: JSONContent[], value: string, marks: NonNullable<JSONContent["marks"]> = []) {
  const parts = value.split("\n");
  parts.forEach((part, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (part) content.push(marks.length > 0 ? { type: "text", text: part, marks } : { type: "text", text: part });
  });
}

function orfAttachmentReferenceToNode(reference: OrfAttachmentReference, options: OrfRichTextMarkdownParseOptions): JSONContent {
  const src = options.attachmentPreviewUrlForReference?.(reference) ?? null;
  return {
    type: "orfAttachmentImage",
    attrs:
      reference.kind === "pending"
        ? { alt: reference.alt, pendingAttachmentId: reference.pendingAttachmentId, src }
        : { alt: reference.alt, attachmentId: reference.attachmentId, src },
  };
}

export function tiptapDocToOrfMarkdown(doc: JSONContent) {
  const blocks = (doc.content ?? []).map(serializeBlockNode).filter((block) => block.length > 0);
  return blocks.join("\n\n").trim();
}

function serializeBlockNode(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return serializeInlineContent(node.content ?? []);
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 3), 1), 6);
      const text = serializeInlineContent(node.content ?? []);
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "blockquote":
      return serializeChildren(node).split("\n").map((line) => `> ${line}`).join("\n");
    case "bulletList":
      return serializeList(node, false);
    case "orderedList":
      return serializeList(node, true);
    case "listItem":
      return serializeChildren(node);
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
      return `\`\`\`${language}\n${plainTextContent(node)}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "orfAttachmentImage":
      return orfAttachmentMarkdown(nodeToAttachmentReference(node));
    default:
      return serializeChildren(node);
  }
}

function serializeList(node: JSONContent, ordered: boolean) {
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      return serializeBlockNode(item)
        .split("\n")
        .map((line, lineIndex) => (lineIndex === 0 ? `${marker} ${line}` : `  ${line}`))
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function serializeChildren(node: JSONContent) {
  return (node.content ?? []).map(serializeBlockNode).filter(Boolean).join("\n");
}

function serializeInlineContent(content: JSONContent[]) {
  return content.map(serializeInlineNode).join("");
}

function serializeInlineNode(node: JSONContent): string {
  if (node.type === "text") return serializeMarkedText(node.text ?? "", node.marks ?? []);
  if (node.type === "hardBreak") return "\n";
  if (node.type === "orfMention") {
    return orfMentionMarkdown({
      label: typeof node.attrs?.label === "string" ? node.attrs.label : "成员",
      userId: typeof node.attrs?.id === "string" ? node.attrs.id : "",
    });
  }
  if (node.type === "orfAttachmentImage") return orfAttachmentMarkdown(nodeToAttachmentReference(node));
  return serializeInlineContent(node.content ?? []);
}

function serializeMarkedText(text: string, marks: NonNullable<JSONContent["marks"]>) {
  let value = text;
  for (const mark of marks) {
    if (mark.type === "code") value = `\`${value.replace(/`/g, "'")}\``;
  }
  for (const mark of marks) {
    if (mark.type === "bold") value = `**${value}**`;
    if (mark.type === "italic") value = `_${value}_`;
    if (mark.type === "strike") value = `~~${value}~~`;
    if (mark.type === "link" && typeof mark.attrs?.href === "string") value = `[${value}](${mark.attrs.href})`;
  }
  return value;
}

function plainTextContent(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainTextContent).join("");
}

function nodeToAttachmentReference(node: JSONContent): OrfAttachmentReference {
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "图片";
  const pendingAttachmentId = typeof node.attrs?.pendingAttachmentId === "string" ? node.attrs.pendingAttachmentId : "";
  if (pendingAttachmentId) return { alt, kind: "pending", pendingAttachmentId };
  return {
    alt,
    attachmentId: typeof node.attrs?.attachmentId === "string" ? node.attrs.attachmentId : "",
    kind: "attached",
  };
}

export function extractOrfMentionReferences(markdown: string): OrfMentionReference[] {
  return matchOrfMentionMarkdownTokens(markdown).map((match) => match.reference);
}
