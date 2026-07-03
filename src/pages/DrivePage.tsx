import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { DriveBrowser } from "../features/drive/DriveBrowser";
import {
  addDriveContextLinkRequest,
  createDriveFolderRequest,
  deleteDriveContextLinkRequest,
  deleteDriveNodeRequest,
  getDriveNodeDetailsRequest,
  getDriveBootstrap,
  getDriveChildren,
  getDriveTrashRequest,
  restoreDriveFileVersionRequest,
  restoreDriveNodeRequest,
  searchDriveRequest,
  uploadDriveRequest,
  uploadDriveFileVersionRequest,
  type ApiUploadProgress,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { DriveBootstrap } from "../types/orf";

export function DrivePage() {
  const { notify, state } = useOrf();
  const navigate = useNavigate();
  const location = useLocation();
  const { nodeId } = useParams<{ nodeId?: string }>();
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const previewRoute = /^\/resources\/[^/]+\/preview\/?$/.test(location.pathname);
  const contextOptions = useMemo(() => [
    ...state.projects.map((project) => ({ id: project.id, title: project.name, type: "project" as const })),
    ...state.objectives.slice(0, 120).map((objective) => ({ id: objective.id, title: objective.title, type: "objective" as const })),
    ...state.results.slice(0, 120).map((result) => ({ id: result.id, title: result.title, type: "result" as const })),
    ...state.tasks.slice(0, 120).map((task) => ({ id: task.id, title: task.title, type: "task" as const })),
    ...state.feedback.slice(0, 120).map((feedback) => ({ id: feedback.id, title: feedback.phenomenon, type: "feedback" as const })),
  ], [state.feedback, state.objectives, state.projects, state.results, state.tasks]);
  const resourceHref = useCallback((resourceNodeId: string) => {
    const suffix = previewRoute ? "/preview" : "";
    return `${window.location.origin}/resources/${encodeURIComponent(resourceNodeId)}${suffix}`;
  }, [previewRoute]);

  const handleSelectedNodeIdChange = useCallback((selectedNodeId: string | null) => {
    if (!bootstrap?.root.id || !selectedNodeId) return;
    if (selectedNodeId === bootstrap.root.id) {
      if (location.pathname !== "/resources") navigate("/resources", { replace: true });
      return;
    }
    if (nodeId === selectedNodeId) return;
    navigate(`/resources/${encodeURIComponent(selectedNodeId)}${previewRoute ? "/preview" : ""}`, { replace: false });
  }, [bootstrap?.root.id, location.pathname, navigate, nodeId, previewRoute]);

  const loadDrive = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await getDriveBootstrap();
      if (requestIdRef.current !== requestId) return;
      setBootstrap(response.drive);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "云盘加载失败";
      notify(message);
      setBootstrap(null);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadDrive();
  }, [loadDrive]);

  return (
    <PageScaffold title="资源" subtitle="团队文件、文件夹、搜索和预览。">
      <div className="orf-drive-page">
        <DriveBrowser
          bootstrap={bootstrap}
          canWrite
          initialSelectedNodeId={nodeId ?? null}
          contextLabel="团队空间"
          contextOptions={contextOptions}
          loading={loading}
          notify={notify}
          onSelectedNodeIdChange={handleSelectedNodeIdChange}
          resourceHref={resourceHref}
          onAddContextLink={async (input) => {
            const response = await addDriveContextLinkRequest(input);
            return response.details;
          }}
          onCreateFolder={async (input) => {
            const response = await createDriveFolderRequest(input);
            return response.node;
          }}
          onRemoveContextLink={async (input) => {
            const response = await deleteDriveContextLinkRequest(input);
            return response.details;
          }}
          onDeleteNode={async (nodeId) => {
            await deleteDriveNodeRequest({ nodeId });
          }}
          onListTrash={async () => {
            const response = await getDriveTrashRequest();
            return response.nodes;
          }}
          onLoadChildren={async (parentNodeId) => {
            const response = await getDriveChildren({ parentNodeId });
            return response.children;
          }}
          onLoadDetails={async (nodeId) => {
            const response = await getDriveNodeDetailsRequest({ nodeId });
            return response.details;
          }}
          onRefresh={loadDrive}
          onRestoreNode={async (nodeId) => {
            const response = await restoreDriveNodeRequest({ nodeId });
            return response.node;
          }}
          onRestoreVersion={async (input) => {
            const response = await restoreDriveFileVersionRequest(input);
            return { node: response.node, versions: response.versions };
          }}
          onSearch={async (input) => {
            const response = await searchDriveRequest(input);
            return response.nodes;
          }}
          onUploadFile={async ({ file, onProgress, parentNodeId }: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => {
            const response = await uploadDriveRequest({
              file,
              onProgress,
              parentNodeId,
            });
            return { node: response.node };
          }}
          onUploadVersion={async ({ file, fileId, onProgress }) => {
            const response = await uploadDriveFileVersionRequest({ file, fileId, onProgress });
            return { node: response.node, versions: response.versions };
          }}
        />
      </div>
    </PageScaffold>
  );
}
