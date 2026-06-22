import { clsx } from "clsx";
import { Leaf, Search, X, type LucideIcon } from "lucide-react";
import { Children, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { FantasySelectMenu, type FantasySelectOption } from "../../components/FantasySelectMenu";
import { Button, IconButton, actionButtonClassName, type ButtonSize } from "../../components/ui";
import "./bounty-hall-skin.css";

type ButtonVariant = "primary" | "secondary" | "blue" | "dark" | "ghost" | "danger";
type BadgeTone = "neutral" | "accent" | "gold" | "warning" | "success" | "danger";

export function BountyPanel({
  children,
  className,
  count,
  title,
}: {
  children: ReactNode;
  className?: string;
  count?: string;
  title?: string;
}) {
  return (
    <section className={clsx("bounty-panel", className)}>
      {title && (
        <div className="bounty-panel-head">
          <h3>{title}</h3>
          {count && <span>{count}</span>}
        </div>
      )}
      <div className="bounty-panel-body">{children}</div>
    </section>
  );
}

export function BountyCardSurface({
  children,
  className,
  priority,
}: {
  children: ReactNode;
  className?: string;
  priority?: boolean;
}) {
  return <article className={clsx("bounty-card", priority && "bounty-card-priority", className)}>{children}</article>;
}

export function BountyButton({
  children,
  className,
  disabled,
  form,
  loading,
  onClick,
  size = "md",
  type = "button",
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  form?: string;
  loading?: boolean;
  onClick?: () => void;
  size?: ButtonSize;
  type?: "button" | "submit";
  variant?: ButtonVariant;
}) {
  return (
    <Button className={className} disabled={disabled} form={form} loading={loading} onClick={onClick} size={size} type={type} variant={variant}>
      {children}
    </Button>
  );
}

export function BountyIconButton({
  className,
  icon: Icon,
  label,
  onClick,
}: {
  className?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return <IconButton className={className} icon={Icon} label={label} onClick={onClick} type="button" />;
}

export function BountyLinkButton({ children, className, to }: { children: ReactNode; className?: string; to: string }) {
  return (
    <Link className={actionButtonClassName({ className, variant: "secondary" })} to={to}>
      {children}
    </Link>
  );
}

export function BountyBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={clsx("bounty-badge", `bounty-badge-${tone}`)}>{children}</span>;
}

export function BountyEmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="bounty-empty-state">
      <div className="bounty-empty-icon">
        <Leaf aria-hidden="true" />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function BountyTextInput({
  ariaLabel,
  onValueChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="bounty-search-box">
      <span className="sr-only">{ariaLabel}</span>
      <Search aria-hidden="true" />
      <input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function BountySelect({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const options = bountySelectOptionsFromChildren(children);

  return (
    <div className="bounty-select-label">
      <span>{label}</span>
      <FantasySelectMenu
        ariaLabel={label}
        className="bounty-select-menu"
        onChange={onChange}
        options={options}
        value={value}
        variant="filter"
      />
    </div>
  );
}

function bountySelectOptionsFromChildren(children: ReactNode): Array<FantasySelectOption<string>> {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];

    const props = (child as ReactElement<{
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
      value?: number | string;
    }>).props;
    const label = props.label ?? bountySelectOptionText(props.children);
    const value = props.value === undefined ? label : String(props.value);

    return [{ disabled: props.disabled, label, value }];
  });
}

function bountySelectOptionText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "number" || typeof node === "string") return String(node);
  if (Array.isArray(node)) return node.map(bountySelectOptionText).join("");
  if (isValidElement(node)) {
    return bountySelectOptionText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

export function BountyDialog({
  children,
  className,
  footer,
  onClose,
  open = true,
  subtitle,
  title,
  variant,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  onClose: () => void;
  open?: boolean;
  subtitle?: string;
  title: string;
  variant?: "confirm";
}) {
  if (!open) return null;

  return createPortal(
    <div className="bounty-modal show" role="presentation" onMouseDown={onClose}>
      <section
        className={clsx("bounty-modal-card", variant === "confirm" && "bounty-modal-card-confirm", className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <BountyIconButton className="bounty-modal-close" icon={X} label="关闭" onClick={onClose} />
        <span className="bounty-corner-mark bounty-corner-tl" aria-hidden="true" />
        <span className="bounty-corner-mark bounty-corner-br" aria-hidden="true" />
        <header className="bounty-modal-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
        <div className="bounty-modal-body">{children}</div>
        {footer && <footer className="bounty-modal-footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

export function BountyMetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bounty-metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function BountyInfoLine({ children }: { children: ReactNode }) {
  return <div className="bounty-info-line">{children}</div>;
}
