import { mergeAttributes, Node } from "@tiptap/core";

export const OrfMentionNode = Node.create({
  name: "orfMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: {
        default: "",
      },
      label: {
        default: "成员",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-orf-mention]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-orf-mention": HTMLAttributes.id,
        class: "orf-rich-text-mention",
      }),
      `@${HTMLAttributes.label || "成员"}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label || "成员"}`;
  },
});

export const OrfAttachmentImageNode = Node.create({
  name: "orfAttachmentImage",
  group: "block",
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      alt: {
        default: "图片",
      },
      attachmentId: {
        default: null,
      },
      pendingAttachmentId: {
        default: null,
      },
      src: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-orf-attachment-image]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const attachmentId = HTMLAttributes.attachmentId || HTMLAttributes.pendingAttachmentId || "";
    const label = HTMLAttributes.alt || "图片";
    const src = typeof HTMLAttributes.src === "string" && HTMLAttributes.src ? HTMLAttributes.src : "";
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-orf-attachment-image": attachmentId,
        class: "orf-rich-text-attachment-node",
      }),
      src
        ? ["img", { alt: label, class: "orf-rich-text-attachment-image", contenteditable: "false", draggable: "false", src }]
        : ["div", { class: "orf-rich-text-attachment-preview", contenteditable: "false" }, ["span", {}, label]],
    ];
  },

  renderText({ node }) {
    return node.attrs.alt || "图片";
  },
});
