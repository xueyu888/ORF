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
  Inbox,
  Link2,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  Trash2,
  Unlink,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { DriveFilePreviewSurface } from "./DriveFilePreview";
import {
  compareDriveNodes,
  driveNodeMetaLabel,
  drivePreviewKindLabel,
  drivePreviewUrl,
  formatDriveDateTime as formatDateTime,
  formatDriveFileSize as formatFileSize,
} from "./drivePresentation";
import type { ApiUploadProgress } from "../../state/apiClient";
import type {
  ChatMessage,
  DriveBootstrap,
  DriveSearchContextFilter,
  DriveContextType,
  DriveFileVersion,
  DriveNode,
  DriveNodeDetails,
  DrivePreviewKind,
  DriveSearchSource,
  DriveSearchStatus,
  DriveSearchType,
  DriveSearchUpdatedRange,
} from "../../types/orf";

type DriveUploadResult = {
  announcementMessage?: ChatMessage | null;
  node: DriveNode;
};

export type DriveContextOption = {
  id: string;
  title: string;
  type: Exclude<DriveContextType, "chatChannel" | "chatMessage" | "chatThread">;
};

export type DriveUploaderOption = {
  id: string;
  name: string;
};

type DriveSearchFilters = {
  contextType: DriveSearchContextFilter;
  previewKind: DrivePreviewKind | "all";
  source: DriveSearchSource;
  status: DriveSearchStatus;
  type: DriveSearchType;
  updated: DriveSearchUpdatedRange;
  uploaderId: string;
};

