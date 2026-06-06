import { reconcileMentions, type ChatDraft } from "./chatModels";

export type ChatMarkdownMode =
  | "bold"
  | "code"
  | "heading"
  | "italic"
  | "link"
  | "orderedList"
  | "quote"
  | "strike"
  | "unorderedList";

export type ChatMarkdownShortcutResult = {
  draft: ChatDraft;
  selectionEnd: number;
  selectionStart: number;
};

function clampCursor(cursor: number, text: string) {
  return Math.max(0, Math.min(text.length, cursor));
}

function normalizeSelection(text: string, selectionStart: number, selectionEnd: number) {
  const start = clampCursor(Math.min(selectionStart, selectionEnd), text);
  const end = clampCursor(Math.max(selectionStart, selectionEnd), text);
  return { end, start };
}

function createMarkdownResult(
  draft: ChatDraft,
  text: string,
  selectionStart: number,
  selectionEnd: number,
): ChatMarkdownShortcutResult {
  const selection = normalizeSelection(text, selectionStart, selectionEnd);
  return {
    draft: {
      mentions: reconcileMentions(draft.text, text, draft.mentions),
      text,
    },
    selectionEnd: selection.end,
    selectionStart: selection.start,
  };
}

function wrapInlineMarkdown(
  draft: ChatDraft,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after = before,
): ChatMarkdownShortcutResult {
  const selection = normalizeSelection(draft.text, selectionStart, selectionEnd);
  const selected = draft.text.slice(selection.start, selection.end);
  const surroundingStart = selection.start - before.length;
  const surroundingEnd = selection.end + after.length;
  if (
    surroundingStart >= 0 &&
    draft.text.slice(surroundingStart, selection.start) === before &&
    draft.text.slice(selection.end, surroundingEnd) === after
  ) {
    const text = `${draft.text.slice(0, surroundingStart)}${selected}${draft.text.slice(surroundingEnd)}`;
    return createMarkdownResult(draft, text, surroundingStart, surroundingStart + selected.length);
  }
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const unwrapped = selected.slice(before.length, selected.length - after.length);
    const text = `${draft.text.slice(0, selection.start)}${unwrapped}${draft.text.slice(selection.end)}`;
    return createMarkdownResult(draft, text, selection.start, selection.start + unwrapped.length);
  }
  const text = `${draft.text.slice(0, selection.start)}${before}${selected}${after}${draft.text.slice(selection.end)}`;
  const nextSelectionStart = selection.start + before.length;
  return createMarkdownResult(draft, text, nextSelectionStart, nextSelectionStart + selected.length);
}

function wrapCodeMarkdown(draft: ChatDraft, selectionStart: number, selectionEnd: number): ChatMarkdownShortcutResult {
  const selection = normalizeSelection(draft.text, selectionStart, selectionEnd);
  const selected = draft.text.slice(selection.start, selection.end);
  if (!selected.includes("\n")) return wrapInlineMarkdown(draft, selection.start, selection.end, "`");

  const codeBlockStart = "```\n";
  const codeBlockEnd = "\n```";
  if (selected.startsWith(codeBlockStart) && selected.endsWith(codeBlockEnd)) {
    const unwrapped = selected.slice(codeBlockStart.length, selected.length - codeBlockEnd.length);
    const text = `${draft.text.slice(0, selection.start)}${unwrapped}${draft.text.slice(selection.end)}`;
    return createMarkdownResult(draft, text, selection.start, selection.start + unwrapped.length);
  }

  const surroundingStart = selection.start - codeBlockStart.length;
  const surroundingEnd = selection.end + codeBlockEnd.length;
  if (
    surroundingStart >= 0 &&
    draft.text.slice(surroundingStart, selection.start) === codeBlockStart &&
    draft.text.slice(selection.end, surroundingEnd) === codeBlockEnd
  ) {
    const text = `${draft.text.slice(0, surroundingStart)}${selected}${draft.text.slice(surroundingEnd)}`;
    return createMarkdownResult(draft, text, surroundingStart, surroundingStart + selected.length);
  }

  const text = `${draft.text.slice(0, selection.start)}${codeBlockStart}${selected}${codeBlockEnd}${draft.text.slice(selection.end)}`;
  const nextSelectionStart = selection.start + codeBlockStart.length;
  return createMarkdownResult(draft, text, nextSelectionStart, nextSelectionStart + selected.length);
}

type LineMarkdownMode = Extract<ChatMarkdownMode, "heading" | "orderedList" | "quote" | "unorderedList">;

type LineMarkdownEdit = {
  delta: number;
  markerLength: number;
  operation: "add" | "none" | "remove";
  originalEnd: number;
  originalStart: number;
};

