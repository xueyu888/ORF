import type { Page } from "@playwright/test";
import { payloadForKind } from "./payloads";
import { isInAllowedScope, shouldRunEvent } from "./safety";
import type { EventParams, ExecutionIssue, ExecutionResult, ExplorerConfig, UiEvent } from "./types";

export async function executeEvent(page: Page, event: UiEvent, config: ExplorerConfig): Promise<ExecutionResult> {
  const start = Date.now();
  const issues: ExecutionIssue[] = [];
  let timedOut = false;

  if (!shouldRunEvent(event, config)) {
    return {
      ok: false,
      durationMs: 0,
      issues: [{ severity: "ordinary", type: "blocked-operation", message: `Blocked operation: ${event.operation}` }],
      routeEscape: false,
      timedOut: false,
    };
  }

  try {
    await runWithTimeout(runEvent(page, event, config), config.maxStepDuration + 250);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    timedOut = /Timeout|timed out/i.test(message);
    issues.push({
      severity: /Target page, context or browser has been closed|crash/i.test(message) ? "severe" : "ordinary",
      type: timedOut ? "timeout" : "execution-error",
      message: compactMessage(message),
    });
  }

  await page.waitForTimeout(60).catch(() => undefined);
  const currentUrl = page.url();
  const routeEscape = !isInAllowedScope(currentUrl, config);
  if (routeEscape) {
    issues.push({
      severity: "ordinary",
      type: "route-escape",
      message: `Route escaped explorer scope: ${currentUrl}`,
      url: currentUrl,
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== "severe"),
    durationMs: Date.now() - start,
    issues,
    routeEscape,
    timedOut,
  };
}

async function runEvent(page: Page, event: UiEvent, config: ExplorerConfig) {
  switch (event.operation) {
    case "click":
      await locatorFor(page, event).click({ button: event.params.button ?? "left", timeout: config.maxStepDuration });
      return;
    case "doubleClick":
      await locatorFor(page, event).dblclick({ timeout: config.maxStepDuration });
      return;
    case "hover":
      await locatorFor(page, event).hover({ timeout: config.maxStepDuration });
      return;
    case "focus":
      await locatorFor(page, event).focus({ timeout: config.maxStepDuration });
      return;
    case "insertText":
    case "pasteText":
      await locatorFor(page, event).fill(payloadFor(event.params), { timeout: config.maxStepDuration });
      return;
    case "clear":
      await locatorFor(page, event).fill("", { timeout: config.maxStepDuration });
      return;
    case "pressKey":
      if (event.target) {
        await locatorFor(page, event).focus({ timeout: config.maxStepDuration });
      }
      await page.keyboard.press(keyFor(event.params), { delay: 5 });
      return;
    case "modifiedKey":
      if (event.target) {
        await locatorFor(page, event).focus({ timeout: config.maxStepDuration });
      }
      await page.keyboard.press(modifiedKeyFor(event.params), { delay: 5 });
      return;
    case "selectOption":
      await selectOption(page, event, config);
      return;
    case "wheel":
      await wheel(page, event);
      return;
    case "backgroundClick":
      await backgroundClick(page, event.params);
      return;
    case "refresh":
      await page.reload({ waitUntil: "domcontentloaded", timeout: config.maxStepDuration });
      return;
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded", timeout: config.maxStepDuration }).catch(() => undefined);
      return;
    case "wait":
      await page.waitForTimeout(Math.min(event.params.durationMs ?? 250, config.maxStepDuration));
      return;
    case "repeatedClick":
      for (let index = 0; index < Math.min(5, event.params.count ?? 2); index += 1) {
        await locatorFor(page, event).click({ button: event.params.button ?? "left", timeout: config.maxStepDuration });
      }
      return;
  }
}

function locatorFor(page: Page, event: UiEvent) {
  if (!event.target) {
    throw new Error(`${event.operation} requires a target.`);
  }
  return page.locator(event.target.selector).first();
}

function payloadFor(params: EventParams) {
  if (!params.payloadKind) {
    throw new Error("Text event requires payloadKind.");
  }
  return payloadForKind(params.payloadKind);
}

function keyFor(params: EventParams) {
  return params.key ?? "Enter";
}

function modifiedKeyFor(params: EventParams) {
  const key = params.key ?? "A";
  const modifiers = (params.modifierSet ?? ["Primary"]).map((modifier) => (modifier === "Primary" ? "Control" : modifier));
  return [...modifiers, key].join("+");
}

async function wheel(page: Page, event: UiEvent) {
  if (event.target) {
    const box = await page.locator(event.target.selector).first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
  const distance = distanceFor(event.params.distanceBucket);
  const direction = event.params.direction ?? "down";
  const deltaX = direction === "left" ? -distance : direction === "right" ? distance : 0;
  const deltaY = direction === "up" ? -distance : direction === "down" ? distance : 0;
  await page.mouse.wheel(deltaX, deltaY);
}

async function selectOption(page: Page, event: UiEvent, config: ExplorerConfig) {
  const locator = locatorFor(page, event);
  const optionIndex = await locator.evaluate((element, bucket) => {
    if (!(element instanceof HTMLSelectElement) || element.options.length === 0) {
      return null;
    }

    const current = Math.max(0, element.selectedIndex);
    if (bucket === "last") {
      return element.options.length - 1;
    }
    if (bucket === "next") {
      return Math.min(element.options.length - 1, current + 1);
    }
    return 0;
  }, event.params.optionBucket ?? "next");

  if (optionIndex === null) {
    throw new Error("selectOption requires a select element.");
  }

  await locator.selectOption({ index: optionIndex }, { timeout: config.maxStepDuration });
}

async function backgroundClick(page: Page, params: EventParams) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const point = pointForBucket(params.pointBucket ?? "center", viewport);
  await page.mouse.click(point.x, point.y);
}

function distanceFor(bucket: EventParams["distanceBucket"]) {
  switch (bucket) {
    case "small":
      return 160;
    case "large":
      return 900;
    case "medium":
    default:
      return 420;
  }
}

function pointForBucket(bucket: string, viewport: { width: number; height: number }) {
  const padding = 20;
  switch (bucket) {
    case "top-left":
      return { x: padding, y: padding };
    case "top-right":
      return { x: viewport.width - padding, y: padding };
    case "bottom-left":
      return { x: padding, y: viewport.height - padding };
    case "bottom-right":
      return { x: viewport.width - padding, y: viewport.height - padding };
    case "center":
    default:
      return { x: viewport.width / 2, y: viewport.height / 2 };
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`UI explorer event timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function compactMessage(message: string) {
  return message.replace(/\s+/g, " ").slice(0, 500);
}
