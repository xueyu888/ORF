export function feedbackMarkdownToPlainText(value: string, options: { attachmentText?: string } = {}) {
  const attachmentText = options.attachmentText ?? "[附件]";
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, attachmentText)
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
