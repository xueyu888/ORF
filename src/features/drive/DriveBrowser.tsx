import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  File,
  FileClock,
  FileText,
  Folder,
  FolderPlus,
  Image,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import type { ApiUploadProgress } from "../../state/apiClient";
import type {
  ChatDriveLink,
  ChatMessage,
  Drive,
  DriveBootstrap,
  DriveContextType,
  DriveFileVersion,
  DriveNode,
  DriveNodeDetails,
  DriveSearchType,
} from "../../types/orf";

type DriveUploadResult = {
  announcementMessage?: ChatMessage | null;
  node: DriveNode;
};

export type DriveContextOption = {
  id: string;
  title: string;
  type: Exclude<DriveContextType, "chatChannel">;
};

type DriveBrowserProps = {
  bootstrap: DriveBootstrap | null;
  canManageLinks?: boolean;
  canWrite: boolean;
  compact?: boolean;
  contextLabel?: string;
  contextOptions?: DriveContextOption[];
  links?: ChatDriveLink[];
  loading: boolean;
  notify: (message: string) => void;
  onAddContextLink?: (input: { contextId: string; contextType: DriveContextType; nodeId: string }) => Promise<DriveNodeDetails>;
  onAddLink?: (input: { isDefaultUploadTarget?: boolean; node: DriveNode }) => Promise<void>;
  onCreateFolder: (input: { name: string; parentNodeId: string }) => Promise<DriveNode>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onListTrash?: () => Promise<DriveNode[]>;
  onLoadChildren: (parentNodeId: string) => Promise<DriveNode[]>;
  onLoadDetails?: (nodeId: string) => Promise<DriveNodeDetails>;
  onRefresh: () => Promise<void> | void;
  onRemoveContextLink?: (input: { linkId: string; nodeId: string }) => Promise<DriveNodeDetails>;
  onRemoveLink?: (linkId: string) => Promise<void>;
  onRestoreNode?: (nodeId: string) => Promise<DriveNode>;
  onRestoreVersion?: (input: { fileId: string; versionId: string }) => Promise<{ node: DriveNode; versions: DriveFileVersion[] }>;
  onSearch?: (input: { query?: string; type?: DriveSearchType }) => Promise<DriveNode[]>;
  onUploadedAnnouncement?: (message: ChatMessage) => void;
  onUploadFile: (input: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => Promise<DriveUploadResult>;
  onUploadVersion?: (input: { file: File; fileId: string; onProgress?: (progress: ApiUploadProgress) => void }) => Promise<{ node: DriveNode; versions: DriveFileVersion[] }>;
};

type UploadTaskState = {
  fileName: string;
  percent: number | null;
};

type DriveMode = "browse" | "recent" | "search" | "trash";

const modeLabels: Record<DriveMode, string> = {
  browse: "文件夹",
  recent: "最近",
  search: "搜索",
  trash: "回收站",
};

export function DriveBrowser({
  bootstrap,
  canManageLinks = false,
  canWrite,
  compact = false,
  contextLabel,
  contextOptions = [],
  links = [],
  loading,
  notify,
  onAddContextLink,
  onAddLink,
  onCreateFolder,
  onDeleteNode,
  onListTrash,
  onLoadChildren,
  onLoadDetails,
  onRefresh,
  onRemoveContextLink,
  onRemoveLink,
  onRestoreNode,
  onRestoreVersion,
  onSearch,
  onUploadedAnnouncement,
  onUploadFile,
  onUploadVersion,
}: DriveBrowserProps) {
  const [childrenByFolderId, setChildrenByFolderId] = useState<Map<string, DriveNode[]>>(new Map());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [details, setDetails] = useState<DriveNodeDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<DriveMode>("browse");
  const [newFolderName, setNewFolderName] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveNode[]>([]);
  const [searchType, setSearchType] = useState<DriveSearchType>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [textPreviewByFileId, setTextPreviewByFileId] = useState<Map<string, string>>(new Map());
  const [textPreviewLoadingIds, setTextPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [trashNodes, setTrashNodes] = useState<DriveNode[]>([]);
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const [compactDetailsOpen, setCompactDetailsOpen] = useState(false);
  const [compactToolsOpen, setCompactToolsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadDetailsRef = useRef(onLoadDetails);
  const notifyRef = useRef(notify);
  const versionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadDetailsRef.current = onLoadDetails;
    notifyRef.current = notify;
  }, [notify, onLoadDetails]);

  useEffect(() => {
    if (!bootstrap) {
      setChildrenByFolderId(new Map());
      setExpandedFolderIds(new Set());
      setSelectedNodeId(null);
      setDetails(null);
      return;
    }
    const nextChildren = new Map([[bootstrap.root.id, bootstrap.children]]);
    setChildrenByFolderId(nextChildren);
    setExpandedFolderIds(new Set([bootstrap.root.id]));
    setSelectedNodeId((current) => {
      if (mode !== "browse") return current;
      return current && hasNode(bootstrap.root, nextChildren, current) ? current : bootstrap.root.id;
    });
  }, [bootstrap]);

  const linkedNodeById = useMemo(() => new Map(links.map((link) => [link.node.id, link.node])), [links]);
  const adHocNodeById = useMemo(() => {
    const items = [...searchResults, ...trashNodes, ...(bootstrap?.recentNodes ?? [])];
    return new Map(items.map((node) => [node.id, node]));
  }, [bootstrap?.recentNodes, searchResults, trashNodes]);
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const modeNode =
      mode === "trash"
        ? trashNodes.find((node) => node.id === selectedNodeId)
        : mode === "search"
          ? searchResults.find((node) => node.id === selectedNodeId)
          : mode === "recent"
            ? bootstrap?.recentNodes?.find((node) => node.id === selectedNodeId)
            : null;
    if (mode !== "browse" && modeNode) return modeNode;
    const adHocNode = adHocNodeById.get(selectedNodeId) ?? null;
    return findNode(bootstrap?.root ?? null, childrenByFolderId, selectedNodeId)
      ?? linkedNodeById.get(selectedNodeId)
      ?? adHocNode
      ?? null;
  }, [adHocNodeById, bootstrap?.recentNodes, bootstrap?.root, childrenByFolderId, linkedNodeById, mode, searchResults, selectedNodeId, trashNodes]);
  const effectiveNode = details?.node ?? selectedNode;
  const selectedFolder = useMemo(() => {
    if (effectiveNode?.type === "folder" && !effectiveNode.deletedAt) return effectiveNode;
    if (!effectiveNode?.parentId) return null;
    return findNode(bootstrap?.root ?? null, childrenByFolderId, effectiveNode.parentId) ?? linkedNodeById.get(effectiveNode.parentId) ?? null;
  }, [bootstrap?.root, childrenByFolderId, effectiveNode, linkedNodeById]);
  const defaultUploadFolder = useMemo(
    () => links.find((link) => link.isDefaultUploadTarget && link.node.type === "folder")?.node ?? null,
    [links],
  );
  const uploadTarget = selectedFolder ?? defaultUploadFolder ?? bootstrap?.root ?? null;
  const canMutateDrive = canWrite && Boolean(bootstrap);
  const selectedAlreadyLinked = Boolean(effectiveNode && linkedNodeById.has(effectiveNode.id));
  const selectedFile = effectiveNode?.file ?? null;
  const textPreview = selectedFile ? textPreviewByFileId.get(selectedFile.id) : undefined;
  const textPreviewLoading = Boolean(selectedFile && textPreviewLoadingIds.has(selectedFile.id));
  const rootItemCount = bootstrap?.children.length ?? 0;
  const recentItemCount = bootstrap?.recentNodes?.length ?? 0;
  const activeScopeLabel = contextLabel ?? (compact ? "当前群聊" : "团队空间");
  const activeModeSummary =
    mode === "browse" ? `${rootItemCount} 项根资源`
      : mode === "recent" ? `${recentItemCount} 项最近更新`
        : mode === "search" ? `${searchResults.length} 项搜索结果`
          : `${trashNodes.length} 项可恢复资源`;
  const compactModeSummary = mode === "browse" ? `${links.length} 项群聊资源` : activeModeSummary;
  const uploadTargetLabel = uploadTarget?.name ?? "未选择上传位置";
  const showCompactLinkAction = Boolean(onAddLink && effectiveNode && canManageLinks && !selectedAlreadyLinked && !effectiveNode.deletedAt);

  useEffect(() => {
    if (!compact || compactToolsOpen || mode !== "browse" || links.length === 0) return;
    const firstLinkedNodeId = links[0].node.id;
    setSelectedNodeId((current) => {
      if (current && current !== bootstrap?.root.id) return current;
      return firstLinkedNodeId;
    });
  }, [bootstrap?.root.id, compact, compactToolsOpen, links, mode]);

  useEffect(() => {
    const nodeId = selectedNodeId;
    const loadDetails = loadDetailsRef.current;
    if (!nodeId || !loadDetails) {
      setDetails(null);
      return;
    }
    let disposed = false;
    setDetails((current) => current?.node.id === nodeId ? current : null);
    setDetailsLoading(true);
    loadDetails(nodeId)
      .then((loaded) => {
        if (!disposed) setDetails(loaded);
      })
      .catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "文件详情加载失败";
        notifyRef.current(message);
        setDetails(null);
      })
      .finally(() => {
        if (!disposed) setDetailsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedNodeId]);

  useEffect(() => {
    const file = selectedFile;
    if (!file?.previewUrl || (file.previewKind !== "markdown" && file.previewKind !== "text")) return undefined;
    if (textPreviewByFileId.has(file.id)) return undefined;
    const controller = new AbortController();
    const previewUrl = drivePreviewUrl(file);
    setTextPreviewLoadingIds((items) => new Set(items).add(file.id));
    fetch(previewUrl, { cache: "no-store", credentials: "include", signal: controller.signal })
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

  const loadChildren = async (folderId: string) => {
    setLoadingFolderIds((items) => new Set(items).add(folderId));
    setErrorMessage(null);
    try {
      const children = await onLoadChildren(folderId);
      setChildrenByFolderId((items) => new Map(items).set(folderId, children));
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件夹加载失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setLoadingFolderIds((items) => {
        const next = new Set(items);
        next.delete(folderId);
        return next;
      });
    }
  };

  const runSearch = async (nextQuery = searchQuery, nextType = searchType) => {
    if (!onSearch) return;
    setMode("search");
    setResourceLoading(true);
    setErrorMessage(null);
    try {
      const nodes = await onSearch({ query: nextQuery, type: nextType });
      setSearchResults(nodes);
      setSelectedNodeId(nodes[0]?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "搜索失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setResourceLoading(false);
    }
  };

  const loadTrash = async () => {
    if (!onListTrash) return;
    setMode("trash");
    setResourceLoading(true);
    setErrorMessage(null);
    try {
      const nodes = await onListTrash();
      setTrashNodes(nodes);
      setSelectedNodeId(nodes[0]?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "回收站加载失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setResourceLoading(false);
    }
  };

  const toggleFolder = (node: DriveNode) => {
    setMode("browse");
    setSelectedNodeId(node.id);
    setExpandedFolderIds((items) => {
      const next = new Set(items);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
        if (!childrenByFolderId.has(node.id)) void loadChildren(node.id);
      }
      return next;
    });
  };

  const createFolder = async () => {
    if (!canMutateDrive || !uploadTarget || creatingFolder || !newFolderName.trim()) return;
    setCreatingFolder(true);
    setErrorMessage(null);
    try {
      const node = await onCreateFolder({ name: newFolderName.trim(), parentNodeId: uploadTarget.id });
      setChildrenByFolderId((items) => appendChildNode(items, uploadTarget.id, node));
      setExpandedFolderIds((items) => new Set(items).add(uploadTarget.id));
      setMode("browse");
      setSelectedNodeId(node.id);
      setNewFolderName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "新建文件夹失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !canMutateDrive || !uploadTarget) return;
    for (const file of Array.from(files)) {
      setUploadTask({ fileName: file.name, percent: null });
      setErrorMessage(null);
      try {
        const response = await onUploadFile({
          file,
          parentNodeId: uploadTarget.id,
          onProgress: (progress) => {
            setUploadTask({ fileName: file.name, percent: progress.percent });
          },
        });
        setChildrenByFolderId((items) => appendChildNode(items, uploadTarget.id, response.node));
        setExpandedFolderIds((items) => new Set(items).add(uploadTarget.id));
        setMode("browse");
        setSelectedNodeId(response.node.id);
        if (response.announcementMessage) onUploadedAnnouncement?.(response.announcementMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : "上传云盘失败";
        setErrorMessage(message);
        notify(message);
        break;
      } finally {
        setUploadTask(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadVersion = async (files: FileList | null) => {
    const fileMeta = selectedFile;
    if (!files?.[0] || !fileMeta || !onUploadVersion || !canMutateDrive) return;
    const file = files[0];
    setUploadTask({ fileName: file.name, percent: null });
    setErrorMessage(null);
    try {
      const response = await onUploadVersion({
        file,
        fileId: fileMeta.id,
        onProgress: (progress) => {
          setUploadTask({ fileName: file.name, percent: progress.percent });
        },
      });
      patchNodeEverywhere(response.node);
      setTextPreviewByFileId((items) => removeTextPreview(items, fileMeta.id));
      setDetails((current) => current ? { ...current, node: response.node, versions: response.versions } : current);
      setSelectedNodeId(response.node.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传新版本失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setUploadTask(null);
      if (versionInputRef.current) versionInputRef.current.value = "";
    }
  };

  const patchNodeEverywhere = (node: DriveNode) => {
    if (node.parentId) {
      setChildrenByFolderId((items) => appendChildNode(items, node.parentId ?? "", node));
    }
    setSearchResults((items) => items.map((item) => item.id === node.id ? node : item));
    setTrashNodes((items) => items.map((item) => item.id === node.id ? node : item));
  };

  const deleteSelectedNode = async () => {
    if (!canMutateDrive || !effectiveNode || effectiveNode.id === bootstrap?.root.id) return;
    setErrorMessage(null);
    try {
      await onDeleteNode(effectiveNode.id);
      setSelectedNodeId(bootstrap?.root.id ?? null);
      await onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除云盘失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const restoreSelectedNode = async () => {
    if (!effectiveNode?.deletedAt || !onRestoreNode || !canMutateDrive) return;
    setErrorMessage(null);
    try {
      const node = await onRestoreNode(effectiveNode.id);
      setTrashNodes((items) => items.filter((item) => item.id !== node.id));
      setSelectedNodeId(node.id);
      setMode("browse");
      await onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "恢复失败，可能存在同名文件";
      setErrorMessage(message);
      notify(message);
    }
  };

  const addSelectedLink = async (isDefaultUploadTarget = false) => {
    const node = isDefaultUploadTarget ? uploadTarget : effectiveNode;
    if (!onAddLink || !canManageLinks || !node || node.deletedAt) return;
    setErrorMessage(null);
    try {
      await onAddLink({ isDefaultUploadTarget, node });
      if (compact) {
        setMode("browse");
        setCompactToolsOpen(false);
        setSelectedNodeId(node.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "群聊云盘绑定失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const removeLink = async (linkId: string) => {
    if (!onRemoveLink || !canManageLinks) return;
    setErrorMessage(null);
    try {
      await onRemoveLink(linkId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "取消绑定失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const restoreVersion = async (versionId: string) => {
    const file = selectedFile;
    if (!file || !onRestoreVersion || !canMutateDrive) return;
    setErrorMessage(null);
    try {
      const response = await onRestoreVersion({ fileId: file.id, versionId });
      patchNodeEverywhere(response.node);
      setTextPreviewByFileId((items) => removeTextPreview(items, file.id));
      setDetails((current) => current ? { ...current, node: response.node, versions: response.versions } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "版本恢复失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const addContext = async (contextKey: string) => {
    if (!effectiveNode || !onAddContextLink || !contextKey) return;
    const [type, id] = contextKey.split(":", 2) as [DriveContextType, string];
    if (!type || !id) return;
    setErrorMessage(null);
    try {
      const nextDetails = await onAddContextLink({ contextId: id, contextType: type, nodeId: effectiveNode.id });
      setDetails(nextDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : "关联工作上下文失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const removeContext = async (linkId: string) => {
    if (!effectiveNode || !onRemoveContextLink) return;
    setErrorMessage(null);
    try {
      const nextDetails = await onRemoveContextLink({ linkId, nodeId: effectiveNode.id });
      setDetails(nextDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : "移除工作上下文失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const resourceList = mode === "recent"
    ? (bootstrap?.recentNodes ?? [])
    : mode === "search"
      ? searchResults
      : mode === "trash"
        ? trashNodes
        : [];
  const compactShowsTeamFolders = compact && compactToolsOpen && mode === "browse";
  const compactResourceNodes = mode === "browse" ? links.map((link) => link.node) : resourceList;
  const compactResourceTitle = mode === "browse" ? "群聊资源" : modeLabels[mode];
  const compactResourceCount = compactResourceNodes.length;

  const modebar = (
    <div className="orf-drive-modebar">
      {(Object.keys(modeLabels) as DriveMode[]).map((item) => (
        <button
          key={item}
          type="button"
          className={clsx(mode === item && "is-active")}
          aria-label={item === "trash" && bootstrap?.trashCount ? `${modeLabels[item]} ${bootstrap.trashCount}` : modeLabels[item]}
          aria-pressed={mode === item}
          title={modeLabels[item]}
          onClick={() => {
            if (item === "trash") void loadTrash();
            else setMode(item);
          }}
        >
          {item === "browse" && <Folder className="h-4 w-4" />}
          {item === "recent" && <Clock3 className="h-4 w-4" />}
          {item === "search" && <Search className="h-4 w-4" />}
          {item === "trash" && <Trash2 className="h-4 w-4" />}
          <span>{modeLabels[item]}</span>
          {item === "trash" && bootstrap?.trashCount ? <small>{bootstrap.trashCount}</small> : null}
        </button>
      ))}
    </div>
  );

  const fullActions = (
    <div className="orf-drive-actions">
      <IconButton disabled={!canMutateDrive || !uploadTarget || mode === "trash"} icon={Upload} label={uploadTarget ? `上传到 ${uploadTarget.name}` : "上传文件"} onClick={() => fileInputRef.current?.click()} />
      <IconButton disabled={!canMutateDrive || !uploadTarget || mode === "trash"} icon={FolderPlus} label="新建文件夹" onClick={() => setNewFolderName((value) => value || "新建文件夹")} />
      <IconButton disabled={!effectiveNode || effectiveNode.id === bootstrap?.root.id || !canMutateDrive || Boolean(effectiveNode.deletedAt)} icon={Trash2} label="删除" onClick={() => void deleteSelectedNode()} />
      <IconButton disabled={!effectiveNode?.deletedAt || !onRestoreNode || !canMutateDrive} icon={RotateCcw} label="恢复" onClick={() => void restoreSelectedNode()} />
      <IconButton disabled={!selectedFile || !onUploadVersion || !canMutateDrive || Boolean(effectiveNode?.deletedAt)} icon={FileClock} label="上传新版本" onClick={() => versionInputRef.current?.click()} />
      {onAddLink && (
        <>
          <IconButton disabled={!effectiveNode || !canManageLinks || selectedAlreadyLinked || Boolean(effectiveNode.deletedAt)} icon={Link2} label="绑定到群聊" onClick={() => void addSelectedLink(false)} />
          <IconButton disabled={!uploadTarget || !canManageLinks || mode === "trash"} icon={Star} label="设为默认上传文件夹" onClick={() => void addSelectedLink(true)} />
        </>
      )}
      <IconButton icon={RefreshCw} label="刷新" loading={loading} onClick={() => void onRefresh()} />
      <span className="orf-drive-upload-target" title={uploadTargetLabel}>{uploadTargetLabel}</span>
    </div>
  );

  const compactAdvancedActions = (
    <div className="orf-drive-actions orf-drive-actions-advanced">
      <IconButton disabled={!canMutateDrive || !uploadTarget || mode === "trash"} icon={FolderPlus} label="新建文件夹" onClick={() => setNewFolderName((value) => value || "新建文件夹")} />
      <IconButton disabled={!effectiveNode || effectiveNode.id === bootstrap?.root.id || !canMutateDrive || Boolean(effectiveNode.deletedAt)} icon={Trash2} label="删除" onClick={() => void deleteSelectedNode()} />
      <IconButton disabled={!effectiveNode?.deletedAt || !onRestoreNode || !canMutateDrive} icon={RotateCcw} label="恢复" onClick={() => void restoreSelectedNode()} />
      <IconButton disabled={!selectedFile || !onUploadVersion || !canMutateDrive || Boolean(effectiveNode?.deletedAt)} icon={FileClock} label="上传新版本" onClick={() => versionInputRef.current?.click()} />
      {onAddLink && (
        <IconButton disabled={!uploadTarget || !canManageLinks || mode === "trash"} icon={Star} label="设为默认上传文件夹" onClick={() => void addSelectedLink(true)} />
      )}
      <IconButton icon={RefreshCw} label="刷新" loading={loading} onClick={() => void onRefresh()} />
      <span className="orf-drive-upload-target" title={uploadTargetLabel}>{uploadTargetLabel}</span>
    </div>
  );

  return (
    <div className={clsx("orf-drive-panel", compact && "orf-drive-panel-compact")}>
      <div className="orf-drive-workbench-header">
        <div className="orf-drive-workbench-title">
          <span>{compact ? "频道资源" : "团队云盘"}</span>
          <strong>{activeScopeLabel}</strong>
          <small>{compact ? compactModeSummary : activeModeSummary}</small>
        </div>
        <div className="orf-drive-workbench-meta" aria-label="云盘状态摘要">
          <span><Folder className="h-3.5 w-3.5" />{rootItemCount}</span>
          <span><Clock3 className="h-3.5 w-3.5" />{recentItemCount}</span>
          <span><Trash2 className="h-3.5 w-3.5" />{bootstrap?.trashCount ?? 0}</span>
        </div>
      </div>

      {!compact && links.length > 0 && (
        <div className="orf-drive-linked-card">
          <div className="orf-drive-linked-heading">
            <strong>已绑定到群聊</strong>
            <small>{links.length} 项</small>
          </div>
          <div className="orf-drive-linked-strip" aria-label="群聊已绑定云盘资源">
            {links.map((link) => (
              <div key={link.id} className={clsx("orf-drive-linked-item", link.isDefaultUploadTarget && "is-default")}>
                <button type="button" onClick={() => setSelectedNodeId(link.node.id)}>
                  {link.node.type === "folder" ? <Folder className="h-4 w-4" /> : <File className="h-4 w-4" />}
                  <span>{link.label || link.node.name}</span>
                  {link.isDefaultUploadTarget && <Star className="h-3.5 w-3.5" />}
                </button>
                {canManageLinks && onRemoveLink && (
                  <button type="button" className="orf-drive-linked-remove" aria-label="取消绑定" onClick={() => void removeLink(link.id)}>
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && modebar}

      <form
        className={clsx("orf-drive-searchbar", compact && "orf-drive-searchbar-compact")}
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <Search className="h-4 w-4" />
        <input value={searchQuery} placeholder={compact ? "搜索群聊资源或团队云盘" : "搜索文件名、类型、内容线索"} onChange={(event) => setSearchQuery(event.target.value)} />
        {compact ? (
          <IconButton icon={Search} label="搜索" size="sm" type="submit" variant="ghost" />
        ) : (
          <>
            <select
              value={searchType}
              onChange={(event) => {
                const nextType = event.target.value as DriveSearchType;
                setSearchType(nextType);
                if (mode === "search") void runSearch(searchQuery, nextType);
              }}
            >
              <option value="all">全部</option>
              <option value="file">文件</option>
              <option value="folder">文件夹</option>
            </select>
            <Button size="sm" variant="secondary">搜索</Button>
          </>
        )}
      </form>

      {compact ? (
        <>
          <div className={clsx("orf-drive-compact-primary-actions", !showCompactLinkAction && "is-minimal")}>
            <Button disabled={!canMutateDrive || !uploadTarget || mode === "trash"} size="sm" type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              上传
            </Button>
            {showCompactLinkAction && (
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => void addSelectedLink(false)}
              >
                <Link2 className="h-3.5 w-3.5" />
                绑定到群聊
              </Button>
            )}
            <IconButton
              icon={MoreHorizontal}
              label={compactToolsOpen ? "收起更多操作" : "更多操作"}
              onClick={() => setCompactToolsOpen((value) => !value)}
              variant={compactToolsOpen ? "secondary" : "ghost"}
            />
          </div>
          {compactToolsOpen && (
            <div className="orf-drive-compact-tools">
              {modebar}
              {compactAdvancedActions}
            </div>
          )}
        </>
      ) : (
        fullActions
      )}
      <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
      <input ref={versionInputRef} hidden type="file" onChange={(event) => void uploadVersion(event.currentTarget.files)} />

      {newFolderName && (
        <form className="orf-drive-create" onSubmit={(event) => {
          event.preventDefault();
          void createFolder();
        }}>
          <input aria-label="文件夹名称" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} />
          <Button disabled={creatingFolder || !newFolderName.trim()} size="sm" variant="secondary">
            {creatingFolder ? "创建中" : "创建"}
          </Button>
        </form>
      )}

      {uploadTask && (
        <div className="orf-drive-uploading">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{uploadTask.fileName}</span>
          <strong>{uploadTask.percent === null ? "上传中" : `${Math.round(uploadTask.percent)}%`}</strong>
        </div>
      )}
      {errorMessage && <div className="orf-drive-error">{errorMessage}</div>}

      {loading && !bootstrap ? (
        <div className="orf-drive-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载云盘</div>
      ) : bootstrap ? (
        <div className="orf-drive-layout">
          <div className={clsx("orf-drive-tree", compact && !compactShowsTeamFolders && "orf-drive-resource-pane")} role={compact && !compactShowsTeamFolders ? "listbox" : "tree"}>
            {resourceLoading ? (
              <div className="orf-drive-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载资源</div>
            ) : compact && !compactShowsTeamFolders ? (
              <>
                <div className="orf-drive-resource-pane-heading">
                  <span>{compactResourceTitle}</span>
                  <small>{compactResourceCount} 项</small>
                </div>
                <DriveResourceList
                  emptyLabel={mode === "browse" ? "暂无群聊资源" : "没有资源"}
                  nodes={compactResourceNodes}
                  selectedNodeId={selectedNodeId}
                  onSelect={(node) => setSelectedNodeId(node.id)}
                />
              </>
            ) : mode === "browse" ? (
              <DriveTreeRow
                childrenByFolderId={childrenByFolderId}
                expandedFolderIds={expandedFolderIds}
                level={0}
                loadingFolderIds={loadingFolderIds}
                node={bootstrap.root}
                onSelectFile={(node) => setSelectedNodeId(node.id)}
                selectedNodeId={selectedNodeId}
                toggleFolder={toggleFolder}
              />
            ) : (
              <DriveResourceList nodes={resourceList} selectedNodeId={selectedNodeId} onSelect={(node) => setSelectedNodeId(node.id)} />
            )}
          </div>
          <DrivePreview
            canWrite={canMutateDrive}
            compact={compact}
            compactDetailsOpen={compactDetailsOpen}
            contextOptions={contextOptions}
            defaultUploadFolder={defaultUploadFolder}
            details={details}
            detailsLoading={detailsLoading}
            node={effectiveNode}
            onAddContext={onAddContextLink ? addContext : undefined}
            onRemoveContext={onRemoveContextLink ? removeContext : undefined}
            onRestoreNode={onRestoreNode ? () => void restoreSelectedNode() : undefined}
            onRestoreVersion={onRestoreVersion ? restoreVersion : undefined}
            onToggleCompactDetails={() => setCompactDetailsOpen((value) => !value)}
            textPreview={textPreview}
            textPreviewLoading={textPreviewLoading}
            uploadTarget={uploadTarget}
          />
        </div>
      ) : (
        <div className="orf-drive-empty">
          <Folder className="h-8 w-8" />
          <strong>云盘不可用</strong>
        </div>
      )}
    </div>
  );
}

function DriveResourceList({
  emptyLabel = "没有资源",
  nodes,
  onSelect,
  selectedNodeId,
}: {
  emptyLabel?: string;
  nodes: DriveNode[];
  onSelect: (node: DriveNode) => void;
  selectedNodeId: string | null;
}) {
  if (nodes.length === 0) {
    return <div className="orf-drive-empty">{emptyLabel}</div>;
  }
  return (
    <div className="orf-drive-resource-list">
      {nodes.map((node) => {
        const Icon = node.type === "folder" ? Folder : iconForFile(node);
        return (
          <button
            key={node.id}
            type="button"
            className={clsx("orf-drive-row", selectedNodeId === node.id && "orf-drive-row-active", node.deletedAt && "is-deleted")}
            title={node.name}
            onClick={() => onSelect(node)}
          >
            <span className="orf-drive-row-spacer" />
            <Icon className="h-4 w-4" />
            <span>{node.name}</span>
            <small>{driveNodeMetaLabel(node)}</small>
          </button>
        );
      })}
    </div>
  );
}

function DriveTreeRow({
  childrenByFolderId,
  expandedFolderIds,
  level,
  loadingFolderIds,
  node,
  onSelectFile,
  selectedNodeId,
  toggleFolder,
}: {
  childrenByFolderId: Map<string, DriveNode[]>;
  expandedFolderIds: Set<string>;
  level: number;
  loadingFolderIds: Set<string>;
  node: DriveNode;
  onSelectFile: (node: DriveNode) => void;
  selectedNodeId: string | null;
  toggleFolder: (node: DriveNode) => void;
}) {
  const folder = node.type === "folder";
  const expanded = expandedFolderIds.has(node.id);
  const children = childrenByFolderId.get(node.id) ?? [];
  const loading = loadingFolderIds.has(node.id);
  const Icon = folder ? Folder : iconForFile(node);

  return (
    <>
      <button
        type="button"
        className={clsx("orf-drive-row", selectedNodeId === node.id && "orf-drive-row-active")}
        role="treeitem"
        style={{ paddingLeft: `${8 + level * 14}px` }}
        title={node.name}
        onClick={() => folder ? toggleFolder(node) : onSelectFile(node)}
      >
        {folder ? (
          loading ? <Loader2 className="h-4 w-4 animate-spin" /> : expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          <span className="orf-drive-row-spacer" />
        )}
        <Icon className="h-4 w-4" />
        <span>{node.name}</span>
        <small>{driveNodeMetaLabel(node)}</small>
      </button>
      {folder && expanded && children.map((child) => (
        <DriveTreeRow
          key={child.id}
          childrenByFolderId={childrenByFolderId}
          expandedFolderIds={expandedFolderIds}
          level={level + 1}
          loadingFolderIds={loadingFolderIds}
          node={child}
          onSelectFile={onSelectFile}
          selectedNodeId={selectedNodeId}
          toggleFolder={toggleFolder}
        />
      ))}
    </>
  );
}

function DrivePreview({
  canWrite,
  compact = false,
  compactDetailsOpen = false,
  contextOptions,
  defaultUploadFolder,
  details,
  detailsLoading,
  node,
  onAddContext,
  onRemoveContext,
  onRestoreNode,
  onRestoreVersion,
  onToggleCompactDetails,
  textPreview,
  textPreviewLoading,
  uploadTarget,
}: {
  canWrite: boolean;
  compact?: boolean;
  compactDetailsOpen?: boolean;
  contextOptions: DriveContextOption[];
  defaultUploadFolder: DriveNode | null;
  details: DriveNodeDetails | null;
  detailsLoading: boolean;
  node: DriveNode | null;
  onAddContext?: (contextKey: string) => void;
  onRemoveContext?: (linkId: string) => void;
  onRestoreNode?: () => void;
  onRestoreVersion?: (versionId: string) => void;
  onToggleCompactDetails?: () => void;
  textPreview?: string;
  textPreviewLoading?: boolean;
  uploadTarget: DriveNode | null;
}) {
  if (!node) {
    return <div className="orf-drive-preview-empty">选择文件</div>;
  }
  const file = node.file ?? null;
  const previewUrl = file?.previewUrl ? drivePreviewUrl(file) : undefined;
  const PreviewIcon = node.type === "folder" ? Folder : iconForFile(node);
  return (
    <div className="orf-drive-preview-stack">
      {node.type === "folder" ? (
        <div className="orf-drive-folder-preview">
          <div className="orf-drive-folder-preview-icon"><Folder className="h-7 w-7" /></div>
          <div>
            <strong>{node.name}</strong>
            <small>{node.deletedAt ? "已在回收站" : "文件夹"}</small>
          </div>
          <div className="orf-drive-preview-badges">
            {uploadTarget?.id === node.id && !node.deletedAt && <span>上传目标</span>}
            {defaultUploadFolder?.id === node.id && <span>群聊默认上传</span>}
          </div>
        </div>
      ) : file ? (
        <div className="orf-drive-preview">
          <div className="orf-drive-preview-meta">
            <div className="orf-drive-preview-title">
              <PreviewIcon className="h-4 w-4" />
              <div>
                <strong>{file.fileName}</strong>
                <small>{formatFileSize(file.fileSize)} · {file.createdByName ?? "未知成员"} · {formatDateTime(node.updatedAt)}</small>
              </div>
            </div>
            <div className="orf-drive-preview-badges">
              <span>v{file.latestVersionNumber ?? 1}</span>
              <span>{drivePreviewKindLabel(file.previewKind)}</span>
            </div>
            <a className="orf-drive-download-link" href={file.downloadUrl}>
              <Download className="h-4 w-4" />
              下载
            </a>
          </div>
          {file.previewKind === "image" && previewUrl ? (
            <div className="orf-drive-image-preview">
              <img alt={file.fileName} src={previewUrl} />
            </div>
          ) : (file.previewKind === "markdown" || file.previewKind === "text") && previewUrl ? (
            <div className="orf-drive-text-preview">
              {textPreviewLoading && textPreview === undefined ? (
                <div className="orf-drive-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
              ) : (
                <pre>{textPreview ?? ""}</pre>
              )}
            </div>
          ) : file.previewKind === "pdf" && previewUrl ? (
            <iframe className="orf-drive-inline-preview" src={previewUrl} title={file.fileName} />
          ) : (
            <div className="orf-drive-preview-empty">
              <File className="h-8 w-8" />
              <span>无法预览</span>
            </div>
          )}
        </div>
      ) : (
        <div className="orf-drive-preview-empty">文件不可用</div>
      )}
      {compact ? (
        <div className={clsx("orf-drive-compact-details", compactDetailsOpen && "is-open")}>
          <button type="button" className="orf-drive-compact-details-toggle" onClick={onToggleCompactDetails} aria-expanded={compactDetailsOpen}>
            <span>详情、版本和工作上下文</span>
            <small>
              {detailsLoading ? "同步中"
                : details ? `${details.contextLinks.length} 关联 · ${details.versions.length} 版本`
                  : "选择资源后查看"}
            </small>
          </button>
          {compactDetailsOpen && (
            <DriveDetails
              canWrite={canWrite}
              contextOptions={contextOptions}
              details={details}
              loading={detailsLoading}
              node={node}
              onAddContext={onAddContext}
              onRemoveContext={onRemoveContext}
              onRestoreNode={onRestoreNode}
              onRestoreVersion={onRestoreVersion}
            />
          )}
        </div>
      ) : (
        <DriveDetails
          canWrite={canWrite}
          contextOptions={contextOptions}
          details={details}
          loading={detailsLoading}
          node={node}
          onAddContext={onAddContext}
          onRemoveContext={onRemoveContext}
          onRestoreNode={onRestoreNode}
          onRestoreVersion={onRestoreVersion}
        />
      )}
    </div>
  );
}

function DriveDetails({
  canWrite,
  contextOptions,
  details,
  loading,
  node,
  onAddContext,
  onRemoveContext,
  onRestoreNode,
  onRestoreVersion,
}: {
  canWrite: boolean;
  contextOptions: DriveContextOption[];
  details: DriveNodeDetails | null;
  loading: boolean;
  node: DriveNode | null;
  onAddContext?: (contextKey: string) => void;
  onRemoveContext?: (linkId: string) => void;
  onRestoreNode?: () => void;
  onRestoreVersion?: (versionId: string) => void;
}) {
  if (loading) {
    if (details) return <DriveDetailsContent canWrite={canWrite} contextOptions={contextOptions} details={details} onAddContext={onAddContext} onRemoveContext={onRemoveContext} onRestoreNode={onRestoreNode} onRestoreVersion={onRestoreVersion} />;
    return <DriveDetailsLoading canWrite={canWrite} node={node} onRestoreNode={onRestoreNode} />;
  }
  if (!details) return null;
  return <DriveDetailsContent canWrite={canWrite} contextOptions={contextOptions} details={details} onAddContext={onAddContext} onRemoveContext={onRemoveContext} onRestoreNode={onRestoreNode} onRestoreVersion={onRestoreVersion} />;
}

function DriveDetailsLoading({ canWrite, node, onRestoreNode }: { canWrite: boolean; node: DriveNode | null; onRestoreNode?: () => void }) {
  const file = node?.file ?? null;
  return (
    <div className="orf-drive-details" aria-busy="true">
      <div className="orf-drive-detail-sync" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>正在同步版本、活动和工作上下文</span>
      </div>

      <div className="orf-drive-detail-section">
        <div className="orf-drive-detail-heading">
          <h3>详情</h3>
          {node?.deletedAt && <span>可恢复</span>}
        </div>
        <p>{node?.name ?? "正在同步详情"}</p>
        {node ? (
          <dl>
            <div><dt>类型</dt><dd>{node.type === "folder" ? "文件夹" : file?.mimeType ?? "文件"}</dd></div>
            {file && <div><dt>大小</dt><dd>{formatFileSize(file.fileSize)}</dd></div>}
            <div><dt>创建</dt><dd>{formatDateTime(node.createdAt)}</dd></div>
            <div><dt>更新</dt><dd>{formatDateTime(node.updatedAt)}</dd></div>
            {node.deletedAt && <div><dt>删除</dt><dd>{formatDateTime(node.deletedAt)}</dd></div>}
          </dl>
        ) : null}
        {node?.deletedAt && canWrite && onRestoreNode && (
          <Button className="orf-drive-restore-callout" size="sm" variant="secondary" onClick={onRestoreNode}>
            <RotateCcw className="h-3.5 w-3.5" />
            恢复此{node.type === "folder" ? "文件夹" : "文件"}
          </Button>
        )}
      </div>

      <div className="orf-drive-detail-section">
        <h3>工作上下文</h3>
        <div className="orf-drive-detail-skeleton" />
      </div>

      <div className="orf-drive-detail-section">
        <h3>活动</h3>
        <div className="orf-drive-detail-skeleton" />
      </div>
    </div>
  );
}

function DriveDetailsContent({
  canWrite,
  contextOptions,
  details,
  onAddContext,
  onRemoveContext,
  onRestoreNode,
  onRestoreVersion,
}: {
  canWrite: boolean;
  contextOptions: DriveContextOption[];
  details: DriveNodeDetails;
  onAddContext?: (contextKey: string) => void;
  onRemoveContext?: (linkId: string) => void;
  onRestoreNode?: () => void;
  onRestoreVersion?: (versionId: string) => void;
}) {
  const node = details.node;
  return (
    <div className="orf-drive-details" data-deleted={node.deletedAt ? "true" : "false"}>
      <div className="orf-drive-detail-section">
        <div className="orf-drive-detail-heading">
          <h3>详情</h3>
          {node.deletedAt && <span>可恢复</span>}
        </div>
        <p>{details.path.map((item) => item.name).join(" / ")}</p>
        <dl>
          <div><dt>类型</dt><dd>{node.type === "folder" ? "文件夹" : node.file?.mimeType ?? "文件"}</dd></div>
          {node.file && <div><dt>大小</dt><dd>{formatFileSize(node.file.fileSize)}</dd></div>}
          <div><dt>创建</dt><dd>{formatDateTime(node.createdAt)}</dd></div>
          <div><dt>更新</dt><dd>{formatDateTime(node.updatedAt)}</dd></div>
          {node.deletedAt && <div><dt>删除</dt><dd>{formatDateTime(node.deletedAt)}</dd></div>}
        </dl>
        {node.deletedAt && canWrite && onRestoreNode && (
          <Button className="orf-drive-restore-callout" size="sm" variant="secondary" onClick={onRestoreNode}>
            <RotateCcw className="h-3.5 w-3.5" />
            恢复此{node.type === "folder" ? "文件夹" : "文件"}
          </Button>
        )}
      </div>

      <div className="orf-drive-detail-section">
        <div className="orf-drive-detail-heading">
          <h3>工作上下文</h3>
          <span>{details.contextLinks.length} 个关联</span>
        </div>
        {details.contextLinks.length > 0 ? (
          <div className="orf-drive-context-list">
            {details.contextLinks.map((link) => (
              <span key={link.id} className="orf-drive-context-item" data-context-type={link.contextType}>
                <strong>{contextTypeLabel(link.contextType)}</strong>
                <em>{link.contextTitle}</em>
                {canWrite && onRemoveContext && (
                  <button type="button" aria-label="移除上下文" onClick={() => onRemoveContext(link.id)}>
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p>未关联目标或项目</p>
        )}
        {canWrite && onAddContext && contextOptions.length > 0 && (
          <select defaultValue="" onChange={(event) => {
            const value = event.currentTarget.value;
            event.currentTarget.value = "";
            if (value) onAddContext(value);
          }}>
            <option value="">关联目标或项目</option>
            {contextOptions.map((option) => (
              <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                {contextTypeLabel(option.type)} · {option.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {details.versions.length > 0 && (
        <div className="orf-drive-detail-section">
          <div className="orf-drive-detail-heading">
            <h3>版本</h3>
            <span>{details.versions.length} 个快照</span>
          </div>
          <div className="orf-drive-version-list">
            {details.versions.map((version, index) => (
              <div key={version.id} className={index === 0 ? "is-current" : undefined}>
                <span>v{version.versionNumber}</span>
                <strong>{version.fileName}</strong>
                <small>{formatFileSize(version.fileSize)} · {formatDateTime(version.createdAt)}</small>
                {index === 0 && <em>当前</em>}
                {index > 0 && canWrite && onRestoreVersion && (
                  <button type="button" onClick={() => onRestoreVersion(version.id)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    恢复
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="orf-drive-detail-section">
        <div className="orf-drive-detail-heading">
          <h3>活动</h3>
          <span>{details.activity.length} 条</span>
        </div>
        {details.activity.length > 0 ? (
          <div className="orf-drive-activity-list">
            {details.activity.map((event) => (
              <div key={event.id}>
                <Activity className="h-3.5 w-3.5" />
                <span>{event.actorName ?? "系统"} {eventActionLabel(event.action)}</span>
                <small>{formatDateTime(event.createdAt)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p>暂无活动</p>
        )}
      </div>
    </div>
  );
}

function iconForFile(node: DriveNode) {
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}

function driveNodeMetaLabel(node: DriveNode) {
  if (node.deletedAt) return `已删除 · ${formatDateTime(node.deletedAt)}`;
  if (node.type === "folder") return "文件夹";
  if (!node.file) return "文件";
  return `${drivePreviewKindLabel(node.file.previewKind)} · ${formatFileSize(node.file.fileSize)}`;
}

function drivePreviewKindLabel(kind: Drive["previewKind"]) {
  if (kind === "image") return "图片";
  if (kind === "pdf") return "PDF";
  if (kind === "markdown") return "Markdown";
  if (kind === "text") return "文本";
  return "文件";
}

function appendChildNode(items: Map<string, DriveNode[]>, parentId: string, node: DriveNode) {
  const next = new Map(items);
  const children = next.get(parentId) ?? [];
  const filtered = children.filter((child) => child.id !== node.id);
  next.set(parentId, [...filtered, node].sort(compareDriveNodes));
  return next;
}

function removeTextPreview(items: Map<string, string>, fileId: string) {
  if (!items.has(fileId)) return items;
  const next = new Map(items);
  next.delete(fileId);
  return next;
}

function drivePreviewUrl(file: Drive) {
  const base = file.previewUrl ?? file.contentUrl;
  const separator = base.includes("?") ? "&" : "?";
  const cacheKey = file.latestVersionNumber ?? file.versionCount ?? file.createdAt;
  return `${base}${separator}v=${encodeURIComponent(String(cacheKey))}`;
}

function compareDriveNodes(left: DriveNode, right: DriveNode) {
  if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
  return left.name.localeCompare(right.name, "zh-CN");
}

function findNode(root: DriveNode | null, childrenByFolderId: Map<string, DriveNode[]>, nodeId: string): DriveNode | null {
  if (!root) return null;
  if (root.id === nodeId) return root;
  for (const child of childrenByFolderId.get(root.id) ?? []) {
    if (child.id === nodeId) return child;
    if (child.type === "folder") {
      const found = findNode(child, childrenByFolderId, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function hasNode(root: DriveNode, childrenByFolderId: Map<string, DriveNode[]>, nodeId: string) {
  return Boolean(findNode(root, childrenByFolderId, nodeId));
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function contextTypeLabel(type: DriveContextType) {
  if (type === "project") return "项目";
  if (type === "objective") return "目标";
  return "群聊";
}

function eventActionLabel(action: string) {
  const labels: Record<string, string> = {
    chat_linked: "绑定到群聊",
    chat_unlinked: "移出群聊",
    context_linked: "关联上下文",
    context_unlinked: "移除上下文",
    file_uploaded: "上传文件",
    file_version_restored: "恢复版本",
    file_version_uploaded: "上传新版本",
    folder_created: "创建文件夹",
    node_deleted: "删除资源",
    node_restored: "恢复资源",
  };
  return labels[action] ?? action;
}
