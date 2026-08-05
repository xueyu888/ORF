import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  createWorkbenchLocation,
  goBackInWorkbenchStack,
  goForwardInWorkbenchStack,
  syncWorkbenchStackWithRouter,
  updateCurrentWorkbenchViewport,
  workbenchHrefFromLocation,
  type WorkbenchLocation,
  type WorkbenchNavigationSource,
  type WorkbenchNavigationStack,
  type WorkbenchViewportPosition,
} from "./workbenchNavigationModel";
import {
  readWorkbenchNavigationStack,
  writeWorkbenchNavigationStack,
} from "./workbenchNavigationStore";

type WorkbenchNavigationContextValue = {
  canGoBack: boolean;
  canGoForward: boolean;
  current: WorkbenchLocation | null;
  goBack: () => void;
  goForward: () => void;
  open: (href: string, options?: { replace?: boolean; source?: WorkbenchNavigationSource }) => void;
  replace: (href: string, options?: { source?: WorkbenchNavigationSource }) => void;
  stack: WorkbenchNavigationStack;
  updateCurrentViewport: (viewport: WorkbenchViewportPosition) => void;
};

const WorkbenchNavigationContext = createContext<WorkbenchNavigationContextValue | null>(null);

export function WorkbenchNavigationProvider({
  children,
  currentUserId,
}: {
  children: ReactNode;
  currentUserId?: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const href = workbenchHrefFromLocation(location);
  const [stack, setStack] = useState(() => initialWorkbenchStack(currentUserId, href));
  const stackRef = useRef(stack);
  const hrefRef = useRef(href);
  const currentUserIdRef = useRef(currentUserId);
  const pendingSourceRef = useRef<WorkbenchNavigationSource | null>(null);
  const viewportCaptureTimerRef = useRef<number | null>(null);
  const viewportRestoreRef = useRef<{ href: string; viewport?: WorkbenchViewportPosition } | null>(stack.current ? { href: stack.current.href, viewport: stack.current.viewport } : null);
  const [viewportRestoreSignal, setViewportRestoreSignal] = useState(0);
  hrefRef.current = href;

  const commitStack = useCallback((nextStack: WorkbenchNavigationStack) => {
    stackRef.current = nextStack;
    setStack(nextStack);
    writeWorkbenchNavigationStack(currentUserIdRef.current, nextStack);
  }, []);

  const updateCurrentViewport = useCallback((viewport: WorkbenchViewportPosition) => {
    commitStack(updateCurrentWorkbenchViewport(stackRef.current, viewport));
  }, [commitStack]);

  const flushViewportCapture = useCallback(() => {
    if (viewportCaptureTimerRef.current !== null) {
      window.clearTimeout(viewportCaptureTimerRef.current);
      viewportCaptureTimerRef.current = null;
    }
    updateCurrentViewport(readWindowViewportPosition());
  }, [updateCurrentViewport]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    const nextStack = initialWorkbenchStack(currentUserId, hrefRef.current);
    stackRef.current = nextStack;
    setStack(nextStack);
    writeWorkbenchNavigationStack(currentUserId, nextStack);
    viewportRestoreRef.current = nextStack.current ? { href: nextStack.current.href, viewport: nextStack.current.viewport } : null;
    setViewportRestoreSignal((value) => value + 1);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const locationRecord = createWorkbenchLocation({
      href,
      source: pendingSourceRef.current ?? sourceFromNavigationType(navigationType),
      title: typeof document === "undefined" ? undefined : document.title,
    });
    pendingSourceRef.current = null;
    if (!locationRecord) return;

    const nextStack = syncWorkbenchStackWithRouter(stackRef.current, locationRecord, navigationType);
    commitStack(nextStack);
    if (navigationType === "POP") {
      viewportRestoreRef.current = nextStack.current ? { href: nextStack.current.href, viewport: nextStack.current.viewport } : null;
      setViewportRestoreSignal((value) => value + 1);
    }
  }, [commitStack, currentUserId, href, navigationType]);

  useLayoutEffect(() => {
    return () => {
      flushViewportCapture();
    };
  }, [flushViewportCapture, href]);

  useLayoutEffect(() => {
    const request = viewportRestoreRef.current;
    if (!request || request.href !== href) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (viewportRestoreRef.current?.href !== href) return;
      window.scrollTo({ behavior: "auto", top: viewportRestoreRef.current.viewport?.scrollTop ?? 0 });
      viewportRestoreRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [href, viewportRestoreSignal]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const scheduleViewportCapture = () => {
      if (viewportCaptureTimerRef.current !== null) return;
      viewportCaptureTimerRef.current = window.setTimeout(() => {
        viewportCaptureTimerRef.current = null;
        updateCurrentViewport(readWindowViewportPosition());
      }, 250);
    };
    window.addEventListener("scroll", scheduleViewportCapture, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleViewportCapture);
      if (viewportCaptureTimerRef.current !== null) {
        window.clearTimeout(viewportCaptureTimerRef.current);
        viewportCaptureTimerRef.current = null;
      }
    };
  }, [updateCurrentViewport]);

  const open = useCallback((targetHref: string, options: { replace?: boolean; source?: WorkbenchNavigationSource } = {}) => {
    const target = createWorkbenchLocation({ href: targetHref, source: options.source ?? "user" });
    if (!target) return;
    flushViewportCapture();
    pendingSourceRef.current = target.source;
    navigate(target.href, { replace: options.replace ?? false });
  }, [flushViewportCapture, navigate]);

  const replace = useCallback((targetHref: string, options: { source?: WorkbenchNavigationSource } = {}) => {
    open(targetHref, { replace: true, source: options.source ?? "user" });
  }, [open]);

  const goBack = useCallback(() => {
    flushViewportCapture();
    const result = goBackInWorkbenchStack(stackRef.current);
    if (!result.target) return;
    commitStack(result.stack);
    viewportRestoreRef.current = { href: result.target.href, viewport: result.target.viewport };
    setViewportRestoreSignal((value) => value + 1);
    navigate(result.target.href, { replace: true });
  }, [commitStack, flushViewportCapture, navigate]);

  const goForward = useCallback(() => {
    flushViewportCapture();
    const result = goForwardInWorkbenchStack(stackRef.current);
    if (!result.target) return;
    commitStack(result.stack);
    viewportRestoreRef.current = { href: result.target.href, viewport: result.target.viewport };
    setViewportRestoreSignal((value) => value + 1);
    navigate(result.target.href, { replace: true });
  }, [commitStack, flushViewportCapture, navigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableEventTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward]);

  const value = useMemo<WorkbenchNavigationContextValue>(() => ({
    canGoBack: stack.back.length > 0,
    canGoForward: stack.forward.length > 0,
    current: stack.current,
    goBack,
    goForward,
    open,
    replace,
    stack,
    updateCurrentViewport,
  }), [goBack, goForward, open, replace, stack, updateCurrentViewport]);

  return (
    <WorkbenchNavigationContext.Provider value={value}>
      {children}
    </WorkbenchNavigationContext.Provider>
  );
}

