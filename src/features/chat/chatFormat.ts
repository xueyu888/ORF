export { formatFileSize } from "../../utils/fileSize";

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDay(value: string) {
  const date = new Date(value);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    weekday: "short",
    year: "numeric",
  }).format(new Date(value));
}
