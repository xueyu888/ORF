import { useLocation } from "react-router-dom";
import { SkeletonBlock } from "./ui";
import { breadcrumb } from "./appShellBreadcrumb";
import { usePageReady } from "../hooks/usePageReady";

export function PageScaffold({
  title,
  subtitle,
  action,
  children,
  hideHeader = false,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  hideHeader?: boolean;
}) {
  const ready = usePageReady();
  const location = useLocation();
  const shellTitleParts = breadcrumb(location.pathname)
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
  const showContextTitle = !hideHeader && !shellTitleParts.includes(title.trim());
  const hasContextHeader = !hideHeader && Boolean(showContextTitle || subtitle || action);

  if (!ready) {
    return (
      <section className="orf-page" aria-label={title}>
        {hasContextHeader && (
          <header className="orf-page-context">
            {subtitle && (
              <div className="orf-page-context-copy">
                {showContextTitle && <SkeletonBlock className="h-7 w-56" />}
                <SkeletonBlock className="h-4 w-96" />
              </div>
            )}
            {showContextTitle && !subtitle && (
              <div className="orf-page-context-copy">
                <SkeletonBlock className="h-7 w-56" />
              </div>
            )}
            {action && <SkeletonBlock className="h-9 w-40" />}
          </header>
        )}
        <div className="orf-page-content">
          <div className="grid grid-cols-4 gap-4">
            <SkeletonBlock className="h-32" />
            <SkeletonBlock className="h-32" />
            <SkeletonBlock className="h-32" />
            <SkeletonBlock className="h-32" />
          </div>
          <SkeletonBlock className="h-[420px]" />
        </div>
      </section>
    );
  }

  return (
    <section className="orf-page" aria-label={title}>
      {hasContextHeader && (
        <header className="orf-page-context">
          {(showContextTitle || subtitle) && (
            <div className="orf-page-context-copy">
              {showContextTitle && <h2 className="orf-page-context-title">{title}</h2>}
              {subtitle && <p className="orf-page-subtitle">{subtitle}</p>}
            </div>
          )}
          {action && <div className="orf-page-actions">{action}</div>}
        </header>
      )}
      <div className="orf-page-content">{children}</div>
    </section>
  );
}
