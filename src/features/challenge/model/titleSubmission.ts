export type TitleSubmissionContext = {
  origin: "submit" | "blur";
};

export function shouldCancelEmptyCreationDraft(title: string, context: TitleSubmissionContext) {
  return context.origin === "blur" && title.trim().length === 0;
}
