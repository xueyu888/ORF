import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const commentDeleteForbiddenCases = createReverseCommentCaseVariants({
  actorLabel: "非作者普通成员",
  id: "comments.delete.non-author-forbidden",
  kind: "delete-forbidden",
  secondaryLabel: "评论作者普通成员",
  slug: "delete-forbidden",
  tags: ["comments", "delete", "member", "forbidden"],
  title: "评论删除-非作者不可删除",
});