export function useWorkbenchNavigation() {
  const context = useContext(WorkbenchNavigationContext);
  if (!context) {
    throw new Error("useWorkbenchNavigation must be used within WorkbenchNavigationProvider");
  }
  return context;
}

export function WorkbenchNavigationControls() {
  const navigation = useWorkbenchNavigation();
  return (
    <div className="orf-workbench-history-controls" aria-label="工作位置历史">
      <button
        type="button"
        className="orf-workbench-history-button"
        aria-label="回到上一个工作位置"
        title="回到上一个工作位置 (Alt+←)"
        disabled={!navigation.canGoBack}
        onClick={navigation.goBack}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="orf-workbench-history-button"
        aria-label="前进到下一个工作位置"
        title="前进到下一个工作位置 (Alt+→)"
        disabled={!navigation.canGoForward}
        onClick={navigation.goForward}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function initialWorkbenchStack(userId: string | null | undefined, href: string) {
  const stored = readWorkbenchNavigationStack(userId);
  const current = createWorkbenchLocation({ href, source: "route" });
  return current ? syncWorkbenchStackWithRouter(stored, current, "POP") : stored;
}

function readWindowViewportPosition(): WorkbenchViewportPosition {
  return {
    containerId: "window",
    scrollTop: Math.max(0, Math.round(window.scrollY)),
  };
}

function sourceFromNavigationType(navigationType: string): WorkbenchNavigationSource {
  return navigationType === "POP" ? "route" : "user";
}

function isEditableEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]"));
}
