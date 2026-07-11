import { useEffect, useState } from "react";
import { getVisualBackgrounds, type VisualBackgroundScene, type VisualBackgroundsData } from "../state/apiClient";
import { loadPersonalBackground, personalBackgroundSnapshot } from "../state/readModelQueries";
import { pickVisualBackground, prepareVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs, type VisualBackgroundSelection } from "../utils/visualBackgrounds";

type VisualBackgroundLoadState =
  | { status: "loading"; selection: null; url: null; error: null }
  | { status: "ready"; selection: VisualBackgroundSelection; url: string; error: null }
  | { status: "empty"; selection: null; url: null; error: null }
  | { status: "error"; selection: null; url: null; error: Error };

function visualBackgroundError(scene: VisualBackgroundScene, error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(`Failed to load ${scene} visual background`);
}

function loadVisualBackgrounds(scene: VisualBackgroundScene, force = false) {
  return scene === "login_background" ? getVisualBackgrounds(scene) : loadPersonalBackground(scene, { force });
}

function cachedVisualBackgrounds(scene: VisualBackgroundScene | null) {
  return scene && scene !== "login_background" ? personalBackgroundSnapshot(scene) : undefined;
}

function visualBackgroundState(data: VisualBackgroundsData): VisualBackgroundLoadState {
  const selection = pickVisualBackground(data);
  return selection
    ? { status: "ready", selection, url: selection.url, error: null }
    : { status: "empty", selection: null, url: null, error: null };
}

function preparedVisualBackgroundState(data: VisualBackgroundsData): VisualBackgroundLoadState {
  const selection = prepareVisualBackground(data);
  return selection
    ? { status: "ready", selection, url: selection.url, error: null }
    : { status: "empty", selection: null, url: null, error: null };
}

export function useVisualBackground(scene: VisualBackgroundScene | null) {
  const [background, setBackground] = useState<VisualBackgroundLoadState>(() => {
    const cached = cachedVisualBackgrounds(scene);
    if (cached) return preparedVisualBackgroundState(cached);
    return scene
      ? { status: "loading", selection: null, url: null, error: null }
      : { status: "empty", selection: null, url: null, error: null };
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const clearRotationTimer = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const loadBackground = (force = false) => {
      if (!scene) {
        clearRotationTimer();
        setBackground({ status: "empty", selection: null, url: null, error: null });
        return;
      }

      clearRotationTimer();
      const cached = cachedVisualBackgrounds(scene);
      if (cached && !force) {
        setBackground(visualBackgroundState(cached));
      } else if (force) {
        setBackground((current) => current.status === "ready"
          ? current
          : { status: "loading", selection: null, url: null, error: null });
      } else {
        setBackground({ status: "loading", selection: null, url: null, error: null });
      }

      const applyBackground = (data: Awaited<ReturnType<typeof getVisualBackgrounds>>) => {
        setBackground(visualBackgroundState(data));
      };

      void loadVisualBackgrounds(scene, force)
        .then((data) => {
          if (cancelled) {
            return;
          }

          if (force || data !== cached) applyBackground(data);

          const intervalMs = visualBackgroundIntervalMs(data);
          if (intervalMs) {
            intervalId = window.setInterval(() => {
              applyBackground(data);
            }, intervalMs);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setBackground({ status: "error", selection: null, url: null, error: visualBackgroundError(scene, error) });
          }
        });
    };

    loadBackground(false);
    const unsubscribe = scene ? subscribeVisualBackgroundChanged(scene, () => loadBackground(true)) : () => undefined;

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
    };
  }, [scene]);

  return background;
}
