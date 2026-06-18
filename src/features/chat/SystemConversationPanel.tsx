import { clsx } from "clsx";
import { ArrowLeft, CheckCheck, ExternalLink, Loader2, Mail, Reply, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import type { SystemConversationMessage, SystemConversationSummary } from "../../types/orf";

type SystemConversationPanelProps = {
  conversation: SystemConversationSummary;
  loading: boolean;
  messages: SystemConversationMessage[];
  onMarkAllRead: () => Promise<void>;
  onMarkRead: (message: SystemConversationMessage) => Promise<void>;
  onMarkUnread: (message: SystemConversationMessage) => Promise<void>;
  onMobileBack?: () => void;
  onOpenTarget: (href: string) => void;
  onReply: (message: SystemConversationMessage, body: string) => Promise<void>;
};

function formatSystemMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function SystemConversationPanel({
  conversation,
  loading,
  messages,
  onMarkAllRead,
  onMarkRead,
  onMarkUnread,
  onMobileBack,
  onOpenTarget,
  onReply,
}: SystemConversationPanelProps) {
  const unreadMessages = useMemo(() => messages.filter((message) => !message.readAt), [messages]);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAllRead(false);
    }
  };

  return (
    <>
      <header className="orf-chat-header orf-system-conversation-header">
        {onMobileBack && (
          <IconButton className="orf-chat-header-back" icon={ArrowLeft} label="返回聊天列表" onClick={onMobileBack} />
        )}
        <div className="orf-chat-header-title orf-system-conversation-title">
          <Mail className="h-5 w-5" />
          <span>{conversation.title}</span>
        </div>
        <div className="orf-chat-header-meta">
          <span>{conversation.description}</span>
        </div>
        <div className="orf-chat-header-actions">
          <IconButton
            disabled={unreadMessages.length === 0 || markingAllRead}
            icon={CheckCheck}
            label="全部标记已读"
            onClick={() => void handleMarkAllRead()}
          />
        </div>
      </header>
      <div className="orf-system-conversation-scroll">
        {loading && messages.length === 0 ? (
          <div className="orf-chat-message-loading"><Loader2 className="h-5 w-5 animate-spin" /> 加载系统消息</div>
        ) : messages.length === 0 ? (
          <div className="orf-chat-message-empty">这里还没有系统消息。</div>
        ) : (
          <div className="orf-system-message-list">
            {messages.map((message) => (
              <SystemConversationMessageRow
                key={message.id}
                message={message}
                onMarkRead={onMarkRead}
                onMarkUnread={onMarkUnread}
                onOpenTarget={onOpenTarget}
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SystemConversationMessageRow({
  message,
  onMarkRead,
  onMarkUnread,
  onOpenTarget,
  onReply,
}: {
  message: SystemConversationMessage;
  onMarkRead: (message: SystemConversationMessage) => Promise<void>;
  onMarkUnread: (message: SystemConversationMessage) => Promise<void>;
  onOpenTarget: (href: string) => void;
  onReply: (message: SystemConversationMessage, body: string) => Promise<void>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingReadState, setUpdatingReadState] = useState(false);
  const trimmedReply = replyBody.trim();
  const unread = !message.readAt;

  const submitReply = async () => {
    if (!trimmedReply || submitting) return;
    setSubmitting(true);
    try {
      await onReply(message, trimmedReply);
      setReplyBody("");
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReadState = async () => {
    setUpdatingReadState(true);
    try {
      if (unread) {
        await onMarkRead(message);
      } else {
        await onMarkUnread(message);
      }
    } finally {
      setUpdatingReadState(false);
    }
  };

  return (
    <article className={clsx("orf-system-message", unread && "orf-system-message-unread")}>
      <div className="orf-system-message-main">
        <div className="orf-system-message-meta">
          <strong>{message.actorName}</strong>
          <span>{formatSystemMessageTime(message.createdAt)}</span>
          {unread && <em>未读</em>}
        </div>
        <h3>{message.title}</h3>
        <p>{message.body}</p>
      </div>
      <div className="orf-system-message-actions">
        <IconButton icon={ExternalLink} label="打开关联对象" onClick={() => onOpenTarget(message.targetHref)} />
        <IconButton
          disabled={updatingReadState}
          icon={unread ? CheckCheck : Mail}
          label={unread ? "标记已读" : "标记未读"}
          onClick={() => void toggleReadState()}
        />
        {message.canReply && (
          <IconButton
            className={replyOpen ? "orf-system-message-action-active" : undefined}
            icon={Reply}
            label="回复"
            onClick={() => setReplyOpen((value) => !value)}
          />
        )}
      </div>
      {replyOpen && (
        <div className="orf-system-message-reply">
          <textarea
            value={replyBody}
            maxLength={20000}
            onChange={(event) => setReplyBody(event.target.value)}
            placeholder="写一条评论回复"
          />
          <div>
            <Button variant="ghost" type="button" onClick={() => setReplyOpen(false)}>取消</Button>
            <Button disabled={!trimmedReply || submitting} type="button" onClick={() => void submitReply()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              回复
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
