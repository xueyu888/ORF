import { AlertTriangle, HelpCircle, X } from "lucide-react";
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./ui";

export type ConfirmDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: ReactNode;
  title: string;
  tone?: "default" | "danger";
};

type ConfirmDialogRequest = ConfirmDialogOptions & {
  returnFocusTo: HTMLElement | null;
  resolve: (confirmed: boolean) => void;
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);
  const requestRef = useRef<ConfirmDialogRequest | null>(null);

  const close = useCallback((confirmed: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    requestRef.current?.resolve(false);
    const nextRequest = {
      ...options,
      resolve,
      returnFocusTo: typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    };
    requestRef.current = nextRequest;
    setRequest(nextRequest);
  }), []);

  useEffect(() => () => {
    requestRef.current?.resolve(false);
    requestRef.current = null;
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, request]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      {request && typeof document !== "undefined"
        ? createPortal(<ConfirmDialog request={request} onClose={close} />, document.body)
        : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider");
  return context.confirm;
}

function ConfirmDialog({
  onClose,
  request,
}: {
  onClose: (confirmed: boolean) => void;
  request: ConfirmDialogRequest;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const danger = request.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;
  const descriptionId = "orf-confirm-dialog-description";
  const titleId = "orf-confirm-dialog-title";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(".orf-confirm-dialog-confirm")
        ?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      request.returnFocusTo?.focus();
    };
  }, [request.returnFocusTo]);

  const keepFocusInsideDialog = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="orf-confirm-dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="orf-confirm-dialog"
        data-tone={danger ? "danger" : "default"}
        onKeyDown={keepFocusInsideDialog}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <header className="orf-confirm-dialog-header">
          <span className="orf-confirm-dialog-icon" aria-hidden="true"><Icon /></span>
          <div>
            <span>确认操作</span>
            <h2 id={titleId}>{request.title}</h2>
          </div>
          <IconButton icon={X} label="关闭确认框" size="sm" onClick={() => onClose(false)} />
        </header>
        <div className="orf-confirm-dialog-description" id={descriptionId}>{request.description}</div>
        <footer className="orf-confirm-dialog-actions">
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>
            {request.cancelLabel ?? "取消"}
          </Button>
          <Button
            autoFocus
            className="orf-confirm-dialog-confirm"
            type="button"
            variant={danger ? "danger" : "primary"}
            onClick={() => onClose(true)}
          >
            {request.confirmLabel ?? "确认"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
