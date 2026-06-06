import { clsx } from "clsx";
import {
  Bell,
  BellOff,
  Bookmark,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Pin,
  Reply,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatChannel, ChatChannelType, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser } from "../../types/orf";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem } from "./ChatMessageItem";
import { scrollChatFeedToLatest, scrollChatFeedToMessage } from "./chatFeedScroll";
import { formatDay, formatTime } from "./chatFormat";
import { ChatMarkdown } from "./chatMarkdown";
import { shouldCompactChatMessage } from "./chatMessagePresentation";
import type { ChatDraft } from "./chatModels";
import { formatPresence, isChatUserOnline } from "./chatPresence";

export type ActivePanel = "thread" | "threads" | "info" | "search" | "pins" | "saved" | null;
export type ChatSearchScope = "all" | "current";
export type ChatSearchTypeFilter = ChatChannelType | "all";

type ChatRightPanelProps = {
  activePanel: ActivePanel;
  allUsers: ChatUser[];
  canManage: boolean;
  channel: ChatChannel;
  collectionLoading: boolean;
  collectionResults: ChatSearchResult[];
  currentUserId?: string;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onClose: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onOpenResult: (result: ChatSearchResult) => void;
  onOpenThreadSummary: (summary: ChatThreadSummary) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemoveMember: (userId: string) => Promise<void>;
  onSave: (message: ChatMessage) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  onSendThreadReply: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  searchQuery: string;
  searchScope: ChatSearchScope;
  searchResults: ChatSearchResult[];
  searchType: ChatSearchTypeFilter;
  setSearchQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  thread: ChatThread | null;
  threadFocusMessageId: string | null;
  threadLoading: boolean;
  threadSummaries: ChatThreadSummary[];
  threadSummariesLoading: boolean;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
};

