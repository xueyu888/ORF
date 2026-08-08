export type FeedbackCommandResult =
  | { status: "ok"; changed: boolean }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "invalidAssignee" }
  | { status: "invalidProject" }
  | { status: "conflict" }
  | { status: "forbidden" };
