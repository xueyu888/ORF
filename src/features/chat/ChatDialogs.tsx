import { clsx } from "clsx";
import { Download, FileText, X } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatUser } from "../../types/orf";
import { formatFileSize } from "./chatFormat";
import type { ChatDraft } from "./chatModels";
import { formatPresence, isChatUserOnline } from "./chatPresence";
import { ChatDraftEditor } from "./ChatDraftEditor";

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
          <div className="orf-chat-modal-users">
            {users.map((user) => (
              <button className={selected.includes(user.id) ? "selected" : ""} key={user.id} type="button" onClick={() => setSelected((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}>
                <span className="orf-chat-member-avatar">
                  <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                  <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                </span>
                <span>{user.name}</span>
                <small>{formatPresence(user, currentUserId)}</small>
              </button>
            ))}
          </div>
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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const candidates = users.filter((user) => user.id !== currentUserId && (user.name.includes(query) || user.email.includes(query)));
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
        <label>查找成员<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="orf-chat-modal-users">
          {candidates.map((user) => (
            <button className={selected.includes(user.id) ? "selected" : ""} key={user.id} type="button" onClick={() => setSelected((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}>
              <span className="orf-chat-member-avatar">
                <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
              </span>
              <span>{user.name}</span>
              <small>{formatPresence(user, currentUserId)}</small>
            </button>
          ))}
        </div>
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button disabled={selected.length === 0 || saving} onClick={() => void submit()}>{saving ? "打开中" : "打开"}</Button>
        </footer>
      </div>
    </div>
  );
}

export function EditMessageDialog({
  draft,
  mentionableUsers,
  onClose,
  onSave,
}: {
  draft: ChatDraft;
  mentionableUsers: ChatUser[];
  onClose: () => void;
  onSave: (draft: ChatDraft) => void;
}) {
  const [localDraft, setLocalDraft] = useState(draft);
  const save = () => onSave(localDraft);
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal orf-chat-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>编辑消息</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <ChatDraftEditor
          className="orf-chat-edit-box"
          draft={localDraft}
          mentionableUsers={mentionableUsers}
          onChange={setLocalDraft}
          onSubmit={() => {
            save();
            return true;
          }}
          placeholder="编辑消息..."
          rows={6}
        />
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button onClick={save}>保存</Button>
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
