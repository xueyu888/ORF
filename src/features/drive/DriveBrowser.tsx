import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  Image,
  Link2,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import type { ApiUploadProgress } from "../../state/apiClient";
import type { ChatDriveLink, ChatMessage, DriveBootstrap, DriveNode } from "../../types/orf";

type DriveUploadResult = {
  announcementMessage?: ChatMessage | null;
  node: DriveNode;
};

type DriveBrowserProps = {
  bootstrap: DriveBootstrap | null;
  canManageLinks?: boolean;
  canWrite: boolean;
  compact?: boolean;
  links?: ChatDriveLink[];
  loading: boolean;
  notify: (message: string) => void;
  onAddLink?: (input: { isDefaultUploadTarget?: boolean; node: DriveNode }) => Promise<void>;
  onCreateFolder: (input: { name: string; parentNodeId: string }) => Promise<DriveNode>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onLoadChildren: (parentNodeId: string) => Promise<DriveNode[]>;
  onRefresh: () => Promise<void> | void;
  onRemoveLink?: (linkId: string) => Promise<void>;
  onUploadedAnnouncement?: (message: ChatMessage) => void;
  onUploadFile: (input: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => Promise<DriveUploadResult>;
};

type UploadTaskState = {
  fileName: string;
  percent: number | null;
};

export function DriveBrowser({
  bootstrap,
  canManageLinks = false,
  canWrite,
  compact = false,
  links = [],
  loading,
  notify,
  onAddLink,
  onCreateFolder,
  onDeleteNode,
  onLoadChildren,
  onRefresh,
  onRemoveLink,
  onUploadedAnnouncement,
  onUploadFile,
}: DriveBrowserProps) {
  const [childrenByFolderId, setChildrenByFolderId] = useState<Map<string, DriveNode[]>>(new Map());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [textPreviewByFileId, setTextPreviewByFileId] = useState<Map<string, string>>(new Map());
  const [textPreviewLoadingIds, setTextPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!bootstrap) {
      setChildrenByFolderId(new Map());
      setExpandedFolderIds(new Set());
      setSelectedNodeId(null);
      return;
    }
    const nextChildren = new Map([[bootstrap.root.id, bootstrap.children]]);
    setChildrenByFolderId(nextChildren);
    setExpandedFolderIds(new Set([bootstrap.root.id]));
    setSelectedNodeId((current) => current && hasNode(bootstrap.root, nextChildren, current) ? current : bootstrap.root.id);
  }, [bootstrap]);

  const linkedNodeById = useMemo(() => new Map(links.map((link) => [link.node.id, link.node])), [links]);
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNode(bootstrap?.root ?? null, childrenByFolderId, selectedNodeId) ?? linkedNodeById.get(selectedNodeId) ?? null;
  }, [bootstrap?.root, childrenByFolderId, linkedNodeById, selectedNodeId]);
  const selectedFolder = useMemo(() => {
    if (selectedNode?.type === "folder") return selectedNode;
    if (!selectedNode?.parentId) return null;
    return findNode(bootstrap?.root ?? null, childrenByFolderId, selectedNode.parentId) ?? linkedNodeById.get(selectedNode.parentId) ?? null;
  }, [bootstrap?.root, childrenByFolderId, linkedNodeById, selectedNode]);
  const defaultUploadFolder = useMemo(
    () => links.find((link) => link.isDefaultUploadTarget && link.node.type === "folder")?.node ?? null,
    [links],
  );
  const uploadTarget = selectedFolder ?? defaultUploadFolder ?? bootstrap?.root ?? null;
  const canMutateDrive = canWrite && Boolean(bootstrap);
  const selectedAlreadyLinked = Boolean(selectedNode && linkedNodeById.has(selectedNode.id));
  const selectedFile = selectedNode?.file ?? null;
  const textPreview = selectedFile ? textPreviewByFileId.get(selectedFile.id) : undefined;
  const textPreviewLoading = Boolean(selectedFile && textPreviewLoadingIds.has(selectedFile.id));

  useEffect(() => {
    const file = selectedFile;
    if (!file?.previewUrl || (file.previewKind !== "markdown" && file.previewKind !== "text")) return undefined;
    if (textPreviewByFileId.has(file.id)) return undefined;
    const controller = new AbortController();
    setTextPreviewLoadingIds((items) => new Set(items).add(file.id));
    fetch(file.previewUrl, { credentials: "include", signal: controller.signal })
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

  const toggleFolder = (node: DriveNode) => {
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

  const deleteSelectedNode = async () => {
    if (!canMutateDrive || !selectedNode || selectedNode.id === bootstrap?.root.id) return;
    setErrorMessage(null);
    try {
      await onDeleteNode(selectedNode.id);
      setSelectedNodeId(bootstrap?.root.id ?? null);
      await onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除云盘失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  const addSelectedLink = async (isDefaultUploadTarget = false) => {
    const node = isDefaultUploadTarget ? uploadTarget : selectedNode;
    if (!onAddLink || !canManageLinks || !node) return;
    setErrorMessage(null);
    try {
      await onAddLink({ isDefaultUploadTarget, node });
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

  return (
    <div className={clsx("orf-drive-panel", compact && "orf-drive-panel-compact")}>
      {links.length > 0 && (
        <div className="orf-drive-linked-strip" aria-label="群聊已绑定云盘资源">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              className={clsx("orf-drive-linked-item", link.isDefaultUploadTarget && "is-default")}
              onClick={() => setSelectedNodeId(link.node.id)}
            >
              {link.node.type === "folder" ? <Folder className="h-4 w-4" /> : <File className="h-4 w-4" />}
              <span>{link.label || link.node.name}</span>
              {link.isDefaultUploadTarget && <Star className="h-3.5 w-3.5" />}
              {canManageLinks && onRemoveLink && (
                <span
                  role="button"
                  tabIndex={0}
                  className="orf-drive-linked-remove"
                  aria-label="取消绑定"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeLink(link.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    void removeLink(link.id);
                  }}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="orf-drive-actions">
        <IconButton disabled={!canMutateDrive || !uploadTarget} icon={Upload} label={uploadTarget ? `上传到 ${uploadTarget.name}` : "上传文件"} onClick={() => fileInputRef.current?.click()} />
        <IconButton disabled={!canMutateDrive || !uploadTarget} icon={FolderPlus} label="新建文件夹" onClick={() => setNewFolderName((value) => value || "新建文件夹")} />
        <IconButton disabled={!selectedNode || selectedNode.id === bootstrap?.root.id || !canMutateDrive} icon={Trash2} label="删除" onClick={() => void deleteSelectedNode()} />
        {onAddLink && (
          <>
            <IconButton disabled={!selectedNode || !canManageLinks || selectedAlreadyLinked} icon={Link2} label="绑定到群聊" onClick={() => void addSelectedLink(false)} />
            <IconButton disabled={!uploadTarget || !canManageLinks} icon={Star} label="设为默认上传文件夹" onClick={() => void addSelectedLink(true)} />
          </>
        )}
        <IconButton icon={RefreshCw} label="刷新" loading={loading} onClick={() => void onRefresh()} />
        <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
      </div>

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
          <div className="orf-drive-tree" role="tree">
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
          </div>
          <DrivePreview
            defaultUploadFolder={defaultUploadFolder}
            node={selectedNode}
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
        onClick={() => folder ? toggleFolder(node) : onSelectFile(node)}
      >
        {folder ? (
          loading ? <Loader2 className="h-4 w-4 animate-spin" /> : expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          <span className="orf-drive-row-spacer" />
        )}
        <Icon className="h-4 w-4" />
        <span>{node.name}</span>
        {node.file && <small>{formatFileSize(node.file.fileSize)}</small>}
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
  defaultUploadFolder,
  node,
  textPreview,
  textPreviewLoading,
  uploadTarget,
}: {
  defaultUploadFolder: DriveNode | null;
  node: DriveNode | null;
  textPreview?: string;
  textPreviewLoading?: boolean;
  uploadTarget: DriveNode | null;
}) {
  if (!node) {
    return <div className="orf-drive-preview-empty">选择文件</div>;
  }
  if (node.type === "folder") {
    return (
      <div className="orf-drive-preview-empty">
        <Folder className="h-8 w-8" />
        <strong>{node.name}</strong>
        {uploadTarget?.id === node.id && <span>上传目标</span>}
        {defaultUploadFolder?.id === node.id && <span>群聊默认上传</span>}
      </div>
    );
  }
  const file = node.file;
  if (!file) return <div className="orf-drive-preview-empty">文件不可用</div>;
  return (
    <div className="orf-drive-preview">
      <div className="orf-drive-preview-meta">
        <strong>{file.fileName}</strong>
        <small>{formatFileSize(file.fileSize)} · {file.createdByName ?? "未知成员"}</small>
        <a href={file.downloadUrl}>
          <Download className="h-4 w-4" />
          下载
        </a>
      </div>
      {file.previewKind === "image" && file.previewUrl ? (
        <div className="orf-drive-image-preview">
          <img alt={file.fileName} src={file.previewUrl} />
        </div>
      ) : (file.previewKind === "markdown" || file.previewKind === "text") && file.previewUrl ? (
        <div className="orf-drive-text-preview">
          {textPreviewLoading && textPreview === undefined ? (
            <div className="orf-drive-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
          ) : (
            <pre>{textPreview ?? ""}</pre>
          )}
        </div>
      ) : file.previewKind === "pdf" && file.previewUrl ? (
        <iframe className="orf-drive-inline-preview" src={file.previewUrl} title={file.fileName} />
      ) : (
        <div className="orf-drive-preview-empty">
          <File className="h-8 w-8" />
          <span>无法预览</span>
        </div>
      )}
    </div>
  );
}

function iconForFile(node: DriveNode) {
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}

function appendChildNode(items: Map<string, DriveNode[]>, parentId: string, node: DriveNode) {
  const next = new Map(items);
  const children = next.get(parentId) ?? [];
  const filtered = children.filter((child) => child.id !== node.id);
  next.set(parentId, [...filtered, node].sort(compareDriveNodes));
  return next;
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
