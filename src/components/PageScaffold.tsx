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
      <div className="grid gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-3">
            <SkeletonBlock className="h-8 w-64" />
            <SkeletonBlock className="h-4 w-96" />
          </div>
          <SkeletonBlock className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
        <SkeletonBlock className="h-[420px]" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="orf-text-primary text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="orf-text-secondary mt-2 max-w-3xl text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
