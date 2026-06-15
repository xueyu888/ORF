import { clsx } from "clsx";
import { Bold, Check, Code, Heading3, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Quote, Strikethrough, Unlink, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { UserAvatar } from "../../components/UserAvatar";
import {
  orfMentionMarkdown,
  orfRichTextHasMeaningfulContent,
  orfRichTextMentionLabel,
  parseOrfAttachmentMarkdownToken,
} from "./orfRichTextMarkdown";

export type OrfRichTextMentionUser = {
  avatarUrl?: string | null;
  email?: string | null;
  id: string;
  name: string;
  searchText?: string;
  status?: string;
};

export type OrfRichTextMentionInsert = {
  label: string;
  range: {
    from: number;
    to: number;
  };
  text: string;
  user: OrfRichTextMentionUser;
};

type MentionRange = {
  from: number;
  query: string;
  to: number;
};

type TextRange = {
  from: number;
  to: number;
};

export type OrfRichTextImageUploadResult = {
  markdown: string;
  previewUrl?: string | null;
};

export type OrfRichTextEditorActions = {
  focus: () => void;
  focusEnd: () => void;
  focusStart: () => void;
  getMarkdown: () => string;
  insertMarkdown: (markdown: string) => void;
  insertText: (text: string) => void;
  isEmpty: () => boolean;
  isSelectionAtEnd: () => boolean;
  isSelectionAtStart: () => boolean;
  setMarkdown: (markdown: string) => void;
};

export type OrfRichTextEditorProps = {
  actionsRef?: MutableRefObject<OrfRichTextEditorActions | null>;
  autoGrow?: boolean;
  autoFocus?: boolean;
  className?: string;
  currentUserId: string;
  disabled?: boolean;
  excludeCurrentUserFromMentions?: boolean;
  footer?: ReactNode;
  formatMentionText?: (user: OrfRichTextMentionUser, label: string) => string;
  idleHint?: string;
  mentionPlainTextUserIds?: ReadonlySet<string>;
  mentionableUsers: OrfRichTextMentionUser[];
  onBusyChange?: (busy: boolean) => void;
  onChange: (markdown: string) => void;
  onErrorChange?: (message: string) => void;
  onFilesInsert?: (files: File[]) => boolean | void;
  onKeyDown?: (event: KeyboardEvent, actions: OrfRichTextEditorActions) => boolean | void;
  onMentionInsert?: (insert: OrfRichTextMentionInsert) => void;
  onSubmitRequest?: () => void;
  onUploadImage?: (file: File) => Promise<OrfRichTextImageUploadResult | null>;
  placeholder: string;
  submitOnEnter?: boolean;
  toolbarControls?: ReactNode;
  transformPastedText?: (text: string) => string;
  value: string;
};

const supportedImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

function isImageFile(file: File) {
  return file.type.startsWith("image/") && (supportedImageTypes.has(file.type) || file.type === "");
}

function isAllowedRichTextLinkUrl(url: string) {
  return /^(https?:\/\/|\/(?!\/))/.test(url);
}

function mentionRangeForMarkdown(markdown: string, cursor: number): MentionRange | null {
  const prefix = markdown.slice(0, cursor);
  const match = /(^|[\s(（])@([^\s@()[\]]{0,40})$/u.exec(prefix);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    from: cursor - query.length - 1,
    query,
    to: cursor,
  };
}

function textRangeForTextarea(textarea: HTMLTextAreaElement | null): TextRange {
  return {
    from: textarea?.selectionStart ?? 0,
    to: textarea?.selectionEnd ?? 0,
  };
}

function selectedLineRange(markdown: string, range: TextRange): TextRange {
  const from = markdown.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextNewline = markdown.indexOf("\n", range.to);
  return {
    from,
    to: nextNewline === -1 ? markdown.length : nextNewline,
  };
}

function lineParts(markdown: string, range: TextRange) {
  const block = markdown.slice(range.from, range.to);
  const hasTrailingNewline = block.endsWith("\n");
  const lines = hasTrailingNewline ? block.slice(0, -1).split("\n") : block.split("\n");
  return { hasTrailingNewline, lines };
}

function joinLineParts(lines: string[], hasTrailingNewline: boolean) {
  return `${lines.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}

function replaceRange(markdown: string, range: TextRange, value: string) {
  return `${markdown.slice(0, range.from)}${value}${markdown.slice(range.to)}`;
}

function nextBlockInsert(markdown: string, range: TextRange, block: string) {
  const before = markdown.slice(0, range.from);
  const after = markdown.slice(range.to);
  const prefix = !before.trim() ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = !after.trim() ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return {
    markdown: `${before}${prefix}${block}${suffix}${after}`,
    selection: before.length + prefix.length + block.length,
  };
}

function unwrapMarkdownLink(value: string) {
  const match = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+|\/(?!\/)[^)\s<]+)\)$/.exec(value);
  return match?.[1] ?? value;
}

function mentionUserMatchesQuery(user: OrfRichTextMentionUser, query: string) {
  return (
    !query ||
    user.name.toLowerCase().includes(query) ||
    (user.email ?? "").toLowerCase().includes(query) ||
    (user.searchText ?? "").toLowerCase().includes(query)
  );
}

function listVisibleMentionUsers(input: {
  currentUserId: string;
  excludeCurrentUser: boolean;
  mentionRange: MentionRange | null;
  users: OrfRichTextMentionUser[];
}) {
  if (!input.mentionRange) return [];
  const query = input.mentionRange.query.trim().toLowerCase();
  return input.users
    .filter((user) => !input.excludeCurrentUser || user.id !== input.currentUserId)
    .filter((user) => user.status === undefined || user.status === "active")
    .filter((user) => mentionUserMatchesQuery(user, query));
}

export function OrfRichTextEditor({
  actionsRef,
  autoGrow = false,
  autoFocus = false,
  className,
  currentUserId,
  disabled = false,
  excludeCurrentUserFromMentions = true,
  footer,
  formatMentionText,
  idleHint,
  mentionPlainTextUserIds,
  mentionableUsers,
  onBusyChange,
  onChange,
  onErrorChange,
  onFilesInsert,
  onKeyDown,
  onMentionInsert,
  onSubmitRequest,
  onUploadImage,
  placeholder,
  submitOnEnter = true,
  toolbarControls,
  transformPastedText,
  value,
}: OrfRichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const disabledRef = useRef(disabled);
  const formatMentionTextRef = useRef(formatMentionText);
  const markdownRef = useRef(value);
  const lastAppliedMarkdownRef = useRef(value);
  const mentionPlainTextUserIdsRef = useRef(mentionPlainTextUserIds);
  const onBusyChangeRef = useRef(onBusyChange);
  const onChangeRef = useRef(onChange);
  const onErrorChangeRef = useRef(onErrorChange);
  const onFilesInsertRef = useRef(onFilesInsert);
  const onKeyDownRef = useRef(onKeyDown);
  const onMentionInsertRef = useRef(onMentionInsert);
  const onSubmitRequestRef = useRef(onSubmitRequest);
  const onUploadImageRef = useRef(onUploadImage);
  const submitOnEnterRef = useRef(submitOnEnter);
  const transformPastedTextRef = useRef(transformPastedText);
  const uploadImageRef = useRef<(file: File) => void>(() => undefined);
  const [markdown, setMarkdown] = useState(value);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [linkDraft, setLinkDraft] = useState<{ error: string; open: boolean; url: string }>({ error: "", open: false, url: "" });
  const [uploadingImage, setUploadingImage] = useState(false);

  const filteredMentionUsers = useMemo(() => {
    return listVisibleMentionUsers({
      currentUserId,
      excludeCurrentUser: excludeCurrentUserFromMentions,
      mentionRange,
      users: mentionableUsers,
    });
  }, [currentUserId, excludeCurrentUserFromMentions, mentionRange, mentionableUsers]);

  const resizeAutoGrowTextarea = useCallback(() => {
    if (!autoGrow) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [autoGrow]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!autoGrow) {
      textarea.style.removeProperty("height");
      return;
    }
    resizeAutoGrowTextarea();
  }, [autoGrow, markdown, resizeAutoGrowTextarea]);

  useEffect(() => {
    if (!autoGrow) return undefined;
    const syncTextareaHeight = () => resizeAutoGrowTextarea();
    window.addEventListener("resize", syncTextareaHeight);
    const container = textareaRef.current?.parentElement;
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncTextareaHeight);
    if (container) resizeObserver?.observe(container);
    return () => {
      window.removeEventListener("resize", syncTextareaHeight);
      resizeObserver?.disconnect();
    };
  }, [autoGrow, resizeAutoGrowTextarea]);

  const refreshMentionRange = useCallback((nextMarkdown = markdownRef.current, cursor = textareaRef.current?.selectionStart ?? 0) => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.selectionStart !== textarea.selectionEnd) {
      setMentionRange(null);
      return;
    }
    setMentionRange(mentionRangeForMarkdown(nextMarkdown, cursor));
  }, []);

  const focusSelection = useCallback((from: number, to = from) => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(from, to);
      refreshMentionRange(markdownRef.current, to);
    });
  }, [refreshMentionRange]);

  const applyLocalMarkdown = useCallback((nextMarkdown: string, selection?: TextRange | number) => {
    markdownRef.current = nextMarkdown;
    lastAppliedMarkdownRef.current = nextMarkdown;
    setMarkdown(nextMarkdown);
    if (selection !== undefined) {
      const range = typeof selection === "number" ? { from: selection, to: selection } : selection;
      focusSelection(range.from, range.to);
    }
  }, [focusSelection]);

  const emitMarkdown = useCallback((nextMarkdown: string, selection?: TextRange | number) => {
    applyLocalMarkdown(nextMarkdown, selection);
    onChangeRef.current(nextMarkdown);
  }, [applyLocalMarkdown]);

  const insertRawText = useCallback((text: string) => {
    const range = textRangeForTextarea(textareaRef.current);
    const nextMarkdown = replaceRange(markdownRef.current, range, text);
    emitMarkdown(nextMarkdown, range.from + text.length);
  }, [emitMarkdown]);

  const insertBlockMarkdown = useCallback((block: string) => {
    const range = textRangeForTextarea(textareaRef.current);
    const next = nextBlockInsert(markdownRef.current, range, block);
    emitMarkdown(next.markdown, next.selection);
  }, [emitMarkdown]);

  const actions = useMemo<OrfRichTextEditorActions>(() => ({
    focus: () => textareaRef.current?.focus(),
    focusEnd: () => focusSelection(markdownRef.current.length),
    focusStart: () => focusSelection(0),
    getMarkdown: () => markdownRef.current,
    insertMarkdown: insertRawText,
    insertText: insertRawText,
    isEmpty: () => !orfRichTextHasMeaningfulContent(markdownRef.current),
    isSelectionAtEnd: () => (textareaRef.current?.selectionEnd ?? markdownRef.current.length) >= markdownRef.current.length,
    isSelectionAtStart: () => (textareaRef.current?.selectionStart ?? 0) <= 0,
    setMarkdown: (nextMarkdown: string) => {
      applyLocalMarkdown(nextMarkdown);
      refreshMentionRange(nextMarkdown);
    },
  }), [applyLocalMarkdown, focusSelection, insertRawText, refreshMentionRange]);

  useEffect(() => {
    if (!actionsRef) return undefined;
    actionsRef.current = actions;
    return () => {
      if (actionsRef.current === actions) actionsRef.current = null;
    };
  }, [actions, actionsRef]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onErrorChangeRef.current = onErrorChange;
  }, [onErrorChange]);

  useEffect(() => {
    onFilesInsertRef.current = onFilesInsert;
  }, [onFilesInsert]);

  useEffect(() => {
    onKeyDownRef.current = onKeyDown;
  }, [onKeyDown]);

  useEffect(() => {
    formatMentionTextRef.current = formatMentionText;
  }, [formatMentionText]);

  useEffect(() => {
    onMentionInsertRef.current = onMentionInsert;
  }, [onMentionInsert]);

  useEffect(() => {
    onSubmitRequestRef.current = onSubmitRequest;
  }, [onSubmitRequest]);

  useEffect(() => {
    onUploadImageRef.current = onUploadImage;
  }, [onUploadImage]);

  useEffect(() => {
    submitOnEnterRef.current = submitOnEnter;
  }, [submitOnEnter]);

  useEffect(() => {
    transformPastedTextRef.current = transformPastedText;
  }, [transformPastedText]);

  useEffect(() => {
    mentionPlainTextUserIdsRef.current = mentionPlainTextUserIds;
  }, [mentionPlainTextUserIds]);

  useEffect(() => {
    if (value === lastAppliedMarkdownRef.current) return;
    applyLocalMarkdown(value);
    refreshMentionRange(value);
  }, [applyLocalMarkdown, refreshMentionRange, value]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionRange?.query, filteredMentionUsers.length]);

  useEffect(() => {
    if (!mentionRange || filteredMentionUsers.length === 0) return;
    mentionOptionRefs.current[selectedMentionIndex]?.scrollIntoView({ block: "nearest" });
  }, [filteredMentionUsers.length, mentionRange, selectedMentionIndex]);

  useEffect(() => {
    if (autoFocus && !disabled) focusSelection(markdownRef.current.length);
  }, [autoFocus, disabled, focusSelection]);

  const uploadImage = useCallback(async (file: File) => {
    if (disabledRef.current) return;
    const uploadImageHandler = onUploadImageRef.current;
    if (!uploadImageHandler) return;
    if (!isImageFile(file)) {
      onErrorChangeRef.current?.("只能上传 PNG、JPEG、GIF 或 WebP 图片");
      return;
    }

    setUploadingImage(true);
    onBusyChangeRef.current?.(true);
    onErrorChangeRef.current?.("");
    try {
      const upload = await uploadImageHandler(file);
      const attachment = upload ? parseOrfAttachmentMarkdownToken(upload.markdown) : null;
      if (!upload || !attachment) {
        onErrorChangeRef.current?.("图片上传失败");
        return;
      }
      insertBlockMarkdown(upload.markdown);
    } finally {
      setUploadingImage(false);
      onBusyChangeRef.current?.(false);
    }
  }, [insertBlockMarkdown]);

  useEffect(() => {
    uploadImageRef.current = (file: File) => {
      void uploadImage(file);
    };
  }, [uploadImage]);

  const wrapInlineMarkdown = useCallback((prefix: string, suffix = prefix) => {
    const range = textRangeForTextarea(textareaRef.current);
    const current = markdownRef.current;
    const selected = current.slice(range.from, range.to);
    if (selected && selected.startsWith(prefix) && selected.endsWith(suffix)) {
      const inner = selected.slice(prefix.length, selected.length - suffix.length);
      emitMarkdown(replaceRange(current, range, inner), { from: range.from, to: range.from + inner.length });
      return;
    }
    const nextText = `${prefix}${selected}${suffix}`;
    const nextRange = selected
      ? { from: range.from, to: range.from + nextText.length }
      : { from: range.from + prefix.length, to: range.from + prefix.length };
    emitMarkdown(replaceRange(current, range, nextText), nextRange);
  }, [emitMarkdown]);

  const applyLineMarkdown = useCallback((kind: "bullet" | "heading" | "ordered" | "quote") => {
    const current = markdownRef.current;
    const range = selectedLineRange(current, textRangeForTextarea(textareaRef.current));
    const { hasTrailingNewline, lines } = lineParts(current, range);
    const actionable = lines.filter((line) => line.trim());
    if (actionable.length === 0) {
      const marker = kind === "heading" ? "### " : kind === "ordered" ? "1. " : kind === "quote" ? "> " : "- ";
      emitMarkdown(replaceRange(current, textRangeForTextarea(textareaRef.current), marker), range.from + marker.length);
      return;
    }

    let orderedIndex = 1;
    const nextLines = lines.map((line) => {
      if (!line.trim()) return line;
      if (kind === "heading") {
        return actionable.every((item) => /^\s{0,3}#{1,6}\s+/.test(item))
          ? line.replace(/^(\s{0,3})#{1,6}\s+/, "$1")
          : line.replace(/^(\s{0,3})(?:#{1,6}\s+)?/, "$1### ");
      }
      if (kind === "quote") {
        return actionable.every((item) => /^\s*>\s?/.test(item))
          ? line.replace(/^(\s*)>\s?/, "$1")
          : line.replace(/^(\s*)/, "$1> ");
      }
      if (kind === "bullet") {
        return actionable.every((item) => /^\s*[-*+]\s+/.test(item))
          ? line.replace(/^(\s*)[-*+]\s+/, "$1")
          : line.replace(/^(\s*)(?:[-*+]\s+)?/, "$1- ");
      }
      const nextOrderedIndex = orderedIndex;
      orderedIndex += 1;
      return actionable.every((item) => /^\s*\d+[.)]\s+/.test(item))
        ? line.replace(/^(\s*)\d+[.)]\s+/, "$1")
        : line.replace(/^(\s*)(?:\d+[.)]\s+)?/, `$1${nextOrderedIndex}. `);
    });

    const nextBlock = joinLineParts(nextLines, hasTrailingNewline);
    emitMarkdown(replaceRange(current, range, nextBlock), { from: range.from, to: range.from + nextBlock.length });
  }, [emitMarkdown]);

  const openLinkEditor = useCallback(() => {
    const range = textRangeForTextarea(textareaRef.current);
    const selected = markdownRef.current.slice(range.from, range.to);
    const link = selected.match(/^\[[^\]\n]+\]\((https?:\/\/[^)\s<]+|\/(?!\/)[^)\s<]+)\)$/);
    setLinkDraft({ error: "", open: true, url: link?.[1] ?? "https://" });
    window.requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
  }, []);

  const closeLinkEditor = useCallback(() => {
    setLinkDraft({ error: "", open: false, url: "" });
    textareaRef.current?.focus();
  }, []);

  const applyLinkDraft = useCallback((event: FormEvent) => {
    event.preventDefault();
    const url = linkDraft.url.trim();
    if (!url) {
      closeLinkEditor();
      return;
    }
    if (!isAllowedRichTextLinkUrl(url)) {
      setLinkDraft((draft) => ({ ...draft, error: "只支持 http(s) 链接或站内 / 路径" }));
      return;
    }
    const range = textRangeForTextarea(textareaRef.current);
    const selected = markdownRef.current.slice(range.from, range.to);
    const label = unwrapMarkdownLink(selected).trim() || url;
    const token = `[${label}](${url})`;
    emitMarkdown(replaceRange(markdownRef.current, range, token), { from: range.from, to: range.from + token.length });
    setLinkDraft({ error: "", open: false, url: "" });
  }, [closeLinkEditor, emitMarkdown, linkDraft.url]);

  const removeLink = useCallback(() => {
    const range = textRangeForTextarea(textareaRef.current);
    const selected = markdownRef.current.slice(range.from, range.to);
    const unwrapped = unwrapMarkdownLink(selected);
    emitMarkdown(replaceRange(markdownRef.current, range, unwrapped), { from: range.from, to: range.from + unwrapped.length });
    setLinkDraft({ error: "", open: false, url: "" });
  }, [emitMarkdown]);

  const insertMention = useCallback((user: OrfRichTextMentionUser) => {
    if (!mentionRange) return;
    const label = orfRichTextMentionLabel(user.name);
    const plainText = Boolean(mentionPlainTextUserIdsRef.current?.has(user.id));
    const defaultText = plainText ? `@${label}` : orfMentionMarkdown({ label, userId: user.id });
    const mentionText = formatMentionTextRef.current?.(user, label) ?? defaultText;
    const valueWithTrailingSpace = `${mentionText} `;
    emitMarkdown(replaceRange(markdownRef.current, mentionRange, valueWithTrailingSpace), mentionRange.from + valueWithTrailingSpace.length);
    onMentionInsertRef.current?.({
      label,
      range: { from: mentionRange.from, to: mentionRange.to },
      text: mentionText,
      user,
    });
    setMentionRange(null);
  }, [emitMarkdown, mentionRange]);

  const handleMarkdownChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    emitMarkdown(event.target.value);
    refreshMentionRange(event.target.value, event.target.selectionStart);
  };

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.size > 0);
    const filesHandled = files.length > 0 ? onFilesInsertRef.current?.(files) : false;
    if (filesHandled) {
      event.preventDefault();
      return;
    }
    const image = files.find(isImageFile);
    if (!image || !onUploadImageRef.current) return;
    event.preventDefault();
    uploadImageRef.current(image);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.size > 0);
    const filesHandled = files.length > 0 ? onFilesInsertRef.current?.(files) : false;
    if (filesHandled) {
      event.preventDefault();
      return;
    }
    const image = files.find(isImageFile);
    if (image && onUploadImageRef.current) {
      event.preventDefault();
      uploadImageRef.current(image);
      return;
    }
    const transform = transformPastedTextRef.current;
    if (!transform) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    const nextText = transform(text);
    if (nextText === text) return;
    event.preventDefault();
    insertRawText(nextText);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (disabledRef.current) return;
    const currentMentionUsers = filteredMentionUsers;
    if (mentionRange && currentMentionUsers.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((index) => (index + 1) % currentMentionUsers.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((index) => (index - 1 + currentMentionUsers.length) % currentMentionUsers.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selectedUser = currentMentionUsers[selectedMentionIndex] ?? currentMentionUsers[0];
        if (selectedUser) insertMention(selectedUser);
        return;
      }
    }

    if (mentionRange && event.key === "Escape") {
      event.preventDefault();
      setMentionRange(null);
      return;
    }

    const currentSubmit = onSubmitRequestRef.current;
    const isComposing = event.nativeEvent.isComposing;
    if (
      currentSubmit &&
      ((submitOnEnterRef.current && event.key === "Enter" && !event.shiftKey && !event.altKey && !isComposing) ||
        ((event.ctrlKey || event.metaKey) && event.key === "Enter"))
    ) {
      event.preventDefault();
      currentSubmit();
      return;
    }

    if (onKeyDownRef.current?.(event.nativeEvent, actions)) return;

    const primary = event.ctrlKey || event.metaKey;
    if (!primary || event.altKey || isComposing) return;
    if (event.key.toLowerCase() === "b") {
      event.preventDefault();
      wrapInlineMarkdown("**");
      return;
    }
    if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      wrapInlineMarkdown("_");
      return;
    }
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      openLinkEditor();
    }
  };

  return (
    <div className={clsx("orf-rich-text-editor", className, disabled && "orf-rich-text-editor-disabled")}>
      <div className="orf-rich-text-toolbar" aria-label="Markdown 编辑工具">
        <ToolbarButton disabled={disabled} label="加粗" onClick={() => wrapInlineMarkdown("**")}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="斜体" onClick={() => wrapInlineMarkdown("_")}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="删除线" onClick={() => wrapInlineMarkdown("~~")}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="代码" onClick={() => wrapInlineMarkdown("`")}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="标题" onClick={() => applyLineMarkdown("heading")}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <span className="orf-rich-text-toolbar-divider" />
        <ToolbarButton disabled={disabled} label="无序列表" onClick={() => applyLineMarkdown("bullet")}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="有序列表" onClick={() => applyLineMarkdown("ordered")}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={disabled} label="引用" onClick={() => applyLineMarkdown("quote")}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <span className="orf-rich-text-toolbar-divider" />
        <ToolbarButton disabled={disabled} label="链接" onClick={openLinkEditor}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        {onUploadImage && (
          <>
            <ToolbarButton disabled={disabled || uploadingImage} label="添加图片" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              accept="image/gif,image/jpeg,image/png,image/webp"
              className="hidden"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadImage(file);
              }}
            />
          </>
        )}
        {toolbarControls}
      </div>
      {linkDraft.open && (
        <form className="orf-rich-text-link-editor" onSubmit={applyLinkDraft}>
          <LinkIcon className="h-4 w-4" aria-hidden="true" />
          <input
            ref={linkInputRef}
            aria-label="链接地址"
            placeholder="https://"
            value={linkDraft.url}
            onChange={(event) => setLinkDraft((draft) => ({ ...draft, error: "", url: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeLinkEditor();
              }
            }}
          />
          {linkDraft.error && <span className="orf-rich-text-link-error">{linkDraft.error}</span>}
          <button type="submit" aria-label="应用链接" title="应用链接">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" aria-label="移除链接" title="移除链接" onClick={removeLink}>
            <Unlink className="h-4 w-4" />
          </button>
          <button type="button" aria-label="关闭链接编辑" title="关闭" onClick={closeLinkEditor}>
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
      <div className="orf-rich-text-editor-shell">
        <textarea
          ref={textareaRef}
          aria-label={placeholder}
          aria-multiline="true"
          className="orf-rich-text-editor-content"
          disabled={disabled}
          placeholder={placeholder}
          value={markdown}
          onChange={handleMarkdownChange}
          onClick={() => refreshMentionRange()}
          onDrop={handleDrop}
          onKeyDown={handleKeyDown}
          onKeyUp={() => refreshMentionRange()}
          onPaste={handlePaste}
          onSelect={() => refreshMentionRange()}
        />
        {mentionRange && mentionableUsers.length > 0 && (
          <div className="orf-comment-mention-menu orf-rich-text-mention-menu" role="listbox" aria-label="提及成员">
            {filteredMentionUsers.length > 0 ? (
              filteredMentionUsers.map((user, index) => (
                <button
                  key={user.id}
                  ref={(element) => {
                    mentionOptionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === selectedMentionIndex}
                  className={clsx("orf-comment-mention-option", index === selectedMentionIndex && "orf-comment-mention-option-active")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user);
                  }}
                >
                  <UserAvatar avatarUrl={user.avatarUrl} className="orf-rich-text-mention-avatar" frame={false} name={user.name} size="md" />
                  <span>
                    <span className="orf-comment-mention-name">{user.name}</span>
                    <span className="orf-comment-mention-email">{user.email}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="orf-comment-mention-empty">没有匹配成员</div>
            )}
          </div>
        )}
      </div>
      <div className="orf-rich-text-footer">
        <span className="orf-comment-hint">{uploadingImage ? "图片上传中..." : idleHint}</span>
        {footer}
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="orf-rich-text-tool-button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export { orfRichTextHasMeaningfulContent };
