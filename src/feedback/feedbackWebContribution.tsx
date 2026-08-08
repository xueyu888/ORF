import {
  createFeedbackWebContribution,
  type FeedbackCommentDraft,
  type FeedbackCommentDraftMode,
  type FeedbackCommentMentionUser,
  type FeedbackImagePreview,
  type FeedbackWebAttachment,
  type FeedbackWebHost,
  type FeedbackWebUser,
} from "@orf/feedback-module/web";
import type { FormEvent } from "react";
import { ImagePreviewDialog, type ImagePreview } from "../components/ImagePreviewDialog";
import { UserAvatar } from "../components/UserAvatar";
import { hasPermission } from "../config/permissions";
import {
  CommentBodyText,
  CommentComposer,
  CommentDraftFields,
  CommentInlineEditor,
  commentDraftFromStoredBody,
  emptyCommentDraft,
  serializeCommentDraft,
  type CommentMentionUser,
} from "../features/challenge/comments/CommentPanel";
import { RelatedResourcesPanel } from "../features/drive/RelatedResourcesPanel";
import { validOrfRichTextDraftAttachments, type OrfRichTextDraft } from "../features/rich-text/orfRichTextDraft";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { useOrf } from "../state/OrfProvider";
import type { CommentAttachment } from "../types/orf";
import "./feedback.css";

const feedbackWebHost: FeedbackWebHost = {
  components: {
    CommentBodyText: FeedbackCommentBodyText,
    CommentComposer: FeedbackCommentComposer,
    CommentDraftFields: FeedbackCommentDraftFields,
    CommentInlineEditor: FeedbackCommentInlineEditor,
    ImagePreviewDialog,
    RelatedResourcesPanel,
    UserAvatar,
  },
  commentDraft: {
    empty: emptyCommentDraft,
    fromStoredBody: commentDraftFromStoredBody,
    serialize: serializeCommentDraft,
    validPendingAttachmentIds(draft: FeedbackCommentDraft) {
      return validOrfRichTextDraftAttachments(draft as OrfRichTextDraft)
        .flatMap((attachment) => attachment.kind === "pending" ? [attachment.pendingAttachmentId] : []);
    },
  },
  useSession() {
    const {
      addComment,
      currentUser,
      loadCommentMentionableUsers,
      notify,
      readModelInvalidations,
      state,
      updateCommentMessage,
      uploadCommentAttachment,
    } = useOrf();

    return {
      addComment,
      canManageAllComments: hasPermission(currentUser, state.permissionRules, "comment.manage"),
      currentUser: currentUser as FeedbackWebUser | null,
      feedbackInvalidationKey: readModelInvalidationKey(readModelInvalidations, "feedback"),
      loadCommentMentionableUsers: async (input) => loadCommentMentionableUsers(input) as Promise<FeedbackWebUser[]>,
      notify,
      updateCommentMessage,
      uploadCommentAttachment,
    };
  },
};

export const feedbackWebContribution = createFeedbackWebContribution(feedbackWebHost);

function FeedbackCommentBodyText({
  attachments,
  body,
  mentionUsersById,
  onOpenImage,
}: {
  attachments?: FeedbackWebAttachment[];
  body: string;
  mentionUsersById: Map<string, FeedbackCommentMentionUser>;
  onOpenImage: (preview: FeedbackImagePreview) => void;
}) {
  return (
    <CommentBodyText
      attachments={feedbackAttachmentsForHost(attachments ?? [])}
      body={body}
      mentionUsersById={feedbackMentionUsersByIdForHost(mentionUsersById)}
      onOpenImage={(preview) => onOpenImage(feedbackImagePreviewForModule(preview))}
    />
  );
}

