import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { AppErrorBoundary, fallbackContentForError } from "./components/AppFallback";
import { applyDesignTokens } from "./config/designTokens";
import { OrfProvider } from "./state/OrfProvider";
import "./styles.css";

applyDesignTokens();

const rootElement = document.getElementById("root");

try {
  if (!rootElement) {
    renderStaticFallback(document.body, {
      title: "页面容器缺失",
      description: "ORF 页面缺少根容器，无法启动前端应用。请重新加载页面。",
      detail: "Missing #root",
    });
  } else {
    createRoot(rootElement).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <BrowserRouter>
            <OrfProvider>
              <Routes>
                <Route path="/" element={<Navigate to="/bounties" replace />} />
                <Route path="/*" element={<App />} />
              </Routes>
            </OrfProvider>
          </BrowserRouter>
        </AppErrorBoundary>
      </React.StrictMode>,
    );
  }
} catch (error) {
  renderStaticFallback(rootElement ?? document.body, fallbackContentForError(error));
}

function renderStaticFallback(target: HTMLElement, content: { title: string; description: string; detail?: string | null }) {
  target.innerHTML = [
    '<main class="orf-app-fallback-page" role="alert" aria-live="assertive">',
    '<section class="orf-app-fallback-panel">',
    '<div class="orf-app-fallback-content">',
    `<h1>${escapeHtml(content.title)}</h1>`,
    `<p>${escapeHtml(content.description)}</p>`,
    content.detail ? `<pre>${escapeHtml(content.detail)}</pre>` : "",
    '<button class="orf-control orf-action-button orf-action-button-primary orf-action-button-md" type="button" onclick="window.location.reload()">重新加载</button>',
    "</div>",
    "</section>",
    "</main>",
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
