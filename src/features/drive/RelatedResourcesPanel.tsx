import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ExternalLink, File, FileText, Folder, Image, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { searchDriveRequest } from "../../state/apiClient";
import type { DriveContextType, DriveNode } from "../../types/orf";
import { driveNodeMetaLabel, formatDriveDateTime } from "./drivePresentation";

type RelatedResourcesPanelProps = {
  className?: string;
  compact?: boolean;
  contextId: string;
  contextType: DriveContextType;
  emptyLabel?: string;
  hideWhenEmpty?: boolean;
  limit?: number;
  title?: string;
};

export function RelatedResourcesPanel({
  className,
  compact = false,
  contextId,
  contextType,
  emptyLabel = "暂无相关资源",
  hideWhenEmpty = false,
  limit = 6,
  title = "相关资源",
}: RelatedResourcesPanelProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<DriveNode[]>([]);

  useEffect(() => {
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

  if (hideWhenEmpty && !loading && !errorMessage && nodes.length === 0) return null;

  return (
    <section className={clsx("orf-related-resources", compact && "orf-related-resources-compact", className)} aria-label={title}>
      <header className="orf-related-resources-header">
        <strong>{title}</strong>
        <span>{loading ? "同步中" : `${nodes.length} 项`}</span>
      </header>
      <div className="orf-related-resources-list">
        {loading && nodes.length === 0 ? (
          <div className="orf-related-resources-empty">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在加载</span>
          </div>
        ) : errorMessage ? (
          <div className="orf-related-resources-empty is-error">{errorMessage}</div>
        ) : nodes.length > 0 ? (
          nodes.map((node) => <RelatedResourceRow key={node.id} node={node} />)
        ) : (
          <div className="orf-related-resources-empty">{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}

function RelatedResourceRow({ node }: { node: DriveNode }) {
  const Icon = iconForNode(node);
  const href = `/resources/${encodeURIComponent(node.id)}/preview`;
  const meta = [driveNodeMetaLabel(node), formatDriveDateTime(node.updatedAt)].filter(Boolean).join(" · ");
  return (
    <Link className="orf-related-resource-row" to={href} title={node.name}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        <strong>{node.name}</strong>
        <small>{meta}</small>
      </span>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function iconForNode(node: DriveNode) {
  if (node.type === "folder") return Folder;
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}
