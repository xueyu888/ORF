import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const commentImageUploadCases = createCommentCaseVariants({
  actorRole: "member",
  id: "comments.image-upload",
  kind: "image",
  slug: "image-upload",
  tags: ["comments", "image-upload", "member", "happy-path"],
  title: "评论上传图片",
});
