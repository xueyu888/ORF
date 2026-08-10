export function chatFloatingLayerRoot() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".orf-app-shell[data-chat-page='true']") ?? document.body;
}
