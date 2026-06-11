import { X } from "lucide-react";
import { useOrf } from "../state/OrfProvider";

export function Toasts() {
  const { toasts, removeToast } = useOrf();

  return (
    <div className="orf-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="orf-toast-card orf-surface-elevated orf-text-primary flex items-center gap-3 rounded-lg border orf-border px-4 py-3 text-sm shadow-2xl">
          <div className="h-2 w-2 rounded-full bg-[var(--orf-success-text)]" />
          <div className="flex-1">{toast.message}</div>
          <button type="button" aria-label="关闭提示" onClick={() => removeToast(toast.id)} className="orf-text-muted orf-hover-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