export function ChatRightPanel(props: ChatRightPanelProps) {
  const title =
    props.activePanel === "thread" ? "话题"
      : props.activePanel === "threads" ? "话题收件箱"
        : props.activePanel === "search" ? "搜索"
          : props.activePanel === "pins" ? "固定消息"
            : props.activePanel === "saved" ? "已保存"
              : "频道信息";
  return (
    <aside className="orf-chat-right-panel">
      <div className="orf-chat-right-header">
        <strong>{title}</strong>
        <IconButton icon={X} label="关闭" onClick={props.onClose} />
      </div>
      {props.activePanel === "thread" && (
        props.thread ? (
          <ThreadPanel
            canPin={props.canManage}
            currentUserId={props.currentUserId}
            focusMessageId={props.threadFocusMessageId}
            onAttachmentPreview={props.onAttachmentPreview}
            onCopyLink={props.onCopyLink}
            onDelete={props.onDelete}
            onDraftStateChange={props.onDraftStateChange}
            onEdit={props.onEdit}
            onMarkUnread={props.onMarkUnread}
            onPin={props.onPin}
            onReaction={props.onReaction}
            onSave={props.onSave}
            onSend={props.onSendThreadReply}
            onToggleFollow={props.onToggleFollow}
            onTyping={props.onTyping}
            thread={props.thread}
            users={props.users}
            usersById={props.usersById}
          />
        ) : (
          <div className="orf-chat-panel-loading">
            {props.threadLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5" />}
            <span>{props.threadLoading ? "正在加载话题" : "没有可显示的话题"}</span>
          </div>
        )
      )}
      {props.activePanel === "search" && (
        <SearchPanel
          onOpenResult={props.onOpenResult}
          onSearch={props.onSearch}
          query={props.searchQuery}
          results={props.searchResults}
          searchScope={props.searchScope}
          searchType={props.searchType}
          setQuery={props.setSearchQuery}
          setSearchScope={props.setSearchScope}
          setSearchType={props.setSearchType}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "threads" && (
        <ThreadInboxPanel
          loading={props.threadSummariesLoading}
          onOpenThread={props.onOpenThreadSummary}
          summaries={props.threadSummaries}
          usersById={props.usersById}
        />
      )}
      {(props.activePanel === "pins" || props.activePanel === "saved") && (
        <CollectionPanel
          kind={props.activePanel}
          loading={props.collectionLoading}
          onOpenResult={props.onOpenResult}
          onSave={props.onSave}
          results={props.collectionResults}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "info" && (
        <ChannelInfoPanel
          canManage={props.canManage}
          channel={props.channel}
          currentUserId={props.currentUserId}
          onAddMembers={props.onAddMembers}
          onRemoveMember={props.onRemoveMember}
          onUpdateChannel={props.onUpdateChannel}
          users={props.allUsers}
          usersById={props.usersById}
        />
      )}
    </aside>
  );
}

function ThreadInboxPanel({
  loading,
  onOpenThread,
  summaries,
  usersById,
}: {
  loading: boolean;
  onOpenThread: (summary: ChatThreadSummary) => void;
  summaries: ChatThreadSummary[];
  usersById: Map<string, ChatUser>;
}) {
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
      {summaries.map((summary) => (
        <button type="button" key={summary.rootMessage.id} onClick={() => onOpenThread(summary)}>
          <span>{summary.channel.displayName}</span>
          {summary.unreadCount > 0 && <strong>{summary.unreadCount}</strong>}
          <b>{summary.rootMessage.authorName}</b>
          <div className="orf-chat-thread-inbox-body">
            {summary.rootMessage.body.trim() ? <ChatMarkdown compact body={summary.rootMessage.body} usersById={usersById} /> : "附件话题"}
          </div>
          <small>
            {summary.rootMessage.replyCount} 条回复
            {summary.rootMessage.lastReplyAt ? ` · 最近 ${formatTime(summary.rootMessage.lastReplyAt)}` : ""}
          </small>
        </button>
      ))}
    </div>
  );
}

function ThreadPanel({
  onAttachmentPreview,
  canPin,
  currentUserId,
  focusMessageId,
  onCopyLink,
  onDelete,
  onDraftStateChange,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onSend,
  onToggleFollow,
  onTyping,
  thread,
  users,
  usersById,
}: {
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  canPin: boolean;
  currentUserId?: string;
  focusMessageId: string | null;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave: (message: ChatMessage) => void;
  onSend: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  thread: ChatThread;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const threadPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const element = threadPanelRef.current;
      if (!element) return;
      if (focusMessageId) {
        if (scrollChatFeedToMessage(element, focusMessageId, { behavior: "smooth", offset: 20 })) return;
      }
      scrollChatFeedToLatest(element, "smooth");
    });
  }, [focusMessageId, thread.replies.length, thread.rootMessage.id]);

  return (
    <div className="orf-chat-thread-panel" ref={threadPanelRef}>
      <ChatMessageItem
        canPin={canPin}
        currentUserId={currentUserId}
        focused={focusMessageId === thread.rootMessage.id}
        message={thread.rootMessage}
        onAttachmentPreview={onAttachmentPreview}
        onCopyLink={onCopyLink}
        onDelete={onDelete}
        onEdit={onEdit}
        onMarkUnread={onMarkUnread}
        onPin={onPin}
        onReaction={onReaction}
        onSave={onSave}
        onThread={() => undefined}
        usersById={usersById}
      />
      <button type="button" className="orf-chat-follow-button" onClick={() => onToggleFollow(!thread.following)}>
        {thread.following ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {thread.following ? "取消关注话题" : "关注话题"}
      </button>
      <div className="orf-chat-thread-replies">
        {thread.replies.map((reply, index) => {
          const compact = shouldCompactChatMessage(thread.replies[index - 1], reply);
          return (
            <ChatMessageItem
              canPin={canPin}
              compact={compact}
              currentUserId={currentUserId}
              key={reply.id}
              focused={focusMessageId === reply.id}
              message={reply}
              onAttachmentPreview={onAttachmentPreview}
              onCopyLink={onCopyLink}
              onDelete={onDelete}
              onEdit={onEdit}
              onMarkUnread={onMarkUnread}
              onPin={onPin}
              onReaction={onReaction}
              onSave={onSave}
              onThread={() => undefined}
              usersById={usersById}
            />
          );
        })}
      </div>
      <ChatComposer
        channelId={thread.rootMessage.channelId}
        mentionableUsers={users}
        onDraftStateChange={onDraftStateChange}
        onSend={onSend}
        onTyping={onTyping}
        parentMessageId={thread.replies.at(-1)?.id ?? thread.rootMessage.id}
        rootMessageId={thread.rootMessage.id}
      />
    </div>
  );
}

