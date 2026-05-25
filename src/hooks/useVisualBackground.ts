import { useEffect, useState } from "react";
import { getVisualBackgrounds, type VisualBackgroundScene } from "../state/apiClient";
import { pickVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs } from "../utils/visualBackgrounds";

type VisualBackgroundLoadState =
  | { status: "loading"; url: null; error: null }
  | { status: "ready"; url: string; error: null }
  | { status: "error"; url: null; error: Error };

function visualBackgroundError(scene: VisualBackgroundScene, error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(`Failed to load ${scene} visual background`);
}

function requiredVisualBackgroundUrl(scene: VisualBackgroundScene, data: Awaited<ReturnType<typeof getVisualBackgrounds>>) {
  const background = pickVisualBackground(data);
  if (!background) {
    throw new Error(`No visual background image is configured for ${scene}`);
  }

  return background.url;
}

export function useVisualBackground(scene: VisualBackgroundScene) {
  const [background, setBackground] = useState<VisualBackgroundLoadState>({ status: "loading", url: null, error: null });

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
      clearRotationTimer();
      setBackground((current) => (current.status === "ready" ? current : { status: "loading", url: null, error: null }));

      const applyBackground = (data: Awaited<ReturnType<typeof getVisualBackgrounds>>) => {
        try {
          setBackground({ status: "ready", url: requiredVisualBackgroundUrl(scene, data), error: null });
        } catch (error) {
          setBackground({ status: "error", url: null, error: visualBackgroundError(scene, error) });
        }
      };

      void getVisualBackgrounds(scene)
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
            setBackground({ status: "error", url: null, error: visualBackgroundError(scene, error) });
          }
        });
    };

    loadBackground();
    const unsubscribe = subscribeVisualBackgroundChanged(scene, loadBackground);

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
    };
  }, [scene]);

  return background;
}
