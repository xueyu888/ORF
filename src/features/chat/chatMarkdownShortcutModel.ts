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

function findWordEnd(text: string, start: number) {
  const match = text.slice(start).match(/\s/);
  return match?.index === undefined ? text.length : start + match.index;
}

function findWordStart(text: string, start: number) {
  const before = text.slice(0, start);
  const match = before.match(/\s\S*$/);
  return match?.index === undefined ? 0 : match.index + 1;
}

function applyLinkMarkdown(draft: ChatDraft, selectionStart: number, selectionEnd: number): ChatMarkdownShortcutResult {
  const selection = normalizeSelection(draft.text, selectionStart, selectionEnd);
  const placeholderUrl = "https://";
  const delimiterStart = "[";
  const delimiterEnd = `](${placeholderUrl})`;
  const urlOffsetAfterLabel = delimiterStart.length + 2;
  const prefix = draft.text.slice(0, selection.start);
  const selected = draft.text.slice(selection.start, selection.end);
  const suffix = draft.text.slice(selection.end);

  if (prefix.endsWith(delimiterStart) && suffix.startsWith(delimiterEnd)) {
    const text = `${prefix.slice(0, -delimiterStart.length)}${selected}${suffix.slice(delimiterEnd.length)}`;
    return createMarkdownResult(draft, text, selection.start - delimiterStart.length, selection.end - delimiterStart.length);
  }

  if (!draft.text) {
    const text = `${delimiterStart}${delimiterEnd}`;
    return createMarkdownResult(draft, text, delimiterStart.length, delimiterStart.length);
  }

  if (selection.start < selection.end) {
    const text = `${prefix}${delimiterStart}${selected}${delimiterEnd}${suffix}`;
    const urlStart = selection.end + urlOffsetAfterLabel;
    return createMarkdownResult(draft, text, urlStart, urlStart + placeholderUrl.length);
  }

  const spaceBefore = selection.start > 0 && /\s/.test(draft.text.charAt(selection.start - 1));
  const spaceAfter = selection.end < draft.text.length && /\s/.test(draft.text.charAt(selection.end));
  const cursorBeforeWord = (selection.start !== 0 && spaceBefore && !spaceAfter) || (selection.start === 0 && !spaceAfter);
  const cursorAfterWord = (selection.end !== draft.text.length && spaceAfter && !spaceBefore) || (selection.end === draft.text.length && !spaceBefore);

  if (cursorBeforeWord) {
    const wordEnd = findWordEnd(draft.text, selection.start);
    const word = draft.text.slice(selection.start, wordEnd);
    const text = `${prefix}${delimiterStart}${word}${delimiterEnd}${draft.text.slice(wordEnd)}`;
    const urlStart = selection.start + word.length + urlOffsetAfterLabel;
    return createMarkdownResult(draft, text, urlStart, urlStart + placeholderUrl.length);
  }

  if (cursorAfterWord && selection.start === draft.text.length) {
    const text = `${draft.text} ${delimiterStart}${delimiterEnd}`;
    const labelStart = selection.start + 1 + delimiterStart.length;
    return createMarkdownResult(draft, text, labelStart, labelStart);
  }

  if (cursorAfterWord) {
    const wordStart = findWordStart(draft.text, selection.start);
    const word = draft.text.slice(wordStart, selection.start);
    const text = `${draft.text.slice(0, wordStart)}${delimiterStart}${word}${delimiterEnd}${suffix}`;
    const urlStart = selection.start + urlOffsetAfterLabel;
    return createMarkdownResult(draft, text, urlStart, urlStart + placeholderUrl.length);
  }

  const wordStart = findWordStart(draft.text, selection.start);
  const wordEnd = findWordEnd(draft.text, selection.start);
  const word = draft.text.slice(wordStart, wordEnd);
  const text = `${draft.text.slice(0, wordStart)}${delimiterStart}${word}${delimiterEnd}${draft.text.slice(wordEnd)}`;
  const urlStart = wordEnd + urlOffsetAfterLabel;
  return createMarkdownResult(draft, text, urlStart, urlStart + placeholderUrl.length);
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
  if (mode === "link") return applyLinkMarkdown(draft, selectionStart, selectionEnd);
  if (mode === "strike") return wrapInlineMarkdown(draft, selectionStart, selectionEnd, "~~");
  return applyLineMarkdown(draft, selectionStart, selectionEnd, mode);
}
