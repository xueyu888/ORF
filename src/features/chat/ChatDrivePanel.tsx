import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Download, ExternalLink, File as FileIcon, FileText, Folder, Image, Link2, Loader2, Maximize2, MoreHorizontal, Plus, Search, Unlink, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { ImageCopyButton } from "../../components/ImageCopyButton";
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
import type { ChatChannel, ChatDriveLink, ChatMessage, Drive, DriveBootstrap, DriveNode } from "../../types/orf";
import { canOpenDriveFilePreview, DriveDocxPreview, DriveFilePreviewDialog, openDriveFilePreviewPopoutWindow } from "../drive/DriveFilePreview";
import { driveNodeMetaLabel, drivePreviewUrl } from "../drive/drivePresentation";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";
import { driveNodeMatchesChatResourceTarget, type ChatDriveResourceSelectionRequest } from "./chatDriveResourceLinks";

type ChatDrivePanelProps = {
  canManage: boolean;
  canWrite: boolean;
  channel: ChatChannel;
  notify: (message: string) => void;
  onAnnouncementMessage?: (message: ChatMessage) => void;
  onSelectionRequestHandled?: (requestId: number) => void;
  selectionRequest?: ChatDriveResourceSelectionRequest | null;
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
  onSelectionRequestHandled,
  selectionRequest,
}: ChatDrivePanelProps) {
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderChildrenByLinkId, setFolderChildrenByLinkId] = useState<Map<string, DriveNode[]>>(new Map());
  const [folderChildrenLoading, setFolderChildrenLoading] = useState(false);
  const [links, setLinks] = useState<ChatDriveLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [bindingMode, setBindingMode] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [largePreviewFile, setLargePreviewFile] = useState<Drive | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DriveNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sessionNodes, setSessionNodes] = useState<DriveNode[]>([]);
  const [textPreviewByFileId, setTextPreviewByFileId] = useState<Map<string, string>>(new Map());
  const [textPreviewLoadingIds, setTextPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const folderRequestIdRef = useRef(0);
  const notifiedMissingSelectionRequestIdRef = useRef<number | null>(null);
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
    setQuery("");
    setBindingMode(false);
    setLargePreviewFile(null);
  }, [channel.id]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!bindingMode && !trimmed) {
      setSearchLoading(false);
      setSearchResults([]);
      return undefined;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      searchDriveRequest({ limit: 30, query: trimmed || undefined, status: "active", type: "all" })
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
  }, [bindingMode, notify, query]);

  const linkedNodeIds = useMemo(() => new Set(links.map((link) => link.node.id)), [links]);
  const defaultUploadFolder = useMemo(
    () => links.find((link) => link.isDefaultUploadTarget && link.node.type === "folder")?.node ?? null,
    [links],
  );
  const firstLinkedFolder = useMemo(() => links.find((link) => link.node.type === "folder")?.node ?? null, [links]);
  const uploadTarget = defaultUploadFolder ?? firstLinkedFolder ?? bootstrap?.root ?? null;
  const uploadTargetLabel = uploadTarget ? chatResourceTargetLabel(uploadTarget.name) : "";

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
    sourceLabel: linkedNodeIds.has(node.id) ? "已在频道" : "团队文件",
  })), [linkedNodeIds, searchResults]);

  const searchActive = bindingMode || query.trim().length > 0;
  const visibleItems = searchActive ? searchItems : channelItems;
  const requestedChannelItem = useMemo(() => {
    if (!selectionRequest) return null;
    return channelItems.find((item) => driveNodeMatchesChatResourceTarget(item.node, selectionRequest)) ?? null;
  }, [channelItems, selectionRequest]);

  useEffect(() => {
    if (!selectionRequest) return;
    if (requestedChannelItem) {
      notifiedMissingSelectionRequestIdRef.current = null;
      setBindingMode(false);
      setQuery("");
      setSelectedNodeId(requestedChannelItem.node.id);
      return;
    }
    if (!bootstrap) return;
    if (loading || folderChildrenLoading) return;
    if (notifiedMissingSelectionRequestIdRef.current === selectionRequest.requestId) return;
    notifiedMissingSelectionRequestIdRef.current = selectionRequest.requestId;
    notify("这个文件不在当前频道资源里");
    onSelectionRequestHandled?.(selectionRequest.requestId);
  }, [bootstrap, folderChildrenLoading, loading, notify, onSelectionRequestHandled, requestedChannelItem, selectionRequest]);

  useEffect(() => {
    if (!selectionRequest || !requestedChannelItem) return;
    if (selectedNodeId !== requestedChannelItem.node.id) return;
    onSelectionRequestHandled?.(selectionRequest.requestId);
  }, [onSelectionRequestHandled, requestedChannelItem, selectedNodeId, selectionRequest]);

  useEffect(() => {
    if (requestedChannelItem) return;
    if (selectedNodeId && visibleItems.some((item) => item.node.id === selectedNodeId)) return;
    setSelectedNodeId(visibleItems[0]?.node.id ?? null);
  }, [requestedChannelItem, selectedNodeId, visibleItems]);

  const selectedItem = visibleItems.find((item) => item.node.id === selectedNodeId)
    ?? channelItems.find((item) => item.node.id === selectedNodeId)
    ?? searchItems.find((item) => item.node.id === selectedNodeId)
    ?? null;
  const selectedNode = selectedItem?.node ?? null;
  const selectedFile = selectedNode?.file ?? null;
  const textPreview = selectedFile ? textPreviewByFileId.get(selectedFile.id) : undefined;
  const textPreviewLoading = Boolean(selectedFile && textPreviewLoadingIds.has(selectedFile.id));
  const resourceCount = channelItems.length;
  const uploadDisabled = !canWrite || !uploadTarget || loading || Boolean(uploadTask);
  const uploadTitle = !canWrite
    ? "当前频道不可上传资源"
    : loading
      ? "正在确认上传位置"
      : uploadTarget
      ? `上传到 ${uploadTargetLabel}`
      : "没有可用上传位置";

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

  const uploadFiles = async (files: FileList | File[] | null) => {
    const nextFiles = Array.from(files ?? []).filter((file) => file.size >= 0);
    if (nextFiles.length === 0 || !canWrite || !uploadTarget) return;
    for (const file of nextFiles) {
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
        setBindingMode(false);
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

  const handlePanelDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    if (!uploadDisabled) setDragActive(true);
  };

  const handlePanelDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    if (!uploadDisabled) event.dataTransfer.dropEffect = "copy";
  };

  const handlePanelDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setDragActive(false);
  };

  const handlePanelDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDragActive(false);
    if (uploadDisabled) return;
    void uploadFiles(event.dataTransfer.files);
  };

  const addNodeToChannel = async (node: DriveNode) => {
    if (!canManage || linkedNodeIds.has(node.id) || node.deletedAt) return;
    setErrorMessage(null);
    try {
      const response = await addChatDriveLinkRequest({ channelId: channel.id, nodeId: node.id });
      setBootstrap(response.drive);
      setLinks(response.links);
      setQuery("");
      setBindingMode(false);
      setSelectedNodeId(node.id);
      void loadLinkedFolderChildren(response.links);
      notify("已加入频道资源");
    } catch (error) {
      const message = error instanceof Error ? error.message : "加入频道资源失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const removeLinkFromChannel = async (link: ChatDriveLink) => {
    if (!canManage) return;
    setErrorMessage(null);
    try {
      const response = await deleteChatDriveLinkRequest({ channelId: channel.id, linkId: link.id });
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

  const openExistingResourceBinder = () => {
    if (!canManage) return;
    setBindingMode(true);
    setQuery("");
    setSelectedNodeId(null);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const openLargePreview = (file: Drive) => {
    if (!canOpenDriveFilePreview(file)) return;
    if (!openDriveFilePreviewPopoutWindow(file)) {
      setLargePreviewFile(file);
    }
  };

  return (
    <div
      className={clsx("orf-chat-resource-panel", dragActive && "is-dragging")}
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
    >
      <div className="orf-chat-resource-topline">
        <span>
          <strong title={contextLabel}>频道资源</strong>
          <small>
            {loading ? "同步中" : `${resourceCount} 项`}
            {uploadTargetLabel ? ` · ${uploadTargetLabel}` : ""}
          </small>
        </span>
      </div>

      <div className="orf-chat-resource-commandbar">
        <form
          className="orf-chat-resource-search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Search className="h-4 w-4" />
          <input
            ref={searchInputRef}
            value={query}
            placeholder={bindingMode ? "搜索要绑定的团队文件或文件夹" : canManage ? "搜索频道资源或团队文件" : "搜索频道资源"}
            aria-label="搜索群聊资源"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <ChatResourceCommandMenu
          bindingMode={bindingMode}
          canManage={canManage}
          canWrite={canWrite}
          uploadDisabled={uploadDisabled}
          uploadTask={uploadTask}
          uploadTitle={uploadTitle}
          onBindExisting={openExistingResourceBinder}
          onUpload={() => fileInputRef.current?.click()}
        />
      </div>
      {bindingMode && (
        <div className="orf-chat-resource-binding-banner">
          <Link2 className="h-4 w-4" />
          <span>
            <strong>绑定现有资源</strong>
            <small>从团队云盘选择文件夹或文件固定到频道，不需要重新上传。</small>
          </span>
          <button type="button" onClick={() => setBindingMode(false)}>完成</button>
        </div>
      )}
      <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
      {(uploadTask || dragActive) && (
        <div className="orf-chat-resource-upload-status">
          {uploadTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>
            <strong>{uploadTask?.fileName ?? "松开即可上传"}</strong>
            <small>
              {uploadTask
                ? uploadTask.percent === null ? "上传中" : `${Math.round(uploadTask.percent)}%`
                : uploadTargetLabel ? `进入 ${uploadTargetLabel}` : "请先绑定上传文件夹"}
            </small>
          </span>
        </div>
      )}

      {errorMessage && <div className="orf-chat-resource-error">{errorMessage}</div>}

      <div className="orf-chat-resource-stage">
        {selectedItem ? (
          <ChatResourceSpotlight
            canManage={canManage}
            bindingMode={bindingMode}
            item={selectedItem}
            link={selectedItem.link ?? links.find((link) => link.node.id === selectedItem.node.id) ?? null}
            linked={linkedNodeIds.has(selectedItem.node.id)}
            onAddToChannel={() => void addNodeToChannel(selectedItem.node)}
            onOpenLargePreview={openLargePreview}
            onRemoveFromChannel={(link) => void removeLinkFromChannel(link)}
            textPreview={textPreview}
            textPreviewLoading={textPreviewLoading}
          />
        ) : (
          <div className="orf-chat-resource-stage-empty">
            {loading || searchLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Folder className="h-5 w-5" />}
            <span>{searchActive ? bindingMode ? "没有可绑定资源" : "没有匹配资源" : "暂无频道资源"}</span>
          </div>
        )}
      </div>

      <div className="orf-chat-resource-body">
        <div className="orf-chat-resource-section-heading">
          <span>{bindingMode ? "可绑定资源" : searchActive ? "搜索结果" : "资源流"}</span>
          <small>{searchActive ? `${searchResults.length} 项结果` : folderChildrenLoading ? `${resourceCount} 项，同步中` : `${resourceCount} 项资源`}</small>
        </div>
        <div className="orf-chat-resource-list" role="list" aria-label={searchActive ? "资源搜索结果" : "群聊资源"}>
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
                onSelect={() => setSelectedNodeId(item.node.id)}
                selected={selectedNodeId === item.node.id}
              />
            ))
          ) : (
            <div className="orf-chat-resource-empty">
              {searchActive ? bindingMode ? "没有可绑定资源" : "没有匹配资源" : "暂无频道资源"}
            </div>
          )}
        </div>
      </div>
      {largePreviewFile ? <DriveFilePreviewDialog file={largePreviewFile} onClose={() => setLargePreviewFile(null)} /> : null}
    </div>
  );
}

