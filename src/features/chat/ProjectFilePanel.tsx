import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Download, File, FileText, Folder, FolderPlus, Image, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import {
  createProjectFolderRequest,
  deleteProjectFileNodeRequest,
  getProjectFileBootstrap,
  getProjectFileChildren,
  updateChatChannelRequest,
  uploadProjectFileRequest,
  type ApiUploadProgress,
} from "../../state/apiClient";
import type { ChatChannel, ChatMessage, OrfProject, ProjectFileNode, ProjectFileTreeBootstrap } from "../../types/orf";
import { formatFileSize } from "./chatFormat";

type ProjectFilePanelProps = {
  canManage: boolean;
  canWrite: boolean;
  channel: ChatChannel;
  onAnnouncementMessage?: (message: ChatMessage) => void;
  onChannelUpdated: (channel: ChatChannel) => void;
  projects: OrfProject[];
  notify: (message: string) => void;
};

type UploadTaskState = {
  fileName: string;
  percent: number | null;
};

export function ProjectFilePanel({
  canManage,
  canWrite,
  channel,
  notify,
  onAnnouncementMessage,
  onChannelUpdated,
  projects,
}: ProjectFilePanelProps) {
  const [tree, setTree] = useState<ProjectFileTreeBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [childrenByFolderId, setChildrenByFolderId] = useState<Map<string, ProjectFileNode[]>>(new Map());
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bindingProjectId, setBindingProjectId] = useState(channel.projectId ?? "");
  const [savingBinding, setSavingBinding] = useState(false);
  const [uploadTask, setUploadTask] = useState<UploadTaskState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);

  const boundProject = useMemo(
    () =>
      projects.find((project) => project.id === channel.projectId)
      ?? tree?.project
      ?? (channel.projectId && channel.projectName ? { id: channel.projectId, name: channel.projectName } : null),
    [channel.projectId, channel.projectName, projects, tree?.project],
  );
  const projectOptions = useMemo(() => {
    if (!boundProject || projects.some((project) => project.id === boundProject.id)) return projects;
    return [boundProject, ...projects];
  }, [boundProject, projects]);
  const selectedNode = useMemo(
    () => selectedNodeId ? findNode(tree?.root ?? null, childrenByFolderId, selectedNodeId) : null,
    [childrenByFolderId, selectedNodeId, tree?.root],
  );
  const selectedFolder = useMemo(
    () => selectedFolderId ? findNode(tree?.root ?? null, childrenByFolderId, selectedFolderId) : null,
    [childrenByFolderId, selectedFolderId, tree?.root],
  );
  const canMutateFiles = canWrite && Boolean(channel.projectId && tree);

  const applyTree = useCallback((nextTree: ProjectFileTreeBootstrap | null) => {
    setTree(nextTree);
    if (!nextTree) {
      setChildrenByFolderId(new Map());
      setExpandedFolderIds(new Set());
      setSelectedNodeId(null);
      setSelectedFolderId(null);
      return;
    }
    setChildrenByFolderId(new Map([[nextTree.root.id, nextTree.children]]));
    setExpandedFolderIds(new Set([nextTree.root.id]));
    setSelectedFolderId(nextTree.root.id);
    setSelectedNodeId((current) => current && hasNode(nextTree.root, new Map([[nextTree.root.id, nextTree.children]]), current) ? current : nextTree.root.id);
  }, []);

  const loadTree = useCallback(async () => {
    if (!channel.projectId) {
      applyTree(null);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await getProjectFileBootstrap(channel.id);
      if (requestIdRef.current !== requestId) return;
      applyTree(response.tree);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "项目文件加载失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [applyTree, channel.id, channel.projectId, notify]);

  useEffect(() => {
    setBindingProjectId(channel.projectId ?? "");
    void loadTree();
  }, [channel.id, channel.projectId, loadTree]);

  const saveBinding = async () => {
    if (!canManage || savingBinding || bindingProjectId === (channel.projectId ?? "")) return;
    setSavingBinding(true);
    setErrorMessage(null);
    try {
      const response = await updateChatChannelRequest(channel.id, { projectId: bindingProjectId || null });
      onChannelUpdated(response.channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : "项目绑定保存失败";
      setErrorMessage(message);
      notify(message);
    } finally {
      setSavingBinding(false);
    }
  };

  const loadChildren = async (folderId: string) => {
    if (!channel.projectId) return;
    setLoadingFolderIds((items) => new Set(items).add(folderId));
    setErrorMessage(null);
    try {
      const response = await getProjectFileChildren({ channelId: channel.id, parentNodeId: folderId });
      setChildrenByFolderId((items) => new Map(items).set(folderId, response.children));
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

  const toggleFolder = (node: ProjectFileNode) => {
    setSelectedNodeId(node.id);
    setSelectedFolderId(node.id);
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
    if (!canMutateFiles || !selectedFolder || creatingFolder || !newFolderName.trim()) return;
    setCreatingFolder(true);
    setErrorMessage(null);
    try {
      const response = await createProjectFolderRequest({
        channelId: channel.id,
        name: newFolderName.trim(),
        parentNodeId: selectedFolder.id,
      });
      setChildrenByFolderId((items) => appendChildNode(items, selectedFolder.id, response.node));
      setExpandedFolderIds((items) => new Set(items).add(selectedFolder.id));
      setSelectedNodeId(response.node.id);
      setSelectedFolderId(response.node.id);
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
    if (!files || files.length === 0 || !canMutateFiles || !selectedFolder) return;
    for (const file of Array.from(files)) {
      setUploadTask({ fileName: file.name, percent: null });
      setErrorMessage(null);
      try {
        const response = await uploadProjectFileRequest({
          channelId: channel.id,
          file,
          parentNodeId: selectedFolder.id,
          onProgress: (progress: ApiUploadProgress) => {
            setUploadTask({ fileName: file.name, percent: progress.percent });
          },
        });
        setChildrenByFolderId((items) => appendChildNode(items, selectedFolder.id, response.node));
        setExpandedFolderIds((items) => new Set(items).add(selectedFolder.id));
        setSelectedNodeId(response.node.id);
        if (response.announcementMessage) onAnnouncementMessage?.(response.announcementMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : "上传项目文件失败";
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
    if (!canMutateFiles || !selectedNode || selectedNode.id === tree?.root.id) return;
    try {
      await deleteProjectFileNodeRequest({ channelId: channel.id, nodeId: selectedNode.id });
      await loadTree();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除项目文件失败";
      setErrorMessage(message);
      notify(message);
    }
  };

  return (
    <div className="orf-project-file-panel">
      <div className="orf-project-file-toolbar">
        <div className="orf-project-file-binding">
          <select
            aria-label="绑定项目"
            disabled={!canManage || savingBinding}
            value={bindingProjectId}
            onChange={(event) => setBindingProjectId(event.target.value)}
          >
            <option value="">未绑定项目</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          {canManage && (
            <Button disabled={savingBinding || bindingProjectId === (channel.projectId ?? "")} onClick={() => void saveBinding()} size="sm" variant="secondary">
              {savingBinding ? "保存中" : "保存"}
            </Button>
          )}
        </div>
        {boundProject && <strong className="orf-project-file-project-name">{boundProject.name}</strong>}
      </div>

      {!channel.projectId ? (
        <div className="orf-project-file-empty">
          <Folder className="h-8 w-8" />
          <strong>未绑定项目</strong>
          <span>{canManage ? "选择项目后启用文件夹" : "这个群聊还没有绑定项目"}</span>
        </div>
      ) : loading ? (
        <div className="orf-project-file-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载项目文件</div>
      ) : tree ? (
        <>
          <div className="orf-project-file-actions">
            <IconButton disabled={!canMutateFiles} icon={Upload} label="上传文件" onClick={() => fileInputRef.current?.click()} />
            <IconButton disabled={!canMutateFiles} icon={FolderPlus} label="新建文件夹" onClick={() => setNewFolderName((value) => value || "新建文件夹")} />
            <IconButton disabled={!selectedNode || selectedNode.id === tree.root.id || !canMutateFiles} icon={Trash2} label="删除" onClick={() => void deleteSelectedNode()} />
            <IconButton icon={RefreshCw} label="刷新" loading={loading} onClick={() => void loadTree()} />
            <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
          </div>
          {newFolderName && (
            <form className="orf-project-file-create" onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}>
              <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} />
              <Button disabled={creatingFolder || !newFolderName.trim()} size="sm" variant="secondary">{creatingFolder ? "创建中" : "创建"}</Button>
            </form>
          )}
          {uploadTask && (
            <div className="orf-project-file-uploading">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{uploadTask.fileName}</span>
              <strong>{uploadTask.percent === null ? "上传中" : `${Math.round(uploadTask.percent)}%`}</strong>
            </div>
          )}
          {errorMessage && <div className="orf-project-file-error">{errorMessage}</div>}
          <div className="orf-project-file-layout">
            <div className="orf-project-file-tree" role="tree">
              <ProjectFileTreeRow
                childrenByFolderId={childrenByFolderId}
                expandedFolderIds={expandedFolderIds}
                level={0}
                loadingFolderIds={loadingFolderIds}
                node={tree.root}
                onSelectFile={(node) => setSelectedNodeId(node.id)}
                selectedNodeId={selectedNodeId}
                toggleFolder={toggleFolder}
              />
            </div>
            <ProjectFilePreview node={selectedNode} />
          </div>
        </>
      ) : (
        <div className="orf-project-file-empty">项目文件不可用</div>
      )}
    </div>
  );
}

function ProjectFileTreeRow({
  childrenByFolderId,
  expandedFolderIds,
  level,
  loadingFolderIds,
  node,
  onSelectFile,
  selectedNodeId,
  toggleFolder,
}: {
  childrenByFolderId: Map<string, ProjectFileNode[]>;
  expandedFolderIds: Set<string>;
  level: number;
  loadingFolderIds: Set<string>;
  node: ProjectFileNode;
  onSelectFile: (node: ProjectFileNode) => void;
  selectedNodeId: string | null;
  toggleFolder: (node: ProjectFileNode) => void;
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
        className={clsx("orf-project-file-row", selectedNodeId === node.id && "orf-project-file-row-active")}
        role="treeitem"
        style={{ paddingLeft: `${8 + level * 14}px` }}
        onClick={() => folder ? toggleFolder(node) : onSelectFile(node)}
      >
        {folder ? (
          loading ? <Loader2 className="h-4 w-4 animate-spin" /> : expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          <span className="orf-project-file-row-spacer" />
        )}
        <Icon className="h-4 w-4" />
        <span>{node.name}</span>
        {node.file && <small>{formatFileSize(node.file.fileSize)}</small>}
      </button>
      {folder && expanded && children.map((child) => (
        <ProjectFileTreeRow
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

function ProjectFilePreview({ node }: { node: ProjectFileNode | null }) {
  if (!node) {
    return <div className="orf-project-file-preview-empty">选择文件</div>;
  }
  if (node.type === "folder") {
    return (
      <div className="orf-project-file-preview-empty">
        <Folder className="h-8 w-8" />
        <strong>{node.name}</strong>
      </div>
    );
  }
  const file = node.file;
  if (!file) return <div className="orf-project-file-preview-empty">文件不可用</div>;
  return (
    <div className="orf-project-file-preview">
      <div className="orf-project-file-preview-meta">
        <strong>{file.fileName}</strong>
        <small>{formatFileSize(file.fileSize)} · {file.createdByName ?? "未知成员"}</small>
        <a href={file.downloadUrl}>
          <Download className="h-4 w-4" />
          下载
        </a>
      </div>
      {file.previewKind === "image" && file.previewUrl ? (
        <div className="orf-project-file-image-preview">
          <img alt={file.fileName} src={file.previewUrl} />
        </div>
      ) : (file.previewKind === "pdf" || file.previewKind === "markdown" || file.previewKind === "text") && file.previewUrl ? (
        <iframe className="orf-project-file-inline-preview" src={file.previewUrl} title={file.fileName} />
      ) : (
        <div className="orf-project-file-preview-empty">
          <File className="h-8 w-8" />
          <span>无法预览</span>
        </div>
      )}
    </div>
  );
}

function iconForFile(node: ProjectFileNode) {
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}

function appendChildNode(items: Map<string, ProjectFileNode[]>, parentId: string, node: ProjectFileNode) {
  const next = new Map(items);
  const children = next.get(parentId) ?? [];
  const filtered = children.filter((child) => child.id !== node.id);
  next.set(parentId, [...filtered, node].sort(compareProjectFileNodes));
  return next;
}

function compareProjectFileNodes(left: ProjectFileNode, right: ProjectFileNode) {
  if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
  return left.name.localeCompare(right.name, "zh-CN");
}

function findNode(root: ProjectFileNode | null, childrenByFolderId: Map<string, ProjectFileNode[]>, nodeId: string): ProjectFileNode | null {
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

function hasNode(root: ProjectFileNode, childrenByFolderId: Map<string, ProjectFileNode[]>, nodeId: string) {
  return Boolean(findNode(root, childrenByFolderId, nodeId));
}
