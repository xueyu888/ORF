import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const commentEditForbiddenCases = createReverseCommentCaseVariants({
  actorLabel: "非作者普通成员",
  id: "comments.edit.non-author-forbidden",
  kind: "edit-forbidden",
  secondaryLabel: "评论作者普通成员",
  slug: "edit-forbidden",
  tags: ["comments", "edit", "member", "forbidden"],
  title: "评论编辑-非作者不可编辑",
});
