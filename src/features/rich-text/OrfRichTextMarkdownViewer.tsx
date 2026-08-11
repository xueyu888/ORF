import { useState, type ReactNode } from "react";
import {
  type OrfAttachmentReference,
  type OrfMentionReference,
  isEscapedOrfMarkdownToken,
  parseOrfAttachmentMarkdownToken,
  parseOrfMentionMarkdownToken,
  unescapeOrfMarkdownPlainText,
} from "./orfRichTextMarkdown";

type MarkdownListItem = {
  checked: boolean | null;
  children: MarkdownList[];
  continuationLines: string[];
  text: string;
};
type MarkdownList = {
  items: MarkdownListItem[];
  ordered: boolean;
  start?: number;
};
type ParsedMarkdownListText = Pick<MarkdownListItem, "checked" | "text">;
type MarkdownTableAlignment = "center" | "left" | "right" | null;
type MarkdownTable = {
  alignments: MarkdownTableAlignment[];
  headers: string[];
  rows: string[][];
};

type MarkdownBlock =
  | { kind: "attachment"; key: string; reference: OrfAttachmentReference; token: string }
  | { kind: "code"; content: string; key: string; language: string | null }
  | { kind: "divider"; key: string }
  | { kind: "heading"; key: string; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "list"; key: string; list: MarkdownList }
  | { kind: "paragraph"; lines: string[]; key: string }
  | { kind: "quote"; lines: string[]; key: string }
  | { kind: "table"; key: string; table: MarkdownTable };

const autolinkCandidatePattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/i;
const trailingAutolinkPunctuation = ".,;:!?，。；：！？";
const closingAutolinkPairs: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

export type OrfRichTextViewerUser = {
  email?: string | null;
  name: string;
};

export type OrfRichTextResolvedLink = {
  href: string;
  label: ReactNode;
};

export type OrfRichTextAttachmentPlacement = "block" | "inline";

export type OrfRichTextMarkdownViewerProps = {
  body: string;
  compact?: boolean;
  enableTitleAutolinks?: boolean;
  renderAttachment?: (
    reference: OrfAttachmentReference,
    key: string,
    token: string,
    placement: OrfRichTextAttachmentPlacement,
  ) => ReactNode;
  renderLink?: (href: string, children: ReactNode, key: string) => ReactNode;
  renderMention?: (reference: OrfMentionReference, key: string) => ReactNode;
  renderPlainText?: (text: string, keyPrefix: string) => ReactNode[];
  resolveLink?: (href: string, label: ReactNode) => OrfRichTextResolvedLink | null;
  usersById?: ReadonlyMap<string, OrfRichTextViewerUser>;
};

const markdownClassNamePrefix = "orf-rich-text-markdown";

function isFenceLine(line: string) {
  return line.trimStart().startsWith("```");
}

function parseFenceLanguage(line: string) {
  const language = line.trimStart().slice(3).trim().split(/\s+/)[0]?.trim();
  return language ? language.slice(0, 24) : null;
}

function parseHeading(line: string) {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
    text: match[2] ?? "",
  };
}

function isDividerLine(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function parseTaskListText(text: string): ParsedMarkdownListText {
  const task = text.match(/^\[( |x|X)\]\s+(.+)$/);
  if (!task) return { checked: null, text };
  return { checked: (task[1] ?? " ").toLowerCase() === "x", text: task[2] ?? "" };
}

function leadingIndentColumns(line: string) {
  let columns = 0;
  for (const character of line) {
    if (character === " ") {
      columns += 1;
      continue;
    }
    if (character === "\t") {
      columns += 4;
      continue;
    }
    break;
  }
  return columns;
}

function stripContinuationIndent(line: string, parentIndent: number) {
  const normalized = line.replace(/\t/g, "    ");
  return normalized.slice(Math.min(normalized.length - normalized.trimStart().length, parentIndent + 4)).trimEnd();
}

function parseListItem(line: string) {
  const indent = leadingIndentColumns(line);
  const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
  if (unordered) return { indent, ordered: false, start: undefined, ...parseTaskListText(unordered[1] ?? "") };

  const parenthesized = line.match(/^\s*[（(](\d{1,9})[）)]\s+(.+)$/);
  if (parenthesized) {
    return { indent, ordered: true, start: Number(parenthesized[1]), ...parseTaskListText(parenthesized[2] ?? "") };
  }

  const ordered = line.match(/^\s*(\d{1,9})[.)、．。]\s+(.+)$/);
  if (ordered) return { indent, ordered: true, start: Number(ordered[1]), ...parseTaskListText(ordered[2] ?? "") };
  return null;
}

