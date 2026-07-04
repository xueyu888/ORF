import {
  challengePathForTarget,
  parseChallengeTargetHash,
} from "../challenge/model/challengeLinks";
import type { ChallengeUrlTarget } from "../challenge/model/challengeLinks";
import type { WorkspaceSelection } from "./workspaceTypes";

export function workspaceSelectionFromHref(href: string): WorkspaceSelection | null {
  const url = urlForHref(href);
  if (!url || url.pathname !== "/tasks") return null;

  const target = parseChallengeTargetHash(url.hash);
  if (!target) return null;
  if (target.type === "objective" || target.type === "action" || target.type === "subAction") {
    return { type: target.type, id: target.id };
  }
  return null;
}

export function challengeTargetForWorkspaceSelection(selection: WorkspaceSelection): ChallengeUrlTarget {
  return {
    id: selection.id,
    type: selection.type,
  };
}

export function workspaceSelectionPath(selection: WorkspaceSelection) {
  return challengePathForTarget(challengeTargetForWorkspaceSelection(selection));
}

function urlForHref(href: string) {
  try {
    const base = typeof window === "undefined" ? "http://orf.local" : window.location.origin;
    const url = new URL(href, base);
    if (typeof window !== "undefined" && url.origin !== window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}
