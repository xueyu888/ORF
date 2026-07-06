import { createContext, useContext } from "react";
import type { WorkspaceSelection } from "./workspaceTypes";

type WorkspaceContextValue = {
  closeSecondaryPanel: () => void;
  openChallengePanel: (selection?: WorkspaceSelection | null) => void;
  selection: WorkspaceSelection | null;
  secondaryPanelOpen: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceContextProvider = WorkspaceContext.Provider;

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceRoot");
  }
  return context;
}