function parseListBlock(lines: string[], startIndex: number): { list: MarkdownList; nextIndex: number } | null {
  const first = parseListItem(lines[startIndex] ?? "");
  if (!first) return null;

  const indent = first.indent;
  const ordered = first.ordered;
  const items: MarkdownListItem[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = parseListItem(lines[index] ?? "");
    if (!current || current.indent !== indent || current.ordered !== ordered) break;

    const item: MarkdownListItem = {
      checked: current.checked,
      children: [],
      continuationLines: [],
      text: current.text,
    };
    index += 1;

    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (!line.trim()) break;

      const nested = parseListItem(line);
      if (nested) {
        if (nested.indent > indent) {
          const nestedBlock = parseListBlock(lines, index);
          if (!nestedBlock) break;
          item.children.push(nestedBlock.list);
          index = nestedBlock.nextIndex;
          continue;
        }
        break;
      }

      if (leadingIndentColumns(line) > indent) {
        item.continuationLines.push(stripContinuationIndent(line, indent));
        index += 1;
        continue;
      }

      break;
    }

    items.push(item);
  }

  return {
    list: {
      items,
      ordered,
      start: ordered ? first.start : undefined,
    },
    nextIndex: index,
  };
}

function parseIndentedCodeLine(line: string) {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  return null;
}

function splitMarkdownTableRow(line: string) {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function tableAlignmentForDelimiter(cell: string): MarkdownTableAlignment | undefined {
  const delimiter = cell.trim();
  if (!/^:?-{3,}:?$/.test(delimiter)) return undefined;
  if (delimiter.startsWith(":") && delimiter.endsWith(":")) return "center";
  if (delimiter.endsWith(":")) return "right";
  if (delimiter.startsWith(":")) return "left";
  return null;
}

function parseMarkdownTable(lines: string[], startIndex: number): { nextIndex: number; table: MarkdownTable } | null {
  const headerLine = lines[startIndex] ?? "";
  const delimiterLine = lines[startIndex + 1] ?? "";
  if (!headerLine.includes("|") || !delimiterLine.includes("|")) return null;
  const headers = splitMarkdownTableRow(headerLine);
  const delimiterCells = splitMarkdownTableRow(delimiterLine);
  if (headers.length < 2 || delimiterCells.length !== headers.length) return null;
  const alignments = delimiterCells.map(tableAlignmentForDelimiter);
  if (alignments.some((alignment) => alignment === undefined)) return null;

  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim() || !line.includes("|")) break;
    const cells = splitMarkdownTableRow(line);
    rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
    index += 1;
  }

  return {
    nextIndex: index,
    table: {
      alignments: alignments as MarkdownTableAlignment[],
      headers,
      rows,
    },
  };
}

