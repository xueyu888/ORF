import { createCommentCaseVariants } from "../_support/comment.case-factory";

export const commentReplyCases = createCommentCaseVariants({
  actorRole: "member",
  id: "comments.reply",
  kind: "reply",
  slug: "reply",
  tags: ["comments", "reply", "member", "happy-path"],
  title: "评论回复",
});
