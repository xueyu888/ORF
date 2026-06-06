import { useState, type ReactNode } from "react";
import type { ChatUser } from "../../types/orf";

type MarkdownListItem = { checked: boolean | null; text: string };

type MarkdownBlock =
  | { kind: "code"; content: string; key: string; language: string | null }
  | { kind: "divider"; key: string }
  | { kind: "heading"; key: string; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "list"; items: MarkdownListItem[]; key: string; ordered: boolean }
  | { kind: "paragraph"; lines: string[]; key: string }
  | { kind: "quote"; lines: string[]; key: string };

type ChatMarkdownProps = {
  body: string;
  compact?: boolean;
  usersById: Map<string, ChatUser>;
};

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

function parseTaskListText(text: string): MarkdownListItem {
  const task = text.match(/^\[( |x|X)\]\s+(.+)$/);
  if (!task) return { checked: null, text };
  return { checked: (task[1] ?? " ").toLowerCase() === "x", text: task[2] ?? "" };
}

function parseListItem(line: string) {
  const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
  if (unordered) return { ordered: false, ...parseTaskListText(unordered[1] ?? "") };
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, ...parseTaskListText(ordered[1] ?? "") };
  return null;
}

function parseIndentedCodeLine(line: string) {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  return null;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

    const listItem = parseListItem(line);
    if (listItem) {
      const ordered = listItem.ordered;
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const nextItem = parseListItem(lines[index] ?? "");
        if (!nextItem || nextItem.ordered !== ordered) break;
        items.push({ checked: nextItem.checked, text: nextItem.text });
        index += 1;
      }
      blocks.push({ kind: "list", items, key: `list:${keyIndex}`, ordered });
      keyIndex += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (
        !nextLine.trim() ||
        isFenceLine(nextLine) ||
        nextLine.trimStart().startsWith(">") ||
        parseListItem(nextLine) ||
        parseHeading(nextLine) ||
        isDividerLine(nextLine) ||
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

function renderLineBreakJoined(lines: string[], usersById: Map<string, ChatUser>, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  lines.forEach((line, lineIndex) => {
    nodes.push(...renderInlineFragments(line, usersById, `${keyPrefix}:${lineIndex}`));
    if (lineIndex < lines.length - 1) nodes.push(<br key={`${keyPrefix}:br:${lineIndex}`} />);
  });
  return nodes;
}

function renderInlineFragments(body: string, usersById: Map<string, ChatUser>, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const pattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)|\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+)\)|(https?:\/\/[^\s<]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > index) nodes.push(<span key={`${keyPrefix}:text:${index}`}>{body.slice(index, match.index)}</span>);
    if (match[2]) {
      const userId = safeDecodeURIComponent(match[2]);
      const user = usersById.get(userId);
      nodes.push(
        <span className="orf-chat-mention-token" key={`${keyPrefix}:mention:${match.index}`} title={user?.email || user?.name || match[1]}>
          @{user?.name ?? match[1]}
        </span>,
      );
    } else if (match[4]) {
      nodes.push(
        <a href={match[4]} key={`${keyPrefix}:md-link:${match.index}`} target="_blank" rel="noreferrer">
          {match[3]}
        </a>,
      );
    } else if (match[5]) {
      nodes.push(
        <a href={match[5]} key={`${keyPrefix}:link:${match.index}`} target="_blank" rel="noreferrer">
          {match[5]}
        </a>,
      );
    } else if (match[6]) {
      nodes.push(<code key={`${keyPrefix}:code:${match.index}`}>{match[6]}</code>);
    } else if (match[7]) {
      nodes.push(<strong key={`${keyPrefix}:bold:${match.index}`}>{match[7]}</strong>);
    } else if (match[8]) {
      nodes.push(<strong key={`${keyPrefix}:bold2:${match.index}`}>{match[8]}</strong>);
    } else if (match[9]) {
      nodes.push(<del key={`${keyPrefix}:strike:${match.index}`}>{match[9]}</del>);
    } else if (match[10]) {
      nodes.push(<em key={`${keyPrefix}:italic:${match.index}`}>{match[10]}</em>);
    } else if (match[11]) {
      nodes.push(<em key={`${keyPrefix}:italic2:${match.index}`}>{match[11]}</em>);
    }
    index = pattern.lastIndex;
  }

  if (index < body.length) nodes.push(<span key={`${keyPrefix}:text:${index}`}>{body.slice(index)}</span>);
  return nodes;
}

function MarkdownCodeBlock({ content, compact, language }: { content: string; compact: boolean; language: string | null }) {
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
    <pre className="orf-chat-markdown-code-block">
      {(language || !compact) && (
        <span className="orf-chat-markdown-code-header">
          <small>{language ?? "code"}</small>
          {!compact && <button type="button" onClick={copyCode}>{copied ? "已复制" : "复制"}</button>}
        </span>
      )}
      <code>{content || " "}</code>
    </pre>
  );
}

export function ChatMarkdown({ body, compact = false, usersById }: ChatMarkdownProps) {
  const blocks = parseMarkdownBlocks(body);
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "code") {
          return <MarkdownCodeBlock compact={compact} content={block.content} key={block.key} language={block.language} />;
        }
        if (block.kind === "divider") {
          return <hr className="orf-chat-markdown-divider" key={block.key} />;
        }
        if (block.kind === "heading") {
          const HeadingTag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return (
            <HeadingTag className={`orf-chat-markdown-heading orf-chat-markdown-heading-${block.level}`} key={block.key}>
              {renderInlineFragments(block.text, usersById, block.key)}
            </HeadingTag>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote className="orf-chat-markdown-quote" key={block.key}>
              {renderLineBreakJoined(block.lines, usersById, block.key)}
            </blockquote>
          );
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag className="orf-chat-markdown-list" key={block.key}>
              {block.items.map((item, itemIndex) => (
                <li className={item.checked !== null ? "orf-chat-markdown-task-item" : undefined} key={`${block.key}:${itemIndex}`}>
                  {item.checked !== null && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />}
                  {renderInlineFragments(item.text, usersById, `${block.key}:${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <span className={compact ? undefined : "orf-chat-markdown-paragraph"} key={block.key}>
            {renderLineBreakJoined(block.lines, usersById, block.key)}
          </span>
        );
      })}
    </>
  );
}
