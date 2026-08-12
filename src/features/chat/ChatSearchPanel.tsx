import { FileText, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatMessage, ChatSearchResult, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel } from "./chatChannelPresentation";
import { formatDateTime, formatDay, formatTime } from "./chatFormat";
import { ChatMarkdown, commentImageAttachmentIdsFromChatSystemMetadata } from "./chatMarkdown";
import { chatMessageDisplayAuthor, chatMessageDisplayBody } from "./chatMessagePresentation";
import type { ChatFeedbackReference } from "./chatModels";
import type { ChatSearchScope, ChatSearchTypeFilter } from "./chatPanelTypes";
import { chatSearchInputPlaceholder } from "./chatSearchSyntax";

type ChatSearchPanelProps = {
  currentUserId?: string;
  feedbackItems?: readonly ChatFeedbackReference[];
  focusSignal: number;
  onOpenResult: (result: ChatSearchResult) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  loading: boolean;
  query: string;
  renderMessageBody?: (message: ChatMessage) => string | null | undefined;
  results: ChatSearchResult[];
  searched: boolean;
  searchScope: ChatSearchScope;
  searchType: ChatSearchTypeFilter;
  setQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  usersById: Map<string, ChatUser>;
};

export function ChatSearchPanel({
  currentUserId,
  feedbackItems,
  focusSignal,
  onOpenResult,
  onSearch,
  loading,
  query,
  renderMessageBody,
  results,
  searched,
  searchScope,
  searchType,
  setQuery,
  setSearchScope,
  setSearchType,
  usersById,
}: ChatSearchPanelProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [focusSignal]);

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
        <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={chatSearchInputPlaceholder} />
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
        {loading && (
          <div className="orf-chat-search-empty">
            <Loader2 className="h-5 w-5 animate-spin" />
            搜索中
          </div>
        )}
        {results.map((result) => (
          <button type="button" key={result.message.id} onClick={() => onOpenResult(result)}>
            <span>{chatChannelDisplayLabel(result.channel, currentUserId, usersById)}</span>
            <strong>{chatMessageDisplayAuthor(result.message, usersById).name}</strong>
            <small title={formatDateTime(result.message.createdAt)}>{formatDay(result.message.createdAt)} {formatTime(result.message.createdAt)}</small>
            <SearchResultPreview
              body={chatMessageDisplayBody(result.message, renderMessageBody)}
              feedbackItems={feedbackItems}
              message={result.message}
              usersById={usersById}
            />
          </button>
        ))}
        {!loading && results.length === 0 && (
          <div className="orf-chat-search-empty">
            {!query.trim() ? "输入关键词后搜索。" : searched ? "没有匹配消息。" : "按 Enter 搜索。"}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultPreview({
  body,
  feedbackItems,
  message,
  usersById,
}: {
  body: string | null;
  feedbackItems?: readonly ChatFeedbackReference[];
  message: ChatMessage;
  usersById: Map<string, ChatUser>;
}) {
  return (
    <>
      <div className="orf-chat-search-result-body">
        {body?.trim() ? (
          <ChatMarkdown
            compact
            body={body}
            commentImageAttachmentIds={commentImageAttachmentIdsFromChatSystemMetadata(message.system)}
            feedbackItems={feedbackItems}
            usersById={usersById}
          />
        ) : (
          <span className="orf-chat-search-attachment-only">附件消息</span>
        )}
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
