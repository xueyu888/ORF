import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DriveBrowser } from "../drive/DriveBrowser";
import {
  addDriveContextLinkRequest,
  addChatDriveLinkRequest,
  createDriveFolderRequest,
  deleteDriveContextLinkRequest,
  deleteChatDriveLinkRequest,
  deleteDriveNodeRequest,
  getChatDriveBootstrap,
  getDriveChildren,
  getDriveNodeDetailsRequest,
  getDriveTrashRequest,
  restoreDriveFileVersionRequest,
  restoreDriveNodeRequest,
  searchDriveRequest,
  uploadChatDriveFileRequest,
  uploadDriveFileVersionRequest,
  type ApiUploadProgress,
} from "../../state/apiClient";
import { useOrf } from "../../state/OrfProvider";
import type { ChatChannel, ChatDriveLink, ChatMessage, DriveBootstrap } from "../../types/orf";

type ChatDrivePanelProps = {
  canManage: boolean;
  canWrite: boolean;
  channel: ChatChannel;
  notify: (message: string) => void;
  onAnnouncementMessage?: (message: ChatMessage) => void;
};

export function ChatDrivePanel({
  canManage,
  canWrite,
  channel,
  notify,
  onAnnouncementMessage,
}: ChatDrivePanelProps) {
  const { state } = useOrf();
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [links, setLinks] = useState<ChatDriveLink[]>([]);
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
      const response = await getChatDriveBootstrap(channel.id);
      if (requestIdRef.current !== requestId) return;
      setBootstrap(response.drive);
      setLinks(response.links);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "群聊云盘加载失败";
      notify(message);
      setBootstrap(null);
      setLinks([]);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [channel.id, notify]);

  useEffect(() => {
    void loadDrive();
  }, [loadDrive]);

  return (
    <DriveBrowser
      bootstrap={bootstrap}
      canManageLinks={canManage}
      canWrite={canWrite}
      compact
      contextLabel={channel.displayName || channel.name || "当前群聊"}
      contextOptions={contextOptions}
      links={links}
      loading={loading}
      notify={notify}
      onAddContextLink={async (input) => {
        const response = await addDriveContextLinkRequest(input);
        return response.details;
      }}
      onAddLink={async ({ isDefaultUploadTarget, node }) => {
        const response = await addChatDriveLinkRequest({
          channelId: channel.id,
          isDefaultUploadTarget,
          nodeId: node.id,
        });
        setBootstrap(response.drive);
        setLinks(response.links);
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
      onRemoveLink={async (linkId) => {
        const response = await deleteChatDriveLinkRequest({ channelId: channel.id, linkId });
        setBootstrap(response.drive);
        setLinks(response.links);
      }}
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
      onUploadedAnnouncement={onAnnouncementMessage}
      onUploadFile={async ({ file, onProgress, parentNodeId }: { file: File; onProgress?: (progress: ApiUploadProgress) => void; parentNodeId: string }) => {
        const response = await uploadChatDriveFileRequest({
          channelId: channel.id,
          file,
          onProgress,
          parentNodeId,
        });
        return {
          announcementMessage: response.announcementMessage,
          node: response.node,
        };
      }}
      onUploadVersion={async ({ file, fileId, onProgress }) => {
        const response = await uploadDriveFileVersionRequest({ file, fileId, onProgress });
        return { node: response.node, versions: response.versions };
      }}
    />
  );
}
