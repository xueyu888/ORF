import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { ChallengeWorkspacePanel } from "./ChallengeWorkspacePanel";
import { WorkspaceContextProvider } from "./WorkspaceContext";
import {
  defaultWorkspaceLayout,
  normalizeWorkspaceSecondaryWidth,
  type WorkspaceLayout,
  type WorkspaceSelection,
} from "./workspaceTypes";

type WorkspaceRootProps = {
  children: ReactNode;
  enabled: boolean;
  layout: WorkspaceLayout;
  onLayoutChange: (layout: WorkspaceLayout) => void;
};

export function WorkspaceRoot({ children, enabled, layout, onLayoutChange }: WorkspaceRootProps) {
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [draftWidth, setDraftWidth] = useState(() => normalizeWorkspaceSecondaryWidth(layout.secondaryWidthPx));
  const secondaryPanelOpen = enabled && layout.secondaryPanel === "challenge";

  useEffect(() => {
    setDraftWidth(normalizeWorkspaceSecondaryWidth(layout.secondaryWidthPx));
  }, [layout.secondaryWidthPx]);

  const updateLayout = useCallback((patch: Partial<WorkspaceLayout>) => {
    onLayoutChange({
      ...defaultWorkspaceLayout,
      ...layout,
      ...patch,
      secondaryWidthPx: normalizeWorkspaceSecondaryWidth(patch.secondaryWidthPx ?? layout.secondaryWidthPx),
      version: 1,
    });
  }, [layout, onLayoutChange]);

  const openChallengePanel = useCallback((nextSelection?: WorkspaceSelection | null) => {
    if (nextSelection !== undefined) setSelection(nextSelection);
    updateLayout({ secondaryPanel: "challenge" });
  }, [updateLayout]);

  const closeSecondaryPanel = useCallback(() => {
    updateLayout({ secondaryPanel: null });
  }, [updateLayout]);

  const contextValue = useMemo(
    () => ({
      closeSecondaryPanel,
      openChallengePanel,
      selection,
      secondaryPanelOpen,
    }),
    [closeSecondaryPanel, openChallengePanel, secondaryPanelOpen, selection],
  );

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!secondaryPanelOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = draftWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = normalizeWorkspaceSecondaryWidth(startWidth - (moveEvent.clientX - startX));
      setDraftWidth(nextWidth);
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      const nextWidth = normalizeWorkspaceSecondaryWidth(startWidth - (upEvent.clientX - startX));
      setDraftWidth(nextWidth);
      updateLayout({ secondaryWidthPx: nextWidth });
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <WorkspaceContextProvider value={contextValue}>
      <div
        className="orf-workspace-root"
        data-secondary-open={secondaryPanelOpen ? "true" : "false"}
        data-workspace-enabled={enabled ? "true" : "false"}
        style={{ "--orf-workspace-secondary-width": `${draftWidth}px` } as CSSProperties}
      >
        <section className="orf-workspace-primary" aria-label="主工作区">
          {children}
        </section>
        {secondaryPanelOpen && (
          <>
            <button
              aria-label="调整目标面板宽度"
              className="orf-workspace-resize-handle"
              onPointerDown={handleResizeStart}
              type="button"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <aside className="orf-workspace-secondary" aria-label="目标和行动项工作区">
              <ChallengeWorkspacePanel onClose={closeSecondaryPanel} selection={selection} />
            </aside>
          </>
        )}
      </div>
    </WorkspaceContextProvider>
  );
}
