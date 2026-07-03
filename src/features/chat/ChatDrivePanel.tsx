import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Download, ExternalLink, File, FileText, Folder, Image, Link2, Loader2, Search, Unlink, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, IconButton } from "../../components/ui";
import {
  addChatDriveLinkRequest,
  deleteChatDriveLinkRequest,
  getChatDriveBootstrap,
  getDriveChildren,
  searchDriveRequest,
  uploadChatDriveFileRequest,
  type ApiUploadProgress,
} from "../../state/apiClient";
import type { ChatChannel, ChatDriveLink, ChatMessage, DriveBootstrap, DriveNode } from "../../types/orf";
import { driveNodeMetaLabel, drivePreviewKindLabel, drivePreviewUrl, formatDriveDateTime, formatDriveFileSize } from "../drive/drivePresentation";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";

type ChatDrivePanelProps = {
  canManage: boolean;
  canWrite: boolean;
  channel: ChatChannel;
  notify: (message: string) => void;
  onAnnouncementMessage?: (message: ChatMessage) => void;
};

type ChatResourceSource = "folderChild" | "linked" | "search" | "uploaded";

type ChatResourceItem = {
  key: string;
  link?: ChatDriveLink;
  node: DriveNode;
  source: ChatResourceSource;
  sourceLabel: string;
};

type UploadTaskState = {
  fileName: string;
  percent: number | null;
};

