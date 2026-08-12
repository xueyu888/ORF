import { Loader2, Reply } from "lucide-react";
import type { ChatThreadSummary, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel } from "./chatChannelPresentation";
import { formatDateTime, formatTime } from "./chatFormat";
import { ChatMarkdown, commentImageAttachmentIdsFromChatSystemMetadata } from "./chatMarkdown";
import { chatMessageDisplayAuthor, chatMessageDisplayBody } from "./chatMessagePresentation";
import type { ChatFeedbackReference } from "./chatModels";

type ChatThreadInboxPanelProps = {
  currentUserId?: string;
  feedbackItems?: readonly ChatFeedbackReference[];
  loading: boolean;
  onOpenThread: (summary: ChatThreadSummary) => void;
  renderMessageBody?: (message: ChatThreadSummary["rootMessage"]) => string | null | undefined;
  summaries: ChatThreadSummary[];
  usersById: Map<string, ChatUser>;
};

export function ChatThreadInboxPanel({ currentUserId, feedbackItems, loading, onOpenThread, renderMessageBody, summaries, usersById }: ChatThreadInboxPanelProps) {
  if (loading && summaries.length === 0) {
    return (
      <div className="orf-chat-panel-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>正在加载话题收件箱</span>
      </div>
    );
  }
  if (summaries.length === 0) {
    return (
      <div className="orf-chat-panel-loading">
        <Reply className="h-5 w-5" />
        <span>暂无关注的话题</span>
      </div>
    );
  }
  return (
    <div className="orf-chat-thread-inbox">
      {loading && (
        <div className="orf-chat-thread-inbox-sync">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          同步话题
        </div>
      )}
      {summaries.map((summary) => {
        const displayBody = chatMessageDisplayBody(summary.rootMessage, renderMessageBody);
        return (
          <button type="button" key={summary.rootMessage.id} onClick={() => onOpenThread(summary)}>
            <span>{chatChannelDisplayLabel(summary.channel, currentUserId, usersById)}</span>
            {summary.unreadCount > 0 && <strong>{summary.unreadCount}</strong>}
            <b>{chatMessageDisplayAuthor(summary.rootMessage, usersById).name}</b>
            <div className="orf-chat-thread-inbox-body">
              {displayBody?.trim() ? (
                <ChatMarkdown
                  compact
                  body={displayBody}
                  commentImageAttachmentIds={commentImageAttachmentIdsFromChatSystemMetadata(summary.rootMessage.system)}
                  feedbackItems={feedbackItems}
                  usersById={usersById}
                />
              ) : "卡片话题"}
            </div>
            <small>
              {summary.rootMessage.replyCount} 条回复
              {summary.rootMessage.lastReplyAt ? (
                <span title={formatDateTime(summary.rootMessage.lastReplyAt)}> · 最近 {formatTime(summary.rootMessage.lastReplyAt)}</span>
              ) : ""}
            </small>
          </button>
        );
      })}
    </div>
  );
}
