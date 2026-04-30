import { Check } from "lucide-react";
import { clsx } from "clsx";

export type MetricIconTone = "todo" | "active" | "review" | "done";

const metricIconColors: Record<MetricIconTone, string> = {
  todo: "#d0d5dd",
  active: "#3f947d",
  review: "#f5bd27",
  done: "#0b8f7f",
};

export function ObjectiveFlagIcon({ complete = false }: { complete?: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border",
        complete ? "border-[#d6d6d3] bg-transparent text-[#a7a7a7]" : "border-[#9fd8cf] bg-[#eefaf7] text-[#2f9c89]",
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
  return <span className="h-7 w-7 shrink-0 rounded-md" style={{ backgroundColor: metricIconColors[tone] }} aria-hidden="true" />;
}

export function CompletionCircleIcon({ checked }: { checked: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
        checked ? "border-[#b8bdc5] bg-[#b8bdc5] text-white" : "border-[#b8bdc5] bg-white text-transparent",
      )}
      aria-hidden="true"
    >
      {checked && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}
