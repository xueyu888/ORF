import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getVisualBackgrounds, type VisualBackgroundScene, type VisualBackgroundsData } from "../state/apiClient";
import {
  cacheVisualBackgroundSelection,
  clearCachedVisualBackgroundSelection,
  readCachedVisualBackgroundSelection,
  releaseCachedVisualBackgroundSelection,
  type CachedVisualBackgroundSelection,
} from "../features/appearance/background/visualBackgroundCache";
import { subscribeVisualBackgroundChanged } from "../features/appearance/background/visualBackgroundRuntime";
import { loadPersonalBackground, personalBackgroundSnapshot } from "../state/readModelQueries";
import { pickVisualBackground, prepareVisualBackground, visualBackgroundIntervalMs, type VisualBackgroundSelection } from "../utils/visualBackgrounds";

type VisualBackgroundLoadState =
  | { status: "loading"; selection: null; url: null; error: null }
  | { status: "ready"; selection: VisualBackgroundSelection; url: string; error: null }
  | { status: "empty"; selection: null; url: null; error: null }
  | { status: "error"; selection: null; url: null; error: Error };

type VisualBackgroundSnapshot = {
  identity: string;
  state: VisualBackgroundLoadState;
};

function visualBackgroundIdentity(scene: VisualBackgroundScene | null, userId: string | null) {
  if (!scene) return "none";
  return scene === "login_background" ? `${scene}:public` : `${scene}:${userId ?? "anonymous"}`;
}

function visualBackgroundError(scene: VisualBackgroundScene, error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(`Failed to load ${scene} visual background`);
}

function loadVisualBackgrounds(scene: VisualBackgroundScene, userId: string | null, force = false) {
  if (scene === "login_background") return getVisualBackgrounds(scene);
  if (!userId) return Promise.reject(new Error(`Cannot load ${scene} without an authenticated user`));
  return loadPersonalBackground(userId, scene, { force });
}

function cachedVisualBackgrounds(scene: VisualBackgroundScene | null, userId: string | null) {
  return scene && scene !== "login_background" && userId ? personalBackgroundSnapshot(userId, scene) : undefined;
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

export function useVisualBackground(scene: VisualBackgroundScene | null, userId: string | null = null): VisualBackgroundLoadState {
  const identity = visualBackgroundIdentity(scene, userId);
  const retainedHydratedSelectionsRef = useRef(new Set<CachedVisualBackgroundSelection>());
  const [snapshot, setSnapshot] = useState<VisualBackgroundSnapshot>(() => {
    const cached = cachedVisualBackgrounds(scene, userId);
    const state: VisualBackgroundLoadState = cached
      ? preparedVisualBackgroundState(cached)
      : scene
        ? { status: "loading", selection: null, url: null, error: null }
        : { status: "empty", selection: null, url: null, error: null };
    return { identity, state };
  });

  useEffect(() => () => {
    for (const selection of retainedHydratedSelectionsRef.current) {
      releaseCachedVisualBackgroundSelection(selection);
    }
    retainedHydratedSelectionsRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    let hydratedSelection: CachedVisualBackgroundSelection | null = null;
    let intervalId: number | null = null;
    let loadGeneration = 0;
    const persistentUserId = scene && scene !== "login_background" ? userId : null;

    const clearRotationTimer = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const detachHydratedSelection = () => {
      hydratedSelection = null;
    };

    const loadBackground = (force = false) => {
      const generation = ++loadGeneration;
      let serverResolved = false;
      if (!scene) {
        clearRotationTimer();
        setSnapshot({ identity, state: { status: "empty", selection: null, url: null, error: null } });
        return;
      }

      clearRotationTimer();
      const cached = cachedVisualBackgrounds(scene, userId);
      if (cached && !force) {
        const cachedState = visualBackgroundState(cached);
        setSnapshot({ identity, state: cachedState });
        if (cachedState.status === "ready" && persistentUserId) {
          void cacheVisualBackgroundSelection({ userId: persistentUserId, scene, selection: cachedState.selection });
        }
      } else if (force) {
        setSnapshot((current) => current.identity === identity && current.state.status === "ready"
          ? current
          : { identity, state: { status: "loading", selection: null, url: null, error: null } });
      } else {
        setSnapshot({ identity, state: { status: "loading", selection: null, url: null, error: null } });
        if (persistentUserId) {
          void readCachedVisualBackgroundSelection({ userId: persistentUserId, scene }).then((selection) => {
            if (!selection) return;
            if (cancelled || generation !== loadGeneration || serverResolved) {
              releaseCachedVisualBackgroundSelection(selection);
              return;
            }
            detachHydratedSelection();
            hydratedSelection = selection;
            retainedHydratedSelectionsRef.current.add(selection);
            setSnapshot({ identity, state: { status: "ready", selection, url: selection.url, error: null } });
          });
        }
      }

      const applyBackground = (data: Awaited<ReturnType<typeof getVisualBackgrounds>>) => {
        const nextState = visualBackgroundState(data);
        const hydratedImageId = hydratedSelection?.image.id ?? null;
        const hydratedUrl = hydratedSelection?.url ?? null;
        if (
          nextState.status === "ready"
          && hydratedUrl
          && hydratedImageId === nextState.selection.image.id
        ) {
          setSnapshot({
            identity,
            state: {
              ...nextState,
              selection: { ...nextState.selection, url: hydratedUrl },
              url: hydratedUrl,
            },
          });
        } else {
          detachHydratedSelection();
          setSnapshot({ identity, state: nextState });
        }
        if (persistentUserId) {
          if (nextState.status === "ready") {
            void cacheVisualBackgroundSelection({ userId: persistentUserId, scene, selection: nextState.selection });
          } else {
            void clearCachedVisualBackgroundSelection({ userId: persistentUserId, scene });
          }
        }
      };

      void loadVisualBackgrounds(scene, userId, force)
        .then((data) => {
          if (cancelled || generation !== loadGeneration) {
            return;
          }
          serverResolved = true;

          if (force || data !== cached) applyBackground(data);

          const intervalMs = visualBackgroundIntervalMs(data);
          if (intervalMs) {
            intervalId = window.setInterval(() => {
              applyBackground(data);
            }, intervalMs);
          }
        })
        .catch((error) => {
          if (!cancelled && generation === loadGeneration) {
            serverResolved = true;
            setSnapshot((current) => current.identity === identity && current.state.status === "ready"
              ? current
              : { identity, state: { status: "error", selection: null, url: null, error: visualBackgroundError(scene, error) } });
          }
        });
    };

    loadBackground(false);
    const unsubscribe = scene ? subscribeVisualBackgroundChanged(scene, () => loadBackground(true)) : () => undefined;

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
      hydratedSelection = null;
    };
  }, [identity, scene, userId]);

  if (snapshot.identity === identity) return snapshot.state;
  return scene
    ? { status: "loading", selection: null, url: null, error: null }
    : { status: "empty", selection: null, url: null, error: null };
}
