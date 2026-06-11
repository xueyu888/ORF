import { useMemo } from "react";
import {
  apiJson,
  getCommentMentionableUsers,
  uploadCommentAttachment as uploadCommentAttachmentRequest,
} from "./apiClient";
import { commentMutationFailureMessage } from "./orfProviderMutationMessages";
import type { CommentAttachmentUploadResult, CommentStatus, CommentTargetType, CommentThread, OrfUser } from "../types/orf";

type CommentMutationResponse = { ok: boolean; commentThread: CommentThread | null };

interface CommentActionOptions {
  applyCommentThread: (commentThread: CommentThread) => void;
  applyRemovedCommentThread: (threadId: string) => void;
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
}

export function useOrfProviderCommentActions({
  applyCommentThread,
  applyRemovedCommentThread,
  notify,
  refreshTaskManagementData,
}: CommentActionOptions) {
  return useMemo(
    () => ({
      addComment: (input: {
        targetType: CommentTargetType;
        targetId: string;
        targetTitle: string;
        body: string;
        author?: string;
        parentMessageId?: string;
        replyToMessageId?: string;
        replyToAuthor?: string;
      }) => {
        void apiJson<CommentMutationResponse>("/api/comments", {
          method: "POST",
          body: JSON.stringify({
            targetType: input.targetType,
            targetId: input.targetId,
            targetTitle: input.targetTitle,
            body: input.body,
            parentMessageId: input.parentMessageId,
            replyToMessageId: input.replyToMessageId,
            replyToAuthor: input.replyToAuthor,
          }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify("评论已添加");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论添加失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      loadCommentMentionableUsers: async (input: { targetId: string; targetType: CommentTargetType }): Promise<OrfUser[]> => {
        const response = await getCommentMentionableUsers(input);
        return response.users;
      },
      uploadCommentAttachment: async (input: { file: File; targetId: string; targetType: CommentTargetType }): Promise<CommentAttachmentUploadResult | null> => {
        try {
          const response = await uploadCommentAttachmentRequest(input);
          return { attachment: response.attachment, markdown: response.markdown };
        } catch (error) {
          notify(commentMutationFailureMessage(error, "图片上传失败"));
          return null;
        }
      },
      updateCommentThreadStatus: (threadId: string, status: CommentStatus) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify(status === "resolved" ? "评论已解决" : "评论已重新打开");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateCommentMessage: (threadId: string, messageId: string, body: string) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify("评论已更新");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteCommentMessage: (threadId: string, messageId: string) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            } else {
              applyRemovedCommentThread(threadId);
            }
            notify("评论已删除");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
    }),
    [applyCommentThread, applyRemovedCommentThread, notify, refreshTaskManagementData],
  );
}
