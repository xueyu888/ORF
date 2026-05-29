const personalPreferencesChangedEvent = "orf:personal-preferences-changed";

export function dispatchPersonalPreferencesChanged() {
  window.dispatchEvent(new Event(personalPreferencesChangedEvent));
}

export function subscribePersonalPreferencesChanged(listener: () => void) {
  window.addEventListener(personalPreferencesChangedEvent, listener);
  return () => window.removeEventListener(personalPreferencesChangedEvent, listener);
}
