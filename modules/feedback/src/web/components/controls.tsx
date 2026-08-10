import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";

export function FeedbackButton({
  children,
  className,
  loading,
  size = "md",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  size?: "lg" | "md" | "sm";
  variant?: ButtonVariant;
}) {
  return (
    <button
      {...props}
      className={clsx("feedback-button", className)}
      data-variant={variant}
      data-size={size}
      disabled={props.disabled || loading}
      type={props.type ?? "button"}
    >
      {loading ? <Loader2 aria-hidden="true" className="feedback-spin" /> : null}
      {children}
    </button>
  );
}

export function FeedbackBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "accent" | "danger" | "gold" | "neutral" | "success" | "warning";
}) {
  return <span className="feedback-badge" data-tone={tone}>{children}</span>;
}

export function FeedbackEmptyState({
  description,
  icon,
  title,
}: {
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div className="feedback-empty-state">
      {icon ? <span className="feedback-empty-state-icon" aria-hidden="true">{icon}</span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function FeedbackSelect({
  children,
  label,
  onChange,
  value,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="feedback-select">
      <span>{label}</span>
      <select {...props} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

export function FeedbackTextInput({
  ariaLabel,
  onValueChange,
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  ariaLabel: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="feedback-text-input">
      <span className="sr-only">{ariaLabel}</span>
      <input
        {...props}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </label>
  );
}