function markdownLineRange(text: string, selectionStart: number, selectionEnd: number) {
  const effectiveEnd = selectionEnd > selectionStart && text[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextNewline = text.indexOf("\n", effectiveEnd);
  return { lineEnd: nextNewline === -1 ? text.length : nextNewline, lineStart };
}

function markdownLineMarker(mode: LineMarkdownMode, ordinal: number) {
  if (mode === "heading") return "### ";
  if (mode === "orderedList") return `${ordinal}. `;
  if (mode === "quote") return "> ";
  return "- ";
}

function removableLineMarkerLength(line: string, mode: LineMarkdownMode) {
  if (mode === "heading") return line.match(/^#{1,6}\s+/)?.[0].length ?? 0;
  if (mode === "orderedList") return line.match(/^\d+[.)]\s+/)?.[0].length ?? 0;
  if (mode === "quote") return line.match(/^>\s?/)?.[0].length ?? 0;
  return line.match(/^[-*]\s+/)?.[0].length ?? 0;
}

function mapMarkdownLineCursor(cursor: number, edits: LineMarkdownEdit[]) {
  let deltaBefore = 0;
  for (const edit of edits) {
    if (cursor < edit.originalStart) return cursor + deltaBefore;
    if (cursor <= edit.originalEnd) {
      if (edit.operation === "add") return cursor + deltaBefore + edit.markerLength;
      if (edit.operation === "remove") {
        if (cursor <= edit.originalStart + edit.markerLength) return edit.originalStart + deltaBefore;
        return cursor + deltaBefore - edit.markerLength;
      }
      return cursor + deltaBefore;
    }
    deltaBefore += edit.delta;
  }
  return cursor + deltaBefore;
}

function applyLineMarkdown(
  draft: ChatDraft,
  selectionStart: number,
  selectionEnd: number,
  mode: LineMarkdownMode,
): ChatMarkdownShortcutResult {
  const selection = normalizeSelection(draft.text, selectionStart, selectionEnd);
  const range = markdownLineRange(draft.text, selection.start, selection.end);
  const selectedBlock = draft.text.slice(range.lineStart, range.lineEnd);
  const lines = selectedBlock.split("\n");
  const transformEmptyLine = selection.start === selection.end && lines.length === 1;
  const markerCandidates = lines.filter((line) => line.trim() || transformEmptyLine);
  const shouldRemove = markerCandidates.length > 0 && markerCandidates.every((line) => removableLineMarkerLength(line, mode) > 0);
  const edits: LineMarkdownEdit[] = [];
  let ordinal = 1;
  let offset = 0;

  const nextLines = lines.map((line) => {
    const originalStart = range.lineStart + offset;
    const originalEnd = originalStart + line.length;
    offset += line.length + 1;
    if (!line.trim() && !transformEmptyLine) {
      edits.push({ delta: 0, markerLength: 0, operation: "none", originalEnd, originalStart });
      return line;
    }
    if (shouldRemove) {
      const markerLength = removableLineMarkerLength(line, mode);
      edits.push({ delta: -markerLength, markerLength, operation: "remove", originalEnd, originalStart });
      return line.slice(markerLength);
    }
    const marker = markdownLineMarker(mode, ordinal);
    ordinal += 1;
    edits.push({ delta: marker.length, markerLength: marker.length, operation: "add", originalEnd, originalStart });
    return `${marker}${line}`;
  });

  const nextBlock = nextLines.join("\n");
  const text = `${draft.text.slice(0, range.lineStart)}${nextBlock}${draft.text.slice(range.lineEnd)}`;
  return createMarkdownResult(
    draft,
    text,
    mapMarkdownLineCursor(selection.start, edits),
    mapMarkdownLineCursor(selection.end, edits),
  );
}

export function applyChatMarkdownShortcut({
  draft,
  mode,
  selectionEnd,
  selectionStart,
}: {
  draft: ChatDraft;
  mode: ChatMarkdownMode;
  selectionEnd: number;
  selectionStart: number;
}): ChatMarkdownShortcutResult {
  if (mode === "bold") return wrapInlineMarkdown(draft, selectionStart, selectionEnd, "**");
  if (mode === "code") return wrapCodeMarkdown(draft, selectionStart, selectionEnd);
  if (mode === "italic") return wrapInlineMarkdown(draft, selectionStart, selectionEnd, "_");
  if (mode === "link") return wrapInlineMarkdown(draft, selectionStart, selectionEnd, "[", "](https://)");
  if (mode === "strike") return wrapInlineMarkdown(draft, selectionStart, selectionEnd, "~~");
  return applyLineMarkdown(draft, selectionStart, selectionEnd, mode);
}
