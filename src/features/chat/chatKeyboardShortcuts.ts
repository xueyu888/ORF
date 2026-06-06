export type ChatKeyboardShortcutKey = {
  code?: string;
  key?: string;
};

export function matchesChatShortcutKey(event: ChatKeyboardShortcutKey, shortcut: ChatKeyboardShortcutKey) {
  if (shortcut.key && event.key?.toLowerCase() === shortcut.key.toLowerCase()) return true;
  if (shortcut.code && event.code === shortcut.code) return true;
  return !shortcut.key && !shortcut.code;
}
