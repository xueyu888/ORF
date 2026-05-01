import { clsx } from "clsx";
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "blue" | "teal" | "gold" | "danger" | "success" | "muted";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

export function FantasyButton({
  children,
  className,
  disabled,
  loading,
  size = "md",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  size?: Size;
  variant?: ButtonVariant;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx("gi-button", `gi-button-${variant}`, `gi-button-${size}`, loading && "gi-button-loading", className)}
    >
      <span className="gi-button__ornament" aria-hidden="true" />
      <span className="gi-button__content">{loading ? "处理中" : children}</span>
    </button>
  );
}

export function FantasySvgButton({
  children,
  className,
  disabled,
  loading,
  size = "md",
  style,
  width,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  size?: Size;
  width?: number | string;
}) {
  const buttonStyle = {
    ...style,
    ...(width
      ? {
          "--gi-svg-button-width": typeof width === "number" ? `${width}px` : width,
        }
      : {}),
  } as CSSProperties;

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx("gi-svg-button", `gi-svg-button-${size}`, loading && "gi-svg-button-loading", className)}
      style={buttonStyle}
    >
      <span className="gi-svg-button__cap gi-svg-button__cap-left" aria-hidden="true" />
      <span className="gi-svg-button__mid" aria-hidden="true" />
      <span className="gi-svg-button__cap gi-svg-button__cap-right" aria-hidden="true" />
      <span className="gi-svg-button__label">{loading ? "处理中" : children}</span>
    </button>
  );
}

export function FantasyExactNewTaskButton({
  children = "新建任务",
  className,
  disabled,
  loading,
  style,
  width,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  width?: number | string;
}) {
  const buttonStyle = {
    ...style,
    ...(width
      ? {
          "--gi-exact-new-task-width": typeof width === "number" ? `${width}px` : width,
        }
      : {}),
  } as CSSProperties;

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx("gi-exact-new-task-button", loading && "gi-exact-new-task-button-loading", className)}
      style={buttonStyle}
    >
      <span className="gi-visually-hidden">{loading ? "处理中" : children}</span>
    </button>
  );
}

export function FantasyPanel({
  children,
  className,
  title,
  variant = "light",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: "light" | "blue";
}) {
  return (
    <section className={clsx("gi-panel", `gi-panel-${variant}`, className)}>
      <span className="gi-corner gi-corner-tl" aria-hidden="true" />
      <span className="gi-corner gi-corner-tr" aria-hidden="true" />
      <span className="gi-corner gi-corner-bl" aria-hidden="true" />
      <span className="gi-corner gi-corner-br" aria-hidden="true" />
      {title && (
        <header className="gi-panel__header">
          <span className="gi-panel__title">{title}</span>
        </header>
      )}
      <div className="gi-panel__body">{children}</div>
    </section>
  );
}

export function FantasyCard({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <article className={clsx("gi-card", interactive && "gi-card-interactive", className)}>{children}</article>;
}

export function FantasyInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("gi-input", className)} />;
}

export function FantasySelect({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx("gi-select", className)}>
      {children}
    </select>
  );
}

export function FantasyBadge({
  children,
  className,
  tone = "blue",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return <span className={clsx("gi-badge", `gi-badge-${tone}`, className)}>{children}</span>;
}

export function FantasyTabs<TValue extends string>({
  items,
  onChange,
  value,
}: {
  items: { label: string; value: TValue }[];
  onChange: (value: TValue) => void;
  value: TValue;
}) {
  return (
    <div className="gi-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          aria-selected={item.value === value}
          className={clsx("gi-tab", item.value === value && "gi-tab-active")}
          role="tab"
          type="button"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function FantasyDivider({ label }: { label?: string }) {
  return (
    <div className="gi-divider" aria-hidden={!label}>
      {label && <span>{label}</span>}
    </div>
  );
}

export function FantasyModal({
  children,
  title,
  variant = "light",
}: {
  children: ReactNode;
  title: string;
  variant?: "light" | "blue";
}) {
  return (
    <FantasyPanel className="gi-modal" title={title} variant={variant}>
      {children}
      <footer className="gi-modal__footer">
        <FantasyButton size="sm" variant="secondary">
          取消
        </FantasyButton>
        <FantasyButton size="sm">确认</FantasyButton>
      </footer>
    </FantasyPanel>
  );
}

export function FantasySidebar({
  items,
}: {
  items: { active?: boolean; icon: LucideIcon; label: string }[];
}) {
  return (
    <aside className="gi-sidebar">
      <div className="gi-sidebar__brand">任务管理</div>
      <nav className="gi-sidebar__nav">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button key={item.label} className={clsx("gi-sidebar-item", item.active && "gi-sidebar-item-active")} type="button">
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function FantasyTaskCard({
  description,
  dueDate,
  status,
  tag,
  title,
}: {
  description?: string;
  dueDate?: string;
  status: "todo" | "doing" | "done" | "overdue";
  tag?: string;
  title: string;
}) {
  const label = status === "todo" ? "待办" : status === "doing" ? "进行中" : status === "done" ? "已完成" : "已逾期";
  const tone = status === "todo" ? "gold" : status === "doing" ? "blue" : status === "done" ? "success" : "danger";

  return (
    <FantasyCard className="gi-task-card" interactive>
      <span className="gi-task-card__icon" aria-hidden="true" />
      <div className="gi-task-card__content">
        <header className="gi-task-card__top">
          <h3>{title}</h3>
          <FantasyBadge tone={tone}>{label}</FantasyBadge>
        </header>
        {description && <p>{description}</p>}
        <footer>
          {tag && <FantasyBadge tone="muted">{tag}</FantasyBadge>}
          {dueDate && <span>截止日期：{dueDate}</span>}
        </footer>
      </div>
    </FantasyCard>
  );
}

export function FantasyKanbanColumn({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <FantasyPanel className="gi-kanban-column" title={title}>
      <div className="gi-kanban-column__count">{count}</div>
      <div className="gi-kanban-column__body">{children}</div>
    </FantasyPanel>
  );
}
