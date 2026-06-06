import { useEffect, useState } from "react";
import {
  getPersonalBackgrounds,
  getVisualBackgrounds,
  type AppShellBackgroundSlot,
  type VisualBackgroundPlacement,
  type VisualBackgroundScene,
  type VisualBackgroundsData,
} from "../state/apiClient";
import { pickVisualBackground, subscribeVisualBackgroundChanged, visualBackgroundIntervalMs } from "../utils/visualBackgrounds";

type VisualBackgroundLoadState =
  | { status: "loading"; url: null; error: null }
  | { status: "ready"; url: string; error: null }
  | { status: "error"; url: null; error: Error };

type AppShellBackgroundLoadState =
  | { status: "loading"; url: null; placement: VisualBackgroundPlacement; error: null }
  | { status: "ready"; url: string; placement: VisualBackgroundPlacement; error: null }
  | { status: "error"; url: null; placement: VisualBackgroundPlacement; error: Error };

const defaultBackgroundPlacement: VisualBackgroundPlacement = {
  positionX: 50,
  positionY: 50,
  scale: 1,
};

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

function requiredAppShellBackground(slot: AppShellBackgroundSlot, data: VisualBackgroundsData) {
  const background = pickVisualBackground(data);
  if (!background) {
    throw new Error(`No visual background image is configured for ${slot}`);
  }

  return {
    url: background.url,
    placement: data.config.placement ?? defaultBackgroundPlacement,
  };
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

export function useAppShellBackground(slot: AppShellBackgroundSlot) {
  const [background, setBackground] = useState<AppShellBackgroundLoadState>({
    status: "loading",
    url: null,
    placement: defaultBackgroundPlacement,
    error: null,
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

    const loadBackground = () => {
      clearRotationTimer();
      setBackground((current) =>
        current.status === "ready" ? current : { status: "loading", url: null, placement: defaultBackgroundPlacement, error: null },
      );

      const applyBackground = (data: VisualBackgroundsData) => {
        try {
          setBackground({ status: "ready", ...requiredAppShellBackground(slot, data), error: null });
        } catch (error) {
          setBackground({ status: "error", url: null, placement: defaultBackgroundPlacement, error: visualBackgroundError("app_background", error) });
        }
      };

      void getPersonalBackgrounds()
        .then((data) => {
          if (cancelled) {
            return;
          }
          const slotData = data.slots[slot];
          applyBackground(slotData);

          const intervalMs = visualBackgroundIntervalMs(slotData);
          if (intervalMs) {
            intervalId = window.setInterval(() => {
              applyBackground(slotData);
            }, intervalMs);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setBackground({ status: "error", url: null, placement: defaultBackgroundPlacement, error: visualBackgroundError("app_background", error) });
          }
        });
    };

    loadBackground();
    const unsubscribe = subscribeVisualBackgroundChanged("app_background", loadBackground, slot);

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
    };
  }, [slot]);

  return background;
}
