export type OrfRichTextTextRange = {
  from: number;
  to: number;
};

export type OrfRichTextLineMarkdownKind = "bullet" | "heading" | "ordered" | "quote";

export type OrfRichTextBlockKind = OrfRichTextLineMarkdownKind | "mixed" | "paragraph";

export type OrfRichTextBlockState = {
  kind: OrfRichTextBlockKind;
  label: string;
};

export type OrfRichTextEditResult = {
  markdown: string;
  selection: OrfRichTextTextRange;
};

export type OrfRichTextBlockInsertResult = {
  insertedRange: OrfRichTextTextRange;
  markdown: string;
  selection: number;
};

export const ORF_RICH_TEXT_BLOCK_LABELS: Record<OrfRichTextBlockKind, string> = {
  bullet: "无序列表",
  heading: "标题",
  mixed: "混合格式",
  ordered: "有序列表",
  paragraph: "Markdown",
  quote: "引用",
};

function normalizeRange(range: OrfRichTextTextRange): OrfRichTextTextRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

export function selectedOrfMarkdownLineRange(markdown: string, selection: OrfRichTextTextRange): OrfRichTextTextRange {
  const range = normalizeRange(selection);
  const from = markdown.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextNewline = markdown.indexOf("\n", range.to);
  return {
    from,
    to: nextNewline === -1 ? markdown.length : nextNewline,
  };
}

function currentLineRange(markdown: string, cursor: number): OrfRichTextTextRange {
  const normalizedCursor = Math.max(0, Math.min(cursor, markdown.length));
  const from = markdown.lastIndexOf("\n", Math.max(0, normalizedCursor - 1)) + 1;
  const nextNewline = markdown.indexOf("\n", normalizedCursor);
  return {
    from,
    to: nextNewline === -1 ? markdown.length : nextNewline,
  };
}

function lineParts(markdown: string, range: OrfRichTextTextRange) {
  const block = markdown.slice(range.from, range.to);
  const hasTrailingNewline = block.endsWith("\n");
  const lines = hasTrailingNewline ? block.slice(0, -1).split("\n") : block.split("\n");
  return { hasTrailingNewline, lines };
}

function joinLineParts(lines: string[], hasTrailingNewline: boolean) {
  return `${lines.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}

export function replaceOrfMarkdownRange(markdown: string, range: OrfRichTextTextRange, value: string) {
  const normalizedRange = normalizeRange(range);
  return `${markdown.slice(0, normalizedRange.from)}${value}${markdown.slice(normalizedRange.to)}`;
}

export function nextOrfBlockMarkdownInsert(markdown: string, selection: OrfRichTextTextRange, block: string): OrfRichTextBlockInsertResult {
  const range = normalizeRange(selection);
  const before = markdown.slice(0, range.from);
  const after = markdown.slice(range.to);
  const prefix = !before.trim() ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = !after.trim() ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insertedStart = before.length + prefix.length;
  const insertedEnd = insertedStart + block.length;
  return {
    insertedRange: { from: insertedStart, to: insertedEnd },
    markdown: `${before}${prefix}${block}${suffix}${after}`,
    selection: insertedEnd,
  };
}

function markerForKind(kind: OrfRichTextLineMarkdownKind) {
  if (kind === "heading") return "### ";
  if (kind === "ordered") return "1. ";
  if (kind === "quote") return "> ";
  return "- ";
}

function lineMatchesKind(line: string, kind: OrfRichTextLineMarkdownKind) {
  if (kind === "heading") return /^\s{0,3}#{1,6}\s+/.test(line);
  if (kind === "quote") return /^\s*>\s?/.test(line);
  if (kind === "bullet") return /^\s*[-*+]\s+/.test(line);
  return /^\s*\d+[.)]\s+/.test(line);
}

function classifyLine(line: string): OrfRichTextBlockKind {
  if (!line.trim()) return "paragraph";
  if (lineMatchesKind(line, "heading")) return "heading";
  if (lineMatchesKind(line, "quote")) return "quote";
  if (lineMatchesKind(line, "bullet")) return "bullet";
  if (lineMatchesKind(line, "ordered")) return "ordered";
  return "paragraph";
}

function lineIsInsideFencedCodeBlock(markdown: string, lineStart: number) {
  const beforeLine = markdown.slice(0, lineStart);
  let insideFence = false;
  for (const line of beforeLine.split("\n")) {
    if (/^\s{0,3}(```|~~~)/.test(line)) insideFence = !insideFence;
  }
  return insideFence;
}

export function getOrfRichTextBlockState(markdown: string, selection: OrfRichTextTextRange): OrfRichTextBlockState {
  const range = selectedOrfMarkdownLineRange(markdown, selection);
  const { lines } = lineParts(markdown, range);
  const kinds: OrfRichTextBlockKind[] = [];
  let offset = range.from;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!line.trim() || lineIsInsideFencedCodeBlock(markdown, lineStart)) continue;
    kinds.push(classifyLine(line));
  }

  if (kinds.length === 0) return { kind: "paragraph", label: ORF_RICH_TEXT_BLOCK_LABELS.paragraph };
  const firstKind = kinds[0] ?? "paragraph";
  const kind = kinds.every((item) => item === firstKind) ? firstKind : "mixed";
  return { kind, label: ORF_RICH_TEXT_BLOCK_LABELS[kind] };
}

