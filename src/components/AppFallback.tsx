import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export type AppFallbackContent = {
  title: string;
  description: string;
  detail?: string | null;
};

type AppErrorBoundaryState = {
  error: unknown | null;
};

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("ORF app render failed", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <AppFallbackPage {...fallbackContentForError(this.state.error)} />;
    }
    return this.props.children;
  }
}

export function AppFallbackPage({ description, detail, title }: AppFallbackContent) {
  return (
    <main className="orf-app-fallback-page" role="alert" aria-live="assertive">
      <section className="orf-app-fallback-panel">
        <div className="orf-app-fallback-icon" aria-hidden="true">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="orf-app-fallback-content">
          <h1>{title}</h1>
          <p>{description}</p>
          {detail && <pre>{detail}</pre>}
          <button className="orf-control orf-primary-action inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold" type="button" onClick={reloadApp}>
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
        </div>
      </section>
    </main>
  );
}

export function fallbackContentForError(error: unknown): AppFallbackContent {
  const detail = errorMessage(error);
  if (isFrontendAssetError(detail)) {
    return {
      title: "前端资源加载失败",
      description: "当前页面需要的前端资源没有成功加载，通常是客户端缓存和服务器资源版本不一致。请重新加载，仍失败就安装最新客户端。",
      detail,
    };
  }

  if (isBackendConnectionError(detail)) {
    return {
      title: "无法连接后端服务",
      description: "ORF 前端已经启动，但后端接口没有响应。请确认后端服务已启动，然后重新加载页面。",
      detail,
    };
  }

  return {
    title: "页面运行异常",
    description: "ORF 页面渲染时遇到异常。请重新加载页面；如果仍然出现，请升级客户端或联系管理员。",
    detail,
  };
}

function reloadApp() {
  window.location.reload();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isFrontendAssetError(message: string) {
  return /Failed to fetch dynamically imported module/i.test(message)
    || /Failed to load module script/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /Loading chunk .* failed/i.test(message)
    || /\/assets\/.*\b404\b/i.test(message);
}

function isBackendConnectionError(message: string) {
  return /Failed to fetch/i.test(message)
    || /NetworkError/i.test(message)
    || /Load failed/i.test(message)
    || /无法连接后端服务/i.test(message)
    || /认证服务暂时不可用/i.test(message);
}