function parseMarkdownBlocks(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  let keyIndex = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const attachment = parseOrfAttachmentMarkdownToken(line);
    if (attachment) {
      blocks.push({ kind: "attachment", key: `attachment:${keyIndex}`, reference: attachment, token: line.trim() });
      keyIndex += 1;
      index += 1;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      blocks.push({ kind: "heading", key: `heading:${keyIndex}`, level: heading.level, text: heading.text });
      keyIndex += 1;
      index += 1;
      continue;
    }

    if (isDividerLine(line)) {
      blocks.push({ kind: "divider", key: `divider:${keyIndex}` });
      keyIndex += 1;
      index += 1;
      continue;
    }

    const list = parseListBlock(lines, index);
    if (list) {
      blocks.push({ kind: "list", key: `list:${keyIndex}`, list: list.list });
      keyIndex += 1;
      index = list.nextIndex;
      continue;
    }

    const indentedCodeLine = parseIndentedCodeLine(line);
    if (indentedCodeLine !== null) {
      const content = [indentedCodeLine];
      index += 1;
      while (index < lines.length) {
        const nextCodeLine = parseIndentedCodeLine(lines[index] ?? "");
        if (nextCodeLine === null) break;
        content.push(nextCodeLine);
        index += 1;
      }
      blocks.push({ kind: "code", content: content.join("\n"), key: `code:${keyIndex}`, language: null });
      keyIndex += 1;
      continue;
    }

    if (isFenceLine(line)) {
      const content: string[] = [];
      const language = parseFenceLanguage(line);
      index += 1;
      while (index < lines.length && !isFenceLine(lines[index] ?? "")) {
        content.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", content: content.join("\n"), key: `code:${keyIndex}`, language });
      keyIndex += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trimStart().startsWith(">")) {
        quoteLines.push((lines[index] ?? "").trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines, key: `quote:${keyIndex}` });
      keyIndex += 1;
      continue;
    }

    const table = parseMarkdownTable(lines, index);
    if (table) {
      blocks.push({ kind: "table", key: `table:${keyIndex}`, table: table.table });
      keyIndex += 1;
      index = table.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (
        !nextLine.trim() ||
        parseOrfAttachmentMarkdownToken(nextLine) ||
        isFenceLine(nextLine) ||
        nextLine.trimStart().startsWith(">") ||
        parseListBlock(lines, index) ||
        parseHeading(nextLine) ||
        isDividerLine(nextLine) ||
        parseMarkdownTable(lines, index) ||
        parseIndentedCodeLine(nextLine) !== null
      ) break;
      paragraphLines.push(nextLine);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraphLines, key: `paragraph:${keyIndex}` });
    keyIndex += 1;
  }

  return blocks;
}

function splitAutolinkTrailingText(value: string) {
  let end = value.length;
  while (end > 0) {
    const character = value[end - 1] ?? "";
    const url = value.slice(0, end);
    if (trailingAutolinkPunctuation.includes(character) || character === ">") {
      end -= 1;
      continue;
    }
    const openingPair = closingAutolinkPairs[character];
    if (openingPair && countChar(url, character) > countChar(url, openingPair)) {
      end -= 1;
      continue;
    }
    break;
  }
  return {
    trailingText: value.slice(end),
    url: value.slice(0, end),
  };
}

function countChar(value: string, target: string) {
  let count = 0;
  for (const char of value) {
    if (char === target) count += 1;
  }
  return count;
}

