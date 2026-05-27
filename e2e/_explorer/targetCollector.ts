import type { Page } from "@playwright/test";
import type { TargetAction, TargetCapability, UiTarget } from "./types";
import { normalizeRoutePattern, shortHash } from "./stateAbstractorRegistry";

type BrowserTarget = Omit<UiTarget, "id" | "routePattern">;

export type TargetCollectionScope = {
  rootSelector?: string;
};

export async function collectTargets(page: Page, scope: TargetCollectionScope = {}): Promise<UiTarget[]> {
  const targets = await page.evaluate((rootSelector) => {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const interactiveClassOrIdPattern = /\b(btn|button|submit|clickable|link|item|tab|menu)\b/i;
    const roleActionMap = new Map<string, TargetAction[]>([
      ["button", [{ type: "click" }, { type: "pressEnter" }, { type: "pressSpace" }]],
      ["link", [{ type: "click" }, { type: "pressEnter" }]],
      ["checkbox", [{ type: "click" }, { type: "pressSpace" }, { type: "toggle" }]],
      ["switch", [{ type: "click" }, { type: "pressSpace" }, { type: "toggle" }]],
      ["radio", [{ type: "click" }, { type: "pressSpace" }]],
      ["tab", [{ type: "click" }, { type: "pressEnter" }]],
      ["menuitem", [{ type: "click" }, { type: "pressEnter" }]],
    ]);

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
      if (tag === "a" && element instanceof HTMLAnchorElement && element.href) {
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

    function isElementEnabled(element: Element) {
      const disabled =
        "disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled);
      const ariaDisabled = element.getAttribute("aria-disabled") === "true";
      return !disabled && !ariaDisabled && !element.hasAttribute("inert");
    }

    function isInteractable(element: Element) {
      if (!element.isConnected || element.hasAttribute("hidden") || !isElementEnabled(element)) {
        return false;
      }
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
        tag === "summary" ||
        role === "button" ||
        role === "link" ||
        role === "menuitem" ||
        role === "option" ||
        role === "tab" ||
        role === "combobox" ||
        role === "switch" ||
        element.hasAttribute("aria-haspopup") ||
        inputType === "button" ||
        inputType === "submit";
      const toggle = role === "checkbox" || role === "radio" || role === "switch" || inputType === "checkbox" || inputType === "radio";
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

    function isReadonly(element: Element) {
      return (
        ("readOnly" in element && Boolean((element as HTMLInputElement | HTMLTextAreaElement).readOnly)) ||
        element.getAttribute("aria-readonly") === "true"
      );
    }

    function inferActions(element: Element): TargetAction[] {
      const tag = element.tagName.toLowerCase();
      const role = roleFor(element);
      const inputType = element instanceof HTMLInputElement ? element.type || "text" : "";
      const readonly = isReadonly(element);
      const actions: TargetAction[] = [];

      if (tag === "button" || inputType === "button" || inputType === "submit" || inputType === "reset") {
        actions.push({ type: "click" }, { type: "pressEnter" }, { type: "pressSpace" });
      } else if (element instanceof HTMLAnchorElement && element.href) {
        actions.push({ type: "click" }, { type: "pressEnter" });
      } else if (tag === "input") {
        if (["text", "search", "email", "url", "tel", "password", "number"].includes(inputType)) {
          actions.push({ type: "focus" });
          if (!readonly) {
            actions.push({ type: "typeText" }, { type: "clearText" });
          }
          actions.push({ type: "pressEnter" }, { type: "blur" });
        } else if (inputType === "checkbox") {
          actions.push({ type: "click" }, { type: "toggle" }, { type: "pressSpace" });
        } else if (inputType === "radio") {
          actions.push({ type: "click" }, { type: "pressSpace" });
        } else if (inputType === "range") {
          actions.push({ type: "focus" }, { type: "click" });
        }
      } else if (tag === "textarea") {
        actions.push({ type: "focus" });
        if (!readonly) {
          actions.push({ type: "typeText" }, { type: "clearText" });
        }
        actions.push({ type: "blur" });
      } else if (tag === "select") {
        actions.push({ type: "focus" }, { type: "selectOption" }, { type: "blur" });
      } else if (tag === "option") {
        actions.push({ type: "click" });
      } else if (tag === "summary" || tag === "details") {
        actions.push({ type: "click" }, { type: "pressEnter" }, { type: "pressSpace" });
      } else if (tag === "label") {
        actions.push({ type: "click" });
      } else if (element.getAttribute("contenteditable") === "true") {
        actions.push({ type: "focus" });
        if (!readonly) {
          actions.push({ type: "typeText" }, { type: "clearText" });
        }
        actions.push({ type: "blur" });
      }

      for (const action of roleActionMap.get(role) ?? []) {
        actions.push(action);
      }

      const tabindex = tabindexValue(element);
      if (tabindex !== null && tabindex >= 0) {
        actions.push({ type: "focus" }, { type: "pressEnter" }, { type: "pressSpace" });
      }

      const style = window.getComputedStyle(element);
      if (element.hasAttribute("onclick") || style.cursor === "pointer" || classOrIdSuggestsInteraction(element)) {
        actions.push({ type: "click" });
      }

      if (element.scrollHeight > element.clientHeight + 8 || element.scrollWidth > element.clientWidth + 8) {
        actions.push({ type: "scrollIntoView" });
      }

      return dedupeActions(actions);
    }

    function scoreInteractiveCandidate(element: Element): { confidence: number; reason: string[] } {
      const tag = element.tagName.toLowerCase();
      const role = roleFor(element);
      const inputType = element instanceof HTMLInputElement ? element.type || "text" : "";
      const reason: string[] = [];
      let confidence = 0;

      if (tag === "button") {
        confidence = Math.max(confidence, 1);
        reason.push("native:button");
      }
      if (element instanceof HTMLAnchorElement && element.href) {
        confidence = Math.max(confidence, 1);
        reason.push("native:a[href]");
      }
      if (["input", "textarea", "select", "option", "summary", "details", "label"].includes(tag)) {
        if (!(tag === "input" && inputType === "file")) {
          confidence = Math.max(confidence, 1);
          reason.push(`native:${tag}`);
        }
      }
      if (element.getAttribute("contenteditable") === "true") {
        confidence = Math.max(confidence, 0.9);
        reason.push("contenteditable");
      }
      if (roleActionMap.has(role)) {
        confidence = Math.max(confidence, 0.8);
        reason.push(`role:${role}`);
      }
      if (element.hasAttribute("onclick")) {
        confidence = Math.max(confidence, 0.7);
        reason.push("attr:onclick");
      }
      const tabindex = tabindexValue(element);
      if (tabindex !== null && tabindex >= 0) {
        confidence = Math.max(confidence, 0.5);
        reason.push("attr:tabindex");
      }
      if (window.getComputedStyle(element).cursor === "pointer") {
        confidence = Math.max(confidence, 0.4);
        reason.push("style:cursor-pointer");
      }
      if (classOrIdSuggestsInteraction(element)) {
        confidence = Math.max(confidence, 0.3);
        reason.push("heuristic:class-or-id");
      }

      return { confidence: Math.min(1, confidence), reason };
    }

    function discoverInteractiveTargets(root: ParentNode = document) {
      const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
      return elements
        .filter((element) => {
          if (!isInteractable(element)) {
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
        .map((element) => {
          const score = scoreInteractiveCandidate(element);
          const actions = inferActions(element);
          return { element, ...score, actions };
        })
        .filter((target) => target.confidence > 0 && target.actions.length > 0)
        .slice(0, 300);
    }

    function classOrIdSuggestsInteraction(element: Element) {
      const source = `${element.id} ${typeof element.className === "string" ? element.className : ""}`;
      return interactiveClassOrIdPattern.test(source);
    }

    function tabindexValue(element: Element) {
      if (!element.hasAttribute("tabindex")) {
        return null;
      }
      const parsed = Number.parseInt(element.getAttribute("tabindex") ?? "", 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function dedupeActions(actions: TargetAction[]) {
      const seen = new Set<string>();
      return actions.filter((action) => {
        const key = JSON.stringify(action);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    const sameKindCounts = new Map<string, number>();
    const root = rootSelector ? document.querySelector(rootSelector) : document;
    if (!root) {
      return [];
    }
    return discoverInteractiveTargets(root)
      .map((interactiveTarget) => {
        const element = interactiveTarget.element;
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
          `act:${interactiveTarget.actions.map((action) => action.type).join(".")}`,
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
          actions: interactiveTarget.actions,
          confidence: interactiveTarget.confidence,
          reason: interactiveTarget.reason,
        };
      });
  }, scope.rootSelector ?? null);

  const routePattern = routePatternForUrl(page.url());
  return (targets as BrowserTarget[]).map((target) => {
    const signature = routeScopedTargetSignature(routePattern, target.signature);
    return { ...target, routePattern, signature, id: `T-${shortHash(signature)}` };
  });
}

function routePatternForUrl(url: string) {
  return normalizeRoutePattern(new URL(url).pathname);
}

function routeScopedTargetSignature(routePattern: string, domSignature: string) {
  return `route:${routePattern}|${domSignature}`;
}
