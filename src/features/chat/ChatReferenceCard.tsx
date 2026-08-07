import { clsx } from "clsx";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { actionButtonClassName } from "../../components/ui";

export type ChatReferenceCardStatus = "ready" | "loading" | "missing" | "error";

export type ChatReferenceCardProps = {
  actionHref?: string | null;
  actionLabel?: string;
  badge?: ReactNode;
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
    <aside className={clsx("orf-chat-reference-card", `orf-chat-reference-card-${status}`, className)} role="group">
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
      {children && <div className="orf-chat-reference-card-body">{children}</div>}
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
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="orf-chat-reference-card-notice">
      {icon ?? <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span>{children}</span>
    </div>
  );
}