function hrefForAutolink(value: string) {
  if (value.startsWith("/")) return value;
  const href = value.toLowerCase().startsWith("www.") ? `https://${value}` : value;

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyAutolinkTitle(label: string, href: string) {
  const trimmed = label.trim();
  if (trimmed.length < 3) return false;
  if (autolinkCandidatePattern.test(trimmed)) return false;

  try {
    const url = new URL(href);
    return trimmed !== url.hostname && trimmed !== url.toString();
  } catch {
    return true;
  }
}

function bareAutolinkHrefFor(line: string) {
  const trimmed = line.trim();
  const { trailingText, url } = splitAutolinkTrailingText(trimmed);
  if (trailingText || url !== trimmed) return null;
  return hrefForAutolink(url);
}

function paragraphTitleLinkFor(lines: string[]) {
  if (lines.length === 2) {
    const href = bareAutolinkHrefFor(lines[1] ?? "");
    const label = (lines[0] ?? "").trim();
    if (href && isLikelyAutolinkTitle(label, href)) return { href, label };
  }

  if (lines.length !== 1) return null;
  const line = lines[0] ?? "";
  const match = line.match(/^(.*?)\s+((?:https?:\/\/|www\.)[^\s<>"']+)\s*$/i);
  if (!match) return null;
  const label = (match[1] ?? "").trim();
  const { trailingText, url } = splitAutolinkTrailingText(match[2] ?? "");
  if (trailingText) return null;
  const href = hrefForAutolink(url);
  if (!href || !isLikelyAutolinkTitle(label, href)) return null;
  return { href, label };
}

function defaultRenderPlainText(text: string, keyPrefix: string) {
  return [<span key={`${keyPrefix}:text`}>{text}</span>];
}

function defaultRenderLink(href: string, children: ReactNode, key: string) {
  return (
    <a href={href} key={key} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function defaultRenderMention(reference: OrfMentionReference, key: string, usersById: ReadonlyMap<string, OrfRichTextViewerUser>) {
  const user = usersById.get(reference.userId);
  const label = user?.name ?? reference.label;
  return (
    <span className="orf-rich-text-viewer-mention" key={key} title={user?.email || label}>
      @{label}
    </span>
  );
}

function defaultRenderAttachment(reference: OrfAttachmentReference, key: string) {
  return (
    <span key={key} className="orf-rich-text-viewer-attachment-missing">
      附件不可用：{reference.alt}
    </span>
  );
}

type InlineRenderContext = Required<Pick<OrfRichTextMarkdownViewerProps, "renderPlainText">> & {
  renderAttachment: NonNullable<OrfRichTextMarkdownViewerProps["renderAttachment"]>;
  renderLink: NonNullable<OrfRichTextMarkdownViewerProps["renderLink"]>;
  renderMention: NonNullable<OrfRichTextMarkdownViewerProps["renderMention"]>;
  resolveLink?: OrfRichTextMarkdownViewerProps["resolveLink"];
  usersById: ReadonlyMap<string, OrfRichTextViewerUser>;
};

function resolvedLinkFor(
  href: string,
  label: ReactNode,
  resolveLink: OrfRichTextMarkdownViewerProps["resolveLink"],
): OrfRichTextResolvedLink {
  return resolveLink?.(href, label) ?? { href, label };
}

function renderInlineFragments(body: string, context: InlineRenderContext, keyPrefix: string, depth = 0): ReactNode[] {
  if (depth > 8) return context.renderPlainText(unescapeOrfMarkdownPlainText(body), `${keyPrefix}:depth`);

  const nodes: ReactNode[] = [];
  const pattern = /!\[([^\]\n]*)\]\((orf-attachment|orf-pending-attachment):([A-Za-z0-9_-]+)\)|@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)|\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+|\/(?!\/)[^)\s<]+)\)|(https?:\/\/[^\s<]+|www\.[^\s<]+|\/feedback\/[^\s<]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    if (isEscapedOrfMarkdownToken(body, match.index)) continue;
    if (match.index > index) {
      nodes.push(...context.renderPlainText(unescapeOrfMarkdownPlainText(body.slice(index, match.index)), `${keyPrefix}:plain:${index}`));
    }
    if (match[2] === "orf-attachment" || match[2] === "orf-pending-attachment") {
      const reference = parseOrfAttachmentMarkdownToken(match[0]);
      nodes.push(reference ? context.renderAttachment(reference, `${keyPrefix}:attachment:${match.index}`, match[0], "inline") : match[0]);
    } else if (match[5]) {
      const reference = parseOrfMentionMarkdownToken(match[0]);
      nodes.push(reference ? context.renderMention(reference, `${keyPrefix}:mention:${match.index}`) : match[0]);
    } else if (match[6] && match[7]) {
      const children = renderInlineFragments(match[6], context, `${keyPrefix}:md-link-label:${match.index}`, depth + 1);
      const link = resolvedLinkFor(match[7], children, context.resolveLink);
      nodes.push(context.renderLink(link.href, link.label, `${keyPrefix}:md-link:${match.index}`));
    } else if (match[8]) {
      const { trailingText, url } = splitAutolinkTrailingText(match[8]);
      const href = hrefForAutolink(url) ?? url;
      const link = resolvedLinkFor(href, url, context.resolveLink);
      nodes.push(context.renderLink(link.href, link.label, `${keyPrefix}:link:${match.index}`));
      if (trailingText) nodes.push(...context.renderPlainText(trailingText, `${keyPrefix}:link-trailing:${match.index}`));
    } else if (match[9]) {
      nodes.push(<code key={`${keyPrefix}:code:${match.index}`}>{match[9]}</code>);
    } else if (match[10] || match[11]) {
      const value = match[10] ?? match[11] ?? "";
      nodes.push(<strong key={`${keyPrefix}:bold:${match.index}`}>{renderInlineFragments(value, context, `${keyPrefix}:bold-inner:${match.index}`, depth + 1)}</strong>);
    } else if (match[12]) {
      nodes.push(<del key={`${keyPrefix}:strike:${match.index}`}>{renderInlineFragments(match[12], context, `${keyPrefix}:strike-inner:${match.index}`, depth + 1)}</del>);
    } else if (match[13] || match[14]) {
      const value = match[13] ?? match[14] ?? "";
      nodes.push(<em key={`${keyPrefix}:italic:${match.index}`}>{renderInlineFragments(value, context, `${keyPrefix}:italic-inner:${match.index}`, depth + 1)}</em>);
    }
    index = pattern.lastIndex;
  }

  if (index < body.length) {
    nodes.push(...context.renderPlainText(unescapeOrfMarkdownPlainText(body.slice(index)), `${keyPrefix}:plain:${index}`));
  }
  return nodes;
}

function renderLineBreakJoined(lines: string[], context: InlineRenderContext, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  lines.forEach((line, lineIndex) => {
    nodes.push(...renderInlineFragments(line, context, `${keyPrefix}:${lineIndex}`));
    if (lineIndex < lines.length - 1) nodes.push(<br key={`${keyPrefix}:br:${lineIndex}`} />);
  });
  return nodes;
}

function MarkdownCodeBlock({
  compact,
  content,
  language,
}: {
  compact: boolean;
  content: string;
  language: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <pre className={`${markdownClassNamePrefix}-code-block`}>
      {(language || !compact) && (
        <span className={`${markdownClassNamePrefix}-code-header`}>
          <small>{language ?? "code"}</small>
          {!compact && <button type="button" onClick={copyCode}>{copied ? "已复制" : "复制"}</button>}
        </span>
      )}
      <code>{content || " "}</code>
    </pre>
  );
}

function MarkdownListBlock({
  context,
  list,
  nodeKey,
}: {
  context: InlineRenderContext;
  list: MarkdownList;
  nodeKey: string;
}) {
  const ListTag = list.ordered ? "ol" : "ul";
  return (
    <ListTag className={`${markdownClassNamePrefix}-list`} start={list.start && list.start !== 1 ? list.start : undefined}>
      {list.items.map((item, index) => (
        <li
          className={item.checked === null ? undefined : `${markdownClassNamePrefix}-task-item`}
          key={`${nodeKey}:item:${index}`}
        >
          {item.checked !== null && <input checked={item.checked} readOnly type="checkbox" />}
          {renderInlineFragments(item.text, context, `${nodeKey}:item:${index}`)}
          {item.continuationLines.length > 0 && (
            <span className={`${markdownClassNamePrefix}-list-continuation`}>
              {renderLineBreakJoined(item.continuationLines, context, `${nodeKey}:item:${index}:continuation`)}
            </span>
          )}
          {item.children.map((childList, childIndex) => (
            <MarkdownListBlock
              context={context}
              key={`${nodeKey}:item:${index}:child:${childIndex}`}
              list={childList}
              nodeKey={`${nodeKey}:item:${index}:child:${childIndex}`}
            />
          ))}
        </li>
      ))}
    </ListTag>
  );
}

export function OrfRichTextMarkdownViewer({
  body,
  compact = false,
  enableTitleAutolinks = false,
  renderAttachment,
  renderLink = defaultRenderLink,
  renderMention,
  renderPlainText = defaultRenderPlainText,
  resolveLink,
  usersById = new Map(),
}: OrfRichTextMarkdownViewerProps) {
  const blocks = parseMarkdownBlocks(body);
  if (blocks.length === 0) return null;

  const context: InlineRenderContext = {
    renderAttachment: renderAttachment ?? defaultRenderAttachment,
    renderLink,
    renderMention: renderMention ?? ((reference, key) => defaultRenderMention(reference, key, usersById)),
    renderPlainText,
    resolveLink,
    usersById,
  };

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "attachment") {
          return context.renderAttachment(block.reference, block.key, block.token, "block");
        }
        if (block.kind === "code") {
          return <MarkdownCodeBlock compact={compact} content={block.content} key={block.key} language={block.language} />;
        }
        if (block.kind === "heading") {
          const Tag = `h${Math.min(compact ? 4 : block.level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          const headingClassName = [
            `${markdownClassNamePrefix}-heading`,
            `${markdownClassNamePrefix}-heading-${block.level}`,
            compact ? `${markdownClassNamePrefix}-heading-compact` : null,
          ].filter(Boolean).join(" ");
          return (
            <Tag className={headingClassName} key={block.key}>
              {renderInlineFragments(block.text, context, block.key)}
            </Tag>
          );
        }
        if (block.kind === "divider") {
          return <hr className={`${markdownClassNamePrefix}-divider`} key={block.key} />;
        }
        if (block.kind === "quote") {
          return (
            <blockquote className={`${markdownClassNamePrefix}-quote`} key={block.key}>
              {renderLineBreakJoined(block.lines, context, block.key)}
            </blockquote>
          );
        }
        if (block.kind === "list") {
          return <MarkdownListBlock context={context} key={block.key} list={block.list} nodeKey={block.key} />;
        }
        if (block.kind === "table") {
          return (
            <div className={`${markdownClassNamePrefix}-table-wrap`} key={block.key}>
              <table className={`${markdownClassNamePrefix}-table`}>
                <thead>
                  <tr>
                    {block.table.headers.map((header, index) => (
                      <th align={block.table.alignments[index] ?? undefined} key={`${block.key}:header:${index}`}>
                        {renderInlineFragments(header, context, `${block.key}:header:${index}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.table.rows.map((row, rowIndex) => (
                    <tr key={`${block.key}:row:${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td align={block.table.alignments[cellIndex] ?? undefined} key={`${block.key}:cell:${rowIndex}:${cellIndex}`}>
                          {renderInlineFragments(cell, context, `${block.key}:cell:${rowIndex}:${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (enableTitleAutolinks && block.kind === "paragraph") {
          const titleLink = paragraphTitleLinkFor(block.lines);
          if (titleLink) {
            const link = resolvedLinkFor(titleLink.href, renderInlineFragments(titleLink.label, context, `${block.key}:title-link-label`), context.resolveLink);
            return (
              <p className={`${markdownClassNamePrefix}-paragraph`} key={block.key}>
                {context.renderLink(link.href, link.label, `${block.key}:title-link`)}
              </p>
            );
          }
        }
        return (
          <p className={`${markdownClassNamePrefix}-paragraph`} key={block.key}>
            {renderLineBreakJoined(block.lines, context, block.key)}
          </p>
        );
      })}
    </>
  );
}