function CollectionPanel({
  kind,
  loading,
  onOpenResult,
  onSave,
  results,
  usersById,
}: {
  kind: "pins" | "saved";
  loading: boolean;
  onOpenResult: (result: ChatSearchResult) => void;
  onSave: (message: ChatMessage) => void;
  results: ChatSearchResult[];
  usersById: Map<string, ChatUser>;
}) {
  const empty = kind === "pins" ? "当前频道还没有固定消息。" : "还没有保存过消息。";
  return (
    <div className="orf-chat-collection-panel">
      <div className="orf-chat-collection-caption">
        {kind === "pins" ? <Pin className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        <span>{kind === "pins" ? "当前频道固定的消息" : "你保存的可见消息"}</span>
      </div>
      {loading ? (
        <div className="orf-chat-search-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载中</div>
      ) : (
        <div className="orf-chat-collection-results">
          {results.map((result) => (
            <article className="orf-chat-collection-item" key={result.message.id}>
              <button type="button" onClick={() => onOpenResult(result)}>
                <span>{result.channel.displayName}</span>
                <strong>{result.message.authorName}</strong>
                <small>{formatDay(result.message.createdAt)} {formatTime(result.message.createdAt)}</small>
                <div className="orf-chat-collection-body"><ChatMarkdown compact body={result.message.body} usersById={usersById} /></div>
              </button>
              <IconButton
                className={result.message.savedByCurrentUser ? "orf-chat-message-action-active" : ""}
                icon={Bookmark}
                label={result.message.savedByCurrentUser ? "取消保存" : "保存消息"}
                onClick={() => onSave(result.message)}
              />
            </article>
          ))}
          {results.length === 0 && <div className="orf-chat-search-empty">{empty}</div>}
        </div>
      )}
    </div>
  );
}

function SearchPanel({
  onOpenResult,
  onSearch,
  query,
  results,
  searchScope,
  searchType,
  setQuery,
  setSearchScope,
  setSearchType,
  usersById,
}: {
  onOpenResult: (result: ChatSearchResult) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  query: string;
  results: ChatSearchResult[];
  searchScope: ChatSearchScope;
  searchType: ChatSearchTypeFilter;
  setQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  usersById: Map<string, ChatUser>;
}) {
  const applyScope = (scope: ChatSearchScope) => {
    setSearchScope(scope);
    if (query.trim()) void onSearch({ query, scope, type: searchType });
  };
  const applyType = (type: ChatSearchTypeFilter) => {
    setSearchType(type);
    if (query.trim()) void onSearch({ query, scope: searchScope, type });
  };

  return (
    <div className="orf-chat-search-panel">
      <form onSubmit={(event) => { event.preventDefault(); void onSearch({ query }); }}>
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可见范围内的消息" />
      </form>
      <div className="orf-chat-search-filters">
        <div className="orf-chat-segmented">
          <button type="button" className={searchScope === "all" ? "active" : ""} onClick={() => applyScope("all")}>全部可见</button>
          <button type="button" className={searchScope === "current" ? "active" : ""} onClick={() => applyScope("current")}>当前频道</button>
        </div>
        <div className="orf-chat-segmented">
          {[
            ["all", "全部"],
            ["public", "公开"],
            ["private", "私有"],
            ["direct", "私信"],
            ["group", "群聊"],
          ].map(([value, label]) => (
            <button
              type="button"
              className={searchType === value ? "active" : ""}
              key={value}
              onClick={() => applyType(value as ChatSearchTypeFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="orf-chat-search-results">
        {results.map((result) => (
          <button type="button" key={result.message.id} onClick={() => onOpenResult(result)}>
            <span>{result.channel.displayName}</span>
            <strong>{result.message.authorName}</strong>
            <SearchResultPreview message={result.message} usersById={usersById} />
          </button>
        ))}
        {results.length === 0 && <div className="orf-chat-search-empty">输入关键词后搜索。</div>}
      </div>
    </div>
  );
}

function SearchResultPreview({ message, usersById }: { message: ChatMessage; usersById: Map<string, ChatUser> }) {
  return (
    <>
      <div className="orf-chat-search-result-body">
        {message.body.trim() ? <ChatMarkdown compact body={message.body} usersById={usersById} /> : <span className="orf-chat-search-attachment-only">附件消息</span>}
      </div>
      {message.attachments.length > 0 && (
        <div className="orf-chat-search-attachments">
          {message.attachments.slice(0, 3).map((attachment) => (
            <span key={attachment.id}>
              {attachment.mimeType.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {attachment.fileName}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function ChannelInfoPanel({
  canManage,
  channel,
  currentUserId,
  onAddMembers,
  onRemoveMember,
  onUpdateChannel,
  users,
  usersById,
}: {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState(channel.displayName);
  const [purpose, setPurpose] = useState(channel.purpose);
  const [header, setHeader] = useState(channel.header);
  const [savingDetails, setSavingDetails] = useState(false);
  const memberIds = new Set(channel.members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));
  const canEditMetadata = canManage && channel.type !== "direct" && channel.type !== "group";
  const detailsChanged = displayName !== channel.displayName || purpose !== channel.purpose || header !== channel.header;

  useEffect(() => {
    setDisplayName(channel.displayName);
    setPurpose(channel.purpose);
    setHeader(channel.header);
    setSavingDetails(false);
  }, [channel.displayName, channel.header, channel.id, channel.purpose]);

  const saveDetails = async () => {
    if (!canEditMetadata || !displayName.trim()) return;
    setSavingDetails(true);
    try {
      await onUpdateChannel({ displayName: displayName.trim(), purpose: purpose.trim(), header: header.trim() });
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="orf-chat-info-panel">
      {canEditMetadata ? (
        <div className="orf-chat-info-section">
          <label>频道设置</label>
          <div className="orf-chat-info-fields">
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="频道名" />
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="频道说明" rows={3} />
            <textarea value={header} onChange={(event) => setHeader(event.target.value)} placeholder="频道标题" rows={3} />
          </div>
          <Button disabled={!detailsChanged || !displayName.trim() || savingDetails} onClick={() => void saveDetails()} variant="secondary">
            {savingDetails ? "保存中" : "保存频道设置"}
          </Button>
        </div>
      ) : (
        <>
          <div className="orf-chat-info-section">
            <label>频道说明</label>
            <p>{channel.purpose || "暂无说明"}</p>
          </div>
          <div className="orf-chat-info-section">
            <label>频道标题</label>
            <p>{channel.header || "暂无标题"}</p>
          </div>
        </>
      )}
      {canManage && channel.type !== "public" && (
        <div className="orf-chat-info-section">
          <label>添加成员</label>
          {candidates.length > 0 ? (
            <>
              <div className="orf-chat-member-picker">
                {candidates.slice(0, 10).map((user) => (
                  <button
                    className={selectedUserIds.includes(user.id) ? "orf-chat-member-selected" : ""}
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserIds((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}
                  >
                    <span className="orf-chat-member-avatar">
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                      <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                    </span>
                    <span>{user.name}</span>
                    <small>{formatPresence(user, currentUserId)}</small>
                  </button>
                ))}
              </div>
              <Button disabled={selectedUserIds.length === 0} onClick={() => void onAddMembers(selectedUserIds).then(() => setSelectedUserIds([]))} variant="secondary">
                添加成员
              </Button>
            </>
          ) : (
            <div className="orf-chat-member-empty">没有可添加成员</div>
          )}
        </div>
      )}
      <div className="orf-chat-info-section">
        <label>成员</label>
        <div className="orf-chat-member-list">
          {channel.members.map((member) => {
            const user = usersById.get(member.userId);
            return (
              <div key={member.userId}>
                <span className="orf-chat-member-avatar">
                  <Avatar avatarUrl={user?.avatarUrl} name={user?.name ?? "成员"} size="sm" />
                  <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                </span>
                <span>{user?.name ?? member.userId}</span>
                <small>{member.role} · {formatPresence(user, currentUserId)}</small>
                {canManage && channel.type !== "public" && member.userId !== currentUserId && (
                  <button type="button" onClick={() => void onRemoveMember(member.userId)}>移除</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
