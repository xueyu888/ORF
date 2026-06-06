import { clsx } from "clsx";
import { AtSign, Bold, Code, Italic, Link as LinkIcon, Quote } from "lucide-react";
import { type ClipboardEventHandler, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../../components/ui";
import type { ChatUser } from "../../types/orf";
import { emptyComposerHistory, recallComposerHistory, recordSentComposerDraft } from "./chatComposerModel";
import {
  type ChatDraft,
  mentionLabel,
  mentionRangeFor,
  reconcileMentions,
} from "./chatModels";

type ChatDraftEditorToolbarState = {
  submit: () => void;
  submitting: boolean;
};

type ChatDraftEditorProps = {
  className?: string;
  disabled?: boolean;
  draft: ChatDraft;
  mentionableUsers: ChatUser[];
  onChange: (draft: ChatDraft) => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onSubmit?: (draft: ChatDraft) => Promise<boolean | void> | boolean | void;
  onTyping?: () => void;
  placeholder?: string;
  recordHistoryOnSubmit?: boolean;
  resetKey?: string;
  rows?: number;
  submitDisabled?: boolean;
  toolbarControls?: ReactNode;
  toolbarEnd?: (state: ChatDraftEditorToolbarState) => ReactNode;
};

export function ChatDraftEditor({
  className,
  disabled,
  draft,
  mentionableUsers,
  onChange,
  onPaste,
  onSubmit,
  onTyping,
  placeholder,
  recordHistoryOnSubmit,
  resetKey,
  rows = 3,
  submitDisabled,
  toolbarControls,
  toolbarEnd,
}: ChatDraftEditorProps) {
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionRangeFor>>(null);
  const [selectedMention, setSelectedMention] = useState(0);
  const [history, setHistory] = useState(emptyComposerHistory);
  const [submitting, setSubmitting] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const submittingRef = useRef(false);
  const mentionUsers = useMemo(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.toLowerCase();
    return mentionableUsers
      .filter((user) => user.status === "active")
      .filter((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
      .slice(0, 8);
  }, [mentionRange, mentionableUsers]);

  useEffect(() => {
    setMentionRange(null);
    setSelectedMention(0);
    setHistory(emptyComposerHistory);
    setSubmitting(false);
    submittingRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!draft.text) setMentionRange(null);
  }, [draft.text]);

  const setText = (text: string, cursor: number) => {
    const mentions = reconcileMentions(draft.text, text, draft.mentions);
    onChange({ text, mentions });
    setMentionRange(mentionRangeFor(text, cursor, mentions));
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
  };

  const insertMarkdown = (before: string, after = before) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = `${draft.text.slice(0, start)}${before}${draft.text.slice(start, end)}${after}${draft.text.slice(end)}`;
    const mentions = reconcileMentions(draft.text, nextText, draft.mentions);
    const cursor = start + before.length;
    onChange({ text: nextText, mentions });
    setMentionRange(mentionRangeFor(nextText, cursor, mentions));
    setSelectedMention(0);
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, end + before.length);
    }, 0);
  };

  const insertMention = (user: ChatUser) => {
    if (!mentionRange) return;
    const label = mentionLabel(user.name);
    const replacement = `@${label}`;
    const nextText = `${draft.text.slice(0, mentionRange.start)}${replacement} ${draft.text.slice(mentionRange.end)}`;
    const nextMention = {
      start: mentionRange.start,
      end: mentionRange.start + replacement.length,
      label,
      userId: user.id,
    };
    const mentions = [
      ...draft.mentions.filter((mention) => mention.end <= mentionRange.start || mention.start >= mentionRange.end),
      nextMention,
    ].sort((left, right) => left.start - right.start);
    onChange({ text: nextText, mentions });
    setMentionRange(null);
    window.setTimeout(() => {
      const cursor = nextMention.end + 1;
      textAreaRef.current?.focus();
      textAreaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const submit = async () => {
    if (disabled || submitDisabled || submittingRef.current || !onSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const submitted = await onSubmit(draft);
      if (submitted !== false && recordHistoryOnSubmit) {
        setHistory((item) => recordSentComposerDraft(item, draft));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionRange && mentionUsers.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMention((index) => (index + 1) % mentionUsers.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMention((index) => (index - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        insertMention(mentionUsers[selectedMention] ?? mentionUsers[0]);
        return;
      }
      if (event.key === "Escape") {
        setMentionRange(null);
        return;
      }
    }
    if (event.key === "ArrowUp" && !event.shiftKey) {
      const textarea = textAreaRef.current;
      const canRecall = textarea?.selectionStart === 0 && (history.cursorIndex !== null || !draft.text.trim());
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "older");
        if (recalled) {
          event.preventDefault();
          onChange(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            next.setSelectionRange(0, 0);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "ArrowDown" && !event.shiftKey && history.cursorIndex !== null) {
      const textarea = textAreaRef.current;
      const canRecall = textarea ? textarea.selectionStart === textarea.value.length : true;
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "newer");
        if (recalled) {
          event.preventDefault();
          onChange(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            const cursor = next.value.length;
            next.setSelectionRange(cursor, cursor);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "Enter" && event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      const textarea = textAreaRef.current;
      if (!textarea) return;
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextText = `${draft.text.slice(0, start)}\n${draft.text.slice(end)}`;
      setText(nextText, start + 1);
      window.setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className={clsx("orf-chat-draft-editor", className)}>
      <textarea
        disabled={disabled}
        onChange={(event) => setText(event.target.value, event.target.selectionStart)}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
        ref={textAreaRef}
        rows={rows}
        value={draft.text}
      />
      {mentionRange && (
        <div className="orf-chat-mention-menu">
          {mentionUsers.length > 0 ? mentionUsers.map((user, index) => (
            <button
              className={index === selectedMention ? "orf-chat-mention-option-active" : ""}
              key={user.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMention(user)}
            >
              <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
              <span>{user.name}</span>
              <small>{user.email}</small>
            </button>
          )) : <div className="orf-chat-mention-empty">没有匹配成员</div>}
        </div>
      )}
      <div className="orf-chat-composer-toolbar">
        <button type="button" onClick={() => insertMarkdown("**")} title="加粗"><Bold className="h-4 w-4" /></button>
        <button type="button" onClick={() => insertMarkdown("_")} title="斜体"><Italic className="h-4 w-4" /></button>
        <button type="button" onClick={() => insertMarkdown("`")} title="代码"><Code className="h-4 w-4" /></button>
        <button type="button" onClick={() => insertMarkdown("> ", "")} title="引用"><Quote className="h-4 w-4" /></button>
        <button type="button" onClick={() => insertMarkdown("[", "](https://)")} title="链接"><LinkIcon className="h-4 w-4" /></button>
        {toolbarControls}
        <button type="button" onClick={() => insertMarkdown("@", "")} title="提及成员"><AtSign className="h-4 w-4" /></button>
        <span className="orf-chat-composer-spacer" />
        {toolbarEnd?.({ submit: () => void submit(), submitting })}
      </div>
    </div>
  );
}
