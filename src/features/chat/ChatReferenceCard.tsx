import { clsx } from "clsx";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { actionButtonClassName } from "../../components/ui";

export type ChatReferenceCardStatus = "ready" | "loading" | "missing" | "error";

export type ChatReferenceCardProps = {
  actionHref?: string | null;
  actionLabel?: string;
  badge?: ReactNode;
  bodyCollapseKey?: string;
  children?: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  status?: ChatReferenceCardStatus;
  subtitle?: ReactNode;
  title: ReactNode;
};

function ChatReferenceCardBody({
  collapseKey,
  children,
}: {
  collapseKey?: string;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [collapseKey]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;

    const measure = () => {
      const collapsedHeight = Number.parseFloat(
        window.getComputedStyle(content).getPropertyValue("--orf-chat-reference-card-collapsed-height"),
      ) || 176;
      setOverflowing(content.scrollHeight > collapsedHeight + 1);
    };
    measure();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [collapseKey]);

  return (
    <>
      <div
        className="orf-chat-reference-card-body-frame"
        data-expanded={expanded ? "true" : "false"}
        data-overflowing={overflowing ? "true" : "false"}
      >
        <div className="orf-chat-reference-card-body" ref={contentRef}>{children}</div>
      </div>
      {overflowing && (
        <button
          aria-expanded={expanded}
          className="orf-chat-reference-card-toggle"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span>{expanded ? "收起详情" : "展开详情"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}

function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

function ChatReferenceCardAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const className = actionButtonClassName({
    className: "orf-chat-reference-card-action",
    size: "sm",
    variant: "secondary",
  });
  const content = (
    <>
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </>
  );

  if (isInternalHref(href)) {
    return (
      <Link className={className} to={href}>
        {content}
      </Link>
    );
  }

  return (
    <a className={className} href={href} rel="noreferrer noopener" target="_blank">
      {content}
    </a>
  );
}

export function ChatReferenceCard({
  actionHref,
  actionLabel = "打开",
  badge,
  bodyCollapseKey,
  children,
  className,
  eyebrow,
  footer,
  icon,
  meta,
  status = "ready",
  subtitle,
  title,
}: ChatReferenceCardProps) {
  const href = actionHref?.trim() || "";
  const hasDetails = Boolean(eyebrow || subtitle || meta);
  return (
    <aside
      aria-busy={status === "loading"}
      className={clsx("orf-chat-reference-card", `orf-chat-reference-card-${status}`, className)}
      data-status={status}
      role="group"
    >
      <div className="orf-chat-reference-card-header">
        {icon && <div className="orf-chat-reference-card-icon">{icon}</div>}
        <div className="orf-chat-reference-card-title-block">
          <h4>{title}</h4>
          {hasDetails && (
            <div className="orf-chat-reference-card-detail-line">
              {eyebrow && <span className="orf-chat-reference-card-eyebrow">{eyebrow}</span>}
              {eyebrow && (subtitle || meta) && <span className="orf-chat-reference-card-detail-separator">·</span>}
              {subtitle && <span className="orf-chat-reference-card-subtitle">{subtitle}</span>}
              {subtitle && meta && <span className="orf-chat-reference-card-detail-separator">·</span>}
              {meta && <span className="orf-chat-reference-card-meta">{meta}</span>}
            </div>
          )}
        </div>
        {badge && <div className="orf-chat-reference-card-badge">{badge}</div>}
      </div>
      {children && <ChatReferenceCardBody collapseKey={bodyCollapseKey}>{children}</ChatReferenceCardBody>}
      {(footer || href) && (
        <div className="orf-chat-reference-card-footer">
          {footer && <div className="orf-chat-reference-card-footer-note">{footer}</div>}
          {href && <ChatReferenceCardAction href={href} label={actionLabel} />}
        </div>
      )}
    </aside>
  );
}

export function ChatReferenceCardSection({
  children,
  title,
}: {
  children: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="orf-chat-reference-card-section">
      <h5>{title}</h5>
      <div>{children}</div>
    </section>
  );
}

export function ChatReferenceCardNotice({
  actionLabel,
  children,
  icon,
  onAction,
}: {
  actionLabel?: string;
  children: ReactNode;
  icon?: ReactNode;
  onAction?: () => void;
}) {
  return (
    <div className="orf-chat-reference-card-notice">
      {icon ?? <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="orf-chat-reference-card-notice-content">{children}</span>
      {actionLabel && onAction && (
        <button className="orf-chat-reference-card-notice-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
