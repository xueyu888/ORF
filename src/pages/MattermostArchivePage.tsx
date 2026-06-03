import { Archive, ChevronLeft, ChevronRight, FileText, ImageIcon, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { PageScaffold } from "../components/PageScaffold";
import { Button } from "../components/ui";
import {
  getMattermostArchiveViewer,
  type MattermostArchiveFile,
  type MattermostArchiveMessage,
  type MattermostArchiveViewerResponse,
} from "../state/apiClient";

const pageSize = 80;

export function MattermostArchivePage() {
  const [channelId, setChannelId] = useState("");
  const [data, setData] = useState<MattermostArchiveViewerResponse | null>(null);
  const [error, setError] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");

  const selectedMessage = useMemo(() => {
    if (!data) return null;
    return data.messages.find((message) => message.id === selectedMessageId) ?? data.messages[0] ?? null;
  }, [data, selectedMessageId]);
  const visibleRange = useMemo(() => {
    if (!data || data.total === 0) {
      return "0 / 0";
    }
    const start = (data.query.page - 1) * data.query.limit + 1;
    const end = Math.min(data.total, start + data.messages.length - 1);
    return `${start}-${end} / ${data.total}`;
  }, [data]);

  const loadArchive = async (nextPage = page, nextQuery = submittedQuery) => {
    setLoading(true);
    setError("");
    try {
      const response = await getMattermostArchiveViewer({
        channelId: channelId || null,
        includeDeleted,
        limit: pageSize,
        page: nextPage,
        q: nextQuery,
      });
      setData(response);
      setPage(response.query.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "归档读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadArchive(1, submittedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, includeDeleted, submittedQuery]);

  useEffect(() => {
    if (!data) return;
    if (!data.messages.some((message) => message.id === selectedMessageId)) {
      setSelectedMessageId(data.messages[0]?.id ?? null);
    }
  }, [data, selectedMessageId]);

  const submitSearch = () => {
    setSubmittedQuery(query.trim());
    setPage(1);
  };

  return (
    <PageScaffold title="聊天归档" subtitle="Mattermost 频道历史镜像。">
      <section className="orf-mattermost-archive-shell">
        <div className="orf-mattermost-archive-toolbar">
          <form
            className="orf-mattermost-archive-search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <Search className="h-4 w-4" />
            <input
              aria-label="搜索聊天归档"
              value={query}
              placeholder="搜索消息、作者或附件"
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <select
            aria-label="筛选频道"
            className="orf-mattermost-archive-select"
            value={channelId}
            onChange={(event) => {
              setChannelId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部频道</option>
            {data?.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.displayName || channel.name}
              </option>
            ))}
          </select>
          <label className="orf-mattermost-archive-toggle">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => {
                setIncludeDeleted(event.target.checked);
                setPage(1);
              }}
            />
            包含删除
          </label>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadArchive(page, submittedQuery)}>
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
        </div>

        <div className="orf-mattermost-archive-summary">
          <span>频道 {data?.channels.length ?? 0}</span>
          <span>消息 {visibleRange}</span>
          {submittedQuery && <span>搜索 {submittedQuery}</span>}
        </div>

        {error && <div className="orf-mattermost-archive-error">{error}</div>}

        <div className="orf-mattermost-archive-layout">
          <div className="orf-mattermost-archive-list">
            <div className="orf-mattermost-archive-list-header">
              <span>{loading ? "读取中" : `${data?.messages.length ?? 0} 条`}</span>
              <div className="orf-mattermost-archive-pager">
                <button
                  type="button"
                  aria-label="上一页"
                  disabled={page <= 1 || loading}
                  onClick={() => void loadArchive(page - 1, submittedQuery)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>第 {data?.query.page ?? page} 页</span>
                <button
                  type="button"
                  aria-label="下一页"
                  disabled={!data?.hasNextPage || loading}
                  onClick={() => void loadArchive(page + 1, submittedQuery)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="orf-mattermost-archive-message-list">
              {data?.messages.map((message) => (
                <ArchiveMessageRow
                  key={message.id}
                  active={message.id === selectedMessage?.id}
                  message={message}
                  onSelect={() => setSelectedMessageId(message.id)}
                />
              ))}
              {!loading && data?.messages.length === 0 && (
                <div className="orf-mattermost-archive-empty">
                  <Archive className="h-6 w-6" />
                  <span>暂无归档消息</span>
                </div>
              )}
            </div>
          </div>

          <ArchiveMessageDetail message={selectedMessage} />
        </div>
      </section>
    </PageScaffold>
  );
}

function ArchiveMessageRow({ active, message, onSelect }: { active: boolean; message: MattermostArchiveMessage; onSelect: () => void }) {
  const deleted = Boolean(message.deletedAt);
  const excerpt = deleted ? "该消息已删除" : message.message || "[无正文]";

  return (
    <button
      type="button"
      className={clsx("orf-mattermost-archive-message-row", active && "is-active", deleted && "is-deleted")}
      onClick={onSelect}
    >
      <span className="orf-mattermost-archive-message-row-head">
        <span className="orf-mattermost-archive-channel">{message.channelDisplayName || message.channelName}</span>
        <span>{message.authorName}</span>
      </span>
      <span className="orf-mattermost-archive-excerpt">{excerpt}</span>
      <span className="orf-mattermost-archive-message-row-meta">
        <span>{formatArchiveTime(message.createdAt)}</span>
        {message.files.length > 0 && <span>{message.files.length} 个附件</span>}
        {deleted && <span>已删除</span>}
      </span>
    </button>
  );
}

function ArchiveMessageDetail({ message }: { message: MattermostArchiveMessage | null }) {
  if (!message) {
    return (
      <div className="orf-mattermost-archive-detail">
        <div className="orf-mattermost-archive-empty">
          <Archive className="h-6 w-6" />
          <span>暂无消息</span>
        </div>
      </div>
    );
  }

  const deleted = Boolean(message.deletedAt);

  return (
    <article className="orf-mattermost-archive-detail">
      <header className="orf-mattermost-archive-detail-header">
        <div>
          <h2>{message.channelDisplayName || message.channelName}</h2>
          <div className="orf-mattermost-archive-detail-meta">
            <span>{message.authorName}</span>
            <span>{formatArchiveTime(message.createdAt)}</span>
            {message.editedAt && <span>编辑 {formatArchiveTime(message.editedAt)}</span>}
            {deleted && <span>删除 {formatArchiveTime(message.deletedAt)}</span>}
          </div>
        </div>
        {message.rootId && <span className="orf-mattermost-archive-thread-pill">Thread</span>}
      </header>
      <pre className={clsx("orf-mattermost-archive-body", deleted && "is-deleted")}>
        {deleted ? "该消息已删除" : message.message || "[无正文]"}
      </pre>
      {message.files.length > 0 && (
        <div className="orf-mattermost-archive-files">
          {message.files.map((file) => (
            <ArchiveFileFigure key={file.id} file={file} />
          ))}
        </div>
      )}
    </article>
  );
}

function ArchiveFileFigure({ file }: { file: MattermostArchiveFile }) {
  return (
    <figure className={clsx("orf-mattermost-archive-file", file.contentUrl && "has-preview")}>
      {file.contentUrl ? (
        <a href={file.contentUrl} target="_blank" rel="noreferrer">
          <img src={file.contentUrl} alt={file.name || file.id} loading="lazy" />
        </a>
      ) : (
        <div className="orf-mattermost-archive-file-placeholder">
          {file.isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
      )}
      <figcaption>
        <span className="orf-mattermost-archive-file-name">{file.name || file.id}</span>
        <span>{formatFileSize(file.size)}</span>
        <span>{file.storageStatus}</span>
      </figcaption>
    </figure>
  );
}

function formatArchiveTime(value: string | null) {
  if (!value) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