export function applyOrfLineMarkdown(
  markdown: string,
  selection: OrfRichTextTextRange,
  kind: OrfRichTextLineMarkdownKind,
): OrfRichTextEditResult {
  const selectedRange = normalizeRange(selection);
  const lineRange = selectedOrfMarkdownLineRange(markdown, selectedRange);
  const { hasTrailingNewline, lines } = lineParts(markdown, lineRange);
  const actionable = lines.filter((line) => line.trim());

  if (actionable.length === 0) {
    const marker = markerForKind(kind);
    return {
      markdown: replaceOrfMarkdownRange(markdown, selectedRange, marker),
      selection: { from: selectedRange.from + marker.length, to: selectedRange.from + marker.length },
    };
  }

  const allSelectedLinesAlreadyMatch = actionable.every((line) => lineMatchesKind(line, kind));
  let orderedIndex = 1;
  const nextLines = lines.map((line) => {
    if (!line.trim()) return line;
    if (kind === "heading") {
      return allSelectedLinesAlreadyMatch
        ? line.replace(/^(\s{0,3})#{1,6}\s+/, "$1")
        : line.replace(/^(\s{0,3})(?:#{1,6}\s+)?/, "$1### ");
    }
    if (kind === "quote") {
      return allSelectedLinesAlreadyMatch
        ? line.replace(/^(\s*)>\s?/, "$1")
        : line.replace(/^(\s*)/, "$1> ");
    }
    if (kind === "bullet") {
      return allSelectedLinesAlreadyMatch
        ? line.replace(/^(\s*)[-*+]\s+/, "$1")
        : line.replace(/^(\s*)(?:[-*+]\s+)?/, "$1- ");
    }

    const nextOrderedIndex = orderedIndex;
    orderedIndex += 1;
    return allSelectedLinesAlreadyMatch
      ? line.replace(/^(\s*)\d+[.)]\s+/, "$1")
      : line.replace(/^(\s*)(?:\d+[.)]\s+)?/, `$1${nextOrderedIndex}. `);
  });

  const nextBlock = joinLineParts(nextLines, hasTrailingNewline);
  return {
    markdown: replaceOrfMarkdownRange(markdown, lineRange, nextBlock),
    selection: { from: lineRange.from, to: lineRange.from + nextBlock.length },
  };
}

function renumberFollowingOrderedListItems(markdown: string, lineStart: number, input: {
  delimiter: string;
  indent: string;
  nextNumber: number;
}) {
  let cursor = lineStart;
  let nextNumber = input.nextNumber;
  let output = markdown;

  while (cursor < output.length) {
    const range = currentLineRange(output, cursor);
    const line = output.slice(range.from, range.to);
    const match = /^(\s*)(\d+)([.)])(\s+)(.*)$/.exec(line);
    if (!match || match[1] !== input.indent) break;
    const replacement = `${input.indent}${nextNumber}${input.delimiter}${match[4] ?? " "}${match[5] ?? ""}`;
    output = replaceOrfMarkdownRange(output, range, replacement);
    cursor = range.from + replacement.length;
    if (cursor < output.length && output[cursor] === "\n") cursor += 1;
    nextNumber += 1;
  }

  return output;
}

export function continueOrfMarkdownListOnEnter(markdown: string, selection: OrfRichTextTextRange): OrfRichTextEditResult | null {
  const range = normalizeRange(selection);
  if (range.from !== range.to) return null;
  if (lineIsInsideFencedCodeBlock(markdown, range.from)) return null;

  const lineRange = currentLineRange(markdown, range.from);
  const line = markdown.slice(lineRange.from, lineRange.to);
  const cursorInLine = range.from - lineRange.from;
  const orderedMatch = /^(\s*)(\d+)([.)])(\s+)(.*)$/.exec(line);
  const bulletMatch = /^(\s*)([-*+])(\s+)(.*)$/.exec(line);

  if (orderedMatch) {
    const indent = orderedMatch[1] ?? "";
    const markerEnd = indent.length + (orderedMatch[2] ?? "").length + (orderedMatch[3] ?? ".").length + (orderedMatch[4] ?? " ").length;
    if (cursorInLine < markerEnd) return null;
    const content = line.slice(markerEnd);
    if (!content.trim()) {
      const nextMarkdown = replaceOrfMarkdownRange(markdown, lineRange, indent);
      const cursor = lineRange.from + indent.length;
      return { markdown: nextMarkdown, selection: { from: cursor, to: cursor } };
    }

    const nextNumber = Number.parseInt(orderedMatch[2] ?? "1", 10) + 1;
    const delimiter = orderedMatch[3] ?? ".";
    const insert = `\n${indent}${nextNumber}${delimiter} `;
    const inserted = replaceOrfMarkdownRange(markdown, range, insert);
    const nextSelection = range.from + insert.length;
    const insertedLineStart = range.from + 1;
    const insertedLineEnd = currentLineRange(inserted, insertedLineStart).to;
    const followingLineStart = insertedLineEnd < inserted.length ? insertedLineEnd + 1 : inserted.length;
    const nextMarkdown = renumberFollowingOrderedListItems(inserted, followingLineStart, {
      delimiter,
      indent,
      nextNumber: nextNumber + 1,
    });
    return { markdown: nextMarkdown, selection: { from: nextSelection, to: nextSelection } };
  }

  if (bulletMatch) {
    const indent = bulletMatch[1] ?? "";
    const marker = bulletMatch[2] ?? "-";
    const markerEnd = indent.length + marker.length + (bulletMatch[3] ?? " ").length;
    if (cursorInLine < markerEnd) return null;
    const content = line.slice(markerEnd);
    if (!content.trim()) {
      const nextMarkdown = replaceOrfMarkdownRange(markdown, lineRange, indent);
      const cursor = lineRange.from + indent.length;
      return { markdown: nextMarkdown, selection: { from: cursor, to: cursor } };
    }

    const insert = `\n${indent}${marker} `;
    const nextMarkdown = replaceOrfMarkdownRange(markdown, range, insert);
    const cursor = range.from + insert.length;
    return { markdown: nextMarkdown, selection: { from: cursor, to: cursor } };
  }

  return null;
}
