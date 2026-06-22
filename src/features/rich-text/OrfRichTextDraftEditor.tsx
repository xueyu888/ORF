import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  OrfRichTextEditor,
  type OrfRichTextAttachmentInsert,
  type OrfRichTextAttachmentUploadResult,
  type OrfRichTextEditorActions,
  type OrfRichTextEditorProps,
  type OrfRichTextMentionInsert,
} from "./OrfRichTextEditor";
import {
  type OrfRichTextDraft,
  insertOrfRichTextDraftAttachment,
  insertOrfRichTextDraftMention,
  orfRichTextDraftAttachmentText,
  orfRichTextDraftMentionText,
  reconcileOrfRichTextDraftText,
} from "./orfRichTextDraft";

type PassthroughEditorProps = Omit<
  OrfRichTextEditorProps,
  | "actionsRef"
  | "formatAttachmentText"
  | "formatMentionText"
  | "mentionPlainTextUserIds"
  | "onAttachmentInsert"
  | "onChange"
  | "onMentionInsert"
  | "value"
>;

export type OrfRichTextDraftEditorProps = PassthroughEditorProps & {
  draft: OrfRichTextDraft;
  mentionPlainTextUserIds?: ReadonlySet<string>;
  onDraftChange: (draft: OrfRichTextDraft) => void;
};

export function OrfRichTextDraftEditor({
  draft,
  mentionPlainTextUserIds,
  onDraftChange,
  ...editorProps
}: OrfRichTextDraftEditorProps) {
  const actionsRef = useRef<OrfRichTextEditorActions | null>(null);
  const draftRef = useRef(draft);
  const passThroughPlainTextMentions = useMemo(() => mentionPlainTextUserIds ?? new Set<string>(), [mentionPlainTextUserIds]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const emitDraft = useCallback((nextDraft: OrfRichTextDraft) => {
    draftRef.current = nextDraft;
    onDraftChange(nextDraft);
  }, [onDraftChange]);

  const handleEditorTextChange = useCallback((nextText: string) => {
    emitDraft(reconcileOrfRichTextDraftText(draftRef.current, nextText));
  }, [emitDraft]);

  const currentReconciledDraft = useCallback(() => {
    const currentText = actionsRef.current?.getMarkdown() ?? draftRef.current.text;
    return reconcileOrfRichTextDraftText(draftRef.current, currentText);
  }, []);

  const handleMentionInsert = useCallback((insert: OrfRichTextMentionInsert) => {
    if (passThroughPlainTextMentions.has(insert.user.id)) return;
    const mentionText = orfRichTextDraftMentionText({ label: insert.label });
    const nextDraft = insertOrfRichTextDraftMention(currentReconciledDraft(), {
      end: insert.range.from + mentionText.length,
      label: insert.label,
      start: insert.range.from,
      userId: insert.user.id,
    });
    emitDraft(nextDraft);
  }, [currentReconciledDraft, emitDraft, passThroughPlainTextMentions]);

  const handleAttachmentInsert = useCallback((insert: OrfRichTextAttachmentInsert) => {
    const nextDraft = insertOrfRichTextDraftAttachment(currentReconciledDraft(), {
      ...insert.reference,
      end: insert.range.to,
      start: insert.range.from,
    });
    emitDraft(nextDraft);
  }, [currentReconciledDraft, emitDraft]);

  return (
    <OrfRichTextEditor
      {...editorProps}
      actionsRef={actionsRef}
      formatAttachmentText={(reference) => orfRichTextDraftAttachmentText(reference)}
      formatMentionText={(_user, label) => orfRichTextDraftMentionText({ label })}
      mentionPlainTextUserIds={passThroughPlainTextMentions}
      onAttachmentInsert={handleAttachmentInsert}
      onChange={handleEditorTextChange}
      onMentionInsert={handleMentionInsert}
      value={draft.text}
    />
  );
}

export type { OrfRichTextAttachmentUploadResult };
