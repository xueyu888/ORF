import { generateInteractionEvents } from "./eventModel";
import type { UiTarget } from "./types";

export function generateCandidateEvents(targets: UiTarget[]) {
  return generateInteractionEvents(targets);
}

export { createUiEvent, dedupeEvents, eventsForTarget, pageLevelEvents } from "./eventModel";
