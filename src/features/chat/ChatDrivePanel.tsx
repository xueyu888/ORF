import { useCallback, useEffect, useRef, useState } from "react";
import { DriveBrowser } from "../drive/DriveBrowser";
import {
  addChatDriveLinkRequest,
  createDriveFolderRequest,
  deleteChatDriveLinkRequest,
  deleteDriveNodeRequest,
  getChatDriveBootstrap,
  getDriveChildren,
  uploadChatDriveFileRequest,
  type ApiUploadProgress,
} from "../../state/apiClient";
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
  const [bootstrap, setBootstrap] = useState<DriveBootstrap | null>(null);
  const [links, setLinks] = useState<ChatDriveLink[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

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
      links={links}
      loading={loading}
      notify={notify}
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
      onDeleteNode={async (nodeId) => {
        await deleteDriveNodeRequest({ nodeId });
      }}
      onLoadChildren={async (parentNodeId) => {
        const response = await getDriveChildren({ parentNodeId });
        return response.children;
      }}
      onRefresh={loadDrive}
      onRemoveLink={async (linkId) => {
        const response = await deleteChatDriveLinkRequest({ channelId: channel.id, linkId });
        setBootstrap(response.drive);
        setLinks(response.links);
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
    />
  );
}
