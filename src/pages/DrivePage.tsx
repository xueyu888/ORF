import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const contextOptions = useMemo(() => [
    ...state.projects.map((project) => ({ id: project.id, title: project.name, type: "project" as const })),
    ...state.objectives.slice(0, 120).map((objective) => ({ id: objective.id, title: objective.title, type: "objective" as const })),
  ], [state.objectives, state.projects]);

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
    <PageScaffold title="云盘" subtitle="团队文件、文件夹和预览。">
      <div className="orf-drive-page">
        <DriveBrowser
          bootstrap={bootstrap}
          canWrite
          contextOptions={contextOptions}
          loading={loading}
          notify={notify}
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
