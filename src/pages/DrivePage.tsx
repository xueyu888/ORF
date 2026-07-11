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
  getDriveChildren,
  getDriveTrashRequest,
  restoreDriveFileVersionRequest,
  restoreDriveNodeRequest,
  searchDriveRequest,
  uploadDriveRequest,
  uploadDriveFileVersionRequest,
  type ApiUploadProgress,
} from "../state/apiClient";
import { driveBootstrapSnapshot, invalidateDriveBootstrap, loadDriveBootstrap } from "../state/readModelQueries";
import { useOrf } from "../state/OrfProvider";
import type { DriveBootstrap } from "../types/orf";

export function DrivePage() {
  const { currentUser, notify, state } = useOrf();
  const navigate = useNavigate();
  const location = useLocation();
  const { nodeId } = useParams<{ nodeId?: string }>();
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(() => driveBootstrapSnapshot()?.drive ?? null);
  const [loading, setLoading] = useState(() => driveBootstrapSnapshot() === undefined);
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

  const loadDrive = useCallback(async (force = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(driveBootstrapSnapshot() === undefined);
    try {
      const response = await loadDriveBootstrap({ force });
      if (requestIdRef.current !== requestId) return;
      setBootstrap(response.drive);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "云盘加载失败";
      notify(message);
      // Keep the last usable projection visible when a background refresh fails.
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadDrive(false);
  }, [loadDrive]);

  return (
    <PageScaffold title="资源" subtitle="团队文件、文件夹、搜索和预览。">
      <div className="orf-drive-page">
        <DriveBrowser
          bootstrap={bootstrap}
          canWrite
          currentUserId={currentUser?.id ?? null}
          initialSelectedNodeId={nodeId ?? null}
          contextLabel="团队空间"
          contextOptions={contextOptions}
          loading={loading}
          notify={notify}
          onSelectedNodeIdChange={handleSelectedNodeIdChange}
          resourceHref={resourceHref}
          onAddContextLink={async (input) => {
            const response = await addDriveContextLinkRequest(input);
            invalidateDriveBootstrap();
            return response.details;
          }}
          onCreateFolder={async (input) => {
            const response = await createDriveFolderRequest(input);
            invalidateDriveBootstrap();
            return response.node;
          }}
          onRemoveContextLink={async (input) => {
            const response = await deleteDriveContextLinkRequest(input);
            invalidateDriveBootstrap();
            return response.details;
          }}
          onDeleteNode={async (nodeId) => {
            await deleteDriveNodeRequest({ nodeId });
            invalidateDriveBootstrap();
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
          onRefresh={() => loadDrive(true)}
          onRestoreNode={async (nodeId) => {
            const response = await restoreDriveNodeRequest({ nodeId });
            invalidateDriveBootstrap();
            return response.node;
          }}
          onRestoreVersion={async (input) => {
            const response = await restoreDriveFileVersionRequest(input);
            invalidateDriveBootstrap();
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
            invalidateDriveBootstrap();
            return { node: response.node };
          }}
          onUploadVersion={async ({ file, fileId, onProgress }) => {
            const response = await uploadDriveFileVersionRequest({ file, fileId, onProgress });
            invalidateDriveBootstrap();
            return { node: response.node, versions: response.versions };
          }}
          uploaderOptions={state.users.filter((user) => user.status === "active").map((user) => ({ id: user.id, name: user.name }))}
        />
      </div>
    </PageScaffold>
  );
}
