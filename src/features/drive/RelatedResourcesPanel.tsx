import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ExternalLink, File, FileText, Folder, Image, Link2, Loader2, Search, Unlink, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  addDriveContextLinkRequest,
  deleteDriveContextLinkRequest,
  getDriveBootstrap,
  getDriveNodeDetailsRequest,
  searchDriveRequest,
  uploadDriveRequest,
  type ApiUploadProgress,
} from "../../state/apiClient";
import type { DriveContextType, DriveNode } from "../../types/orf";
import { driveNodeMetaLabel, formatDriveDateTime } from "./drivePresentation";

type RelatedResourcesPanelProps = {
  canEdit?: boolean;
  className?: string;
  compact?: boolean;
  contextId: string;
  contextType: DriveContextType;
  emptyLabel?: string;
  hideWhenEmpty?: boolean;
  limit?: number;
  notify?: (message: string) => void;
  onChanged?: () => void;
  title?: string;
};

export function RelatedResourcesPanel({
  canEdit = false,
  className,
  compact = false,
  contextId,
  contextType,
  emptyLabel = "暂无相关资源",
  hideWhenEmpty = false,
  limit = 6,
  notify,
  onChanged,
  title = "相关资源",
}: RelatedResourcesPanelProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<DriveNode[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveNode[]>([]);
  const [toolMode, setToolMode] = useState<"link" | "upload">("upload");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [unlinkingNodeId, setUnlinkingNodeId] = useState<string | null>(null);
  const [uploadTask, setUploadTask] = useState<{ fileName: string; percent: number | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootNodeIdRef = useRef<string | null>(null);

  const report = useCallback((message: string) => {
    notify?.(message);
  }, [notify]);

  const loadResources = useCallback(() => {
    let disposed = false;
    setLoading(true);
    setErrorMessage(null);
    searchDriveRequest({ contextId, contextType, limit, status: "active", type: "all" })
      .then((response) => {
        if (!disposed) setNodes(response.nodes);
      })
      .catch((error) => {
        if (disposed) return;
        setNodes([]);
        setErrorMessage(error instanceof Error ? error.message : "相关资源加载失败");
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [contextId, contextType, limit]);

  useEffect(() => loadResources(), [loadResources]);

  const linkedNodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const visibleSearchResults = useMemo(
    () => searchResults.filter((node) => !linkedNodeIds.has(node.id) && !node.deletedAt),
    [linkedNodeIds, searchResults],
  );

  const runSearch = async (query = searchQuery) => {
    setSearchLoading(true);
    setErrorMessage(null);
    try {
      const response = await searchDriveRequest({
        limit: 8,
        query: query.trim() || undefined,
        status: "active",
        type: "all",
      });
      setSearchResults(response.nodes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "资源搜索失败";
      setErrorMessage(message);
      report(message);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!toolsOpen || toolMode !== "link") return undefined;
    const timer = window.setTimeout(() => {
      void runSearch(searchQuery);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery, toolMode, toolsOpen]);

  const resolveUploadParentNodeId = async () => {
    if (rootNodeIdRef.current) return rootNodeIdRef.current;
    const response = await getDriveBootstrap();
    rootNodeIdRef.current = response.drive.root.id;
    return response.drive.root.id;
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!canEdit || !files?.length) return;
    for (const file of Array.from(files)) {
      setUploadTask({ fileName: file.name, percent: null });
      setErrorMessage(null);
      try {
        const parentNodeId = await resolveUploadParentNodeId();
        await uploadDriveRequest({
          contextLink: { contextId, contextType },
          file,
          parentNodeId,
          onProgress: (progress: ApiUploadProgress) => {
            setUploadTask({ fileName: file.name, percent: progress.percent });
          },
        });
        report("资源已上传并关联");
        setToolsOpen(false);
        loadResources();
        onChanged?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : "资源上传失败";
        setErrorMessage(message);
        report(message);
        break;
      } finally {
        setUploadTask(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const linkExistingNode = async (node: DriveNode) => {
    if (!canEdit || linkedNodeIds.has(node.id) || node.deletedAt) return;
    setLinkingNodeId(node.id);
    setErrorMessage(null);
    try {
      await addDriveContextLinkRequest({ contextId, contextType, nodeId: node.id });
      setSearchResults((items) => items.filter((item) => item.id !== node.id));
      setSearchQuery("");
      setToolsOpen(false);
      report("资源已关联");
      loadResources();
      onChanged?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "资源关联失败";
      setErrorMessage(message);
      report(message);
    } finally {
      setLinkingNodeId(null);
    }
  };

  const unlinkNode = async (node: DriveNode) => {
    if (!canEdit) return;
    setUnlinkingNodeId(node.id);
    setErrorMessage(null);
    try {
      const response = await getDriveNodeDetailsRequest({ nodeId: node.id });
      const link = response.details.contextLinks.find(
        (item) => item.contextType === contextType && item.contextId === contextId,
      );
      if (!link) {
        loadResources();
        report("资源关联已刷新");
        return;
      }
      await deleteDriveContextLinkRequest({ linkId: link.id, nodeId: node.id });
      report("资源已取消关联");
      loadResources();
      onChanged?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "取消资源关联失败";
      setErrorMessage(message);
      report(message);
    } finally {
      setUnlinkingNodeId(null);
    }
  };

  if (hideWhenEmpty && !canEdit && !loading && !errorMessage && nodes.length === 0) return null;

  return (
    <section className={clsx("orf-related-resources", compact && "orf-related-resources-compact", className)} aria-label={title}>
      <header className="orf-related-resources-header">
        <span>
          <strong>{title}</strong>
          <small>{loading ? "同步中" : `${nodes.length} 项`}</small>
        </span>
        {canEdit && (
          <button
            type="button"
            className="orf-related-resources-add"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((value) => !value)}
          >
            {toolsOpen ? <X className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            <span>{toolsOpen ? "收起" : "添加资源"}</span>
          </button>
        )}
      </header>

      {canEdit && toolsOpen && (
        <div className="orf-related-resource-tools">
          <div className="orf-related-resource-tool-tabs" role="tablist" aria-label={`${title}操作`}>
            <button type="button" className={clsx(toolMode === "upload" && "is-active")} onClick={() => setToolMode("upload")}>
              <Upload className="h-3.5 w-3.5" />
              上传
            </button>
            <button type="button" className={clsx(toolMode === "link" && "is-active")} onClick={() => {
              setToolMode("link");
              void runSearch(searchQuery);
            }}>
              <Search className="h-3.5 w-3.5" />
              关联已有
            </button>
          </div>

          {toolMode === "upload" ? (
            <button
              type="button"
              className="orf-related-resource-upload"
              disabled={Boolean(uploadTask)}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>
                <strong>{uploadTask?.fileName ?? "上传并关联到此上下文"}</strong>
                <small>{uploadTask ? uploadTask.percent === null ? "上传中" : `${Math.round(uploadTask.percent)}%` : "进入团队云盘根目录"}</small>
              </span>
            </button>
          ) : (
            <form
              className="orf-related-resource-search"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch(searchQuery);
              }}
            >
              <Search className="h-4 w-4" />
              <input
                value={searchQuery}
                placeholder="搜索团队云盘"
                aria-label={`搜索可关联到${title}的资源`}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </form>
          )}
          <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => void uploadFiles(event.currentTarget.files)} />

          {toolMode === "link" && (
            <div className="orf-related-resource-search-results">
              {searchLoading ? (
                <div className="orf-related-resources-empty"><Loader2 className="h-4 w-4 animate-spin" /> 正在搜索</div>
              ) : visibleSearchResults.length > 0 ? (
                visibleSearchResults.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    disabled={linkingNodeId === node.id}
                    onClick={() => void linkExistingNode(node)}
                  >
                    {linkingNodeId === node.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ResourceIcon node={node} />}
                    <span>
                      <strong>{node.name}</strong>
                      <small>{driveNodeMetaLabel(node)}</small>
                    </span>
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                ))
              ) : (
                <div className="orf-related-resources-empty">没有可关联资源</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="orf-related-resources-list">
        {loading && nodes.length === 0 ? (
          <div className="orf-related-resources-empty">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在加载</span>
          </div>
        ) : errorMessage ? (
          <div className="orf-related-resources-empty is-error">{errorMessage}</div>
        ) : nodes.length > 0 ? (
          nodes.map((node) => (
            <RelatedResourceRow
              canUnlink={canEdit}
              key={node.id}
              node={node}
              onUnlink={() => void unlinkNode(node)}
              unlinking={unlinkingNodeId === node.id}
            />
          ))
        ) : (
          <div className="orf-related-resources-empty">{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}

function RelatedResourceRow({
  canUnlink,
  node,
  onUnlink,
  unlinking,
}: {
  canUnlink: boolean;
  node: DriveNode;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  const Icon = iconForNode(node);
  const href = `/resources/${encodeURIComponent(node.id)}/preview`;
  const meta = [driveNodeMetaLabel(node), formatDriveDateTime(node.updatedAt)].filter(Boolean).join(" · ");
  return (
    <div className="orf-related-resource-row-shell">
      <Link className="orf-related-resource-row" to={href} title={node.name}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>
          <strong>{node.name}</strong>
          <small>{meta}</small>
        </span>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {canUnlink && (
        <button type="button" className="orf-related-resource-unlink" aria-label={`取消关联 ${node.name}`} disabled={unlinking} onClick={onUnlink}>
          {unlinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function ResourceIcon({ node }: { node: DriveNode }) {
  const Icon = iconForNode(node);
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

function iconForNode(node: DriveNode) {
  if (node.type === "folder") return Folder;
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "docx" || node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}
