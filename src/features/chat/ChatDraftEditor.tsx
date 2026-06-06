import { clsx } from "clsx";
import { AtSign, Bold, Code, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Quote, Smile, Strikethrough } from "lucide-react";
import { type ClipboardEventHandler, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../../components/ui";
import type { ChatUser } from "../../types/orf";
import { emptyComposerHistory, recallComposerHistory, recordSentComposerDraft } from "./chatComposerModel";
import { applyChatMarkdownShortcut, type ChatMarkdownMode } from "./chatMarkdownShortcutModel";
import { ChatReactionPicker } from "./ChatReactionPicker";
import {
  type ChatDraft,
  mentionLabel,
  mentionRangeFor,
  reconcileMentions,
} from "./chatModels";
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
  mentionableUsers: ChatUser[];
  onChange: (draft: ChatDraft) => void;
  onEditLatest?: () => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onReactToLatest?: () => void;
  onReplyToLatest?: () => void;
  onSubmit?: (draft: ChatDraft) => Promise<boolean | void> | boolean | void;
  onTyping?: () => void;
  placeholder?: string;
  recordHistoryOnSubmit?: boolean;
  focusSignal?: number;
  resetKey?: string;
  rows?: number;
  submitDisabled?: boolean;
  toolbarControls?: ReactNode;
  toolbarEnd?: (state: ChatDraftEditorToolbarState) => ReactNode;
};

const chatDraftEditorMaxHeight = 220;

function resizeDraftTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, chatDraftEditorMaxHeight);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > chatDraftEditorMaxHeight ? "auto" : "hidden";
}

function markdownShortcutModeFor(event: KeyboardEvent<HTMLTextAreaElement>): ChatMarkdownMode | null {
  if (event.nativeEvent.isComposing) return null;
  const key = event.key.toLowerCase();
  const code = event.code;
  const primary = event.ctrlKey || event.metaKey;
  if (primary && !event.altKey && !event.shiftKey) {
    if (key === "b") return "bold";
    if (key === "i") return "italic";
    if (key === "k") return "link";
  }
  if (primary && event.altKey && !event.shiftKey) {
    if (key === "c") return "code";
    if (key === "h") return "heading";
    if (key === "k") return "link";
  }
  if (!primary && event.altKey && event.shiftKey) {
    if (code === "Digit7") return "orderedList";
    if (code === "Digit8") return "unorderedList";
    if (code === "Digit9") return "quote";
    if (key === "h") return "heading";
    if (key === "x") return "strike";
  }
  if (primary && event.shiftKey && !event.altKey) {
    if (code === "Digit7") return "orderedList";
    if (code === "Digit8") return "unorderedList";
    if (key === "x") return "strike";
  }
  return null;
}

