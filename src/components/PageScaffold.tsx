import { SkeletonBlock } from "./ui";
import { usePageReady } from "../hooks/usePageReady";

export function PageScaffold({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ready = usePageReady();

  if (!ready) {
    return (
      <section className="orf-page">
        <header className="orf-page-header">
          <div className="orf-page-title-block">
            <SkeletonBlock className="h-8 w-64" />
            <SkeletonBlock className="h-4 w-96" />
          </div>
          <SkeletonBlock className="h-9 w-40" />
        </header>
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
    <section className="orf-page">
      <header className="orf-page-header">
        <div className="orf-page-title-block">
          <h1 className="orf-page-title">{title}</h1>
          {subtitle && <p className="orf-page-subtitle">{subtitle}</p>}
        </div>
        {action && <div className="orf-page-actions">{action}</div>}
      </header>
      <div className="orf-page-content">{children}</div>
    </section>
  );
}
