import { z } from "zod";

export const chatThemeSchema = z.enum(["dark", "light"]);

export type ChatTheme = z.infer<typeof chatThemeSchema>;

export const defaultChatTheme: ChatTheme = "dark";
