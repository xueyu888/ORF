import { Check, Copy, Download, FileText, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { type WheelEvent, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatMessage, ChatUser } from "../../types/orf";
import { formatFileSize } from "./chatFormat";
import { ChatUserPicker } from "./ChatUserPicker";

export function ChannelModal({
  canCreatePublic,
  currentUserId,
  onClose,
  onCreate,
  users,
}: {
  canCreatePublic: boolean;
  currentUserId?: string;
  onClose: () => void;
  onCreate: (input: { displayName: string; header?: string; memberUserIds?: string[]; name?: string; purpose?: string; type: "public" | "private" }) => Promise<void>;
  users: ChatUser[];
}) {
  const [type, setType] = useState<"public" | "private">("private");
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [header, setHeader] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const selectableUsers = users.filter((user) => user.id !== currentUserId);
  const toggleSelected = (userId: string) => {
    setSelected((items) => items.includes(userId) ? items.filter((id) => id !== userId) : [...items, userId]);
  };
  const submit = async () => {
    setSaving(true);
    try {
      await onCreate({ type, displayName, purpose, header, memberUserIds: selected });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>新建频道</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <div className="orf-chat-segmented">
          <button className={type === "private" ? "active" : ""} type="button" onClick={() => setType("private")}>私有</button>
          <button className={type === "public" ? "active" : ""} disabled={!canCreatePublic} type="button" onClick={() => setType("public")}>公开</button>
        </div>
        <label>频道名<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>说明<input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
        <label>标题<input value={header} onChange={(event) => setHeader(event.target.value)} /></label>
        {type === "private" && (
          <ChatUserPicker
            currentUserId={currentUserId}
            emptyLabel="没有可添加成员"
            onToggleUser={toggleSelected}
            placeholder="查找成员"
            selectedUserIds={selected}
            users={selectableUsers}
          />
        )}
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button disabled={!displayName.trim() || saving} onClick={() => void submit()}>{saving ? "创建中" : "创建"}</Button>
        </footer>
      </div>
    </div>
  );
}

export function ConversationModal({
  currentUserId,
  onClose,
  onOpen,
  users,
}: {
  currentUserId?: string;
  onClose: () => void;
  onOpen: (userIds: string[]) => Promise<void>;
  users: ChatUser[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const candidates = users.filter((user) => user.id !== currentUserId);
  const toggleSelected = (userId: string) => {
    setSelected((items) => items.includes(userId) ? items.filter((id) => id !== userId) : [...items, userId]);
  };
  const submit = async () => {
    setSaving(true);
    try {
      await onOpen(selected);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>新建私聊/群聊</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <ChatUserPicker
          currentUserId={currentUserId}
          emptyLabel="没有可私聊成员"
          onToggleUser={toggleSelected}
          placeholder="查找成员"
          selectedUserIds={selected}
          users={candidates}
        />
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button disabled={selected.length === 0 || saving} onClick={() => void submit()}>{saving ? "打开中" : "打开"}</Button>
        </footer>
      </div>
    </div>
  );
}

export function DeleteMessageDialog({
  message,
  onCancel,
  onConfirm,
  submitting,
}: {
  message: ChatMessage;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const isReply = Boolean(message.rootMessageId);
  return (
    <div className="orf-chat-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        aria-labelledby="orf-chat-delete-title"
        aria-modal="true"
        className="orf-chat-modal orf-chat-delete-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="orf-chat-delete-title">{isReply ? "删除回复" : "删除消息"}</h2>
          <IconButton icon={X} label="关闭" onClick={onCancel} />
        </header>
        <div className="orf-chat-delete-body">
          <div className="orf-chat-delete-icon"><Trash2 className="h-5 w-5" /></div>
          <div>
            <p>{isReply ? "确认删除这条回复？" : "确认删除这条消息？"}</p>
            {!isReply && message.replyCount > 0 && <small>这条消息下已有 {message.replyCount} 条回复，删除后主消息正文将不再展示。</small>}
          </div>
        </div>
        <footer>
          <Button disabled={submitting} onClick={onCancel} variant="secondary">取消</Button>
          <Button disabled={submitting} onClick={onConfirm} variant="danger">{submitting ? "删除中" : "确认删除"}</Button>
        </footer>
      </div>
    </div>
  );
}

export function AttachmentPreview({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  const canEmbed = attachment.mimeType === "application/pdf" || attachment.mimeType.startsWith("text/");
  const isImage = attachment.mimeType.startsWith("image/");
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const [naturalSize, setNaturalSize] = useState<{ height: number; width: number } | null>(() => imageNaturalSize(attachment));
  const [fitSize, setFitSize] = useState<{ height: number; width: number } | null>(null);
  const zoomPercent = Math.round(zoom * 100);
  const setZoomLevel = (update: number | ((current: number) => number), anchor?: { clientX: number; clientY: number }) => {
    setZoom((current) => {
      const next = clampZoom(typeof update === "function" ? update(current) : update);
      const viewport = imageViewportRef.current;
      if (next !== current && viewport && anchor) {
        const bounds = viewport.getBoundingClientRect();
        const anchorX = anchor.clientX - bounds.left;
        const anchorY = anchor.clientY - bounds.top;
        const contentX = viewport.scrollLeft + anchorX;
        const contentY = viewport.scrollTop + anchorY;
        const scale = next / current;
        window.requestAnimationFrame(() => {
          viewport.scrollLeft = contentX * scale - anchorX;
          viewport.scrollTop = contentY * scale - anchorY;
        });
      }
      return next;
    });
  };
  const zoomOut = () => setZoomLevel((value) => value - 0.25);
  const zoomIn = () => setZoomLevel((value) => value + 0.25);
  const resetZoom = () => setZoomLevel(1);
  const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoomLevel((value) => value + direction * 0.15, { clientX: event.clientX, clientY: event.clientY });
  };
  const copyImage = async () => {
    if (!isImage || copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      await copyAttachmentImage(attachment);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1800);
  };

  useEffect(() => {
    setZoom(1);
    setCopyStatus("idle");
    setNaturalSize(imageNaturalSize(attachment));
    setFitSize(null);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, [attachment]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isImage) return undefined;
    const element = imageViewportRef.current;
    const sourceSize = imageNaturalSize(attachment) ?? naturalSize;
    if (!element || !sourceSize) return undefined;

    const updateFitSize = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const scale = Math.min(bounds.width / sourceSize.width, bounds.height / sourceSize.height, 1);
      const next = {
        height: Math.max(1, Math.round(sourceSize.height * scale)),
        width: Math.max(1, Math.round(sourceSize.width * scale)),
      };
      setFitSize((current) => (
        current?.height === next.height && current.width === next.width ? current : next
      ));
    };

    updateFitSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFitSize);
      return () => window.removeEventListener("resize", updateFitSize);
    }

    const observer = new ResizeObserver(updateFitSize);
    observer.observe(element);
    window.addEventListener("resize", updateFitSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFitSize);
    };
  }, [attachment, isImage, naturalSize]);

  const imageSizeStyle = fitSize
    ? {
        height: `${Math.round(fitSize.height * zoom)}px`,
        width: `${Math.round(fitSize.width * zoom)}px`,
      }
    : undefined;

  return (
    <div className="orf-chat-attachment-preview" onMouseDown={onClose}>
      <div className="orf-chat-attachment-preview-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span>{attachment.fileName}</span>
          {isImage && (
            <div className="orf-chat-attachment-preview-actions" aria-label="图片查看工具">
              <button type="button" onClick={zoomOut} disabled={zoom <= 0.25} title="缩小图片" aria-label="缩小图片">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="orf-chat-attachment-zoom-value">{zoomPercent}%</span>
              <button type="button" onClick={zoomIn} disabled={zoom >= 4} title="放大图片" aria-label="放大图片">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button type="button" onClick={resetZoom} disabled={zoom === 1} title="重置缩放" aria-label="重置缩放">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void copyImage()} disabled={copyStatus === "copying"} title={copyButtonTitle(copyStatus)} aria-label={copyButtonTitle(copyStatus)}>
                {copyStatus === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}
          <a href={attachment.contentUrl} download={attachment.fileName} title="下载附件">
            <Download className="h-4 w-4" />
          </a>
          <button type="button" onClick={onClose} title="关闭预览"><X className="h-5 w-5" /></button>
        </header>
        {isImage ? (
          <div className="orf-chat-attachment-preview-image-scroll" ref={imageViewportRef} onWheel={handleImageWheel}>
            <img
              src={attachment.contentUrl}
              alt={attachment.fileName}
              style={imageSizeStyle}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setNaturalSize({ height: image.naturalHeight, width: image.naturalWidth });
                }
              }}
            />
          </div>
        ) : canEmbed ? (
          <iframe src={attachment.contentUrl} title={attachment.fileName} />
        ) : (
          <div className="orf-chat-attachment-preview-empty">
            <FileText className="h-8 w-8" />
            <strong>{attachment.fileName}</strong>
            <small>{attachment.mimeType || "未知文件类型"} · {formatFileSize(attachment.fileSize)}</small>
            <a href={attachment.contentUrl} download={attachment.fileName}>下载附件</a>
          </div>
        )}
      </div>
    </div>
  );
}

function imageNaturalSize(attachment: ChatAttachment) {
  const width = imageDimension(attachment.width);
  const height = imageDimension(attachment.height);
  return width && height ? { height, width } : null;
}

function imageDimension(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clampZoom(value: number) {
  return Math.min(4, Math.max(0.25, Math.round(value * 100) / 100));
}

function copyButtonTitle(status: "idle" | "copying" | "copied" | "failed") {
  if (status === "copying") return "正在复制图片";
  if (status === "copied") return "图片已复制";
  if (status === "failed") return "复制失败";
  return "复制图片";
}

async function copyAttachmentImage(attachment: ChatAttachment) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image copy is not supported");
  }

  const response = await fetch(attachment.contentUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Image content request failed");
  }

  const blob = await response.blob();
  const mimeType = blob.type || attachment.mimeType || "image/png";
  const clipboardBlob = blob.type ? blob : blob.slice(0, blob.size, mimeType);
  await navigator.clipboard.write([new ClipboardItem({ [mimeType]: clipboardBlob })]);
}
