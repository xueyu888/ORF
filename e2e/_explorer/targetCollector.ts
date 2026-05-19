import type { Page } from "@playwright/test";
import type { TargetCapability, UiTarget } from "./types";
import { shortHash } from "./stateNormalizer";

type BrowserTarget = Omit<UiTarget, "id">;

export async function collectTargets(page: Page): Promise<UiTarget[]> {
  const targets = await page.evaluate(() => {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    function bucketText(text: string | null | undefined) {
      const value = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!value) {
        return "none";
      }
      if (/^https?:\/\//.test(value)) {
        return "url";
      }
      return value.replace(/[0-9a-f]{8,}/gi, "hex").replace(/\d+/g, "0").slice(0, 36);
    }

    function rectBucket(rect: DOMRect) {
      return {
        x: Math.floor((rect.left / viewportWidth) * 12),
        y: Math.floor((rect.top / viewportHeight) * 12),
        width: Math.max(1, Math.min(12, Math.ceil((rect.width / viewportWidth) * 12))),
        height: Math.max(1, Math.min(12, Math.ceil((rect.height / viewportHeight) * 12))),
      };
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

    function roleFor(element: Element) {
      const explicitRole = element.getAttribute("role");
      if (explicitRole) {
        return explicitRole.toLowerCase();
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

    function isElementEnabled(element: Element) {
      const disabled =
        "disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled);
      const ariaDisabled = element.getAttribute("aria-disabled") === "true";
      return !disabled && !ariaDisabled;
    }

    function isVisibleAndReachable(element: Element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > viewportHeight ||
        rect.left > viewportWidth ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        style.pointerEvents === "none"
      ) {
        return false;
      }

      const centerX = Math.min(viewportWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const centerY = Math.min(viewportHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const topElement = document.elementFromPoint(centerX, centerY);
      return topElement === element || Boolean(topElement && (element.contains(topElement) || topElement.contains(element)));
    }

    function capabilitySet(element: Element): TargetCapability[] {
      const tag = element.tagName.toLowerCase();
      const role = roleFor(element);
      const inputType = element instanceof HTMLInputElement ? element.type : "";
      const capabilities = new Set<TargetCapability>();
      const clickable =
        tag === "button" ||
        tag === "a" ||
        role === "button" ||
        role === "link" ||
        inputType === "button" ||
        inputType === "submit";
      const toggle = role === "checkbox" || role === "radio" || inputType === "checkbox" || inputType === "radio";
      const textInput =
        tag === "textarea" ||
        element.getAttribute("contenteditable") === "true" ||
        (tag === "input" && !["button", "submit", "reset", "checkbox", "radio", "file", "hidden"].includes(inputType));

      if (clickable || toggle) {
        capabilities.add("click");
      }
      if (textInput) {
        capabilities.add("input");
      }
      if (tag === "select") {
        capabilities.add("select");
      }
      if (toggle) {
        capabilities.add("toggle");
      }
      if (textInput || clickable || toggle || tag === "select" || element.getAttribute("tabindex") !== null) {
        capabilities.add("focus");
        capabilities.add("keyboard");
      }
      if (element.scrollHeight > element.clientHeight + 8 || element.scrollWidth > element.clientWidth + 8) {
        capabilities.add("scroll");
      }

      return Array.from(capabilities).sort();
    }

    const selector = [
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
      "[aria-label]",
    ].join(",");
    const sameKindCounts = new Map<string, number>();
    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        if (!isElementEnabled(element) || !isVisibleAndReachable(element)) {
          return false;
        }
        if (element instanceof HTMLAnchorElement && element.href) {
          try {
            return new URL(element.href).origin === window.location.origin;
          } catch {
            return false;
          }
        }
        return true;
      })
      .slice(0, 300)
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const role = roleFor(element);
        const inputType = element instanceof HTMLInputElement ? element.type || "text" : undefined;
        const textBucket = bucketText(element.textContent);
        const labelBucket = bucketText(element.getAttribute("aria-label"));
        const placeholderBucket = bucketText(element.getAttribute("placeholder"));
        const rect = rectBucket(element.getBoundingClientRect());
        const capabilities = capabilitySet(element);
        const kind = [tag, role, inputType].filter(Boolean).join(":");
        const sameKindIndex = sameKindCounts.get(kind) ?? 0;
        sameKindCounts.set(kind, sameKindIndex + 1);
        const signature = [
          `tag:${tag}`,
          `role:${role}`,
          `type:${inputType ?? "none"}`,
          `label:${labelBucket}`,
          `placeholder:${placeholderBucket}`,
          `text:${textBucket}`,
          `rect:${rect.x}.${rect.y}.${rect.width}.${rect.height}`,
          `index:${sameKindIndex}`,
          `cap:${capabilities.join(".")}`,
        ].join("|");

        return {
          signature,
          selector: cssPath(element),
          kind,
          tag,
          role,
          inputType,
          textBucket,
          labelBucket,
          placeholderBucket,
          rect,
          capabilities,
        };
      });
  });

  return (targets as BrowserTarget[]).map((target) => ({ ...target, id: `T-${shortHash(target.signature)}` }));
}