export function ChatDrivePanel({
  canManage,
  canWrite,
  channel,
  notify,
  onAnnouncementMessage,
}: ChatDrivePanelProps) {
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderChildrenByLinkId, setFolderChildrenByLinkId] = useState<Map<string, DriveNode[]>>(new Map());
  const [folderChildrenLoading, setFolderChildrenLoading] = useState(false);
  const [links, setLinks] = useState<ChatDriveLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DriveNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sessionNodes, setSessionNodes] = useState<DriveNode[]>([]);
  const [textPreviewByFileId, setTextPreviewByFileId] = useState<Map<string, string>>(new Map());
  const [textPreviewLoadingIds, setTextPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);

  const contextLabel = channel.displayName || channel.name || "当前群聊";

  const loadLinkedFolderChildren = useCallback(async (nextLinks: ChatDriveLink[]) => {
    const folderLinks = nextLinks.filter((link) => link.node.type === "folder" && !link.node.deletedAt);
    const requestId = folderRequestIdRef.current + 1;
    folderRequestIdRef.current = requestId;
    if (folderLinks.length === 0) {
      setFolderChildrenByLinkId(new Map());
      setFolderChildrenLoading(false);
      return;
    }
    setFolderChildrenLoading(true);
    const settled = await Promise.allSettled(
      folderLinks.map(async (link) => {
        const response = await getDriveChildren({ parentNodeId: link.node.id });
        return [link.id, response.children] as const;
      }),
    );
    if (folderRequestIdRef.current !== requestId) return;
    const nextChildren = new Map<string, DriveNode[]>();
    for (const result of settled) {
      if (result.status === "fulfilled") nextChildren.set(result.value[0], result.value[1]);
    }
    setFolderChildrenByLinkId(nextChildren);
    setFolderChildrenLoading(false);
  }, []);

  const loadDrive = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await getChatDriveBootstrap(channel.id);
      if (requestIdRef.current !== requestId) return;
      setBootstrap(response.drive);
      setLinks(response.links);
      void loadLinkedFolderChildren(response.links);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "群聊资源加载失败";
      setErrorMessage(message);
      notify(message);
      setBootstrap(null);
      setLinks([]);
      setFolderChildrenByLinkId(new Map());
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [channel.id, loadLinkedFolderChildren, notify]);

  useEffect(() => {
    void loadDrive();
  }, [loadDrive]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchLoading(false);
      setSearchResults([]);
      return undefined;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      searchDriveRequest({ limit: 30, query: trimmed, type: "all" })
        .then((response) => {
          if (!disposed) setSearchResults(response.nodes);
        })
        .catch((error) => {
          if (disposed) return;
          const message = error instanceof Error ? error.message : "资源搜索失败";
          setErrorMessage(message);
          notify(message);
          setSearchResults([]);
        })
        .finally(() => {
          if (!disposed) setSearchLoading(false);
        });
    }, 220);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [notify, query]);

  const linkedNodeIds = useMemo(() => new Set(links.map((link) => link.node.id)), [links]);
  const defaultUploadFolder = useMemo(
    () => links.find((link) => link.isDefaultUploadTarget && link.node.type === "folder")?.node ?? null,
    [links],
  );
  const firstLinkedFolder = useMemo(() => links.find((link) => link.node.type === "folder")?.node ?? null, [links]);
  const uploadTarget = defaultUploadFolder ?? firstLinkedFolder ?? bootstrap?.root ?? null;

  const channelItems = useMemo(() => {
    const items: ChatResourceItem[] = [];
    for (const node of sessionNodes) {
      items.push({ key: `uploaded:${node.id}`, node, source: "uploaded", sourceLabel: "刚刚上传" });
    }
    for (const link of links) {
      items.push({
        key: `link:${link.id}`,
        link,
        node: link.node,
        source: "linked",
        sourceLabel: link.isDefaultUploadTarget ? "默认上传位置" : "频道固定",
      });
      if (link.node.type !== "folder") continue;
      const children = folderChildrenByLinkId.get(link.id) ?? [];
      for (const child of children) {
        items.push({
          key: `folder:${link.id}:${child.id}`,
          node: child,
          source: "folderChild",
          sourceLabel: link.label || link.node.name,
        });
      }
    }
    return dedupeChatResourceItems(items).sort(compareChatResourceItems);
  }, [folderChildrenByLinkId, links, sessionNodes]);

  const searchItems = useMemo(() => searchResults.map((node): ChatResourceItem => ({
    key: `search:${node.id}`,
    node,
    source: "search",
    sourceLabel: linkedNodeIds.has(node.id) ? "已在频道" : "团队资源",
  })), [linkedNodeIds, searchResults]);

  const searchActive = query.trim().length > 0;
  const visibleItems = searchActive ? searchItems : channelItems;

  useEffect(() => {
    if (selectedNodeId && visibleItems.some((item) => item.node.id === selectedNodeId)) return;
    setSelectedNodeId(visibleItems[0]?.node.id ?? null);
  }, [selectedNodeId, visibleItems]);

  const selectedItem = visibleItems.find((item) => item.node.id === selectedNodeId)
    ?? channelItems.find((item) => item.node.id === selectedNodeId)
    ?? searchItems.find((item) => item.node.id === selectedNodeId)
    ?? null;
  const selectedNode = selectedItem?.node ?? null;
  const selectedFile = selectedNode?.file ?? null;
  const selectedLink = selectedItem?.link ?? links.find((link) => link.node.id === selectedNode?.id) ?? null;
  const selectedAlreadyLinked = Boolean(selectedNode && linkedNodeIds.has(selectedNode.id));
  const textPreview = selectedFile ? textPreviewByFileId.get(selectedFile.id) : undefined;
  const textPreviewLoading = Boolean(selectedFile && textPreviewLoadingIds.has(selectedFile.id));
  const resourceCount = channelItems.length;
  const summary = folderChildrenLoading
    ? `${resourceCount} 项 · 正在同步文件夹`
    : `${resourceCount} 项 · 上传到 ${uploadTarget?.name ?? "未选择位置"}`;

  useEffect(() => {
    const file = selectedFile;
    if (!file?.previewUrl || (file.previewKind !== "markdown" && file.previewKind !== "text")) return undefined;
    if (textPreviewByFileId.has(file.id)) return undefined;
    const controller = new AbortController();
    setTextPreviewLoadingIds((items) => new Set(items).add(file.id));
    fetch(drivePreviewUrl(file), { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Text preview failed with ${response.status}`);
        const text = await response.text();
        setTextPreviewByFileId((items) => new Map(items).set(file.id, text.slice(0, 200_000)));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTextPreviewByFileId((items) => new Map(items).set(file.id, "预览加载失败"));
      })
      .finally(() => {
        setTextPreviewLoadingIds((items) => {
          const next = new Set(items);
          next.delete(file.id);
          return next;
        });
      });
    return () => controller.abort();
  }, [selectedFile, textPreviewByFileId]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !canWrite || !uploadTarget) return;
    for (const file of Array.from(files)) {
      setUploadTask({ fileName: file.name, percent: null });
      setErrorMessage(null);
      try {
        const response = await uploadChatDriveFileRequest({
          channelId: channel.id,
          file,
          parentNodeId: uploadTarget.id,
          onProgress: (progress: ApiUploadProgress) => {
            setUploadTask({ fileName: file.name, percent: progress.percent });
          },
        });
        setSessionNodes((items) => dedupeDriveNodes([response.node, ...items]));
        setSelectedNodeId(response.node.id);
        setQuery("");
        if (response.announcementMessage) onAnnouncementMessage?.(response.announcementMessage);
        void loadLinkedFolderChildren(links);
      } catch (error) {
        const message = error instanceof Error ? error.message : "上传资源失败";
        setErrorMessage(message);
        notify(message);
        break;
      } finally {
        setUploadTask(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addSelectedToChannel = async () => {
    if (!selectedNode || !canManage || selectedAlreadyLinked || selectedNode.deletedAt) return;
    setErrorMessage(null);
    try {
      const response = await addChatDriveLinkRequest({ channelId: channel.id, nodeId: selectedNode.id });
      setBootstrap(response.drive);
      setLinks(response.links);
      setQuery("");
      setSelectedNodeId(selectedNode.id);
      void loadLinkedFolderChildren(response.links);
      notify("已加入频道资源");
    } catch (error) {
      const message = error instanceof Error ? error.message : "加入频道资源失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const removeSelectedLink = async () => {
    if (!selectedLink || !canManage) return;
    setErrorMessage(null);
    try {
      const response = await deleteChatDriveLinkRequest({ channelId: channel.id, linkId: selectedLink.id });
      setBootstrap(response.drive);
      setLinks(response.links);
      setSelectedNodeId(response.links[0]?.node.id ?? null);
      void loadLinkedFolderChildren(response.links);
      notify("已移出频道资源");
    } catch (error) {
      const message = error instanceof Error ? error.message : "移出频道资源失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  return (
    <div className="orf-chat-resource-panel">
      <div className="orf-chat-resource-hero">
        <div>
          <span>频道资源</span>
          <strong>{contextLabel}</strong>
          <small>{summary}</small>
        </div>
        <Link to="/resources" aria-label="打开资源库" title="打开资源库">
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <form
        className="orf-chat-resource-search"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <Search className="h-4 w-4" />
        <input
          value={query}
          placeholder="搜索本群或团队资源"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.trim() ? (
          <button type="button" aria-label="清空资源搜索" onClick={() => setQuery("")}>
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      <div className="orf-chat-resource-action-row">
        <Button disabled={!canWrite || !uploadTarget || loading} size="sm" type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          上传
        </Button>
        <span>{uploadTarget ? uploadTarget.name : "未选择上传位置"}</span>
      </div>
      <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />

      {uploadTask && (
        <div className="orf-chat-resource-uploading">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{uploadTask.fileName}</span>
          <strong>{uploadTask.percent === null ? "上传中" : `${Math.round(uploadTask.percent)}%`}</strong>
        </div>
      )}
      {errorMessage && <div className="orf-chat-resource-error">{errorMessage}</div>}

      <div className="orf-chat-resource-body">
        <div className="orf-chat-resource-list" role="listbox" aria-label={searchActive ? "资源搜索结果" : "群聊资源"}>
          {loading && !bootstrap ? (
            <div className="orf-chat-resource-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载资源</div>
          ) : searchLoading ? (
            <div className="orf-chat-resource-empty"><Loader2 className="h-5 w-5 animate-spin" /> 搜索资源</div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <ChatResourceRow
                item={item}
                key={item.key}
                linked={linkedNodeIds.has(item.node.id)}
                selected={selectedNodeId === item.node.id}
                onSelect={() => setSelectedNodeId(item.node.id)}
              />
            ))
          ) : (
            <div className="orf-chat-resource-empty">
              {searchActive ? "没有匹配资源" : "暂无资源"}
            </div>
          )}
        </div>

        <ChatResourcePreview
          canManage={canManage}
          linked={selectedAlreadyLinked}
          link={selectedLink}
          node={selectedNode}
          onAddToChannel={() => void addSelectedToChannel()}
          onRemoveFromChannel={() => void removeSelectedLink()}
          textPreview={textPreview}
          textPreviewLoading={textPreviewLoading}
        />
      </div>
    </div>
  );
}

function ChatResourceRow({
  item,
  linked,
  onSelect,
  selected,
}: {
  item: ChatResourceItem;
  linked: boolean;
  onSelect: () => void;
  selected: boolean;
}) {
  const Icon = iconForNode(item.node);
  return (
    <button
      type="button"
      className={clsx("orf-chat-resource-row", selected && "is-active")}
      role="option"
      aria-selected={selected}
      title={item.node.name}
      onClick={onSelect}
    >
      <Icon className="h-4 w-4" />
      <span>
        <strong>{item.node.name}</strong>
        <small>{item.sourceLabel} · {driveNodeMetaLabel(item.node)}</small>
      </span>
      {item.source === "search" && !linked ? <em>可加入</em> : null}
    </button>
  );
}

function ChatResourcePreview({
  canManage,
  linked,
  link,
  node,
  onAddToChannel,
  onRemoveFromChannel,
  textPreview,
  textPreviewLoading,
}: {
  canManage: boolean;
  linked: boolean;
  link: ChatDriveLink | null;
  node: DriveNode | null;
  onAddToChannel: () => void;
  onRemoveFromChannel: () => void;
  textPreview?: string;
  textPreviewLoading: boolean;
}) {
  if (!node) {
    return <div className="orf-chat-resource-preview-empty">选择资源预览</div>;
  }
  const file = node.file ?? null;
  const previewUrl = file?.previewUrl ? drivePreviewUrl(file) : undefined;
  const Icon = iconForNode(node);
  return (
    <div className="orf-chat-resource-preview">
      <div className="orf-chat-resource-preview-header">
        <div className="orf-chat-resource-preview-title">
          <Icon className="h-4 w-4" />
          <div>
            <strong>{node.name}</strong>
            <small>{previewSummary(node)}</small>
          </div>
        </div>
        <div className="orf-chat-resource-preview-actions">
          {canManage && !linked && !node.deletedAt && (
            <Button size="sm" type="button" variant="secondary" onClick={onAddToChannel}>
              <Link2 className="h-3.5 w-3.5" />
              加入频道
            </Button>
          )}
          {canManage && link && (
            <IconButton icon={Unlink} label="移出频道资源" size="sm" variant="ghost" onClick={onRemoveFromChannel} />
          )}
          <Link to={`/resources/${encodeURIComponent(node.id)}`} aria-label="打开资源详情" title="打开资源详情">
            <ExternalLink className="h-4 w-4" />
          </Link>
          {file && (
            <a href={file.downloadUrl} aria-label="下载资源" title="下载资源">
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
      {node.type === "folder" ? (
        <div className="orf-chat-resource-folder-preview">
          <Folder className="h-8 w-8" />
          <strong>{node.name}</strong>
          <span>{node.deletedAt ? "已在回收站" : "文件夹"}</span>
        </div>
      ) : file && file.previewKind === "image" && previewUrl ? (
        <div className="orf-chat-resource-image-preview">
          <img alt={file.fileName} src={previewUrl} />
        </div>
      ) : file && file.previewKind === "markdown" && previewUrl ? (
        <div className="orf-chat-resource-markdown-preview">
          {textPreviewLoading && textPreview === undefined ? (
            <div className="orf-chat-resource-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
          ) : textPreview ? (
            <OrfRichTextMarkdownViewer body={textPreview} classNamePrefix="orf-drive-markdown" />
          ) : null}
        </div>
      ) : file && file.previewKind === "text" && previewUrl ? (
        <div className="orf-chat-resource-text-preview">
          {textPreviewLoading && textPreview === undefined ? (
            <div className="orf-chat-resource-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
          ) : (
            <pre>{textPreview ?? ""}</pre>
          )}
        </div>
      ) : file && file.previewKind === "pdf" && previewUrl ? (
        <iframe className="orf-chat-resource-inline-preview" src={previewUrl} title={file.fileName} />
      ) : (
        <div className="orf-chat-resource-preview-empty">
          <File className="h-8 w-8" />
          <span>无法预览</span>
        </div>
      )}
    </div>
  );
}

function previewSummary(node: DriveNode) {
  if (node.type === "folder") return node.deletedAt ? "已删除文件夹" : "文件夹";
  const file = node.file;
  if (!file) return "文件";
  return `${drivePreviewKindLabel(file.previewKind)} · ${formatDriveFileSize(file.fileSize)} · ${formatDriveDateTime(node.updatedAt)}`;
}

function iconForNode(node: DriveNode) {
  if (node.type === "folder") return Folder;
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}

function dedupeChatResourceItems(items: ChatResourceItem[]) {
  const byNodeId = new Map<string, ChatResourceItem>();
  for (const item of items) {
    if (!byNodeId.has(item.node.id)) byNodeId.set(item.node.id, item);
  }
  return [...byNodeId.values()];
}

function dedupeDriveNodes(nodes: DriveNode[]) {
  const byNodeId = new Map<string, DriveNode>();
  for (const node of nodes) {
    if (!byNodeId.has(node.id)) byNodeId.set(node.id, node);
  }
  return [...byNodeId.values()];
}

function compareChatResourceItems(left: ChatResourceItem, right: ChatResourceItem) {
  const leftTime = new Date(left.node.updatedAt).getTime();
  const rightTime = new Date(right.node.updatedAt).getTime();
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.node.name.localeCompare(right.node.name, "zh-CN");
}
