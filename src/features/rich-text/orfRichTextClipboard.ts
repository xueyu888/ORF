const unorderedClipboardMarkers = new Set(["•", "·", "●", "○", "▪", "▫", "–", "—"]);
const markdownBlockStarterPattern = /^\s*(#{1,6}\s+|>|```|[-*_](?:\s*[-*_]){2,}\s*$|\|)/;

function normalizeIndent(rawIndent: string) {
  return rawIndent.replace(/\t/g, "    ");
}

function normalizeOrderedClipboardLine(indent: string, content: string) {
  const parenthesized = content.match(/^[（(](\d{1,6})[）)]\s*(.+)$/);
  if (parenthesized) {
    return `${indent}${parenthesized[1]}. ${(parenthesized[2] ?? "").trimStart()}`;
  }

  const delimited = content.match(/^(\d{1,6})([.)、．。])(?:\s+|(?=[^\d\s]))(.+)$/);
  if (!delimited) return null;
  return `${indent}${delimited[1]}. ${(delimited[3] ?? "").trimStart()}`;
}

function normalizeUnorderedClipboardLine(indent: string, content: string) {
  const marker = content[0] ?? "";
  if (!unorderedClipboardMarkers.has(marker)) return null;
  const rest = content.slice(1).trimStart();
  return rest ? `${indent}- ${rest}` : null;
}

export function normalizeOrfRichTextClipboardLine(line: string) {
  const withoutTrailingSpace = line.replace(/[ \t]+$/g, "");
  const match = withoutTrailingSpace.match(/^([ \t]*)(.*)$/);
  const indent = normalizeIndent(match?.[1] ?? "");
  const content = match?.[2] ?? "";
  return normalizeOrderedClipboardLine(indent, content)
    ?? normalizeUnorderedClipboardLine(indent, content)
    ?? `${indent}${content}`;
}

function listItemIndent(line: string) {
  const match = line.match(/^([ \t]*)(?:[-*+]\s+|\d{1,6}[.)]\s+)/);
  return match ? normalizeIndent(match[1] ?? "").length : null;
}

function shouldTreatAsListContinuation(line: string, activeListIndent: number | null, sawListItem: boolean) {
  if (activeListIndent === null || !sawListItem) return false;
  if (!line.trim()) return false;
  if (markdownBlockStarterPattern.test(line)) return false;
  if (listItemIndent(line) !== null) return false;
  return normalizeIndent(line.match(/^([ \t]*)/)?.[1] ?? "").length <= activeListIndent;
}

export function normalizePastedOrfRichText(text: string) {
  const normalizedLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(normalizeOrfRichTextClipboardLine);

  const output: string[] = [];
  let activeListIndent: number | null = null;
  let sawListItem = false;

  for (const line of normalizedLines) {
    const indent = listItemIndent(line);
    if (indent !== null) {
      activeListIndent = indent;
      sawListItem = true;
      output.push(line);
      continue;
    }

    if (!line.trim()) {
      activeListIndent = null;
      sawListItem = false;
      output.push(line);
      continue;
    }

    if (shouldTreatAsListContinuation(line, activeListIndent, sawListItem)) {
      output.push(`${" ".repeat((activeListIndent ?? 0) + 4)}${line.trimStart()}`);
      continue;
    }

    activeListIndent = null;
    sawListItem = false;
    output.push(line);
  }

  return output.join("\n");
}
