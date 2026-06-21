import {
  defaultVisualBackgroundCrop,
  normalizeVisualBackgroundCrop,
  type VisualBackgroundCrop,
} from "../domain/settings/visualBackgrounds";
import type { VisualBackgroundImage, VisualBackgroundScene, VisualBackgroundsData } from "../state/apiClient";

const rotationStoragePrefix = "orf.visualBackgroundRotation";
const visualBackgroundChangedEvent = "orf:visual-background-changed";

export type VisualBackgroundSelection = {
  crop: VisualBackgroundCrop;
  image: VisualBackgroundImage;
  overlayOpacity: number;
  url: string;
};

function rotationStorageKey(scene: VisualBackgroundScene) {
  return `${rotationStoragePrefix}.${scene}`;
}

function readStoredIndex(scene: VisualBackgroundScene) {
  const rawValue = window.localStorage.getItem(rotationStorageKey(scene));
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : -1;
}

function writeStoredIndex(scene: VisualBackgroundScene, index: number) {
  window.localStorage.setItem(rotationStorageKey(scene), String(index));
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

  return (readStoredIndex(data.scene) + 1) % data.list.length;
}

export function cropForVisualBackground(data: VisualBackgroundsData, imageId: string | null | undefined) {
  return imageId ? normalizeVisualBackgroundCrop(data.config.crops[imageId]) : defaultVisualBackgroundCrop;
}

export function pickVisualBackground(data: VisualBackgroundsData): VisualBackgroundSelection | null {
  let image: VisualBackgroundImage | null = null;
  if (data.config.mode === "fixed") {
    image = fixedBackground(data);
  } else {
    const nextIndex = nextSwitchableIndex(data);
    if (nextIndex >= 0) {
      image = data.list[nextIndex] ?? null;
    }
  }

  if (!image) {
    return null;
  }

  if (data.config.mode !== "fixed") {
    writeStoredIndex(data.scene, data.list.findIndex((background) => background.id === image?.id));
  }

  return {
    crop: cropForVisualBackground(data, image.id),
    image,
    overlayOpacity: data.config.overlayOpacity,
    url: image.url,
  };
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

export function subscribeVisualBackgroundChanged(scene: VisualBackgroundScene, listener: () => void) {
  const handler = (event: Event) => {
    const detail = event instanceof CustomEvent ? (event.detail as { scene?: VisualBackgroundScene } | undefined) : undefined;
    if (detail?.scene === scene) {
      listener();
    }
  };

  window.addEventListener(visualBackgroundChangedEvent, handler);
  return () => window.removeEventListener(visualBackgroundChangedEvent, handler);
}
