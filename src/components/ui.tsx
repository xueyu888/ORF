import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { FeedbackStatus, Priority, TaskStatus, WorkStatus } from "../types/orf";
import { avatarStyleForName } from "../utils/avatar";
import { initials } from "../utils/format";
import { statusLabel } from "../utils/labels";

const statusClasses: Record<WorkStatus | FeedbackStatus | TaskStatus | Priority, string> = {
  "On Track": "orf-badge-success",
  "At Risk": "orf-badge-warning",
  Blocked: "orf-badge-danger",
  Draft: "orf-badge-neutral",
  New: "orf-badge-info",
  Reviewing: "orf-badge-accent",
  "Action Created": "orf-badge-accent",
  "Result Updated": "orf-badge-success",
  Closed: "orf-badge-neutral",
  Backlog: "orf-badge-neutral",
  Todo: "orf-badge-info",
  "In Progress": "orf-badge-accent",
  "In Review": "orf-badge-accent",
  Done: "orf-badge-success",
  Low: "orf-badge-neutral",
  Medium: "orf-badge-info",
  High: "orf-badge-warning",
  Critical: "orf-badge-danger",
};

export function Card({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={clsx("orf-card", interactive && "orf-card-hover", className)}>{children}</div>;
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={clsx(
        "orf-control inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition",
        variant === "primary" && "orf-primary-action",
        variant === "secondary" && "border orf-secondary-action",
        variant === "ghost" && "orf-ghost-action",
        variant === "danger" && "orf-danger-action",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={clsx("orf-control orf-ghost-action inline-flex h-9 w-9 items-center justify-center transition", className)}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function StatusBadge({ status }: { status: WorkStatus | FeedbackStatus | TaskStatus | Priority }) {
  return <span className={clsx("orf-status-tag inline-flex items-center border px-2 py-0.5 text-xs font-medium", statusClasses[status])}>{statusLabel(status)}</span>;
}

export function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 75 ? "orf-badge-success" : value >= 60 ? "orf-badge-warning" : "orf-badge-danger";
  return <span className={clsx("orf-status-tag inline-flex items-center border px-2 py-0.5 text-xs font-medium", color)}>信心 {value}%</span>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("orf-progress-track orf-status-tag h-2 overflow-hidden", className)}>
      <div className="orf-progress-fill orf-status-tag h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-bold shadow-sm",
        size === "sm" && "h-6 w-6 text-[10px]",
        size === "md" && "h-8 w-8 text-xs",
        size === "lg" && "h-10 w-10 text-sm",
      )}
      style={avatarStyleForName(name)}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="orf-text-secondary grid gap-1.5 text-xs font-medium">
      {label}
      {children}
    </label>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="flex min-h-40 flex-col items-center justify-center orf-card-padding text-center">
      <div className="orf-text-primary text-sm font-semibold">{title}</div>
      <div className="orf-text-secondary mt-2 max-w-md text-sm">{description}</div>
    </Card>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={clsx("orf-control orf-surface-muted animate-pulse", className)} />;
}
