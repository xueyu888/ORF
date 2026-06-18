import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const commentImageUploadInvalidCases = createReverseCommentCaseVariants({
  actorLabel: "普通成员",
  id: "comments.image-upload.invalid-file",
  kind: "image-invalid-file",
  slug: "image-upload-invalid",
  tags: ["comments", "attachment-upload", "non-image"],
  title: "评论上传非图片附件",
});
