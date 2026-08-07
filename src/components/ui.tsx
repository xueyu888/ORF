import { Loader2, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Priority, TaskStatus, WorkStatus } from "../types/orf";
import { UserAvatar } from "./UserAvatar";
import { statusLabel } from "../utils/labels";

const statusClasses: Record<WorkStatus | TaskStatus | Priority, string> = {
  "On Track": "orf-badge-success",
  "At Risk": "orf-badge-warning",
  Blocked: "orf-badge-danger",
  Draft: "orf-badge-neutral",
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

export type ButtonVariant = "primary" | "secondary" | "blue" | "dark" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function actionButtonClassName({
  className,
  iconOnly,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  iconOnly?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return clsx(
    "orf-control orf-action-button",
    `orf-action-button-${variant}`,
    `orf-action-button-${size}`,
    iconOnly && "orf-action-icon-button",
    className,
  );
}

export function Button({
  children,
  className,
  loading,
  size = "md",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; size?: ButtonSize; variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={actionButtonClassName({ className, size, variant })}
    >
      {loading ? "处理中..." : children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  loading,
  size = "md",
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; loading?: boolean; size?: ButtonSize; variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      aria-label={label}
      disabled={props.disabled || loading}
      title={label}
      className={actionButtonClassName({ className, iconOnly: true, size, variant })}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  );
}

export function StatusBadge({ status }: { status: WorkStatus | TaskStatus | Priority }) {
  return (
    <span className={clsx("orf-status-tag inline-flex h-7 min-w-[66px] items-center justify-center px-3 text-xs font-bold leading-none", statusClasses[status])}>
      {statusLabel(status)}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 75 ? "orf-badge-success" : value >= 60 ? "orf-badge-warning" : "orf-badge-danger";
  return <span className={clsx("orf-status-tag inline-flex h-7 min-w-[66px] items-center justify-center px-3 text-xs font-bold leading-none", color)}>信心 {value}%</span>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("orf-progress-track orf-status-tag h-2 overflow-hidden", className)}>
      <div className="orf-progress-fill orf-status-tag h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Avatar({ avatarUrl, name, size = "md" }: { avatarUrl?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  return <UserAvatar avatarUrl={avatarUrl} name={name} size={size} />;
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
