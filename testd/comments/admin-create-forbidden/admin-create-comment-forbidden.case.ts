import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const adminCreateCommentForbiddenCases = createReverseCommentCaseVariants({
  actorLabel: "禁止评论普通成员",
  id: "comments.admin-create.member-unjoined-forbidden",
  kind: "admin-create-forbidden",
  secondaryLabel: "目标参与成员",
  slug: "admin-create-forbidden",
  tags: ["comments", "create", "member", "forbidden"],
  title: "管理员新增评论-普通成员不可评论未参与目标和任务",
});