function ChatResourceCommandMenu({
  bindingMode,
  canManage,
  canWrite,
  uploadDisabled,
  uploadTask,
  uploadTitle,
  onBindExisting,
  onUpload,
}: {
  bindingMode: boolean;
  canManage: boolean;
  canWrite: boolean;
  uploadDisabled: boolean;
  uploadTask: UploadTaskState | null;
  uploadTitle: string;
  onBindExisting: () => void;
  onUpload: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <div className="orf-chat-resource-command-menu" ref={menuRef}>
      <button
        type="button"
        className="orf-chat-resource-action-button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="添加或打开资源"
        title="添加或打开资源"
        onClick={() => setMenuOpen((value) => !value)}
      >
        {uploadTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
      {menuOpen && (
        <div className="orf-chat-resource-more-menu orf-chat-resource-command-popover" role="menu">
          {canManage && (
            <button
              type="button"
              disabled={bindingMode}
              role="menuitem"
              onClick={() => {
                if (bindingMode) return;
                setMenuOpen(false);
                onBindExisting();
              }}
            >
              <Link2 className="h-4 w-4" />
              绑定现有资源
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              disabled={uploadDisabled}
              role="menuitem"
              title={uploadTask ? "正在上传资源" : uploadTitle}
              onClick={() => {
                if (uploadDisabled) return;
                setMenuOpen(false);
                onUpload();
              }}
            >
              <Upload className="h-4 w-4" />
              上传到频道
            </button>
          )}
          <Link to="/resources" role="menuitem" onClick={() => setMenuOpen(false)}>
            <ExternalLink className="h-4 w-4" />
            打开完整云盘
          </Link>
        </div>
      )}
    </div>
  );
}

function ChatResourceSpotlight({
  bindingMode,
  canManage,
  item,
  link,
  linked,
  onAddToChannel,
  onOpenLargePreview,
  onRemoveFromChannel,
  textPreview,
  textPreviewLoading,
}: {
  bindingMode: boolean;
  canManage: boolean;
  item: ChatResourceItem;
  link: ChatDriveLink | null;
  linked: boolean;
  onAddToChannel: () => void;
  onOpenLargePreview: (file: Drive) => void;
  onRemoveFromChannel: (link: ChatDriveLink) => void;
  textPreview?: string;
  textPreviewLoading: boolean;
}) {
  const Icon = iconForNode(item.node);
  const file = item.node.file ?? null;
  return (
    <article className="orf-chat-resource-spotlight">
      <div className="orf-chat-resource-spotlight-head">
        <Icon className="h-4 w-4" />
        <span>
          <strong title={item.node.name}>{item.node.name}</strong>
          <small>{item.sourceLabel} · {driveNodeMetaLabel(item.node)}</small>
        </span>
        <div className="orf-chat-resource-spotlight-actions">
          {file && canOpenDriveFilePreview(file) ? (
            <IconButton
              icon={Maximize2}
              label="大窗口预览"
              size="sm"
              variant="ghost"
              onClick={() => onOpenLargePreview(file)}
            />
          ) : null}
          <ChatResourceItemMenu
            canManage={canManage}
            linked={linked}
            link={link}
            node={item.node}
            onAddToChannel={onAddToChannel}
            onOpenLargePreview={onOpenLargePreview}
            onRemoveFromChannel={onRemoveFromChannel}
          />
        </div>
      </div>
      {bindingMode && canManage && !linked && !item.node.deletedAt ? (
        <div className="orf-chat-resource-bind-strip">
          <span>把这个资源固定到当前频道，所有成员都能从聊天侧栏打开。</span>
          <Button size="sm" type="button" variant="secondary" onClick={onAddToChannel}>
            <Link2 className="h-3.5 w-3.5" />
            固定到频道
          </Button>
        </div>
      ) : null}
      <ChatResourceInlinePreview
        node={item.node}
        textPreview={textPreview}
        textPreviewLoading={textPreviewLoading}
      />
    </article>
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
    <article className={clsx("orf-chat-resource-card", selected && "is-active")} role="listitem">
      <button
        type="button"
        className="orf-chat-resource-row"
        aria-current={selected ? "true" : undefined}
        title={item.node.name}
        onClick={onSelect}
      >
        <Icon className="h-4 w-4" />
        <span>
          <strong>{item.node.name}</strong>
          <small>{item.sourceLabel} · {driveNodeMetaLabel(item.node)}</small>
        </span>
        {item.source === "search" && !linked ? <Link2 className="h-3.5 w-3.5" aria-label="可固定到频道" /> : null}
      </button>
    </article>
  );
}

function ChatResourceItemMenu({
  canManage,
  linked,
  link,
  node,
  onAddToChannel,
  onOpenLargePreview,
  onRemoveFromChannel,
}: {
  canManage: boolean;
  linked: boolean;
  link: ChatDriveLink | null;
  node: DriveNode;
  onAddToChannel: () => void;
  onOpenLargePreview: (file: Drive) => void;
  onRemoveFromChannel: (link: ChatDriveLink) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [node?.id]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const file = node.file ?? null;
  const detailHref = `/resources/${encodeURIComponent(node.id)}/preview`;
  return (
    <div className="orf-chat-resource-more" ref={menuRef}>
      <IconButton
        icon={MoreHorizontal}
        label="更多资源操作"
        size="sm"
        variant="ghost"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((value) => !value)}
      />
      {menuOpen && (
        <div className="orf-chat-resource-more-menu" role="menu">
          <Link to={detailHref} role="menuitem" onClick={() => setMenuOpen(false)}>
            <ExternalLink className="h-4 w-4" />
            打开详情
          </Link>
          {file && canOpenDriveFilePreview(file) && (
            <button type="button" role="menuitem" onClick={() => {
              setMenuOpen(false);
              onOpenLargePreview(file);
            }}>
              <Maximize2 className="h-4 w-4" />
              大窗口预览
            </button>
          )}
          {file?.previewKind === "image" && file.previewUrl && (
            <ImageCopyButton
              fallbackMimeType={file.mimeType}
              role="menuitem"
              showLabel
              sourceUrl={drivePreviewUrl(file)}
              onBeforeCopy={() => setMenuOpen(false)}
            />
          )}
          {canManage && !linked && !node.deletedAt && (
            <button type="button" role="menuitem" onClick={() => {
              setMenuOpen(false);
              onAddToChannel();
            }}>
              <Link2 className="h-4 w-4" />
              固定到频道
            </button>
          )}
          {file && (
            <a href={file.downloadUrl} role="menuitem" onClick={() => setMenuOpen(false)}>
              <Download className="h-4 w-4" />
              下载文件
            </a>
          )}
          {canManage && link && (
            <button type="button" className="is-danger" role="menuitem" onClick={() => {
              setMenuOpen(false);
              onRemoveFromChannel(link);
            }}>
              <Unlink className="h-4 w-4" />
              移出频道
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChatResourceInlinePreview({
  node,
  textPreview,
  textPreviewLoading,
}: {
  node: DriveNode;
  textPreview?: string;
  textPreviewLoading: boolean;
}) {
  const file = node.file ?? null;
  const previewUrl = file?.previewUrl ? drivePreviewUrl(file) : undefined;
  return (
    <div className="orf-chat-resource-preview">
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
            <OrfRichTextMarkdownViewer body={textPreview} classNamePrefix="orf-drive-markdown" compact />
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
      ) : file && file.previewKind === "docx" && previewUrl ? (
        <DriveDocxPreview compact file={file} className="orf-chat-resource-docx-preview" />
      ) : (
        <div className="orf-chat-resource-preview-empty">
          <FileIcon className="h-8 w-8" />
          <span>{chatResourcePreviewUnavailableMessage(file)}</span>
        </div>
      )}
    </div>
  );
}

function chatResourcePreviewUnavailableMessage(file: DriveNode["file"] | null) {
  if (file?.previewStatus === "failed") return file.previewError || "预览生成失败，请下载文件查看";
  return "无法预览";
}

function iconForNode(node: DriveNode) {
  if (node.type === "folder") return Folder;
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "docx" || node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return FileIcon;
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

function chatResourceTargetLabel(name: string) {
  return name === "团队云盘" ? "团队文件库" : name;
}
