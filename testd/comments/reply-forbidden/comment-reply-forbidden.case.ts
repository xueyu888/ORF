import { createReverseCommentCaseVariants } from "../_support/comment.reverse-case-factory";

export const commentReplyForbiddenCases = createReverseCommentCaseVariants({
  actorLabel: "非参与普通成员",
  id: "comments.reply.non-participant-forbidden",
  kind: "reply-forbidden",
  secondaryLabel: "目标参与成员",
  slug: "reply-forbidden",
  tags: ["comments", "reply", "member", "forbidden"],
  title: "评论回复-非参与成员不可回复",
});
