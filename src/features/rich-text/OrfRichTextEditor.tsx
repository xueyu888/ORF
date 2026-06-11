import { clsx } from "clsx";
import { Bold, Check, Code, Heading3, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Quote, Strikethrough, Unlink, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { UserAvatar } from "../../components/UserAvatar";
import { OrfAttachmentImageNode, OrfMentionNode } from "./orfRichTextExtensions";
import {
  type OrfAttachmentReference,
  orfMarkdownToTiptapDoc,
  orfRichTextHasMeaningfulContent,
  orfRichTextMentionLabel,
  parseOrfAttachmentMarkdownToken,
  tiptapDocToOrfMarkdown,
} from "./orfRichTextMarkdown";

export type OrfRichTextMentionUser = {
  avatarUrl?: string | null;
  email?: string | null;
  id: string;
  name: string;
  searchText?: string;
  status?: string;
};

type MentionRange = {
  from: number;
  query: string;
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
  attachmentPreviewUrlForReference?: (reference: OrfAttachmentReference) => string | null | undefined;
  autoFocus?: boolean;
  className?: string;
  currentUserId: string;
  disabled?: boolean;
  excludeCurrentUserFromMentions?: boolean;
  footer?: ReactNode;
  idleHint?: string;
  mentionPlainTextUserIds?: ReadonlySet<string>;
  mentionUsersById?: Map<string, { name: string }>;
  mentionableUsers: OrfRichTextMentionUser[];
  onBusyChange?: (busy: boolean) => void;
  onChange: (markdown: string) => void;
  onErrorChange?: (message: string) => void;
  onFilesInsert?: (files: File[]) => boolean | void;
  onKeyDown?: (event: KeyboardEvent, actions: OrfRichTextEditorActions) => boolean | void;
  onSubmitRequest?: () => void;
  onUploadImage?: (file: File) => Promise<OrfRichTextImageUploadResult | null>;
  placeholder: string;
  submitOnEnter?: boolean;
  toolbarControls?: ReactNode;
  transformPastedText?: (text: string) => string;
  value: string;
};

const supportedImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

function orfRichTextExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      horizontalRule: false,
      link: false,
    }),
    Link.configure({
      autolink: false,
      HTMLAttributes: {
        rel: "noreferrer noopener",
        target: "_blank",
      },
      linkOnPaste: true,
      openOnClick: false,
    }),
    Placeholder.configure({ placeholder }),
    OrfMentionNode,
    OrfAttachmentImageNode,
  ];
}

function mentionRangeForEditor(editor: Editor): MentionRange | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from, from } = selection;
  if (!$from.parent.inlineContent) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\uFFFC");
  const match = /(^|[\s(（])@([^\s@()[\]]{0,40})$/u.exec(textBefore);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    from: from - query.length - 1,
    query,
    to: from,
  };
}

function focusEditorAtEnd(editor: Editor) {
  window.requestAnimationFrame(() => editor.commands.focus("end"));
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") && (supportedImageTypes.has(file.type) || file.type === "");
}

function isAllowedRichTextLinkUrl(url: string) {
  return /^(https?:\/\/|\/(?!\/))/.test(url);
}

