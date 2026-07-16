import {
  CHAT_SYNC_PAGE_SIZE,
  CHAT_SYNC_PROTOCOL_VERSION,
  type ChatSyncResponse,
  type StoredChatSyncCursor,
} from "../../domain/chatSync";

export type ChatSyncCheckpoint = Pick<
  StoredChatSyncCursor,
  "cursor" | "permissionFingerprint" | "teamId"
>;

export async function resolveChatSyncCheckpoint(input: {
  fetchPage: (request: {
    cursor?: string;
    limit: number;
    permissionFingerprint?: string;
    protocolVersion: number;
  }) => Promise<ChatSyncResponse>;
  storedCursor: StoredChatSyncCursor | null;
}): Promise<ChatSyncCheckpoint> {
  let cursor = input.storedCursor?.cursor;
  let permissionFingerprint = input.storedCursor?.permissionFingerprint;
  let storedTeamNeedsValidation = input.storedCursor !== null;

  while (true) {
    const response = await input.fetchPage({
      cursor,
      limit: CHAT_SYNC_PAGE_SIZE,
      permissionFingerprint,
      protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    });

    if (storedTeamNeedsValidation && input.storedCursor?.teamId !== response.teamId) {
      cursor = undefined;
      permissionFingerprint = undefined;
      storedTeamNeedsValidation = false;
      continue;
    }
    storedTeamNeedsValidation = false;
    cursor = response.nextCursor;
    permissionFingerprint = response.permissionFingerprint;
    if (response.mode === "full" || !response.hasMore) {
      return {
        cursor,
        permissionFingerprint,
        teamId: response.teamId,
      };
    }
  }
}
