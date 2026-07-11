import { pageVisualBackgroundSceneForPath } from "../config/visualSkinSlots";
import { loadPersonalBackground, preloadProductionReadModels, preloadReadModelsForPath } from "../state/readModelQueries";
import { readModelCacheGeneration } from "../state/readModelCache";
import { prepareVisualBackground } from "../utils/visualBackgrounds";
import { preloadProductionRouteModules, preloadRouteModules } from "./routeModules";

const imagePreloadRequests = new Map<string, Promise<void>>();

function preloadImage(url: string) {
  const existing = imagePreloadRequests.get(url);
  if (existing) return existing;
  const request = new Promise<void>((resolve) => {
    const image = new Image();
    const finish = () => resolve();
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
  });
  imagePreloadRequests.set(url, request);
  return request;
}

async function preloadRouteBackground(scene: NonNullable<ReturnType<typeof pageVisualBackgroundSceneForPath>>) {
  const generation = readModelCacheGeneration();
  const data = await loadPersonalBackground(scene);
  if (generation !== readModelCacheGeneration()) return;
  const selection = prepareVisualBackground(data);
  if (selection) await preloadImage(selection.url);
}

export function preloadRouteExperience(pathname: string) {
  const backgroundScene = pathname.startsWith("/chat") ? null : pageVisualBackgroundSceneForPath(pathname);
  return Promise.allSettled([
    preloadRouteModules(pathname),
    preloadReadModelsForPath(pathname),
    backgroundScene ? preloadRouteBackground(backgroundScene) : Promise.resolve(),
  ]);
}

export function preloadProductionRouteExperience() {
  return Promise.allSettled([
    preloadProductionRouteModules(),
    preloadProductionReadModels(),
  ]);
}
