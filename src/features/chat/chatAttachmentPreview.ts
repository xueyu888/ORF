import type { ChatAttachment } from "../../types/orf";

export type ChatAttachmentPreviewState =
  | { kind: "file"; attachment: ChatAttachment }
  | { kind: "image"; currentIndex: number; images: ChatAttachment[] };
export type ChatAttachmentFilePreviewState = Extract<ChatAttachmentPreviewState, { kind: "file" }>;
export type ChatAttachmentImagePreviewState = Extract<ChatAttachmentPreviewState, { kind: "image" }>;

export type ChatAttachmentPreviewHandler = (
  attachment: ChatAttachment,
  messageAttachments: readonly ChatAttachment[],
) => void;

export function createChatAttachmentPreviewState(
  messageAttachments: readonly ChatAttachment[],
  selectedAttachment: ChatAttachment,
): ChatAttachmentPreviewState {
  if (!isChatImageAttachment(selectedAttachment)) {
    return { kind: "file", attachment: selectedAttachment };
  }

  const imageAttachments = messageAttachments.filter(isChatImageAttachment);
  const images = imageAttachments.some((attachment) => attachment.id === selectedAttachment.id)
    ? imageAttachments
    : [selectedAttachment];
  const selectedIndex = images.findIndex((attachment) => attachment.id === selectedAttachment.id);
  return {
    kind: "image",
    currentIndex: selectedIndex >= 0 ? selectedIndex : 0,
    images,
  };
}

export function moveChatAttachmentPreviewImage(
  preview: ChatAttachmentImagePreviewState,
  direction: -1 | 1,
): ChatAttachmentImagePreviewState;
export function moveChatAttachmentPreviewImage(
  preview: ChatAttachmentPreviewState,
  direction: -1 | 1,
): ChatAttachmentPreviewState;
export function moveChatAttachmentPreviewImage(
  preview: ChatAttachmentPreviewState,
  direction: -1 | 1,
) {
  if (preview.kind !== "image") return preview;
  const lastIndex = preview.images.length - 1;
  const currentIndex = clampPreviewIndex(preview.currentIndex, lastIndex);
  const nextIndex = clampPreviewIndex(currentIndex + direction, lastIndex);
  return nextIndex === preview.currentIndex ? preview : { ...preview, currentIndex: nextIndex };
}

export function selectChatAttachmentPreviewImage(
  preview: ChatAttachmentImagePreviewState,
  index: number,
): ChatAttachmentImagePreviewState {
  const nextIndex = clampPreviewIndex(index, preview.images.length - 1);
  return nextIndex === preview.currentIndex ? preview : { ...preview, currentIndex: nextIndex };
}

export function currentChatAttachmentPreviewImage(preview: ChatAttachmentPreviewState) {
  if (preview.kind !== "image") return null;
  return preview.images[clampPreviewIndex(preview.currentIndex, preview.images.length - 1)] ?? null;
}

function isChatImageAttachment(attachment: ChatAttachment) {
  return attachment.previewKind === "image";
}

function clampPreviewIndex(index: number, lastIndex: number) {
  if (lastIndex <= 0) return 0;
  return Math.min(Math.max(index, 0), lastIndex);
}
