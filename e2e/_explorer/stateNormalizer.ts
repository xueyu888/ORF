import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type { InputValueKind, NormalizedState } from "./types";

export type StateDomSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  focusedSignature: string | null;
  targets: Array<{
    signature: string;
    kind: string;
    disabled: boolean;
    value?: string;
  }>;
  flags: {
    hasError: boolean;
    hasToast: boolean;
    hasModal: boolean;
    hasLoading: boolean;
    hasDrawer: boolean;
  };
  bodyChildCount: number;
  networkPendingCount?: number;
};

export async function normalizeState(
  page: Page,
  networkPendingCount = 0,
  mode: "normal" | "coarse" = "normal",
): Promise<NormalizedState> {
  const snapshot = await page.evaluate(() => {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    function textBucket(text: string | null | undefined) {
      const normalized = (text ?? "").replace(/\s+/g, " ").trim();
      if (!normalized) {
        return "none";
      }
      return normalized
        .toLowerCase()
        .replace(/[0-9a-f]{8,}/gi, "hex")
        .replace(/\d+/g, "0")
        .slice(0, 36);
    }

    function rectBucket(rect: DOMRect) {
      return [
        Math.floor((rect.left / viewportWidth) * 10),
        Math.floor((rect.top / viewportHeight) * 10),
        Math.min(10, Math.ceil((rect.width / viewportWidth) * 10)),
        Math.min(10, Math.ceil((rect.height / viewportHeight) * 10)),
      ].join(".");
    }

    function explicitRole(element: Element) {
      const role = element.getAttribute("role");
      if (role) {
        return role.toLowerCase();
      }
      const tag = element.tagName.toLowerCase();
      if (tag === "button") {
        return "button";
      }
      if (tag === "a") {
        return "link";
      }
      if (tag === "input") {
        return (element as HTMLInputElement).type || "input";
      }
      return tag;
    }

    function candidateElements() {
      return Array.from(
        document.querySelectorAll(
          [
            "button",
            "a",
            "input",
            "textarea",
            "select",
            "[role=button]",
            "[role=link]",
            "[role=checkbox]",
            "[role=radio]",
            "[contenteditable=true]",
            "[tabindex]",
          ].join(","),
        ),
      );
    }

    function isVisible(element: Element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= viewportHeight &&
        rect.left <= viewportWidth &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none"
      );
    }

    const kindCounts = new Map<string, number>();
    const targets = candidateElements()
      .filter(isVisible)
      .slice(0, 250)
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const role = explicitRole(element);
        const input = element instanceof HTMLInputElement ? element : null;
        const inputType = input?.type || "";
        const kind = [tag, role, inputType].filter(Boolean).join(":");
        const index = kindCounts.get(kind) ?? 0;
        kindCounts.set(kind, index + 1);
        const rect = element.getBoundingClientRect();
        const label = textBucket(element.getAttribute("aria-label"));
        const placeholder = textBucket(element.getAttribute("placeholder"));
        const text = textBucket(element.textContent);
        const signature = [
          kind,
          `label:${label}`,
          `placeholder:${placeholder}`,
          `text:${text}`,
          `rect:${rectBucket(rect)}`,
          `index:${index}`,
        ].join("|");
        const value =
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? element.value
            : element instanceof HTMLSelectElement
              ? element.value
              : undefined;
        const disabled =
          "disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled);
        return { signature, kind, disabled, value };
      });

    const active = document.activeElement;
    const focusedSignature =
      active && active !== document.body
        ? targets.find((target) => active instanceof Element && target.signature.includes(explicitRole(active)))?.signature ?? null
        : null;

    const bodyText = document.body?.innerText ?? "";
    const hasTextMatch = (pattern: RegExp) => pattern.test(bodyText);
    const flags = {
      hasError:
        document.querySelector('[role="alert"], [aria-invalid="true"]') !== null ||
        hasTextMatch(/\berror\b|错误|失败|无权限|invalid|failed/i),
      hasToast: document.querySelector('[aria-live], [role="status"], .toast, [class*="toast"]') !== null,
      hasModal: document.querySelector("dialog, [role=dialog], [aria-modal=true]") !== null,
      hasLoading:
        document.querySelector('[aria-busy="true"], [role=progressbar], progress, [class*="loading"]') !== null ||
        hasTextMatch(/loading|加载|处理中/i),
      hasDrawer: document.querySelector('[class*="drawer"], [data-state="open"]') !== null,
    };

    return {
      url: window.location.href,
      title: document.title,
      visibleText: bodyText,
      focusedSignature,
      targets,
      flags,
      bodyChildCount: document.body?.children.length ?? 0,
    };
  });

  return normalizeDomSnapshot({ ...snapshot, networkPendingCount }, mode);
}