export function OrfRichTextEditor({
  actionsRef,
  attachmentPreviewUrlForReference,
  autoFocus = false,
  className,
  currentUserId,
  disabled = false,
  excludeCurrentUserFromMentions = true,
  footer,
  idleHint,
  mentionPlainTextUserIds,
  mentionUsersById = new Map(),
  mentionableUsers,
  onBusyChange,
  onChange,
  onErrorChange,
  onFilesInsert,
  onKeyDown,
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
  const editorRef = useRef<Editor | null>(null);
  const attachmentPreviewUrlForReferenceRef = useRef(attachmentPreviewUrlForReference);
  const mentionPlainTextUserIdsRef = useRef(mentionPlainTextUserIds);
  const mentionUsersByIdRef = useRef(mentionUsersById);
  const canEmitChangeRef = useRef(false);
  const lastAppliedMarkdownRef = useRef(value);
  const mentionRangeRef = useRef<MentionRange | null>(null);
  const filteredMentionUsersRef = useRef<OrfRichTextMentionUser[]>([]);
  const selectedMentionIndexRef = useRef(0);
  const disabledRef = useRef(disabled);
  const onBusyChangeRef = useRef(onBusyChange);
  const onChangeRef = useRef(onChange);
  const onErrorChangeRef = useRef(onErrorChange);
  const onFilesInsertRef = useRef(onFilesInsert);
  const onKeyDownRef = useRef(onKeyDown);
  const onSubmitRequestRef = useRef(onSubmitRequest);
  const onUploadImageRef = useRef(onUploadImage);
  const submitOnEnterRef = useRef(submitOnEnter);
  const transformPastedTextRef = useRef(transformPastedText);
  const uploadImageRef = useRef<(file: File) => void>(() => undefined);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [linkDraft, setLinkDraft] = useState<{ error: string; open: boolean; url: string }>({ error: "", open: false, url: "" });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [, setEditorStateRevision] = useState(0);
  const extensions = useMemo(() => orfRichTextExtensions(placeholder), [placeholder]);
  const filteredMentionUsers = useMemo(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.trim().toLowerCase();
    return mentionableUsers
      .filter((user) => !excludeCurrentUserFromMentions || user.id !== currentUserId)
      .filter((user) => user.status === undefined || user.status === "active")
      .filter((user) => (
        !query ||
        user.name.toLowerCase().includes(query) ||
        (user.email ?? "").toLowerCase().includes(query) ||
        (user.searchText ?? "").toLowerCase().includes(query)
      ))
      .slice(0, 6);
  }, [currentUserId, excludeCurrentUserFromMentions, mentionRange, mentionableUsers]);

  useEffect(() => {
    mentionRangeRef.current = mentionRange;
  }, [mentionRange]);

  useEffect(() => {
    filteredMentionUsersRef.current = filteredMentionUsers;
  }, [filteredMentionUsers]);

  useEffect(() => {
    selectedMentionIndexRef.current = selectedMentionIndex;
  }, [selectedMentionIndex]);

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
    attachmentPreviewUrlForReferenceRef.current = attachmentPreviewUrlForReference;
  }, [attachmentPreviewUrlForReference]);

  useEffect(() => {
    mentionPlainTextUserIdsRef.current = mentionPlainTextUserIds;
  }, [mentionPlainTextUserIds]);

  useEffect(() => {
    mentionUsersByIdRef.current = mentionUsersById;
  }, [mentionUsersById]);

  const refreshMentionRange = useCallback((editor: Editor) => {
    setMentionRange(mentionRangeForEditor(editor));
  }, []);

  const refreshEditorControlState = useCallback(() => {
    setEditorStateRevision((revision) => revision + 1);
  }, []);

  const emitMarkdown = useCallback((editor: Editor) => {
    if (!canEmitChangeRef.current) return;
    const markdown = tiptapDocToOrfMarkdown(editor.getJSON());
    lastAppliedMarkdownRef.current = markdown;
    onChangeRef.current(markdown);
  }, []);

  const getCurrentMarkdown = useCallback(() => {
    const editor = editorRef.current;
    return editor ? tiptapDocToOrfMarkdown(editor.getJSON()) : lastAppliedMarkdownRef.current;
  }, []);

  const actions = useMemo<OrfRichTextEditorActions>(() => ({
    focus: () => {
      editorRef.current?.commands.focus();
    },
    focusEnd: () => {
      const editor = editorRef.current;
      if (editor) focusEditorAtEnd(editor);
    },
    focusStart: () => {
      window.requestAnimationFrame(() => editorRef.current?.commands.focus("start"));
    },
    getMarkdown: getCurrentMarkdown,
    insertMarkdown: (markdown: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const doc = orfMarkdownToTiptapDoc(markdown, mentionUsersByIdRef.current, {
        attachmentPreviewUrlForReference: attachmentPreviewUrlForReferenceRef.current,
      });
      editor.chain().focus().insertContent(doc.content ?? []).run();
      emitMarkdown(editor);
    },
    insertText: (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.chain().focus().insertContent(text).run();
      emitMarkdown(editor);
    },
    isEmpty: () => !orfRichTextHasMeaningfulContent(getCurrentMarkdown()),
    isSelectionAtEnd: () => {
      const editor = editorRef.current;
      if (!editor) return true;
      return editor.state.selection.to >= Math.max(1, editor.state.doc.content.size - 1);
    },
    isSelectionAtStart: () => {
      const editor = editorRef.current;
      if (!editor) return true;
      return editor.state.selection.from <= 1;
    },
    setMarkdown: (markdown: string) => {
      const editor = editorRef.current;
      lastAppliedMarkdownRef.current = markdown;
      if (!editor) return;
      editor.commands.setContent(orfMarkdownToTiptapDoc(markdown, mentionUsersByIdRef.current, {
        attachmentPreviewUrlForReference: attachmentPreviewUrlForReferenceRef.current,
      }), { emitUpdate: false });
      refreshEditorControlState();
      refreshMentionRange(editor);
    },
  }), [emitMarkdown, getCurrentMarkdown, refreshEditorControlState, refreshMentionRange]);

  useEffect(() => {
    if (!actionsRef) return undefined;
    actionsRef.current = actions;
    return () => {
      if (actionsRef.current === actions) actionsRef.current = null;
    };
  }, [actions, actionsRef]);

  const uploadImage = useCallback(async (file: File) => {
    const editor = editorRef.current;
    if (!editor || disabledRef.current) return;
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
      const src = upload.previewUrl ?? attachmentPreviewUrlForReferenceRef.current?.(attachment) ?? null;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "orfAttachmentImage",
          attrs:
            attachment.kind === "pending"
              ? { alt: attachment.alt, pendingAttachmentId: attachment.pendingAttachmentId, src }
              : { alt: attachment.alt, attachmentId: attachment.attachmentId, src },
        })
        .run();
      emitMarkdown(editor);
    } finally {
      setUploadingImage(false);
      onBusyChangeRef.current?.(false);
    }
  }, [emitMarkdown]);

  useEffect(() => {
    uploadImageRef.current = (file: File) => {
      void uploadImage(file);
    };
  }, [uploadImage]);

  const editor = useEditor({
    autofocus: autoFocus ? "end" : false,
    content: orfMarkdownToTiptapDoc(value, mentionUsersById, { attachmentPreviewUrlForReference }),
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": placeholder,
        "aria-multiline": "true",
        class: "orf-rich-text-editor-content",
        placeholder,
        role: "textbox",
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.size > 0);
        const filesHandled = files.length > 0 ? onFilesInsertRef.current?.(files) : false;
        if (filesHandled) {
          event.preventDefault();
          return true;
        }
        const image = files.find(isImageFile);
        if (!image || !onUploadImageRef.current) return false;
        event.preventDefault();
        uploadImageRef.current(image);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (disabledRef.current) return false;
        const currentMentionRange = mentionRangeRef.current;
        const currentMentionUsers = filteredMentionUsersRef.current;
        if (currentMentionRange && currentMentionUsers.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedMentionIndex((index) => (index + 1) % currentMentionUsers.length);
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedMentionIndex((index) => (index - 1 + currentMentionUsers.length) % currentMentionUsers.length);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const selectedUser = currentMentionUsers[selectedMentionIndexRef.current] ?? currentMentionUsers[0];
            if (selectedUser) {
              insertMention(
                editorRef.current,
                selectedUser,
                currentMentionRange,
                emitMarkdown,
                Boolean(mentionPlainTextUserIdsRef.current?.has(selectedUser.id)),
              );
            }
            return true;
          }
        }

        if (currentMentionRange && event.key === "Escape") {
          event.preventDefault();
          setMentionRange(null);
          return true;
        }

        const currentSubmit = onSubmitRequestRef.current;
        if (
          currentSubmit &&
          ((submitOnEnterRef.current && event.key === "Enter" && !event.shiftKey && !event.altKey && !event.isComposing) ||
            ((event.ctrlKey || event.metaKey) && event.key === "Enter"))
        ) {
          event.preventDefault();
          currentSubmit();
          return true;
        }
        if (onKeyDownRef.current?.(event, actions)) return true;
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.size > 0);
        const filesHandled = files.length > 0 ? onFilesInsertRef.current?.(files) : false;
        if (filesHandled) {
          event.preventDefault();
          return true;
        }
        const image = files.find(isImageFile);
        if (image && onUploadImageRef.current) {
          event.preventDefault();
          uploadImageRef.current(image);
          return true;
        }
        const transform = transformPastedTextRef.current;
        if (!transform) return false;
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return false;
        const nextText = transform(text);
        if (nextText === text) return false;
        event.preventDefault();
        actions.insertMarkdown(nextText);
        return true;
      },
    },
    extensions,
    onTransaction: ({ editor }) => {
      refreshEditorControlState();
      refreshMentionRange(editor);
    },
    onUpdate: ({ editor }) => {
      emitMarkdown(editor);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    if (editor) {
      canEmitChangeRef.current = true;
    }
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
        canEmitChangeRef.current = false;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionRange?.query, filteredMentionUsers.length]);

  useEffect(() => {
    if (!editor || value === lastAppliedMarkdownRef.current) return;
    lastAppliedMarkdownRef.current = value;
    editor.commands.setContent(orfMarkdownToTiptapDoc(value, mentionUsersById, { attachmentPreviewUrlForReference }), { emitUpdate: false });
    refreshMentionRange(editor);
  }, [attachmentPreviewUrlForReference, editor, mentionUsersById, refreshMentionRange, value]);

  useEffect(() => {
    if (autoFocus && editor) focusEditorAtEnd(editor);
  }, [autoFocus, editor]);

  const openLinkEditor = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    setLinkDraft({ error: "", open: true, url: previousUrl ?? "https://" });
    window.requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
  }, [editor]);

  const closeLinkEditor = useCallback(() => {
    setLinkDraft({ error: "", open: false, url: "" });
    editor?.commands.focus();
  }, [editor]);

  const applyLinkDraft = useCallback((event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const url = linkDraft.url.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      emitMarkdown(editor);
      setLinkDraft({ error: "", open: false, url: "" });
      return;
    }
    if (!isAllowedRichTextLinkUrl(url)) {
      setLinkDraft((draft) => ({ ...draft, error: "只支持 http(s) 链接或站内 / 路径" }));
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    emitMarkdown(editor);
    setLinkDraft({ error: "", open: false, url: "" });
  }, [editor, emitMarkdown, linkDraft.url]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    emitMarkdown(editor);
    setLinkDraft({ error: "", open: false, url: "" });
  }, [editor, emitMarkdown]);

  return (
    <div className={clsx("orf-rich-text-editor", className, disabled && "orf-rich-text-editor-disabled")}>
      <div className="orf-rich-text-toolbar" aria-label="正文编辑工具">
        <ToolbarButton active={editor?.isActive("bold")} disabled={disabled || !editor} label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("italic")} disabled={disabled || !editor} label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("strike")} disabled={disabled || !editor} label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("code")} disabled={disabled || !editor} label="代码" onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("heading", { level: 3 })} disabled={disabled || !editor} label="标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <span className="orf-rich-text-toolbar-divider" />
        <ToolbarButton active={editor?.isActive("bulletList")} disabled={disabled || !editor} label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("orderedList")} disabled={disabled || !editor} label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("blockquote")} disabled={disabled || !editor} label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <span className="orf-rich-text-toolbar-divider" />
        <ToolbarButton active={editor?.isActive("link")} disabled={disabled || !editor} label="链接" onClick={openLinkEditor}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        {onUploadImage && (
          <>
            <ToolbarButton disabled={disabled || uploadingImage || !editor} label="添加图片" onClick={() => fileInputRef.current?.click()}>
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
        <EditorContent editor={editor} />
        {mentionRange && mentionableUsers.length > 0 && (
          <div className="orf-comment-mention-menu orf-rich-text-mention-menu">
            {filteredMentionUsers.length > 0 ? (
              filteredMentionUsers.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  className={clsx("orf-comment-mention-option", index === selectedMentionIndex && "orf-comment-mention-option-active")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(editor, user, mentionRange, emitMarkdown, Boolean(mentionPlainTextUserIdsRef.current?.has(user.id)));
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

function insertMention(
  editor: Editor | null,
  user: OrfRichTextMentionUser,
  range: MentionRange,
  emitMarkdown: (editor: Editor) => void,
  plainText: boolean,
) {
  if (!editor) return;
  const label = orfRichTextMentionLabel(user.name);
  if (plainText) {
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).insertContent(`@${label} `).run();
    emitMarkdown(editor);
    return;
  }
  editor
    .chain()
    .focus()
    .deleteRange({ from: range.from, to: range.to })
    .insertContent([
      { type: "orfMention", attrs: { id: user.id, label } },
      { type: "text", text: " " },
    ])
    .run();
  emitMarkdown(editor);
}

function ToolbarButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx("orf-rich-text-tool-button", active && "orf-rich-text-tool-button-active")}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
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
