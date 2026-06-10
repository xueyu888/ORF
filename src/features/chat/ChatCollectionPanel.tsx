import { Bookmark, Loader2, Pin } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { ChatMessage, ChatSearchResult, ChatUser, Feedback } from "../../types/orf";
import { formatDateTime, formatDay, formatTime } from "./chatFormat";
import { ChatMarkdown } from "./chatMarkdown";

type ChatCollectionPanelProps = {
  feedbackItems?: readonly Pick<Feedback, "id" | "phenomenon">[];
  kind: "pins" | "saved";
  loading: boolean;
  onOpenResult: (result: ChatSearchResult) => void;
  onSave: (message: ChatMessage) => void;
  results: ChatSearchResult[];
  usersById: Map<string, ChatUser>;
};

export function ChatCollectionPanel({ feedbackItems, kind, loading, onOpenResult, onSave, results, usersById }: ChatCollectionPanelProps) {
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
                <small title={formatDateTime(result.message.createdAt)}>{formatDay(result.message.createdAt)} {formatTime(result.message.createdAt)}</small>
                <div className="orf-chat-collection-body"><ChatMarkdown compact body={result.message.body} feedbackItems={feedbackItems} usersById={usersById} /></div>
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
