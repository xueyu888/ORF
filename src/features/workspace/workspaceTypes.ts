import {
  defaultWorkspaceLayoutPreferences,
  workspaceLayoutLimits,
  type WorkspaceLayoutPreferences,
} from "../../domain/settings/personalPreferences";

export type WorkspaceSelection =
  | { type: "objective"; id: string }
  | { type: "action"; id: string }
  | { type: "subAction"; id: string };

export type WorkspaceLayout = WorkspaceLayoutPreferences;

export const defaultWorkspaceLayout: WorkspaceLayout = defaultWorkspaceLayoutPreferences;

export function normalizeWorkspaceSecondaryWidth(width: number) {
  const { max, min } = workspaceLayoutLimits.secondaryWidthPx;
  if (!Number.isFinite(width)) return workspaceLayoutLimits.secondaryWidthPx.default;
  return Math.max(min, Math.min(max, Math.round(width)));
}

export function workspaceSelectionKey(selection: WorkspaceSelection | null | undefined) {
  return selection ? `${selection.type}:${selection.id}` : "";
}
