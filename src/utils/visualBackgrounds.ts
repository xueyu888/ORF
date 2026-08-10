import {
  defaultVisualBackgroundCrop,
  normalizeVisualBackgroundCrop,
  type VisualBackgroundCrop,
  type VisualMaterialPreferences,
} from "../domain/settings/visualBackgrounds";
import type { VisualBackgroundImage, VisualBackgroundScene, VisualBackgroundsData } from "../state/apiClient";

const rotationStoragePrefix = "orf.visualBackgroundRotation";
const visualBackgroundChangedEvent = "orf:visual-background-changed";
const preparedSelections = new Map<VisualBackgroundScene, { contract: string; imageId: string }>();

export type VisualBackgroundSelection = {
  crop: VisualBackgroundCrop;
  image: VisualBackgroundImage;
  material: VisualMaterialPreferences;
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

function selectionContract(data: VisualBackgroundsData) {
  return JSON.stringify({
    fixedBackgroundId: data.config.fixedBackgroundId,
    list: data.list.map((image) => [image.id, image.url]),
    mode: data.config.mode,
    switchOrder: data.config.switchOrder,
  });
}

function selectionForImage(data: VisualBackgroundsData, image: VisualBackgroundImage): VisualBackgroundSelection {
  return {
    crop: cropForVisualBackground(data, image.id),
    image,
    material: data.config.material,
    url: image.url,
  };
}

function selectVisualBackgroundImage(data: VisualBackgroundsData) {
  if (data.config.mode === "fixed") return fixedBackground(data);
  const nextIndex = nextSwitchableIndex(data);
  return nextIndex >= 0 ? data.list[nextIndex] ?? null : null;
}

function commitSwitchableSelection(data: VisualBackgroundsData, image: VisualBackgroundImage) {
  if (data.config.mode !== "fixed") {
    writeStoredIndex(data.scene, data.list.findIndex((background) => background.id === image.id));
  }
}

export function cropForVisualBackground(data: VisualBackgroundsData, imageId: string | null | undefined) {
  return imageId ? normalizeVisualBackgroundCrop(data.config.crops[imageId]) : defaultVisualBackgroundCrop;
}

export function pickVisualBackground(data: VisualBackgroundsData): VisualBackgroundSelection | null {
  const prepared = preparedSelections.get(data.scene);
  if (prepared?.contract === selectionContract(data)) {
    const preparedImage = data.list.find((image) => image.id === prepared.imageId) ?? null;
    preparedSelections.delete(data.scene);
    if (preparedImage) {
      commitSwitchableSelection(data, preparedImage);
      return selectionForImage(data, preparedImage);
    }
  }
  preparedSelections.delete(data.scene);

  const image = selectVisualBackgroundImage(data);
  if (!image) {
    return null;
  }
  commitSwitchableSelection(data, image);
  return selectionForImage(data, image);
}

export function prepareVisualBackground(data: VisualBackgroundsData): VisualBackgroundSelection | null {
  const contract = selectionContract(data);
  const prepared = preparedSelections.get(data.scene);
  const image = prepared?.contract === contract
    ? data.list.find((item) => item.id === prepared.imageId) ?? null
    : selectVisualBackgroundImage(data);
  if (!image) {
    preparedSelections.delete(data.scene);
    return null;
  }
  preparedSelections.set(data.scene, { contract, imageId: image.id });
  return selectionForImage(data, image);
}

export function clearPreparedVisualBackgrounds() {
  preparedSelections.clear();
}

export function visualBackgroundIntervalMs(data: VisualBackgroundsData) {
  if (data.config.mode !== "switchable" || data.config.switchTrigger !== "interval") {
    return null;
  }

  return Math.max(1, data.config.switchIntervalMinutes) * 60 * 1000;
}

export function dispatchVisualBackgroundChanged(scene: VisualBackgroundScene) {
  preparedSelections.delete(scene);
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
