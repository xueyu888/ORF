import type { ChallengeTarget } from "./types";

export function challengeLinkForTarget(target: ChallengeTarget) {
  return `${window.location.origin}${window.location.pathname}#${target.type}:${target.id}`;
}
