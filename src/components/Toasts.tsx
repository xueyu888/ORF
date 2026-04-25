import { X } from "lucide-react";
import { useOrf } from "../state/OrfProvider";

export function Toasts() {
  const { toasts, removeToast } = useOrf();

  return (
    <div className="fixed bottom-5 right-5 z-50 grid gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="orf-surface-elevated orf-text-primary flex min-w-72 items-center gap-3 rounded-lg border orf-border px-4 py-3 text-sm shadow-2xl">
          <div className="h-2 w-2 rounded-full bg-[var(--orf-success-text)]" />
          <div className="flex-1">{toast.message}</div>
          <button onClick={() => removeToast(toast.id)} className="orf-text-muted orf-hover-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
