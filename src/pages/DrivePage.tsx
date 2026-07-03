import { useCallback, useEffect, useRef, useState } from "react";
import { PageScaffold } from "../components/PageScaffold";
import { DriveBrowser } from "../features/drive/DriveBrowser";
import {
  createDriveFolderRequest,
  deleteDriveNodeRequest,
  getDriveBootstrap,
  getDriveChildren,
  uploadDriveRequest,
  type ApiUploadProgress,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { DriveBootstrap } from "../types/orf";

export function DrivePage() {
  const { notify } = useOrf();
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

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
          loading={loading}
          notify={notify}
          onCreateFolder={async (input) => {
            const response = await createDriveFolderRequest(input);
            return response.node;
          }}
          onDeleteNode={async (nodeId) => {
            await deleteDriveNodeRequest({ nodeId });
          }}
          onLoadChildren={async (parentNodeId) => {
            const response = await getDriveChildren({ parentNodeId });
            return response.children;
          }}
          onRefresh={loadDrive}
          onUploadFile={async ({ file, onProgress, parentNodeId }: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => {
            const response = await uploadDriveRequest({
              file,
              onProgress,
              parentNodeId,
            });
            return { node: response.node };
          }}
        />
      </div>
    </PageScaffold>
  );
}
