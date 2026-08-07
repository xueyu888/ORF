import { Loader2, MessageSquare, X } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { ChatChannel, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser, Feedback, OrfProject } from "../../types/orf";
import { ChatChannelInfoPanel } from "./ChatChannelInfoPanel";
import type { ChatAttachmentPreviewHandler } from "./chatAttachmentPreview";
import { chatChannelInfoLabel } from "./chatChannelPresentation";
import { ChatCollectionPanel } from "./ChatCollectionPanel";
import type { ChatSendHandler } from "./chatModels";
import type { ActivePanel, ChatSearchScope, ChatSearchTypeFilter } from "./chatPanelTypes";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatThreadInboxPanel } from "./ChatThreadInboxPanel";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { ChatDrivePanel } from "./ChatDrivePanel";
import type { ChatDriveResourceLinkTarget, ChatDriveResourceSelectionRequest } from "./chatDriveResourceLinks";
import type { AppAttentionState } from "../interaction/appAttentionState";

type ChatRightPanelProps = {
  activePanel: ActivePanel;
  allUsers: ChatUser[];
  appAttentionState: AppAttentionState;
  attachmentMaxBytes: number;
  canManage: boolean;
  canWrite: boolean;
  canDeleteAnyMessage: boolean;
  channel: ChatChannel;
  collectionLoading: boolean;
  collectionResults: ChatSearchResult[];
  currentUserId?: string;
  driveSelectionRequest?: ChatDriveResourceSelectionRequest | null;
  editingMessageId?: string | null;
  feedbackItems?: readonly Pick<Feedback, "id" | "title">[];
  memberSearchFocusSignal?: number;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onAnnouncementMessage: (message: ChatMessage) => void;
  onAttachmentPreview: ChatAttachmentPreviewHandler;
  onCancelEdit: () => void;
  onClose: () => void;
  onChannelUpdated: (channel: ChatChannel) => void;
  onCopyLink: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onOpenResult: (result: ChatSearchResult) => void;
  onOpenThreadSummary: (summary: ChatThreadSummary) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemovePending: (message: ChatMessage) => void;
  onRequestAcknowledgement: (message: ChatMessage) => void;
  onRetryPending: (message: ChatMessage) => void;
  onRemoveMember: (userId: string) => Promise<void>;
  onDriveSelectionRequestHandled?: (requestId: number) => void;
  onSave: (message: ChatMessage) => void;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  onSendThreadReply: ChatSendHandler;
  onToggleFollow: (following: boolean) => void;
  onTyping: (channelId: string) => void;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "projectId" | "purpose">>) => Promise<void>;
  notify: (message: string) => void;
  projects: OrfProject[];
  searchPerformed: boolean;
  searchFocusSignal: number;
  searchLoading: boolean;
  searchQuery: string;
  searchScope: ChatSearchScope;
  searchResults: ChatSearchResult[];
  searchType: ChatSearchTypeFilter;
  setSearchQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  thread: ChatThread | null;
  threadComposerFocusSignal?: number;
  threadFocusMessageId: string | null;
  threadLoading: boolean;
  threadSummaries: ChatThreadSummary[];
  threadSummariesLoading: boolean;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
};

export function ChatRightPanel(props: ChatRightPanelProps) {
  const infoTitle = chatChannelInfoLabel(props.channel);
  const title =
    props.activePanel === "thread" ? "话题"
      : props.activePanel === "threads" ? "话题收件箱"
        : props.activePanel === "search" ? "搜索"
            : props.activePanel === "pins" ? "固定消息"
              : props.activePanel === "saved" ? "已保存"
                : props.activePanel === "files" ? "群聊资源"
              : infoTitle;
  return (
    <aside className="orf-chat-right-panel" data-active-panel={props.activePanel}>
      <div className="orf-chat-right-header">
        <strong>{title}</strong>
        <IconButton icon={X} label="关闭" onClick={props.onClose} />
      </div>
      {props.activePanel === "thread" && (
        props.thread ? (
          <ChatThreadPanel
            appAttentionState={props.appAttentionState}
            attachmentMaxBytes={props.attachmentMaxBytes}
            canDeleteAnyMessage={props.canDeleteAnyMessage}
            canPin={props.canManage}
            currentUserId={props.currentUserId}
            editingMessageId={props.editingMessageId}
            feedbackItems={props.feedbackItems}
            focusMessageId={props.threadFocusMessageId}
            composerFocusSignal={props.threadComposerFocusSignal}
            onAttachmentPreview={props.onAttachmentPreview}
            onCancelEdit={props.onCancelEdit}
            onCopyLink={props.onCopyLink}
            onCopyMessage={props.onCopyMessage}
            onDelete={props.onDelete}
            onDriveResourceLink={props.onDriveResourceLink}
            onDraftStateChange={props.onDraftStateChange}
            onEdit={props.onEdit}
            onMarkUnread={props.onMarkUnread}
            onPin={props.onPin}
            onReaction={props.onReaction}
            onRemovePending={props.onRemovePending}
            onRequestAcknowledgement={props.onRequestAcknowledgement}
            onRetryPending={props.onRetryPending}
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
          feedbackItems={props.feedbackItems}
          currentUserId={props.currentUserId}
          onOpenResult={props.onOpenResult}
          onSearch={props.onSearch}
          focusSignal={props.searchFocusSignal}
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
          currentUserId={props.currentUserId}
          feedbackItems={props.feedbackItems}
          loading={props.threadSummariesLoading}
          onOpenThread={props.onOpenThreadSummary}
          summaries={props.threadSummaries}
          usersById={props.usersById}
        />
      )}
      {(props.activePanel === "pins" || props.activePanel === "saved") && (
        <ChatCollectionPanel
          feedbackItems={props.feedbackItems}
          currentUserId={props.currentUserId}
          kind={props.activePanel}
          loading={props.collectionLoading}
          onOpenResult={props.onOpenResult}
          onSave={props.onSave}
          results={props.collectionResults}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "files" && (
        <ChatDrivePanel
          canManage={props.canManage}
          canWrite={props.canWrite}
          channel={props.channel}
          onSelectionRequestHandled={props.onDriveSelectionRequestHandled}
          selectionRequest={props.driveSelectionRequest}
          notify={props.notify}
          onAnnouncementMessage={props.onAnnouncementMessage}
        />
      )}
      {props.activePanel === "info" && (
        <ChatChannelInfoPanel
          canManage={props.canManage}
          channel={props.channel}
          currentUserId={props.currentUserId}
          memberSearchFocusSignal={props.memberSearchFocusSignal}
          onAddMembers={props.onAddMembers}
          onRemoveMember={props.onRemoveMember}
          onUpdateChannel={props.onUpdateChannel}
          projects={props.projects}
          users={props.allUsers}
          usersById={props.usersById}
        />
      )}
    </aside>
  );
}
