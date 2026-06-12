import { clsx } from "clsx";
import { AtSign, Edit3, Eye, Smile } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatUser, Feedback } from "../../types/orf";
import {
  OrfRichTextEditor,
  orfRichTextHasMeaningfulContent,
  type OrfRichTextEditorActions,
} from "../rich-text/OrfRichTextEditor";
import { emptyComposerHistory, recallComposerHistory, recordSentComposerDraft } from "./chatComposerModel";
import { matchesChatShortcutKey } from "./chatKeyboardShortcuts";
import { ChatMarkdown } from "./chatMarkdown";
import { type ChatDraft } from "./chatModels";
import {
  chatDraftToRichTextMarkdown,
  chatMentionPlainTextUserIds,
  chatRichTextMarkdownToDraft,
  chatRichTextMentionableUsers,
} from "./chatRichTextDraftModel";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { displayChatReactionEmoji } from "./chatReactions";

type ChatDraftEditorToolbarState = {
  submit: () => void;
  submitting: boolean;
};

type ChatDraftEditorProps = {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  draft: ChatDraft;
  feedbackItems?: readonly Pick<Feedback, "id" | "phenomenon">[];
  focusSignal?: number;
  mentionableUsers: ChatUser[];
  onCancel?: () => void;
  onChange: (draft: ChatDraft) => void;
  onEditLatest?: () => void;
  onFilesInsert?: (files: File[]) => void;
  onReactToLatest?: () => void;
  onReplyToLatest?: () => void;
  onSubmit?: (draft: ChatDraft) => Promise<boolean | void> | boolean | void;
  onTyping?: () => void;
  placeholder?: string;
  recordHistoryOnSubmit?: boolean;
  resetKey?: string;
  submitDisabled?: boolean;
  toolbarControls?: ReactNode;
  toolbarEnd?: (state: ChatDraftEditorToolbarState) => ReactNode;
  transformPastedText?: (text: string) => string;
};

function matchesPreviewShortcut(event: KeyboardEvent) {
  const primary = event.ctrlKey || event.metaKey;
  return (
    primary &&
    matchesChatShortcutKey(event, { code: "KeyP", key: "p" }) &&
    !event.isComposing &&
    ((event.altKey && !event.shiftKey) || (!event.altKey && event.shiftKey))
  );
}

function currentEditorDraft(actions: OrfRichTextEditorActions | null, fallbackMarkdown: string, usersById: Map<string, ChatUser>) {
  return chatRichTextMarkdownToDraft(actions?.getMarkdown() ?? fallbackMarkdown, usersById);
}

