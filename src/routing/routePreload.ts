import { preloadProductionReadModels } from "../state/readModelQueries";
import { preloadProductionRouteModules } from "./routeModules";

export function preloadProductionRouteExperience() {
  return Promise.allSettled([
    preloadProductionRouteModules(),
    preloadProductionReadModels(),
  ]);
}
