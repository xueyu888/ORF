import { Loader2, MessageSquare, X } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { ChatAttachment, ChatChannel, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser } from "../../types/orf";
import { ChatChannelInfoPanel } from "./ChatChannelInfoPanel";
import { ChatCollectionPanel } from "./ChatCollectionPanel";
import type { ChatDraft } from "./chatModels";
import type { ActivePanel, ChatSearchScope, ChatSearchTypeFilter } from "./chatPanelTypes";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatThreadInboxPanel } from "./ChatThreadInboxPanel";
import { ChatThreadPanel } from "./ChatThreadPanel";

type ChatRightPanelProps = {
  activePanel: ActivePanel;
  allUsers: ChatUser[];
  canManage: boolean;
  channel: ChatChannel;
  collectionLoading: boolean;
  collectionResults: ChatSearchResult[];
  currentUserId?: string;
  editingMessageId?: string | null;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onCancelEdit: () => void;
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
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  onSendThreadReply: (
    draft: ChatDraft,
    attachments: ChatAttachment[],
    rootMessageId?: string | null,
    parentMessageId?: string | null,
  ) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  searchPerformed: boolean;
  searchLoading: boolean;
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
          <ChatThreadPanel
            canPin={props.canManage}
            currentUserId={props.currentUserId}
            editingMessageId={props.editingMessageId}
            focusMessageId={props.threadFocusMessageId}
            onAttachmentPreview={props.onAttachmentPreview}
            onCancelEdit={props.onCancelEdit}
            onCopyLink={props.onCopyLink}
            onDelete={props.onDelete}
            onDraftStateChange={props.onDraftStateChange}
            onEdit={props.onEdit}
            onMarkUnread={props.onMarkUnread}
            onPin={props.onPin}
            onReaction={props.onReaction}
            onSave={props.onSave}
            onSaveEdit={props.onSaveEdit}
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
        <ChatSearchPanel
          onOpenResult={props.onOpenResult}
          onSearch={props.onSearch}
          loading={props.searchLoading}
          searched={props.searchPerformed}
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
        <ChatThreadInboxPanel
          loading={props.threadSummariesLoading}
          onOpenThread={props.onOpenThreadSummary}
          summaries={props.threadSummaries}
          usersById={props.usersById}
        />
      )}
      {(props.activePanel === "pins" || props.activePanel === "saved") && (
        <ChatCollectionPanel
          kind={props.activePanel}
          loading={props.collectionLoading}
          onOpenResult={props.onOpenResult}
          onSave={props.onSave}
          results={props.collectionResults}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "info" && (
        <ChatChannelInfoPanel
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
