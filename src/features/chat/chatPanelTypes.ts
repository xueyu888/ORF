import type { ChatChannelType } from "../../types/orf";

export type ActivePanel = "thread" | "threads" | "info" | "search" | "pins" | "saved" | "files" | null;
export type ChatSearchScope = "all" | "current";
export type ChatSearchTypeFilter = ChatChannelType | "all";
