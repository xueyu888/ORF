import { useLayoutEffect, useState } from "react";
import { getVisualBackgrounds, type VisualBackgroundScene, type VisualBackgroundsData } from "../state/apiClient";
import { loadPersonalBackground, personalBackgroundSnapshot } from "../state/readModelQueries";
import { pickVisualBackground, prepareVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs, type VisualBackgroundSelection } from "../utils/visualBackgrounds";

type VisualBackgroundLoadState =
  | { status: "loading"; selection: null; url: null; error: null }
  | { status: "ready"; selection: VisualBackgroundSelection; url: string; error: null }
  | { status: "empty"; selection: null; url: null; error: null }
  | { status: "error"; selection: null; url: null; error: Error };

type VisualBackgroundSnapshot = {
  scene: VisualBackgroundScene | null;
  state: VisualBackgroundLoadState;
};

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

export function useVisualBackground(scene: VisualBackgroundScene | null): VisualBackgroundLoadState {
  const [snapshot, setSnapshot] = useState<VisualBackgroundSnapshot>(() => {
    const cached = cachedVisualBackgrounds(scene);
    const state: VisualBackgroundLoadState = cached
      ? preparedVisualBackgroundState(cached)
      : scene
        ? { status: "loading", selection: null, url: null, error: null }
        : { status: "empty", selection: null, url: null, error: null };
    return { scene, state };
  });

  useLayoutEffect(() => {
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
        setSnapshot({ scene, state: { status: "empty", selection: null, url: null, error: null } });
        return;
      }

      clearRotationTimer();
      const cached = cachedVisualBackgrounds(scene);
      if (cached && !force) {
        setSnapshot({ scene, state: visualBackgroundState(cached) });
      } else if (force) {
        setSnapshot((current) => current.scene === scene && current.state.status === "ready"
          ? current
          : { scene, state: { status: "loading", selection: null, url: null, error: null } });
      } else {
        setSnapshot({ scene, state: { status: "loading", selection: null, url: null, error: null } });
      }

      const applyBackground = (data: Awaited<ReturnType<typeof getVisualBackgrounds>>) => {
        setSnapshot({ scene, state: visualBackgroundState(data) });
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
            setSnapshot({ scene, state: { status: "error", selection: null, url: null, error: visualBackgroundError(scene, error) } });
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

  if (snapshot.scene === scene) return snapshot.state;
  return scene
    ? { status: "loading", selection: null, url: null, error: null }
    : { status: "empty", selection: null, url: null, error: null };
}
