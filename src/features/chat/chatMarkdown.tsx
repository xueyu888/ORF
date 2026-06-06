import type { ReactNode } from "react";
import type { ChatUser } from "../../types/orf";

type MarkdownBlock =
  | { kind: "code"; content: string; key: string }
  | { kind: "list"; items: string[]; key: string; ordered: boolean }
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

function parseListItem(line: string) {
  const unordered = line.match(/^\s*[-*]\s+(.+)$/);
  if (unordered) return { ordered: false, text: unordered[1] ?? "" };
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, text: ordered[1] ?? "" };
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

    if (isFenceLine(line)) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceLine(lines[index] ?? "")) {
        content.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", content: content.join("\n"), key: `code:${keyIndex}` });
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
      const items: string[] = [];
      while (index < lines.length) {
        const nextItem = parseListItem(lines[index] ?? "");
        if (!nextItem || nextItem.ordered !== ordered) break;
        items.push(nextItem.text);
        index += 1;
      }
      blocks.push({ kind: "list", items, key: `list:${keyIndex}`, ordered });
      keyIndex += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (!nextLine.trim() || isFenceLine(nextLine) || nextLine.trimStart().startsWith(">") || parseListItem(nextLine)) break;
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
  const pattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)|\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+)\)|(https?:\/\/[^\s<]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|_([^_\n]+)_/g;
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
      nodes.push(<del key={`${keyPrefix}:strike:${match.index}`}>{match[8]}</del>);
    } else if (match[9]) {
      nodes.push(<em key={`${keyPrefix}:italic:${match.index}`}>{match[9]}</em>);
    }
    index = pattern.lastIndex;
  }

  if (index < body.length) nodes.push(<span key={`${keyPrefix}:text:${index}`}>{body.slice(index)}</span>);
  return nodes;
}

export function ChatMarkdown({ body, compact = false, usersById }: ChatMarkdownProps) {
  const blocks = parseMarkdownBlocks(body);
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "code") {
          return (
            <pre className="orf-chat-markdown-code-block" key={block.key}>
              <code>{block.content || " "}</code>
            </pre>
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
                <li key={`${block.key}:${itemIndex}`}>{renderInlineFragments(item, usersById, `${block.key}:${itemIndex}`)}</li>
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
