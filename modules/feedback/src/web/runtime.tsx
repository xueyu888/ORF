import { createContext, useContext, type ComponentType, type FormEvent, type ReactNode } from "react";
import type {
  FeedbackWebAttachment,
  FeedbackWebCommentMessage,
  FeedbackWebCommentThread,
  FeedbackWebUser,
} from "./types";

export type FeedbackCommentDraft = unknown;
export type FeedbackCommentDraftMode =
  | { type: "default" }
  | { rootMessageId: string; targetAuthor: string; targetMessageId: string; type: "reply" };
export type FeedbackCommentMentionUser = FeedbackWebUser;
export type FeedbackImagePreview = {
  alt: string;
  copySourceUrl?: string;
  downloadFileName?: string;
  downloadUrl: string;
  label: string;
  mimeType?: string | null;
  src: string;
};

export type FeedbackWebSession = {
  canManageAllComments: boolean;
  currentUser: FeedbackWebUser | null;
  feedbackInvalidationKey: string;
  notify: (message: string) => void;
  addComment(input: {
    body: string;
    parentMessageId?: string;
    replyToAuthor?: string;
    replyToMessageId?: string;
    targetId: string;
    targetTitle: string;
    targetType: "feedback";
  }): Promise<boolean>;
  loadCommentMentionableUsers(input: { targetId: string; targetType: "feedback" }): Promise<FeedbackWebUser[]>;
  updateCommentMessage(threadId: string, messageId: string, body: string): Promise<boolean>;
  uploadCommentAttachment(input: { file: File; targetId: string; targetType: "feedback" }): Promise<{
    attachment: FeedbackWebAttachment;
    markdown: string;
  } | null>;
};

export type FeedbackWebHost = {
  components: {
    CommentBodyText: ComponentType<{
      attachments?: FeedbackWebAttachment[];
      body: string;
      mentionUsersById: Map<string, FeedbackCommentMentionUser>;
      onOpenImage: (preview: FeedbackImagePreview) => void;
    }>;
    CommentComposer: ComponentType<{
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
    }>;
    CommentDraftFields: ComponentType<{
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
    }>;
    CommentInlineEditor: ComponentType<{
      currentUserId: string;
      draft: FeedbackCommentDraft;
      mentionableUsers: FeedbackCommentMentionUser[];
      onCancel: () => void;
      onDraftChange: (draft: FeedbackCommentDraft) => void;
      onSubmit: (event: FormEvent) => void;
      onUploadAttachment: (file: File) => Promise<{ markdown: string; previewUrl?: string | null } | null>;
    }>;
    ImagePreviewDialog: ComponentType<{
      navigation?: {
        canGoNext: boolean;
        canGoPrevious: boolean;
        counterLabel: string;
        onGoNext: () => void;
        onGoPrevious: () => void;
      };
      onClose: () => void;
      preview: FeedbackImagePreview;
    }>;
    RelatedResourcesPanel: ComponentType<{
      canEdit: boolean;
      contextId: string;
      contextType: "feedback";
      notify: (message: string) => void;
    }>;
    UserAvatar: ComponentType<{
      avatarUrl?: string | null;
      className?: string;
      frame?: boolean;
      name: string;
    }>;
  };
  commentDraft: {
    empty(): FeedbackCommentDraft;
    fromStoredBody(body: string, mentionUsersById: Map<string, FeedbackCommentMentionUser>): FeedbackCommentDraft;
    serialize(draft: FeedbackCommentDraft): string;
    validPendingAttachmentIds(draft: FeedbackCommentDraft): string[];
  };
  useSession(): FeedbackWebSession;
};

const FeedbackWebHostContext = createContext<FeedbackWebHost | null>(null);

export function FeedbackWebHostProvider({ children, host }: { children: ReactNode; host: FeedbackWebHost }) {
  return <FeedbackWebHostContext.Provider value={host}>{children}</FeedbackWebHostContext.Provider>;
}

export function useFeedbackWebHost() {
  const host = useContext(FeedbackWebHostContext);
  if (!host) {
    throw new Error("Feedback web host is not configured");
  }
  return host;
}
