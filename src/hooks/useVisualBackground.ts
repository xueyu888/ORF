import { useEffect, useState } from "react";
import { getPersonalBackgrounds, getVisualBackgrounds, type VisualBackgroundScene } from "../state/apiClient";
import { pickVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs, type VisualBackgroundSelection } from "../utils/visualBackgrounds";

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

function loadVisualBackgrounds(scene: VisualBackgroundScene) {
  return scene === "login_background" ? getVisualBackgrounds(scene) : getPersonalBackgrounds(scene);
}

export function useVisualBackground(scene: VisualBackgroundScene | null) {
  const [background, setBackground] = useState<VisualBackgroundLoadState>({ status: "loading", selection: null, url: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const clearRotationTimer = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const loadBackground = () => {
      if (!scene) {
        clearRotationTimer();
        setBackground({ status: "empty", selection: null, url: null, error: null });
        return;
      }

      clearRotationTimer();
      setBackground((current) => (current.status === "ready" ? current : { status: "loading", selection: null, url: null, error: null }));

      const applyBackground = (data: Awaited<ReturnType<typeof getVisualBackgrounds>>) => {
        const selection = pickVisualBackground(data);
        if (!selection) {
          setBackground({ status: "empty", selection: null, url: null, error: null });
          return;
        }
        setBackground({ status: "ready", selection, url: selection.url, error: null });
      };

      void loadVisualBackgrounds(scene)
        .then((data) => {
          if (cancelled) {
            return;
          }

          applyBackground(data);

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

    loadBackground();
    const unsubscribe = scene ? subscribeVisualBackgroundChanged(scene, loadBackground) : () => undefined;

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
    };
  }, [scene]);

  return background;
}
