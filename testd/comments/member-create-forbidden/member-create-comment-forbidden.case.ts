import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const memberCreateCommentForbiddenCases = createReverseCommentCaseVariants({
  actorLabel: "非参与普通成员",
  id: "comments.member-create.non-participant-forbidden",
  kind: "member-create-forbidden",
  secondaryLabel: "目标参与成员",
  slug: "member-create-forbidden",
  tags: ["comments", "create", "member", "forbidden"],
  title: "成员新增评论-非参与成员不可新增评论",
});
