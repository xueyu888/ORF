import type { Page } from "@playwright/test";
import { abstractState, type StateDomSnapshot } from "./stateAbstractorRegistry";
import type { NormalizedState } from "./types";

export type { StateDomSnapshot, StateAbstractor, StateAbstraction } from "./stateAbstractorRegistry";
export {
  classifyInputValue,
  createNormalizedState,
  getStateAbstractor,
  normalizeRoutePattern,
  registerStateAbstractor,
  registeredStateAbstractorNames,
  sanitizeSignature,
  sanitizeVisibleText,
  shortHash,
  stableStringify,
} from "./stateAbstractorRegistry";

export async function normalizeState(
  page: Page,
  networkPendingCount = 0,
  abstractorName = "normal",
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

    function longTextBucket(text: string | null | undefined) {
      const normalized = (text ?? "").replace(/\s+/g, " ").trim();
      if (!normalized) {
        return "none";
      }
      return normalized
        .toLowerCase()
        .replace(/[0-9a-f]{8,}/gi, "hex")
        .replace(/\d+/g, "0")
        .slice(0, 220);
    }

    function directText(element: Element) {
      return Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(" ");
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
      if (tag === "select") {
        return "select";
      }
      if (tag === "summary") {
        return "button";
      }
      if (tag === "textarea") {
        return "textbox";
      }
      if (tag === "input") {
        const type = (element as HTMLInputElement).type || "text";
        if (type === "checkbox") {
          return "checkbox";
        }
        if (type === "radio") {
          return "radio";
        }
        if (type === "button" || type === "submit") {
          return "button";
        }
        return "textbox";
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
            "summary",
            "[role=button]",
            "[role=link]",
            "[role=checkbox]",
            "[role=radio]",
            "[role=menuitem]",
            "[role=option]",
            "[role=tab]",
            "[role=switch]",
            "[role=combobox]",
            "[contenteditable=true]",
            "[tabindex]",
            "[aria-haspopup]",
          ].join(","),
        ),
      );
    }

    function dataAttributes(element: Element) {
      return Array.from(element.attributes).reduce<Record<string, string>>((result, attribute) => {
        if (attribute.name.startsWith("data-")) {
          result[attribute.name] = attribute.value.slice(0, 80);
        }
        return result;
      }, {});
    }

    function cssPath(element: Element) {
      const segments: string[] = [];
      let current: Element | null = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
        const tag = current.tagName.toLowerCase();
        const parent: Element | null = current.parentElement;
        if (!parent) {
          break;
        }
        const currentTag = current.tagName;
        const sameTagSiblings = Array.from(parent.children).filter((child): child is Element => child.tagName === currentTag);
        const index = sameTagSiblings.indexOf(current) + 1;
        segments.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return segments.length > 0 ? segments.join(" > ") : element.tagName.toLowerCase();
    }

    function domTree(element: Element, depth = 0, budget = { count: 0 }): unknown {
      budget.count += 1;
      if (depth > 8 || budget.count > 450) {
        return null;
      }
      const visibleChildren = Array.from(element.children).filter(isVisible).slice(0, 80);
      return {
        tag: element.tagName.toLowerCase(),
        role: explicitRole(element),
        selector: cssPath(element),
        classTokens: Array.from(element.classList).slice(0, 24),
        dataAttributes: dataAttributes(element),
        textBucket: longTextBucket(directText(element)),
        subtreeTextBucket: longTextBucket(element.textContent),
        children: visibleChildren.map((child) => domTree(child, depth + 1, budget)).filter(Boolean),
      };
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
      domTree: document.body ? domTree(document.body) : null,
    };
  });

  return normalizeDomSnapshot({ ...snapshot, networkPendingCount }, abstractorName);
}

export function normalizeDomSnapshot(
  snapshot: StateDomSnapshot,
  abstractorName = "normal",
): NormalizedState {
  return abstractState(snapshot, abstractorName);
}
