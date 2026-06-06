import { FileText, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatMessage, ChatSearchResult, ChatUser } from "../../types/orf";
import { formatDateTime, formatDay, formatTime } from "./chatFormat";
import { ChatMarkdown } from "./chatMarkdown";
import type { ChatSearchScope, ChatSearchTypeFilter } from "./chatPanelTypes";
import { chatSearchInputPlaceholder } from "./chatSearchSyntax";

type ChatSearchPanelProps = {
  onOpenResult: (result: ChatSearchResult) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  loading: boolean;
  query: string;
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
  onOpenResult,
  onSearch,
  loading,
  query,
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
  }, []);

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
        {loading && (
          <div className="orf-chat-search-empty">
            <Loader2 className="h-5 w-5 animate-spin" />
            搜索中
          </div>
        )}
        {results.map((result) => (
          <button type="button" key={result.message.id} onClick={() => onOpenResult(result)}>
            <span>{result.channel.displayName}</span>
            <strong>{result.message.authorName}</strong>
            <small title={formatDateTime(result.message.createdAt)}>{formatDay(result.message.createdAt)} {formatTime(result.message.createdAt)}</small>
            <SearchResultPreview message={result.message} usersById={usersById} />
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

function SearchResultPreview({ message, usersById }: { message: ChatMessage; usersById: Map<string, ChatUser> }) {
  return (
    <>
      <div className="orf-chat-search-result-body">
        {message.body.trim() ? (
          <ChatMarkdown compact body={message.body} usersById={usersById} />
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
