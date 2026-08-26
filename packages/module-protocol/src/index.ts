import type { ComponentType } from "react";

declare const orfUnitOfWorkTokenBrand: unique symbol;

export type OrfUnitOfWorkToken = {
  readonly [orfUnitOfWorkTokenBrand]: true;
};

export type ByteRangeSegment = {
  readonly end: number;
  readonly start: number;
};

export type ByteRangeRequest =
  | { readonly kind: "bounded"; readonly end: number | null; readonly start: number }
  | { readonly kind: "suffix"; readonly suffixLength: number };

export type ByteRangeSelection =
  | { readonly status: "none" }
  | { readonly status: "invalid" }
  | { readonly request: ByteRangeRequest; readonly status: "ok" };

export type ResolvedByteRange = ByteRangeSegment & {
  readonly totalLength: number;
};

export type ByteRangeResolution =
  | { readonly status: "none" }
  | { readonly range: ResolvedByteRange; readonly status: "satisfiable" }
  | { readonly status: "unsatisfiable"; readonly totalLength: number };

const byteRangeHeaderPattern = /^bytes=(\d*)-(\d*)$/i;

export function parseByteRangeHeader(value: string | readonly string[] | undefined): ByteRangeSelection {
  if (value === undefined) return { status: "none" };
  if (typeof value !== "string") {
    return value.length === 1 ? parseByteRangeHeader(value[0]) : { status: "invalid" };
  }

  const header = value.trim();
  if (!header) return { status: "none" };
  if (header.includes(",")) return { status: "invalid" };

  const match = byteRangeHeaderPattern.exec(header);
  if (!match) return { status: "invalid" };

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (!startText && !endText) return { status: "invalid" };

  if (!startText) {
    const suffixLength = parseSafeNonNegativeInteger(endText);
    return suffixLength && suffixLength > 0
      ? { status: "ok", request: { kind: "suffix", suffixLength } }
      : { status: "invalid" };
  }

  const start = parseSafeNonNegativeInteger(startText);
  if (start === null) return { status: "invalid" };
  if (!endText) return { status: "ok", request: { kind: "bounded", start, end: null } };

  const end = parseSafeNonNegativeInteger(endText);
  if (end === null || end < start) return { status: "invalid" };
  return { status: "ok", request: { kind: "bounded", start, end } };
}

export function resolveByteRangeSelection(selection: ByteRangeSelection, totalLength: number): ByteRangeResolution {
  const normalizedTotalLength = normalizeContentLength(totalLength);
  if (selection.status === "none") return { status: "none" };
  if (normalizedTotalLength === null) return { status: "unsatisfiable", totalLength: 0 };
  if (selection.status === "invalid" || normalizedTotalLength <= 0) {
    return { status: "unsatisfiable", totalLength: normalizedTotalLength };
  }

  if (selection.request.kind === "suffix") {
    const suffixLength = Math.min(selection.request.suffixLength, normalizedTotalLength);
    return {
      status: "satisfiable",
      range: {
        end: normalizedTotalLength - 1,
        start: normalizedTotalLength - suffixLength,
        totalLength: normalizedTotalLength,
      },
    };
  }

  const start = selection.request.start;
  if (start >= normalizedTotalLength) return { status: "unsatisfiable", totalLength: normalizedTotalLength };
  const end = Math.min(selection.request.end ?? normalizedTotalLength - 1, normalizedTotalLength - 1);
  if (end < start) return { status: "unsatisfiable", totalLength: normalizedTotalLength };
  return {
    status: "satisfiable",
    range: { end, start, totalLength: normalizedTotalLength },
  };
}

export function byteRangeContentLength(range: ByteRangeSegment) {
  return range.end - range.start + 1;
}

export function byteRangeContentRangeHeader(range: ResolvedByteRange) {
  return `bytes ${range.start}-${range.end}/${range.totalLength}`;
}

export function byteRangeUnsatisfiedContentRangeHeader(totalLength: number) {
  return `bytes */${normalizeContentLength(totalLength) ?? 0}`;
}

export function byteRangeRequestHeader(range: ByteRangeSegment) {
  return `bytes=${range.start}-${range.end}`;
}

function parseSafeNonNegativeInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeContentLength(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export type OrfWebModuleCommandItem = {
  readonly label: string;
  readonly path: string;
  readonly searchText: string;
  readonly type: string;
};

export type OrfWebModuleCommandSearchContext<CurrentUser = unknown> = {
  readonly currentUser: CurrentUser | null;
};

export type OrfWebModuleCommandSearchOptions = {
  readonly limit?: number;
  readonly signal?: AbortSignal;
};

export type OrfWebModuleCommandSearch<CurrentUser = unknown> = {
  readonly minQueryLength?: number;
  readonly canSearch?: (context: OrfWebModuleCommandSearchContext<CurrentUser>) => boolean;
  search(query: string, options: OrfWebModuleCommandSearchOptions): Promise<readonly OrfWebModuleCommandItem[]>;
};

export type OrfWebModuleRouteDefinition = {
  readonly id: string;
  readonly path: string;
  readonly routePath: string;
  readonly title: string;
};

export type OrfWebModuleRoute = OrfWebModuleRouteDefinition & {
  readonly Page: ComponentType;
};

export type OrfWebModuleNavigation = {
  readonly label: string;
  readonly path: string;
};

export type OrfWebModuleContribution<CurrentUser = unknown> = {
  readonly actions?: Readonly<Record<string, string>>;
  readonly breadcrumb: (pathname: string) => string | null;
  readonly commands?: readonly OrfWebModuleCommandSearch<CurrentUser>[];
  readonly id: string;
  readonly navigation: OrfWebModuleNavigation;
  readonly preload?: () => Promise<unknown>;
  readonly routes: readonly OrfWebModuleRoute[];
};