export function ChatDraftEditor({
  autoFocus,
  className,
  disabled,
  draft,
  feedbackItems,
  focusSignal,
  mentionableUsers,
  onCancel,
  onChange,
  onEditLatest,
  onFilesInsert,
  onReactToLatest,
  onReplyToLatest,
  onSubmit,
  onTyping,
  placeholder,
  recordHistoryOnSubmit,
  resetKey,
  submitDisabled,
  toolbarControls,
  toolbarEnd,
  transformPastedText,
}: ChatDraftEditorProps) {
  const actionsRef = useRef<OrfRichTextEditorActions | null>(null);
  const emojiAnchorRef = useRef<HTMLSpanElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const submittingRef = useRef(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [history, setHistory] = useState(emptyComposerHistory);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const usersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const markdownValue = useMemo(() => chatDraftToRichTextMarkdown(draft), [draft]);
  const richMentionableUsers = useMemo(
    () => chatRichTextMentionableUsers(mentionableUsers),
    [mentionableUsers],
  );

  useEffect(() => {
    setEmojiOpen(false);
    setHistory(emptyComposerHistory);
    setPreviewing(false);
    setSubmitting(false);
    submittingRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (disabled) {
      setEmojiOpen(false);
      setPreviewing(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!previewing || disabled) return;
    window.requestAnimationFrame(() => previewRef.current?.focus());
  }, [disabled, previewing]);

  useEffect(() => {
    if (focusSignal === undefined || disabled) return;
    window.requestAnimationFrame(() => actionsRef.current?.focusEnd());
  }, [disabled, focusSignal]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    window.requestAnimationFrame(() => actionsRef.current?.focusEnd());
  }, [autoFocus, disabled, resetKey]);

  const markdownToDraft = useCallback((markdown: string) => chatRichTextMarkdownToDraft(markdown, usersById), [usersById]);

  const applyDraftToEditor = useCallback((nextDraft: ChatDraft, focus: "end" | "start" | null = null) => {
    onChange(nextDraft);
    actionsRef.current?.setMarkdown(chatDraftToRichTextMarkdown(nextDraft));
    if (focus) {
      window.requestAnimationFrame(() => {
        if (focus === "start") actionsRef.current?.focusStart();
        if (focus === "end") actionsRef.current?.focusEnd();
      });
    }
  }, [onChange]);

  const handleMarkdownChange = useCallback((markdown: string) => {
    onChange(markdownToDraft(markdown));
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
  }, [markdownToDraft, onChange, onTyping]);

  const submit = useCallback(async (overrideDraft?: ChatDraft) => {
    if (disabled || submitDisabled || submittingRef.current || !onSubmit) return;
    const nextDraft = overrideDraft ?? currentEditorDraft(actionsRef.current, markdownValue, usersById);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const submitted = await onSubmit(nextDraft);
      if (submitted !== false && recordHistoryOnSubmit) {
        setHistory((item) => recordSentComposerDraft(item, nextDraft));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [disabled, markdownValue, onSubmit, recordHistoryOnSubmit, submitDisabled, usersById]);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => actionsRef.current?.focusEnd());
  }, []);

  const togglePreview = useCallback(() => {
    setEmojiOpen(false);
    setPreviewing((value) => {
      if (value) focusEditor();
      return !value;
    });
  }, [focusEditor]);

  const insertEmoji = useCallback((emojiName: string) => {
    setEmojiOpen(false);
    actionsRef.current?.insertText(displayChatReactionEmoji(emojiName));
  }, []);

  const insertAtSign = useCallback(() => {
    actionsRef.current?.insertText("@");
  }, []);

  const handleFilesInsert = useCallback((files: File[]) => {
    if (files.length === 0 || !onFilesInsert) return false;
    onFilesInsert(files);
    return true;
  }, [onFilesInsert]);

  const handleRichTextKeyDown = useCallback((event: KeyboardEvent, actions: OrfRichTextEditorActions) => {
    const currentMarkdown = actions.getMarkdown();
    const currentDraft = markdownToDraft(currentMarkdown);
    const empty = !orfRichTextHasMeaningfulContent(currentMarkdown);

    if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      if (onCancel) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return true;
      }
    }

    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const recalled = recallComposerHistory(history, currentDraft, event.key === "ArrowUp" ? "older" : "newer");
      if (recalled) {
        event.preventDefault();
        event.stopPropagation();
        applyDraftToEditor(recalled.draft, event.key === "ArrowUp" ? "start" : "end");
        setHistory(recalled.history);
        return true;
      }
    }

    if (event.key === "ArrowUp" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && empty) {
      if (onReplyToLatest) {
        event.preventDefault();
        event.stopPropagation();
        onReplyToLatest();
        return true;
      }
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      !event.altKey &&
      (event.key === "\\" || event.code === "Backslash") &&
      !event.isComposing
    ) {
      if (onReactToLatest) {
        event.preventDefault();
        event.stopPropagation();
        onReactToLatest();
        return true;
      }
    }

    if (!empty && matchesPreviewShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      togglePreview();
      return true;
    }

    if (event.key === "ArrowUp" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && actions.isSelectionAtStart()) {
      if (onEditLatest && empty) {
        event.preventDefault();
        event.stopPropagation();
        onEditLatest();
        return true;
      }
      if (history.cursorIndex !== null || empty) {
        const recalled = recallComposerHistory(history, currentDraft, "older");
        if (recalled) {
          event.preventDefault();
          event.stopPropagation();
          applyDraftToEditor(recalled.draft, "start");
          setHistory(recalled.history);
          return true;
        }
      }
    }

    if (event.key === "ArrowDown" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && history.cursorIndex !== null && actions.isSelectionAtEnd()) {
      const recalled = recallComposerHistory(history, currentDraft, "newer");
      if (recalled) {
        event.preventDefault();
        event.stopPropagation();
        applyDraftToEditor(recalled.draft, "end");
        setHistory(recalled.history);
        return true;
      }
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      ((event.altKey && !event.shiftKey) || (!event.altKey && event.shiftKey)) &&
      matchesChatShortcutKey(event, { code: "KeyE", key: "e" }) &&
      !event.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      setEmojiOpen((open) => !open);
      return true;
    }

    return false;
  }, [
    applyDraftToEditor,
    history,
    markdownToDraft,
    onCancel,
    onEditLatest,
    onReactToLatest,
    onReplyToLatest,
    togglePreview,
  ]);

  const handlePreviewKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (matchesPreviewShortcut(event.nativeEvent) || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (previewing) togglePreview();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      void submit();
    }
  };

  const extraToolbarControls = (
    <>
      <button
        className={clsx("orf-rich-text-tool-button", previewing && "orf-rich-text-tool-button-active")}
        disabled={!orfRichTextHasMeaningfulContent(markdownValue)}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={togglePreview}
        title="预览 Markdown"
        aria-label="预览 Markdown"
      >
        {previewing ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <span className="orf-chat-composer-emoji-anchor" ref={emojiAnchorRef}>
        <button
          className="orf-rich-text-tool-button"
          disabled={disabled || previewing}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setEmojiOpen((open) => !open)}
          title="表情"
          aria-label="表情"
        >
          <Smile className="h-4 w-4" />
        </button>
        {emojiOpen && (
          <ChatReactionPicker
            anchorRef={emojiAnchorRef}
            emptyLabel="没有匹配表情"
            label="插入表情"
            onClose={() => setEmojiOpen(false)}
            onSelect={insertEmoji}
            searchPlaceholder="搜索表情"
          />
        )}
      </span>
      {toolbarControls}
      <button
        className="orf-rich-text-tool-button"
        disabled={disabled || previewing}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={insertAtSign}
        title="提及成员 @"
        aria-label="提及成员"
      >
        <AtSign className="h-4 w-4" />
      </button>
    </>
  );

  if (previewing) {
    return (
      <div className={clsx("orf-chat-draft-editor", className)}>
        <div
          className="orf-chat-draft-preview"
          onDoubleClick={togglePreview}
          onKeyDown={handlePreviewKeyDown}
          ref={previewRef}
          role="region"
          tabIndex={0}
        >
          {markdownValue.trim() ? (
            <ChatMarkdown body={markdownValue} feedbackItems={feedbackItems} usersById={usersById} />
          ) : (
            <span className="orf-chat-draft-preview-empty">{placeholder}</span>
          )}
        </div>
        <div className="orf-rich-text-footer orf-chat-rich-text-preview-footer">
          <button
            type="button"
            className="orf-rich-text-tool-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={togglePreview}
            title="继续编辑"
            aria-label="继续编辑"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <span className="orf-chat-composer-end-actions">
            {toolbarEnd?.({ submit: () => void submit(), submitting })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <OrfRichTextEditor
      actionsRef={actionsRef}
      className={clsx("orf-chat-draft-editor", className)}
      currentUserId=""
      disabled={disabled}
      excludeCurrentUserFromMentions={false}
      footer={(
        <span className="orf-chat-composer-end-actions">
          {toolbarEnd?.({ submit: () => void submit(), submitting })}
        </span>
      )}
      idleHint=""
      mentionPlainTextUserIds={chatMentionPlainTextUserIds}
      mentionableUsers={richMentionableUsers}
      onChange={handleMarkdownChange}
      onFilesInsert={handleFilesInsert}
      onKeyDown={handleRichTextKeyDown}
      onSubmitRequest={() => void submit()}
      placeholder={placeholder ?? ""}
      toolbarControls={extraToolbarControls}
      transformPastedText={transformPastedText}
      value={markdownValue}
    />
  );
}
