import { Download, FileText, Trash2, X } from "lucide-react";
import { useState } from "react";
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
  return (
    <div className="orf-chat-attachment-preview" onMouseDown={onClose}>
      <div className="orf-chat-attachment-preview-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span>{attachment.fileName}</span>
          <a href={attachment.contentUrl} download={attachment.fileName} title="下载附件">
            <Download className="h-4 w-4" />
          </a>
          <button type="button" onClick={onClose} title="关闭预览"><X className="h-5 w-5" /></button>
        </header>
        {isImage ? (
          <img src={attachment.contentUrl} alt={attachment.fileName} />
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
