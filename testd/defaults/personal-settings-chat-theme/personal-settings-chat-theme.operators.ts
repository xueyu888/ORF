import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsChatThemeCaseData, TestContext } from "./_support/personal-settings-chat-theme.context";
import {
  readChatThemeByEmail,
  setChatThemeByEmail,
  setDefaultLandingPathByEmail,
  type ChatThemePreference,
} from "./_support/personal-settings-chat-theme.helpers";

type ChatThemeSnapshot = {
  backgroundColor: string;
  chatPage: boolean;
  pageUrl: string;
  savedTheme?: ChatThemePreference | null;
  theme: ChatThemePreference | null;
};

export const personalSettingsChatThemeOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "user.preferences": {
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
    set_chat_theme_by_email: async ({ params }) => {
      await setChatThemeByEmail(requiredString(params, "email"), requiredChatTheme(params, "theme"));
    },
    chat_theme_is: async ({ params }) => {
      await expect.poll(() => readChatThemeByEmail(requiredString(params, "email"))).toBe(requiredChatTheme(params, "theme"));
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.chat_theme": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "聊天界面主题")).toHaveValue(valueForChatThemeLabel(requiredString(params, "label")));
    },
    enabled: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "聊天界面主题")).toBeEnabled();
    },
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      const email = requiredString(params, "email");
      const theme = valueForChatThemeLabel(label);
      await settingsSelect(ctx.page, "聊天界面主题").selectOption({ label });
      await expect(settingsSelect(ctx.page, "聊天界面主题")).toHaveValue(theme);
      await expect.poll(() => readChatThemeByEmail(email)).toBe(theme);
      return {
        backgroundColor: "",
        chatPage: false,
        pageUrl: ctx.page.url(),
        savedTheme: await readChatThemeByEmail(email),
        theme,
      } satisfies ChatThemeSnapshot;
    },
  },
  chat_page: {
    open: async ({ ctx }) => {
      await ctx.page.goto("/chat");
      await expect(ctx.page).toHaveURL(/\/chat$/);
      await expect(chatPage(ctx.page)).toBeVisible();
      return captureChatThemeSnapshot(ctx.page);
    },
  },
  chat_theme_snapshot: {
    page_matches: async ({ params }) => {
      const snapshot = requiredChatThemeSnapshot(params, "snapshot");
      expect(snapshot.chatPage).toBe(true);
      expect(snapshot.pageUrl).toMatch(new RegExp(requiredString(params, "pattern")));
    },
    theme: async ({ params }) => {
      const snapshot = requiredChatThemeSnapshot(params, "snapshot");
      expect(snapshot.theme).toBe(requiredChatTheme(params, "theme"));
    },
    background: async ({ params }) => {
      const snapshot = requiredChatThemeSnapshot(params, "snapshot");
      const tone = requiredString(params, "tone");
      if (tone === "dark") {
        expect(backgroundIsDark(snapshot.backgroundColor)).toBe(true);
        return;
      }
      if (tone === "light") {
        expect(snapshot.theme).toBe("light");
        expect(backgroundIsDark(snapshot.backgroundColor)).toBe(false);
        return;
      }
      throw new Error(`未支持的聊天界面背景色调: ${tone}`);
    },
    saved_theme: async ({ params }) => {
      const snapshot = requiredChatThemeSnapshot(params, "snapshot");
      expect(snapshot.savedTheme).toBe(requiredChatTheme(params, "theme"));
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsChatThemeCaseData>;

function settingsBlock(page: Page, label: string) {
  return page.locator("label").filter({ hasText: label }).first();
}

function settingsSelect(page: Page, label: string) {
  return settingsBlock(page, label).locator("select");
}

function appShell(page: Page) {
  return page.locator(".orf-app-shell").first();
}

function chatPage(page: Page) {
  return page.locator(".orf-chat-page").first();
}

async function captureChatThemeSnapshot(page: Page): Promise<ChatThemeSnapshot> {
  const shell = appShell(page);
  await expect(shell).toHaveAttribute("data-chat-page", "true");
  const theme = await shell.getAttribute("data-chat-theme");
  const backgroundColor = await chatPage(page).evaluate((element) => window.getComputedStyle(element).backgroundColor);
  return {
    backgroundColor,
    chatPage: (await shell.getAttribute("data-chat-page")) === "true",
    pageUrl: page.url(),
    theme: theme === "dark" || theme === "light" ? theme : null,
  };
}

function valueForChatThemeLabel(label: string): ChatThemePreference {
  switch (label) {
    case "舒适暗色":
      return "dark";
    case "经典浅色":
      return "light";
    default:
      throw new Error(`未支持的聊天界面主题选项: ${label}`);
  }
}

function requiredChatTheme(params: Record<string, unknown>, key: string): ChatThemePreference {
  const value = params[key];
  if (value === "dark" || value === "light") {
    return value;
  }
  throw new Error(`参数 ${key} 必须是 dark 或 light`);
}

function requiredChatThemeSnapshot(params: Record<string, unknown>, key: string): ChatThemeSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是聊天主题快照`);
  }
  return value as ChatThemeSnapshot;
}

function backgroundIsDark(color: string) {
  const rgb = parseRgb(color);
  if (!rgb) {
    return false;
  }
  return relativeLuminance(rgb) < 0.18;
}

function parseRgb(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([01]?(?:\.\d+)?))?/);
  if (!match) {
    return null;
  }
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha === 0) {
    return null;
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

async function installDesktopShellMock(page: Page) {
  await page.addInitScript(() => {
    const maximizedState = {
      isFocused: true,
      isFullScreen: false,
      isMaximized: true,
      isMinimized: false,
      isVisible: true,
    };
    window.orfDesktopShell = {
      closeWindow: async () => ({ data: maximizedState, status: "success" }),
      getWindowState: async () => ({ data: maximizedState, status: "success" }),
      minimizeWindow: async () => ({ data: { ...maximizedState, isMinimized: true }, status: "success" }),
      onWindowStateChange: () => () => undefined,
      setWorkbenchZoomLevel: async ({ level }) => ({ data: { level }, status: "success" }),
      toggleMaximizeWindow: async () => ({ data: maximizedState, status: "success" }),
    };
  });
}
