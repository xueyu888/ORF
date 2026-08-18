import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage } from "../../types/orf";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";
import { orfRichTextMarkdownToPortableMarkdown } from "../rich-text/orfRichTextMarkdown";

export type ChatMessageClipboardPayload = {
  html: string;
  text: string;
};

type ClipboardWriter = {
  write?: (items: ClipboardItem[]) => Promise<void>;
  writeText: (text: string) => Promise<void>;
};

type ClipboardItemFactory = new (items: Record<string, Blob>) => ClipboardItem;

function chatAttachmentCopyLabel(fileName: string) {
  return `[附件] ${fileName}`;
}

function chatMessagePortableMarkdown(message: Pick<ChatMessage, "attachments" | "body">) {
  const body = orfRichTextMarkdownToPortableMarkdown(message.body, {
    attachmentText: (reference) => `[图片] ${reference.alt}`,
  });
  const attachmentLines = message.attachments.map((attachment) => chatAttachmentCopyLabel(attachment.fileName));
  return [body, ...attachmentLines].filter(Boolean).join("\n\n");
}

function chatAttachmentClipboardHtml(fileName: string) {
  return renderToStaticMarkup(createElement("p", null, chatAttachmentCopyLabel(fileName)));
}

export function chatMessageClipboardPayload(
  message: Pick<ChatMessage, "attachments" | "body">,
): ChatMessageClipboardPayload {
  const body = orfRichTextMarkdownToPortableMarkdown(message.body, {
    attachmentText: (reference) => `[图片] ${reference.alt}`,
  });
  const bodyHtml = body
    ? renderToStaticMarkup(createElement(OrfRichTextMarkdownViewer, { body }))
    : "";
  const attachmentHtml = message.attachments
    .map((attachment) => chatAttachmentClipboardHtml(attachment.fileName))
    .join("");
  return {
    html: `<div data-orf-chat-message-copy="true">${bodyHtml}${attachmentHtml}</div>`,
    text: chatMessagePortableMarkdown(message),
  };
}

export async function writeChatMessageClipboard(
  payload: ChatMessageClipboardPayload,
  clipboard: ClipboardWriter = navigator.clipboard,
  ClipboardItemClass: ClipboardItemFactory | undefined = globalThis.ClipboardItem,
) {
  if (clipboard.write && ClipboardItemClass) {
    try {
      await clipboard.write([
        new ClipboardItemClass({
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([payload.text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Some WebViews expose ClipboardItem but reject rich MIME writes.
      // The same portable Markdown remains the single fallback projection.
    }
  }
  await clipboard.writeText(payload.text);
}
