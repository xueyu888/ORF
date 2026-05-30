import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const commentEditCases = createCommentCaseVariants({
  actorRole: "member",
  id: "comments.edit",
  kind: "edit",
  slug: "edit",
  tags: ["comments", "edit", "member", "happy-path"],
  title: "评论编辑",
});