export function ChatDraftEditor({
  autoFocus,
  className,
  disabled,
  draft,
  mentionableUsers,
  onChange,
  onEditLatest,
  onPaste,
  onReactToLatest,
  onReplyToLatest,
  onSubmit,
  onTyping,
  placeholder,
  recordHistoryOnSubmit,
  focusSignal,
  resetKey,
  rows = 3,
  submitDisabled,
  toolbarControls,
  toolbarEnd,
}: ChatDraftEditorProps) {
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionRangeFor>>(null);
  const [selectedMention, setSelectedMention] = useState(0);
  const [history, setHistory] = useState(emptyComposerHistory);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emojiAnchorRef = useRef<HTMLSpanElement | null>(null);
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

  useEffect(() => {
    if (disabled) setEmojiOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (focusSignal === undefined || disabled) return;
    window.requestAnimationFrame(() => {
      textAreaRef.current?.focus();
    });
  }, [disabled, focusSignal]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    window.requestAnimationFrame(() => {
      const textarea = textAreaRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [autoFocus, disabled, resetKey]);

  useLayoutEffect(() => {
    resizeDraftTextarea(textAreaRef.current);
  }, [draft.text, resetKey, rows]);

  const setText = (text: string, cursor: number) => {
    const mentions = reconcileMentions(draft.text, text, draft.mentions);
    onChange({ text, mentions });
    setMentionRange(mentionRangeFor(text, cursor, mentions));
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
  };

  const applyMarkdownMode = (mode: ChatMarkdownMode) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const result = applyChatMarkdownShortcut({
      draft,
      mode,
      selectionEnd: textarea.selectionEnd,
      selectionStart: textarea.selectionStart,
    });
    onChange(result.draft);
    setMentionRange(mentionRangeFor(result.draft.text, result.selectionEnd, result.draft.mentions));
    setSelectedMention(0);
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 0);
  };

  const insertTextAtSelection = (text: string) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = `${draft.text.slice(0, start)}${text}${draft.text.slice(end)}`;
    setText(nextText, start + text.length);
    setSelectedMention(0);
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const insertEmoji = (emojiName: string) => {
    setEmojiOpen(false);
    insertTextAtSelection(displayChatReactionEmoji(emojiName));
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
        event.preventDefault();
        event.stopPropagation();
        setMentionRange(null);
        return;
      }
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const recalled = recallComposerHistory(history, draft, event.key === "ArrowUp" ? "older" : "newer");
      if (recalled) {
        event.preventDefault();
        event.stopPropagation();
        onChange(recalled.draft);
        setHistory(recalled.history);
        setMentionRange(null);
        window.setTimeout(() => {
          const next = textAreaRef.current;
          if (!next) return;
          const cursor = event.key === "ArrowUp" ? 0 : next.value.length;
          next.focus();
          next.setSelectionRange(cursor, cursor);
        }, 0);
        return;
      }
    }
    if (event.key === "ArrowUp" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !draft.text.trim()) {
      if (onReplyToLatest) {
        event.preventDefault();
        event.stopPropagation();
        onReplyToLatest();
        return;
      }
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      !event.altKey &&
      (event.key === "\\" || event.code === "Backslash") &&
      !event.nativeEvent.isComposing
    ) {
      if (onReactToLatest) {
        event.preventDefault();
        event.stopPropagation();
        onReactToLatest();
        return;
      }
    }
    if (event.key === "ArrowUp" && !event.shiftKey) {
      const textarea = textAreaRef.current;
      if (
        onEditLatest &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !draft.text.trim() &&
        textarea?.selectionStart === 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        onEditLatest();
        return;
      }
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
    const markdownMode = markdownShortcutModeFor(event);
    if (markdownMode) {
      event.preventDefault();
      event.stopPropagation();
      applyMarkdownMode(markdownMode);
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      ((event.altKey && !event.shiftKey) || (!event.altKey && event.shiftKey)) &&
      event.key.toLowerCase() === "e" &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      setEmojiOpen((open) => !open);
      return;
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
        <button type="button" onClick={() => applyMarkdownMode("bold")} title="加粗 Ctrl/Cmd+B"><Bold className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("italic")} title="斜体 Ctrl/Cmd+I"><Italic className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("strike")} title="删除线 Ctrl/Cmd+Shift+X"><Strikethrough className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("code")} title="代码 Ctrl/Cmd+Alt+C"><Code className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("heading")} title="标题 Ctrl/Cmd+Alt+H"><Heading3 className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("unorderedList")} title="无序列表 Shift+Alt+8"><List className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("orderedList")} title="有序列表 Shift+Alt+7"><ListOrdered className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("quote")} title="引用 Shift+Alt+9"><Quote className="h-4 w-4" /></button>
        <button type="button" onClick={() => applyMarkdownMode("link")} title="链接 Ctrl/Cmd+K"><LinkIcon className="h-4 w-4" /></button>
        <span className="orf-chat-composer-emoji-anchor" ref={emojiAnchorRef}>
          <button type="button" onClick={() => setEmojiOpen((open) => !open)} title="表情 Ctrl/Cmd+Alt+E 或 Ctrl/Cmd+Shift+E">
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
        <button type="button" onClick={() => insertTextAtSelection("@")} title="提及成员 @"><AtSign className="h-4 w-4" /></button>
        <span className="orf-chat-composer-spacer" />
        {toolbarEnd?.({ submit: () => void submit(), submitting })}
      </div>
    </div>
  );
}