type DriveBrowserProps = {
  bootstrap: DriveBootstrap | null;
  canWrite: boolean;
  contextLabel?: string;
  contextOptions?: DriveContextOption[];
  currentUserId?: string | null;
  initialSelectedNodeId?: string | null;
  loading: boolean;
  notify: (message: string) => void;
  onAddContextLink?: (input: { contextId: string; contextType: DriveContextType; nodeId: string }) => Promise<DriveNodeDetails>;
  onCreateFolder: (input: { name: string; parentNodeId: string }) => Promise<DriveNode>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onListTrash?: () => Promise<DriveNode[]>;
  onLoadChildren: (parentNodeId: string) => Promise<DriveNode[]>;
  onLoadDetails?: (nodeId: string) => Promise<DriveNodeDetails>;
  onRefresh: () => Promise<void> | void;
  onRemoveContextLink?: (input: { linkId: string; nodeId: string }) => Promise<DriveNodeDetails>;
  onRestoreNode?: (nodeId: string) => Promise<DriveNode>;
  onRestoreVersion?: (input: { fileId: string; versionId: string }) => Promise<{ node: DriveNode; versions: DriveFileVersion[] }>;
  onSearch?: (input: {
    contextType?: DriveSearchContextFilter;
    previewKind?: DrivePreviewKind | "all";
    query?: string;
    source?: DriveSearchSource;
    status?: DriveSearchStatus;
    type?: DriveSearchType;
    updated?: DriveSearchUpdatedRange;
    uploaderId?: string;
  }) => Promise<DriveNode[]>;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
  onUploadedAnnouncement?: (message: ChatMessage) => void;
  onUploadFile: (input: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => Promise<DriveUploadResult>;
  onUploadVersion?: (input: { file: File; fileId: string; onProgress?: (progress: ApiUploadProgress) => void }) => Promise<{ node: DriveNode; versions: DriveFileVersion[] }>;
  resourceHref?: (nodeId: string) => string;
  uploaderOptions?: DriveUploaderOption[];
};

type UploadTaskState = {
  fileName: string;
  percent: number | null;
};

type DriveMode = "browse" | "recent" | "search" | "trash";

type DriveCollectionKey =
  | "all"
  | "folders"
  | "recent"
  | "mine"
  | "chat"
  | "objective"
  | "result"
  | "task"
  | "feedback"
  | "workLog"
  | "trash"
  | "search";

type DriveCollectionItem = {
  count?: number;
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  key: DriveCollectionKey;
  label: string;
  onSelect: () => void;
};

const defaultDriveSearchFilters: DriveSearchFilters = {
  contextType: "all",
  previewKind: "all",
  source: "all",
  status: "active",
  type: "all",
  updated: "all",
  uploaderId: "all",
};

export function DriveBrowser({
  bootstrap,
  canWrite,
  contextLabel,
  contextOptions = [],
  currentUserId = null,
  initialSelectedNodeId = null,
  loading,
  notify,
  onAddContextLink,
  onCreateFolder,
  onDeleteNode,
  onListTrash,
  onLoadChildren,
  onLoadDetails,
  onRefresh,
  onRemoveContextLink,
  onRestoreNode,
  onRestoreVersion,
  onSearch,
  onSelectedNodeIdChange,
  onUploadedAnnouncement,
  onUploadFile,
  onUploadVersion,
  resourceHref,
  uploaderOptions = [],
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
  const [searchFilters, setSearchFilters] = useState<DriveSearchFilters>(defaultDriveSearchFilters);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [textPreviewByFileId, setTextPreviewByFileId] = useState<Map<string, string>>(new Map());
  const [textPreviewLoadingIds, setTextPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [trashNodes, setTrashNodes] = useState<DriveNode[]>([]);
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialSelectedNodeIdRef = useRef<string | null>(initialSelectedNodeId);
  const loadDetailsRef = useRef(onLoadDetails);
  const notifyRef = useRef(notify);
  const previewColumnRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const versionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadDetailsRef.current = onLoadDetails;
    notifyRef.current = notify;
  }, [notify, onLoadDetails]);

  useEffect(() => {
    if (!actionsMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && actionsMenuRef.current?.contains(target)) return;
      setActionsMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [actionsMenuOpen]);

  useEffect(() => {
    initialSelectedNodeIdRef.current = initialSelectedNodeId;
    if (initialSelectedNodeId) setSelectedNodeId(initialSelectedNodeId);
  }, [initialSelectedNodeId]);

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
      const initialNodeId = initialSelectedNodeIdRef.current;
      if (initialNodeId) return initialNodeId;
      if (mode !== "browse") return current;
      return current && hasNode(bootstrap.root, nextChildren, current) ? current : bootstrap.root.id;
    });
  }, [bootstrap]);

  useEffect(() => {
    onSelectedNodeIdChange?.(selectedNodeId);
  }, [onSelectedNodeIdChange, selectedNodeId]);

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
      ?? adHocNode
      ?? null;
  }, [adHocNodeById, bootstrap?.recentNodes, bootstrap?.root, childrenByFolderId, mode, searchResults, selectedNodeId, trashNodes]);
  const effectiveNode = details?.node ?? selectedNode;
  const selectedFolder = useMemo(() => {
    if (effectiveNode?.type === "folder" && !effectiveNode.deletedAt) return effectiveNode;
    if (!effectiveNode?.parentId) return null;
    return findNode(bootstrap?.root ?? null, childrenByFolderId, effectiveNode.parentId) ?? null;
  }, [bootstrap?.root, childrenByFolderId, effectiveNode]);
  const uploadTarget = selectedFolder ?? bootstrap?.root ?? null;
  const canMutateDrive = canWrite && Boolean(bootstrap);
  const selectedFile = effectiveNode?.file ?? null;
  const textPreview = selectedFile ? textPreviewByFileId.get(selectedFile.id) : undefined;
  const textPreviewLoading = Boolean(selectedFile && textPreviewLoadingIds.has(selectedFile.id));
  const rootItemCount = bootstrap?.children.length ?? 0;
  const recentItemCount = bootstrap?.recentNodes?.length ?? 0;
  const activeScopeLabel = contextLabel ?? "团队空间";
  const activeModeSummary =
    mode === "browse" ? `${rootItemCount} 项根资源`
      : mode === "recent" ? `${recentItemCount} 项最近更新`
        : mode === "search" ? `${searchResults.length} 项搜索结果`
          : `${trashNodes.length} 项可恢复资源`;
  const uploadTargetLabel = uploadTarget?.name ?? "未选择上传位置";

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

  const runSearch = async (
    nextQuery = searchQuery,
    nextFilters = searchFilters,
  ) => {
    if (!onSearch) return;
    setMode("search");
    setResourceLoading(true);
    setErrorMessage(null);
    try {
      const nodes = await onSearch({
        contextType: nextFilters.contextType,
        previewKind: nextFilters.previewKind,
        query: nextQuery,
        source: nextFilters.source,
        status: nextFilters.status,
        type: nextFilters.type,
        updated: nextFilters.updated,
        uploaderId: nextFilters.uploaderId === "all" ? undefined : nextFilters.uploaderId,
      });
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

  const runCollectionSearch = async (nextFilters: Partial<DriveSearchFilters>, nextQuery = "") => {
    const mergedFilters: DriveSearchFilters = { ...defaultDriveSearchFilters, ...nextFilters };
    setSearchQuery(nextQuery);
    setSearchFilters(mergedFilters);
    await runSearch(nextQuery, mergedFilters);
  };

  const updateSearchFilter = <Key extends keyof DriveSearchFilters>(key: Key, value: DriveSearchFilters[Key]) => {
    const nextFilters = { ...searchFilters, [key]: value };
    setSearchFilters(nextFilters);
    if (mode === "search") void runSearch(searchQuery, nextFilters);
  };

  const selectBrowseCollection = () => {
    setMode("browse");
    setResourceLoading(false);
    setErrorMessage(null);
    setSearchFilters(defaultDriveSearchFilters);
    setSearchQuery("");
    setSelectedNodeId((current) => {
      if (!bootstrap) return null;
      if (current && hasNode(bootstrap.root, childrenByFolderId, current)) return current;
      return bootstrap.root.id;
    });
  };

  const selectRecentCollection = () => {
    setMode("recent");
    setResourceLoading(false);
    setErrorMessage(null);
    setSearchFilters(defaultDriveSearchFilters);
    setSearchQuery("");
    setSelectedNodeId(bootstrap?.recentNodes?.[0]?.id ?? null);
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

  const activeCollectionKey = useMemo<DriveCollectionKey>(() => {
    if (mode === "browse") return "folders";
    if (mode === "recent") return "recent";
    if (mode === "trash") return "trash";
    if (mode !== "search") return "folders";
    if (searchQuery.trim()) return "search";
    if (searchFilters.source === "chat") return "chat";
    if (searchFilters.source === "objective") return "objective";
    if (searchFilters.source === "result") return "result";
    if (searchFilters.source === "task") return "task";
    if (searchFilters.source === "feedback") return "feedback";
    if (searchFilters.source === "workLog") return "workLog";
    if (currentUserId && searchFilters.uploaderId === currentUserId) return "mine";
    return "all";
  }, [currentUserId, mode, searchFilters.source, searchFilters.uploaderId, searchQuery]);

  const listTitle = collectionTitle(activeCollectionKey, mode);
  const listDescription = collectionDescription(activeCollectionKey, mode, activeScopeLabel);
  const collectionItems: DriveCollectionItem[] = [
    {
      description: "按名称、来源和上下文聚合",
      icon: Inbox,
      key: "all",
      label: "全部资源",
      onSelect: () => void runCollectionSearch({ status: "active" }),
    },
    {
      count: rootItemCount,
      description: "保留文件夹层级和上传落点",
      icon: Folder,
      key: "folders",
      label: "文件夹树",
      onSelect: selectBrowseCollection,
    },
    {
      count: recentItemCount,
      description: "最近修改和上传",
      icon: Clock3,
      key: "recent",
      label: "最近",
      onSelect: selectRecentCollection,
    },
    {
      description: "当前账号上传的资源",
      disabled: !currentUserId,
      icon: UserRound,
      key: "mine",
      label: "我上传的",
      onSelect: () => {
        if (!currentUserId) return;
        void runCollectionSearch({ uploaderId: currentUserId });
      },
    },
    {
      description: "群聊绑定和聊天上传",
      icon: MessageSquare,
      key: "chat",
      label: "聊天资源",
      onSelect: () => void runCollectionSearch({ source: "chat" }),
    },
    {
      description: "目标说明、证据和附件",
      icon: Target,
      key: "objective",
      label: "目标资源",
      onSelect: () => void runCollectionSearch({ source: "objective" }),
    },
    {
      description: "指标证明和过程材料",
      icon: FileText,
      key: "result",
      label: "指标资源",
      onSelect: () => void runCollectionSearch({ source: "result" }),
    },
    {
      description: "任务执行资料",
      icon: ListChecks,
      key: "task",
      label: "任务资源",
      onSelect: () => void runCollectionSearch({ source: "task" }),
    },
    {
      description: "反馈截图、日志和证据",
      icon: NotebookPen,
      key: "feedback",
      label: "反馈资源",
      onSelect: () => void runCollectionSearch({ source: "feedback" }),
    },
    {
      description: "工作日志里的附件",
      icon: Activity,
      key: "workLog",
      label: "日志资源",
      onSelect: () => void runCollectionSearch({ source: "workLog" }),
    },
    {
      count: bootstrap?.trashCount ?? 0,
      description: "删除后的可恢复资源",
      icon: Trash2,
      key: "trash",
      label: "已删除",
      onSelect: () => void loadTrash(),
    },
  ];

  const copyResourceLink = async (node: DriveNode) => {
    const href = resourceHref?.(node.id) ?? `${window.location.origin}/resources/${encodeURIComponent(node.id)}`;
    try {
      await navigator.clipboard.writeText(href);
      notify("资源链接已复制");
    } catch {
      notify("复制链接失败，请检查浏览器剪贴板权限");
    }
  };

  const selectResourceNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 768px)").matches) return;
    window.setTimeout(() => {
      previewColumnRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }, 120);
  };

  const actions = (
    <div className="orf-drive-actions">
      <IconButton disabled={!canMutateDrive || !uploadTarget || mode === "trash"} icon={Upload} label={uploadTarget ? `上传到 ${uploadTarget.name}` : "上传文件"} onClick={() => fileInputRef.current?.click()} />
      <IconButton disabled={!canMutateDrive || !uploadTarget || mode === "trash"} icon={FolderPlus} label="新建文件夹" onClick={() => setNewFolderName((value) => value || "新建文件夹")} />
      <div className="orf-drive-actions-menu" ref={actionsMenuRef}>
        <IconButton
          icon={MoreHorizontal}
          label="更多云盘操作"
          aria-expanded={actionsMenuOpen}
          aria-haspopup="menu"
          onClick={() => setActionsMenuOpen((value) => !value)}
        />
        {actionsMenuOpen && (
          <div className="orf-drive-actions-popover" role="menu">
            <button
              type="button"
              disabled={!effectiveNode || effectiveNode.id === bootstrap?.root.id || !canMutateDrive || Boolean(effectiveNode.deletedAt)}
              role="menuitem"
              onClick={() => {
                setActionsMenuOpen(false);
                void deleteSelectedNode();
              }}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
            <button
              type="button"
              disabled={!effectiveNode?.deletedAt || !onRestoreNode || !canMutateDrive}
              role="menuitem"
              onClick={() => {
                setActionsMenuOpen(false);
                void restoreSelectedNode();
              }}
            >
              <RotateCcw className="h-4 w-4" />
              恢复
            </button>
            <button
              type="button"
              disabled={!selectedFile || !onUploadVersion || !canMutateDrive || Boolean(effectiveNode?.deletedAt)}
              role="menuitem"
              onClick={() => {
                setActionsMenuOpen(false);
                versionInputRef.current?.click();
              }}
            >
              <FileClock className="h-4 w-4" />
              上传新版本
            </button>
            <button
              type="button"
              disabled={loading}
              role="menuitem"
              onClick={() => {
                setActionsMenuOpen(false);
                void onRefresh();
              }}
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
              刷新
            </button>
          </div>
        )}
      </div>
      <span className="orf-drive-upload-target" title={uploadTargetLabel}>{uploadTargetLabel}</span>
    </div>
  );

  return (
    <div className="orf-drive-panel">
      {loading && !bootstrap ? (
        <div className="orf-drive-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载云盘</div>
      ) : bootstrap ? (
        <div className="orf-drive-workbench-grid">
          <aside className="orf-drive-sidebar" aria-label="资源集合">
            <div className="orf-drive-workbench-header">
              <div className="orf-drive-workbench-title">
                <span>资源工作台</span>
                <strong>{activeScopeLabel}</strong>
                <small>{activeModeSummary}</small>
              </div>
              <div className="orf-drive-workbench-meta" aria-label="云盘状态摘要">
                <span><Folder className="h-3.5 w-3.5" />{rootItemCount}</span>
                <span><Clock3 className="h-3.5 w-3.5" />{recentItemCount}</span>
                <span><Trash2 className="h-3.5 w-3.5" />{bootstrap.trashCount ?? 0}</span>
              </div>
            </div>

            <DriveCollectionNav activeKey={activeCollectionKey} items={collectionItems} />

            <div className="orf-drive-sidebar-actions">
              <span>操作</span>
              {actions}
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
            </div>
          </aside>

          <main className="orf-drive-main" aria-label="资源列表">
            <div className="orf-drive-main-heading">
              <div>
                <span>当前集合</span>
                <strong>{listTitle}</strong>
                <em>{listDescription}</em>
              </div>
              <small>{mode === "browse" ? `${rootItemCount} 项根资源` : `${resourceList.length} 项`}</small>
            </div>

            <form
              className="orf-drive-searchbar"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <Search className="h-4 w-4" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                placeholder="搜索文件、来源、关联对象"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                aria-label="资源节点类型"
                value={searchFilters.type}
                onChange={(event) => {
                  const nextType = event.target.value as DriveSearchType;
                  updateSearchFilter("type", nextType);
                }}
              >
                <option value="all">全部</option>
                <option value="file">文件</option>
                <option value="folder">文件夹</option>
              </select>
              <Button size="sm" variant="secondary">搜索</Button>
            </form>
            <DriveSearchFacets
              activeFilters={searchFilters}
              currentUserId={currentUserId}
              onChangePreviewKind={(nextPreviewKind) => {
                updateSearchFilter("previewKind", nextPreviewKind);
              }}
              onChangeFilter={updateSearchFilter}
              uploaderOptions={uploaderOptions}
            />

            <div className="orf-drive-tree" role={mode === "browse" ? "tree" : "list"}>
              {resourceLoading ? (
                <div className="orf-drive-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载资源</div>
              ) : mode === "browse" ? (
                <DriveTreeRow
                  childrenByFolderId={childrenByFolderId}
                  expandedFolderIds={expandedFolderIds}
                  level={0}
                  loadingFolderIds={loadingFolderIds}
                  node={bootstrap.root}
                  onSelectFile={(node) => selectResourceNode(node.id)}
                  selectedNodeId={selectedNodeId}
                  toggleFolder={toggleFolder}
                />
              ) : (
                <DriveResourceList nodes={resourceList} selectedNodeId={selectedNodeId} onSelect={(node) => selectResourceNode(node.id)} />
              )}
            </div>
          </main>

          <section ref={previewColumnRef} className="orf-drive-preview-column" aria-label="资源预览和详情">
            <DrivePreview
              canWrite={canMutateDrive}
              contextOptions={contextOptions}
              details={details}
              detailsLoading={detailsLoading}
              node={effectiveNode}
              onAddContext={onAddContextLink ? addContext : undefined}
              onCopyResourceLink={resourceHref ? copyResourceLink : undefined}
              onRemoveContext={onRemoveContextLink ? removeContext : undefined}
              onRestoreNode={onRestoreNode ? () => void restoreSelectedNode() : undefined}
              onRestoreVersion={onRestoreVersion ? restoreVersion : undefined}
              textPreview={textPreview}
              textPreviewLoading={textPreviewLoading}
              uploadTarget={uploadTarget}
            />
          </section>
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
        const meta = node.searchMeta;
        const contextBadges = meta?.contexts.slice(0, 3) ?? [];
        return (
          <button
            key={node.id}
            type="button"
            className={clsx("orf-drive-resource-card", selectedNodeId === node.id && "orf-drive-resource-card-active", node.deletedAt && "is-deleted")}
            title={node.name}
            onClick={() => onSelect(node)}
          >
            <Icon className="h-4 w-4" />
            <span className="orf-drive-resource-card-main">
              <strong>{node.name}</strong>
              <small>
                {(meta?.sourceLabels ?? [node.type === "folder" ? "文件夹" : drivePreviewKindLabel(node.file?.previewKind ?? "download")]).join(" / ")}
                {" · "}
                {node.file ? drivePreviewKindLabel(node.file.previewKind) : "文件夹"}
                {node.file ? ` · ${formatFileSize(node.file.fileSize)}` : ""}
              </small>
              {meta?.snippet && <em>{meta.snippet}</em>}
              {contextBadges.length > 0 && (
                <span className="orf-drive-resource-contexts">
                  {contextBadges.map((context) => (
                    <span key={`${context.contextType}:${context.contextId}`}>
                      {contextTypeLabel(context.contextType)} · {context.contextTitle}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="orf-drive-resource-card-side">
              <strong>{node.deletedAt ? "已删除" : "正常"}</strong>
              <small>{meta?.uploadedByName ?? node.createdByName ?? "未知成员"}</small>
              <small>{formatDateTime(meta?.updatedAt ?? node.updatedAt)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DriveCollectionNav({
  activeKey,
  items,
}: {
  activeKey: DriveCollectionKey;
  items: DriveCollectionItem[];
}) {
  const primaryItems = items.filter((item) => item.key === "all" || item.key === "folders" || item.key === "recent" || item.key === "mine");
  const contextItems = items.filter((item) => item.key === "chat" || item.key === "objective" || item.key === "result" || item.key === "task" || item.key === "feedback" || item.key === "workLog");
  const recoveryItems = items.filter((item) => item.key === "trash");
  return (
    <nav className="orf-drive-collection-nav" aria-label="资源集合">
      <div className="orf-drive-collection-section">
        <span>资源</span>
        {primaryItems.map((item) => <DriveCollectionButton key={item.key} active={activeKey === item.key} item={item} />)}
      </div>
      <div className="orf-drive-collection-section">
        <span>工作上下文</span>
        {contextItems.map((item) => <DriveCollectionButton key={item.key} active={activeKey === item.key} item={item} />)}
      </div>
      <div className="orf-drive-collection-section">
        <span>恢复</span>
        {recoveryItems.map((item) => <DriveCollectionButton key={item.key} active={activeKey === item.key} item={item} />)}
      </div>
    </nav>
  );
}

function DriveCollectionButton({ active, item }: { active: boolean; item: DriveCollectionItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={clsx("orf-drive-collection-item", active && "is-active")}
      disabled={item.disabled}
      aria-current={active ? "page" : undefined}
      onClick={item.onSelect}
    >
      <Icon className="h-4 w-4" />
      <span>
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      {typeof item.count === "number" ? <em>{item.count}</em> : null}
    </button>
  );
}

const drivePreviewKindFilters: Array<{ label: string; value: DrivePreviewKind | "all" }> = [
  { label: "全部类型", value: "all" },
  { label: "Markdown", value: "markdown" },
  { label: "图片", value: "image" },
  { label: "PDF", value: "pdf" },
  { label: "DOCX", value: "docx" },
  { label: "文本", value: "text" },
  { label: "其他", value: "download" },
];

function DriveSearchFacets({
  activeFilters,
  currentUserId,
  onChangeFilter,
  onChangePreviewKind,
  uploaderOptions,
}: {
  activeFilters: DriveSearchFilters;
  currentUserId: string | null;
  onChangeFilter: <Key extends keyof DriveSearchFilters>(key: Key, value: DriveSearchFilters[Key]) => void;
  onChangePreviewKind: (previewKind: DrivePreviewKind | "all") => void;
  uploaderOptions: DriveUploaderOption[];
}) {
  return (
    <div className="orf-drive-filter-panel" aria-label="资源搜索筛选">
      <div className="orf-drive-filter-chips" aria-label="资源类型筛选">
        {drivePreviewKindFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={clsx(activeFilters.previewKind === filter.value && "is-active")}
            aria-pressed={activeFilters.previewKind === filter.value}
            onClick={() => onChangePreviewKind(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="orf-drive-filter-selects">
        <label>
          <span>来源</span>
          <select
            value={activeFilters.source}
            onChange={(event) => onChangeFilter("source", event.target.value as DriveSearchSource)}
          >
            <option value="all">全部来源</option>
            <option value="chat">聊天</option>
            <option value="project">项目</option>
            <option value="objective">目标</option>
            <option value="result">指标</option>
            <option value="task">任务</option>
            <option value="feedback">反馈</option>
            <option value="workLog">工作日志</option>
            <option value="manual">手动上传</option>
          </select>
        </label>
        <label>
          <span>上传人</span>
          <select
            value={activeFilters.uploaderId}
            onChange={(event) => onChangeFilter("uploaderId", event.target.value)}
          >
            <option value="all">全部上传人</option>
            {currentUserId && <option value={currentUserId}>我上传的</option>}
            {uploaderOptions
              .filter((user) => user.id !== currentUserId)
              .map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label>
          <span>时间</span>
          <select
            value={activeFilters.updated}
            onChange={(event) => onChangeFilter("updated", event.target.value as DriveSearchUpdatedRange)}
          >
            <option value="all">全部时间</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
        </label>
        <label>
          <span>状态</span>
          <select
            value={activeFilters.status}
            onChange={(event) => onChangeFilter("status", event.target.value as DriveSearchStatus)}
          >
            <option value="active">正常</option>
            <option value="trash">已删除</option>
            <option value="all">全部状态</option>
          </select>
        </label>
        <label>
          <span>关联</span>
          <select
            value={activeFilters.contextType}
            onChange={(event) => onChangeFilter("contextType", event.target.value as DriveSearchContextFilter)}
          >
            <option value="all">全部关联</option>
            <option value="project">项目</option>
            <option value="objective">目标</option>
            <option value="result">指标</option>
            <option value="task">任务</option>
            <option value="feedback">反馈</option>
            <option value="workLog">工作日志</option>
            <option value="chatChannel">群聊</option>
            <option value="chatMessage">聊天消息</option>
            <option value="chatThread">聊天话题</option>
          </select>
        </label>
      </div>
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
  contextOptions,
  details,
  detailsLoading,
  node,
  onAddContext,
  onCopyResourceLink,
  onRemoveContext,
  onRestoreNode,
  onRestoreVersion,
  textPreview,
  textPreviewLoading,
  uploadTarget,
}: {
  canWrite: boolean;
  contextOptions: DriveContextOption[];
  details: DriveNodeDetails | null;
  detailsLoading: boolean;
  node: DriveNode | null;
  onAddContext?: (contextKey: string) => void;
  onCopyResourceLink?: (node: DriveNode) => void;
  onRemoveContext?: (linkId: string) => void;
  onRestoreNode?: () => void;
  onRestoreVersion?: (versionId: string) => void;
  textPreview?: string;
  textPreviewLoading?: boolean;
  uploadTarget: DriveNode | null;
}) {
  const file = node?.file ?? null;

  if (!node) {
    return <div className="orf-drive-preview-empty">选择文件</div>;
  }
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
            {onCopyResourceLink && (
              <button type="button" className="orf-drive-copy-link" onClick={() => onCopyResourceLink(node)}>
                <Link2 className="h-4 w-4" />
                复制链接
              </button>
            )}
            <a className="orf-drive-download-link" href={file.downloadUrl}>
              <Download className="h-4 w-4" />
              下载
            </a>
          </div>
          <DriveFilePreviewSurface file={file} textPreview={textPreview} textPreviewLoading={textPreviewLoading} />
        </div>
      ) : (
        <div className="orf-drive-preview-empty">文件不可用</div>
      )}
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
          <p>未关联工作对象</p>
        )}
        {canWrite && onAddContext && contextOptions.length > 0 && (
          <select defaultValue="" onChange={(event) => {
            const value = event.currentTarget.value;
            event.currentTarget.value = "";
            if (value) onAddContext(value);
          }}>
            <option value="">关联工作对象</option>
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
  if (node.file?.previewKind === "docx" || node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
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

function contextTypeLabel(type: DriveContextType) {
  if (type === "project") return "项目";
  if (type === "objective") return "目标";
  if (type === "result") return "指标";
  if (type === "task") return "任务";
  if (type === "feedback") return "反馈";
  if (type === "workLog") return "工作日志";
  if (type === "chatMessage") return "聊天消息";
  if (type === "chatThread") return "聊天话题";
  return "群聊";
}

function collectionTitle(key: DriveCollectionKey, mode: DriveMode) {
  if (key === "all") return "全部资源";
  if (key === "folders") return "文件夹树";
  if (key === "recent") return "最近更新";
  if (key === "mine") return "我上传的";
  if (key === "chat") return "聊天资源";
  if (key === "objective") return "目标资源";
  if (key === "result") return "指标资源";
  if (key === "task") return "任务资源";
  if (key === "feedback") return "反馈资源";
  if (key === "workLog") return "日志资源";
  if (key === "trash") return "已删除资源";
  return mode === "search" ? "搜索结果" : "资源";
}

function collectionDescription(key: DriveCollectionKey, mode: DriveMode, scopeLabel: string) {
  if (key === "all") return `${scopeLabel} 内的文件、文件夹和工作资料。`;
  if (key === "folders") return "按文件夹层级浏览，选中文件夹后上传会落到该位置。";
  if (key === "recent") return "按更新时间查看最近触达的团队资料。";
  if (key === "mine") return "只显示当前账号上传或创建的资源。";
  if (key === "chat") return "来自群聊绑定、频道上传和聊天资源流。";
  if (key === "objective") return "关联到目标的说明、证据和过程资料。";
  if (key === "result") return "关联到指标的证明、截图和交付资料。";
  if (key === "task") return "关联到任务和行动项的执行资料。";
  if (key === "feedback") return "关联到反馈的问题截图、日志和复现材料。";
  if (key === "workLog") return "关联到工作日志的当天过程资料。";
  if (key === "trash") return "已删除但仍可恢复的资源。";
  return mode === "search" ? "当前搜索和筛选条件命中的资源。" : "团队资源。";
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
