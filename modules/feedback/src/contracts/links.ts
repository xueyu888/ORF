export const feedbackRootPath = "/feedback" as const;
export const feedbackCreateBasePath = "/feedback/new" as const;
export const feedbackLabelsPath = "/feedback/labels" as const;
export const feedbackDetailPathTemplate = "/feedback/:feedbackId" as const;

export type FeedbackListHrefInput = {
  readonly assigneeUserId?: string | null;
  readonly label?: string | null;
  readonly sort?: string | null;
  readonly view?: string | null;
};

export function feedbackListPath(input?: FeedbackListHrefInput) {
  const query = new URLSearchParams();
  const view = input?.view?.trim();
  const assigneeUserId = input?.assigneeUserId?.trim();
  const sort = input?.sort?.trim();
  const label = input?.label?.trim();

  if (assigneeUserId) query.set("assignee", assigneeUserId);
  if (sort) query.set("sort", sort);
  if (view) query.set("view", view);
  if (label) query.set("label", label);

  const suffix = query.toString();
  return suffix ? `${feedbackRootPath}?${suffix}` : feedbackRootPath;
}

export function feedbackCreatePath(input?: { readonly projectId?: string | null }) {
  const projectId = input?.projectId?.trim();
  if (!projectId) {
    return feedbackCreateBasePath;
  }

  return `${feedbackCreateBasePath}?project=${encodeURIComponent(projectId)}`;
}

export function feedbackIssuePath(feedbackId: string) {
  return `${feedbackRootPath}/${encodeURIComponent(feedbackId)}`;
}

export function feedbackCommentPath(input: {
  readonly commentMessageId: string;
  readonly feedbackId: string;
}) {
  return `${feedbackIssuePath(input.feedbackId)}?comment=${encodeURIComponent(input.commentMessageId)}`;
}
