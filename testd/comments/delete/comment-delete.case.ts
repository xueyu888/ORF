import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const commentDeleteCases = createCommentCaseVariants({
  actorRole: "member",
  id: "comments.delete",
  kind: "delete",
  slug: "delete",
  tags: ["comments", "delete", "member", "happy-path"],
  title: "评论删除",
});
