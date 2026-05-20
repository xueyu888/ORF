import type { BrowserContext, Page, Request, Response } from "@playwright/test";
import { targetUrl } from "./safety";
import type { ExecutionIssue, ExplorerConfig } from "./types";

export async function resetToTarget(page: Page, config: ExplorerConfig) {
  await page.goto(targetUrl(config), { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(100);
}

export function attachDiagnostics(context: BrowserContext, page: Page) {
  const issues: ExecutionIssue[] = [];
  const pending = new Set<Request>();

  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") {
      issues.push({ severity: "ordinary", type: "console-error", message: message.text().slice(0, 500), url: page.url() });
    }
  };
  const onPageError = (error: Error) => {
    issues.push({ severity: "severe", type: "pageerror", message: error.message.slice(0, 500), url: page.url() });
  };
  const onRequest = (request: Request) => {
    if (request.url().startsWith("http")) {
      pending.add(request);
    }
  };
  const onRequestFinished = (request: Request) => {
    pending.delete(request);
  };
  const onRequestFailed = (request: Request) => {
    pending.delete(request);
    issues.push({
      severity: "ordinary",
      type: "request-failed",
      message: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.slice(0, 500),
      url: request.url(),
    });
  };
  const onResponse = (response: Response) => {
    if (response.status() >= 500) {
      issues.push({
        severity: "ordinary",
        type: "server-error-response",
        message: `${response.status()} ${response.url()}`.slice(0, 500),
        url: response.url(),
      });
    }
  };
  const onNewPage = async (newPage: Page) => {
    if (newPage !== page) {
      issues.push({ severity: "ordinary", type: "new-window", message: `Closed new page: ${newPage.url()}` });
      await newPage.close().catch(() => undefined);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("request", onRequest);
  page.on("requestfinished", onRequestFinished);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  context.on("page", onNewPage);

  return {
    cursor: () => issues.length,
    readSince: (cursor: number) => issues.slice(cursor),
    pendingCount: () => pending.size,
    detach: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("request", onRequest);
      page.off("requestfinished", onRequestFinished);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
      context.off("page", onNewPage);
    },
  };
}

export function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
