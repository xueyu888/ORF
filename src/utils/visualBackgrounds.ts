import type { AppShellBackgroundSlot, VisualBackgroundImage, VisualBackgroundScene, VisualBackgroundsData } from "../state/apiClient";

const rotationStoragePrefix = "orf.visualBackgroundRotation";
const visualBackgroundChangedEvent = "orf:visual-background-changed";

function backgroundRotationKey(data: Pick<VisualBackgroundsData, "scene" | "slot">) {
  return data.slot ? `${data.scene}.${data.slot}` : data.scene;
}

function rotationStorageKey(data: Pick<VisualBackgroundsData, "scene" | "slot">) {
  return `${rotationStoragePrefix}.${backgroundRotationKey(data)}`;
}

function readStoredIndex(data: Pick<VisualBackgroundsData, "scene" | "slot">) {
  const rawValue = window.localStorage.getItem(rotationStorageKey(data));
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : -1;
}

function writeStoredIndex(data: Pick<VisualBackgroundsData, "scene" | "slot">, index: number) {
  window.localStorage.setItem(rotationStorageKey(data), String(index));
}

function fixedBackground(data: VisualBackgroundsData) {
  return data.list.find((background) => background.id === data.config.fixedBackgroundId) ?? data.list[0] ?? null;
}

function nextSwitchableIndex(data: VisualBackgroundsData) {
  if (data.list.length === 0) {
    return -1;
  }

  if (data.config.switchOrder === "random") {
    return Math.floor(Math.random() * data.list.length);
  }

  return (readStoredIndex(data) + 1) % data.list.length;
}

export function pickVisualBackground(data: VisualBackgroundsData): VisualBackgroundImage | null {
  if (data.config.mode === "fixed") {
    return fixedBackground(data);
  }

  const nextIndex = nextSwitchableIndex(data);
  if (nextIndex < 0) {
    return null;
  }

  writeStoredIndex(data, nextIndex);
  return data.list[nextIndex] ?? null;
}

export function visualBackgroundIntervalMs(data: VisualBackgroundsData) {
  if (data.config.mode !== "switchable" || data.config.switchTrigger !== "interval") {
    return null;
  }

  return Math.max(1, data.config.switchIntervalMinutes) * 60 * 1000;
}

export function dispatchVisualBackgroundChanged(scene: VisualBackgroundScene) {
  window.dispatchEvent(new CustomEvent(visualBackgroundChangedEvent, { detail: { scene } }));
}

export function dispatchAppShellBackgroundChanged(slot?: AppShellBackgroundSlot) {
  window.dispatchEvent(new CustomEvent(visualBackgroundChangedEvent, { detail: { scene: "app_background", slot } }));
}

export function subscribeVisualBackgroundChanged(scene: VisualBackgroundScene, listener: () => void, slot?: AppShellBackgroundSlot) {
  const handler = (event: Event) => {
    const detail = event instanceof CustomEvent ? (event.detail as { scene?: VisualBackgroundScene; slot?: AppShellBackgroundSlot } | undefined) : undefined;
    if (detail?.scene === scene && (!slot || !detail.slot || detail.slot === slot)) {
      listener();
    }
  };

  window.addEventListener(visualBackgroundChangedEvent, handler);
  return () => window.removeEventListener(visualBackgroundChangedEvent, handler);
}
