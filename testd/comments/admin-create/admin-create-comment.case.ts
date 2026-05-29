import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const adminCreateCommentCases = createCommentCaseVariants({
  actorRole: "admin",
  id: "comments.admin-create",
  kind: "create",
  slug: "admin-create",
  tags: ["comments", "create", "admin", "happy-path"],
  title: "管理员新增评论",
});
