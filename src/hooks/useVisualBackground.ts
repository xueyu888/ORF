import { useEffect, useState } from "react";
import { getVisualBackgrounds, type VisualBackgroundScene } from "../state/apiClient";
import { pickVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs } from "../utils/visualBackgrounds";

export function useVisualBackground(scene: VisualBackgroundScene, fallbackUrl: string) {
  const [backgroundUrl, setBackgroundUrl] = useState(fallbackUrl);

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
      void getVisualBackgrounds(scene)
        .then((data) => {
          if (cancelled) {
            return;
          }

          setBackgroundUrl(pickVisualBackground(data)?.url ?? fallbackUrl);

          const intervalMs = visualBackgroundIntervalMs(data);
          if (intervalMs) {
            intervalId = window.setInterval(() => {
              setBackgroundUrl(pickVisualBackground(data)?.url ?? fallbackUrl);
            }, intervalMs);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBackgroundUrl(fallbackUrl);
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
  }, [fallbackUrl, scene]);

  return backgroundUrl;
}