function FeedbackCommentComposer({
  currentMember,
  currentUserAvatarUrl,
  currentUserId,
  draft,
  mentionableUsers,
  mode,
  onCancelMode,
  onDraftChange,
  onSubmit,
  onUploadAttachment,
}: {
  currentMember: string;
  currentUserAvatarUrl?: string | null;
  currentUserId: string;
  draft: FeedbackCommentDraft;
  mentionableUsers: FeedbackCommentMentionUser[];
  mode: FeedbackCommentDraftMode;
  onCancelMode: () => void;
  onDraftChange: (draft: FeedbackCommentDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<{ markdown: string; previewUrl?: string | null } | null>;
}) {
  return (
    <CommentComposer
      currentMember={currentMember}
      currentUserAvatarUrl={currentUserAvatarUrl}
      currentUserId={currentUserId}
      draft={draft as OrfRichTextDraft}
      mentionableUsers={feedbackMentionUsersForHost(mentionableUsers)}
      mode={mode}
      onCancelMode={onCancelMode}
      onDraftChange={(nextDraft) => onDraftChange(nextDraft)}
      onSubmit={onSubmit}
      onUploadAttachment={onUploadAttachment}
    />
  );
}

function FeedbackCommentDraftFields({
  currentUserId,
  draft,
  idleHint,
  mentionableUsers,
  onDraftChange,
  onUploadAttachment,
  placeholder = "添加评论...",
  showSubmitButton,
  submitLabel = "发送评论",
  submitOnEnter,
}: {
  currentUserId: string;
  draft: FeedbackCommentDraft;
  idleHint?: string;
  mentionableUsers: FeedbackCommentMentionUser[];
  onDraftChange: (draft: FeedbackCommentDraft) => void;
  onUploadAttachment: (file: File) => Promise<{ markdown: string; previewUrl?: string | null } | null>;
  placeholder?: string;
  showSubmitButton?: boolean;
  submitLabel?: string;
  submitOnEnter?: boolean;
}) {
  return (
    <CommentDraftFields
      currentUserId={currentUserId}
      draft={draft as OrfRichTextDraft}
      idleHint={idleHint}
      mentionableUsers={feedbackMentionUsersForHost(mentionableUsers)}
      onDraftChange={(nextDraft) => onDraftChange(nextDraft)}
      onUploadAttachment={onUploadAttachment}
      placeholder={placeholder}
      showSubmitButton={showSubmitButton}
      submitLabel={submitLabel}
      submitOnEnter={submitOnEnter}
    />
  );
}

function FeedbackCommentInlineEditor({
  currentUserId,
  draft,
  mentionableUsers,
  onCancel,
  onDraftChange,
  onSubmit,
  onUploadAttachment,
}: {
  currentUserId: string;
  draft: FeedbackCommentDraft;
  mentionableUsers: FeedbackCommentMentionUser[];
  onCancel: () => void;
  onDraftChange: (draft: FeedbackCommentDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<{ markdown: string; previewUrl?: string | null } | null>;
}) {
  return (
    <CommentInlineEditor
      currentUserId={currentUserId}
      draft={draft as OrfRichTextDraft}
      mentionableUsers={feedbackMentionUsersForHost(mentionableUsers)}
      onCancel={onCancel}
      onDraftChange={(nextDraft) => onDraftChange(nextDraft)}
      onSubmit={onSubmit}
      onUploadAttachment={onUploadAttachment}
    />
  );
}

function feedbackAttachmentsForHost(attachments: readonly FeedbackWebAttachment[]): CommentAttachment[] {
  return attachments.map((attachment) => ({
    contentUrl: attachment.contentUrl,
    downloadUrl: attachment.downloadUrl,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    id: attachment.id,
    mimeType: attachment.mimeType,
    previewKind: attachment.previewKind,
    previewUrl: attachment.previewUrl,
  }));
}

function feedbackMentionUsersForHost(users: readonly FeedbackCommentMentionUser[]): CommentMentionUser[] {
  return users.map((user) => ({
    avatarUrl: user.avatarUrl ?? null,
    email: user.email ?? "",
    id: user.id,
    name: user.name,
    role: user.role,
    status: user.status,
  }));
}

function feedbackMentionUsersByIdForHost(usersById: ReadonlyMap<string, FeedbackCommentMentionUser>) {
  return new Map(feedbackMentionUsersForHost([...usersById.values()]).map((user) => [user.id, user]));
}

function feedbackImagePreviewForModule(preview: ImagePreview): FeedbackImagePreview {
  return {
    alt: preview.alt,
    copySourceUrl: preview.copySourceUrl ?? undefined,
    downloadFileName: preview.downloadFileName ?? undefined,
    downloadUrl: preview.downloadUrl ?? preview.src,
    label: preview.label,
    mimeType: preview.mimeType ?? undefined,
    src: preview.src,
  };
}
