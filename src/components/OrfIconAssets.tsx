import { Check } from "lucide-react";
import { clsx } from "clsx";

export type MetricIconTone = "todo" | "active" | "review" | "done";

export function ObjectiveFlagIcon({ complete = false }: { complete?: boolean }) {
  return (
    <span
      className={clsx(
        "orf-objective-icon flex h-8 w-8 shrink-0 items-center justify-center",
        complete ? "orf-objective-icon-complete" : "orf-objective-icon-open",
      )}
    >
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-7 w-7">
        <path d="M9 20.5V7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 8.5H20L16.6 12.3L20 16H10V8.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function MetricSquareIcon({ tone }: { tone: MetricIconTone }) {
  return <span className={clsx("orf-metric-icon h-7 w-7 shrink-0", `orf-metric-icon-${tone}`)} aria-hidden="true" />;
}

export function CompletionCircleIcon({ checked }: { checked: boolean }) {
  return (
    <span
      className={clsx(
        "orf-completion-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition",
        checked ? "orf-completion-icon-checked text-white" : "orf-completion-icon-open text-transparent",
      )}
      aria-hidden="true"
    >
      {checked && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}