export function normalizeDomSnapshot(
  snapshot: StateDomSnapshot,
  mode: "normal" | "coarse" = "normal",
): NormalizedState {
  const routePattern = normalizeRoutePattern(new URL(snapshot.url).pathname);
  const inputValueKinds = snapshot.targets
    .map((target) => (target.value === undefined ? null : classifyInputValue(target.value)))
    .filter((value): value is InputValueKind => value !== null)
    .sort();
  const visibleTargetSummary = snapshot.targets.reduce<Record<string, number>>((summary, target) => {
    summary[target.kind] = (summary[target.kind] ?? 0) + 1;
    return summary;
  }, {});
  const enabled = snapshot.targets.filter((target) => !target.disabled).length;
  const disabled = snapshot.targets.length - enabled;
  const targetSignatures = Array.from(
    new Set(snapshot.targets.map((target) => sanitizeSignature(target.signature) ?? target.signature)),
  ).sort();
  const sanitizedText = sanitizeVisibleText(snapshot.visibleText);
  const stateWithoutId = {
    routePattern,
    visibleTargetSummary,
    interactableStructure: Object.entries(visibleTargetSummary)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => `${kind}:${count}`),
    focusedTargetSignature: sanitizeSignature(snapshot.focusedSignature),
    inputValueKinds,
    flags: {
      ...snapshot.flags,
      isWhiteScreen: sanitizedText.length === 0 && snapshot.targets.length === 0 && snapshot.bodyChildCount <= 1,
    },
    disabledSummary: { enabled, disabled },
    networkPendingSummary: networkPendingBucket(snapshot.networkPendingCount ?? 0),
    mainVisibleTextHash: shortHash(sanitizedText),
    targetSignatures,
  };
  if (mode === "coarse") {
    const coarseStateWithoutId = {
      routePattern,
      visibleTargetSummary,
      interactableStructure: stateWithoutId.interactableStructure,
      focusedTargetSignature: null,
      inputValueKinds: [],
      flags: stateWithoutId.flags,
      disabledSummary: stateWithoutId.disabledSummary,
      networkPendingSummary: "coarse",
      mainVisibleTextHash: "coarse",
      targetSignatures: [],
    };
    const fingerprint = stableStringify(coarseStateWithoutId);
    const id = `S-${shortHash(fingerprint)}`;
    return { id, fingerprint, ...coarseStateWithoutId };
  }
  const fingerprint = stableStringify(stateWithoutId);
  const id = `S-${shortHash(fingerprint)}`;
  return { id, fingerprint, ...stateWithoutId };
}

export function classifyInputValue(value: string): InputValueKind {
  if (value.length === 0) {
    return "empty";
  }
  if (/^\s+$/.test(value)) {
    return "whitespaceOnly";
  }
  if (value.includes("\n")) {
    return "multiLine";
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "emailLike";
  }
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return "numberLike";
  }
  if (/<script\b/i.test(value) || /[{[(<][^}\])>]*$/.test(value)) {
    return "malformed";
  }
  if (/^\s*[{[]/.test(value) || /^https?:\/\//i.test(value) || /<\/?[a-z][\s\S]*>/i.test(value)) {
    return "structured";
  }
  if (/\p{Extended_Pictographic}/u.test(value)) {
    return "emoji";
  }
  if (/[^\u0000-\u007f]/.test(value)) {
    return "unicode";
  }
  if (value.length > 500) {
    return "veryLong";
  }
  if (value.length > 100) {
    return "long";
  }
  return "short";
}

export function normalizeRoutePattern(pathname: string) {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/[0-9a-f]{8,}/gi, ":hex")
    .replace(/\b\d+\b/g, ":num")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

export function sanitizeVisibleText(text: string) {
  return text
    .replace(/https?:\/\/\S+/gi, " url ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " email ")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, " uuid ")
    .replace(/[0-9a-f]{12,}/gi, " token ")
    .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\b/g, " date ")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " time ")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function sanitizeSignature(signature: string | null) {
  return signature
    ?.replace(/https?:\/\/\S+/gi, "url")
    .replace(/[0-9a-f]{8,}/gi, "hex")
    .replace(/\d+/g, "0") ?? null;
}

export function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function networkPendingBucket(count: number) {
  if (count <= 0) {
    return "none";
  }
  if (count <= 2) {
    return "low";
  }
  if (count <= 8) {
    return "medium";
  }
  return "high";
}
