import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const memberCreateCommentCases = createCommentCaseVariants({
  actorRole: "member",
  id: "comments.member-create",
  kind: "create",
  slug: "member-create",
  tags: ["comments", "create", "member", "happy-path"],
  title: "成员新增评论",
});
