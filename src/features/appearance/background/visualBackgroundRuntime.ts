import type { VisualBackgroundScene } from "../../../domain/settings/visualBackgrounds";
import { invalidatePersonalBackground } from "../../../state/readModelQueries";
import { clearPreparedVisualBackground } from "../../../utils/visualBackgrounds";

const visualBackgroundChangedEvent = "orf:visual-background-changed";

export function dispatchVisualBackgroundChanged(input: {
  scene: VisualBackgroundScene;
  userId: string | null;
}) {
  const userId = input.userId;
  clearPreparedVisualBackground(input.scene);
  if (userId && input.scene !== "login_background") {
    invalidatePersonalBackground(userId, input.scene);
  }
  window.dispatchEvent(new CustomEvent(visualBackgroundChangedEvent, {
    detail: { scene: input.scene },
  }));
}

export function subscribeVisualBackgroundChanged(
  scene: VisualBackgroundScene,
  listener: () => void,
) {
  const handler = (event: Event) => {
    const detail = event instanceof CustomEvent
      ? event.detail as { scene?: VisualBackgroundScene } | undefined
      : undefined;
    if (detail?.scene === scene) listener();
  };

  window.addEventListener(visualBackgroundChangedEvent, handler);
  return () => window.removeEventListener(visualBackgroundChangedEvent, handler);
}
