import {
  type OrfAttachmentReference,
  type OrfMentionReference,
  matchOrfAttachmentMarkdownTokens,
  matchOrfMentionMarkdownTokens,
  orfAttachmentMarkdown,
  orfMentionMarkdown,
  orfRichTextImageAlt,
  orfRichTextMentionLabel,
} from "./orfRichTextTokens";

export type OrfRichTextDraftRange = {
  end: number;
  start: number;
};

export type OrfRichTextDraftMention = OrfMentionReference & OrfRichTextDraftRange;
export type OrfRichTextDraftAttachment = OrfAttachmentReference & OrfRichTextDraftRange;

export type OrfRichTextDraft = {
  attachments: OrfRichTextDraftAttachment[];
  mentions: OrfRichTextDraftMention[];
  text: string;
};

export type OrfRichTextDraftUserLookup = ReadonlyMap<string, { name: string }>;

type DraftTokenMatch =
  | {
      index: number;
      kind: "attachment";
      reference: OrfAttachmentReference;
      token: string;
    }
  | {
      index: number;
      kind: "mention";
      reference: OrfMentionReference;
      token: string;
    };

export function createEmptyOrfRichTextDraft(): OrfRichTextDraft {
  return { attachments: [], mentions: [], text: "" };
}

export function orfRichTextDraftMentionText(reference: Pick<OrfMentionReference, "label">) {
  return `@${orfRichTextMentionLabel(reference.label)}`;
}

export function orfRichTextDraftAttachmentText(reference: Pick<OrfAttachmentReference, "alt">) {
  return `附件：${orfRichTextImageAlt(reference.alt)}`;
}

function sortedDraftTokenMatches(markdown: string): DraftTokenMatch[] {
  return [
    ...matchOrfMentionMarkdownTokens(markdown).map((match): DraftTokenMatch => ({
      index: match.index,
      kind: "mention",
      reference: match.reference,
      token: match.token,
    })),
    ...matchOrfAttachmentMarkdownTokens(markdown).map((match): DraftTokenMatch => ({
      index: match.index,
      kind: "attachment",
      reference: match.reference,
      token: match.token,
    })),
  ].sort((left, right) => left.index - right.index || right.token.length - left.token.length);
}

export function orfRichTextDraftFromStoredMarkdown(
  markdown: string,
  options: { usersById?: OrfRichTextDraftUserLookup } = {},
): OrfRichTextDraft {
  const mentions: OrfRichTextDraftMention[] = [];
  const attachments: OrfRichTextDraftAttachment[] = [];
  let text = "";
  let index = 0;

  for (const match of sortedDraftTokenMatches(markdown)) {
    if (match.index < index) continue;
    text += markdown.slice(index, match.index);

    if (match.kind === "mention") {
      const label = orfRichTextMentionLabel(options.usersById?.get(match.reference.userId)?.name ?? match.reference.label);
      const value = orfRichTextDraftMentionText({ label });
      const start = text.length;
      text += value;
      mentions.push({ label, userId: match.reference.userId, start, end: text.length });
    } else {
      const value = orfRichTextDraftAttachmentText(match.reference);
      const start = text.length;
      text += value;
      attachments.push({ ...match.reference, start, end: text.length });
    }

    index = match.index + match.token.length;
  }

  text += markdown.slice(index);
  return { attachments, mentions, text };
}

function sortedValidMentions(draft: OrfRichTextDraft) {
  return draft.mentions
    .filter((mention) => draft.text.slice(mention.start, mention.end) === orfRichTextDraftMentionText(mention))
    .sort((left, right) => left.start - right.start);
}

export function validOrfRichTextDraftAttachments(draft: OrfRichTextDraft) {
  return draft.attachments
    .filter((attachment) => draft.text.slice(attachment.start, attachment.end) === orfRichTextDraftAttachmentText(attachment))
    .sort((left, right) => left.start - right.start);
}

export function serializeOrfRichTextDraft(draft: OrfRichTextDraft) {
  const references = [
    ...sortedValidMentions(draft).map((mention) => ({
      end: mention.end,
      markdown: orfMentionMarkdown({ label: mention.label, userId: mention.userId }),
      start: mention.start,
    })),
    ...validOrfRichTextDraftAttachments(draft).map((attachment) => ({
      end: attachment.end,
      markdown: orfAttachmentMarkdown(attachment),
      start: attachment.start,
    })),
  ].sort((left, right) => left.start - right.start || left.end - right.end);

  let output = "";
  let index = 0;
  for (const reference of references) {
    if (reference.start < index) continue;
    output += draft.text.slice(index, reference.start);
    output += reference.markdown;
    index = reference.end;
  }

  return output + draft.text.slice(index);
}

function reconcileDraftRanges<TReference extends OrfRichTextDraftRange>(
  previousText: string,
  nextText: string,
  references: TReference[],
  textForReference: (reference: TReference) => string,
) {
  if (references.length === 0) return references;

  let prefixLength = 0;
  while (prefixLength < previousText.length && prefixLength < nextText.length && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1;
  }

  let previousSuffix = previousText.length;
  let nextSuffix = nextText.length;
  while (previousSuffix > prefixLength && nextSuffix > prefixLength && previousText[previousSuffix - 1] === nextText[nextSuffix - 1]) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  const delta = nextText.length - previousText.length;
  return references
    .flatMap((reference) => {
      if (reference.end <= prefixLength) return [reference];
      if (reference.start >= previousSuffix) return [{ ...reference, start: reference.start + delta, end: reference.end + delta }];
      return [];
    })
    .filter((reference) => nextText.slice(reference.start, reference.end) === textForReference(reference));
}

export function reconcileOrfRichTextDraftText(previousDraft: OrfRichTextDraft, nextText: string): OrfRichTextDraft {
  return {
    attachments: reconcileDraftRanges(previousDraft.text, nextText, previousDraft.attachments, orfRichTextDraftAttachmentText),
    mentions: reconcileDraftRanges(previousDraft.text, nextText, previousDraft.mentions, orfRichTextDraftMentionText),
    text: nextText,
  };
}

function withoutOverlappingRange<TReference extends OrfRichTextDraftRange>(references: TReference[], range: OrfRichTextDraftRange) {
  return references.filter((reference) => reference.end <= range.start || reference.start >= range.end);
}

export function insertOrfRichTextDraftMention(
  draft: OrfRichTextDraft,
  input: OrfMentionReference & OrfRichTextDraftRange,
): OrfRichTextDraft {
  const mentionText = orfRichTextDraftMentionText(input);
  if (draft.text.slice(input.start, input.end) !== mentionText) return draft;
  return {
    ...draft,
    attachments: withoutOverlappingRange(draft.attachments, input),
    mentions: [...withoutOverlappingRange(draft.mentions, input), input].sort((left, right) => left.start - right.start),
  };
}

export function insertOrfRichTextDraftAttachment(
  draft: OrfRichTextDraft,
  input: OrfAttachmentReference & OrfRichTextDraftRange,
): OrfRichTextDraft {
  const attachmentText = orfRichTextDraftAttachmentText(input);
  if (draft.text.slice(input.start, input.end) !== attachmentText) return draft;
  return {
    ...draft,
    attachments: [...withoutOverlappingRange(draft.attachments, input), input].sort((left, right) => left.start - right.start),
    mentions: withoutOverlappingRange(draft.mentions, input),
  };
}

export function orfRichTextDraftHasMeaningfulContent(draft: OrfRichTextDraft) {
  return Boolean(draft.text.trim());
}
