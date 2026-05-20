import { shortHash, stableStringify } from "./stableHash";
import type { RepeatableRegionRecord } from "./types";

export type DomTreeNodeSnapshot = {
  tag: string;
  role: string;
  selector?: string;
  classTokens: string[];
  dataAttributes: Record<string, string>;
  textBucket: string;
  subtreeTextBucket: string;
  children: DomTreeNodeSnapshot[];
};

export type RepeatableRegionAnalysis = {
  regions: RepeatableRegionRecord[];
  collapsedVisibleText: string;
};

type RegionCandidate = Omit<RepeatableRegionRecord, "id" | "signature" | "abstractionKey"> & {
  regionPath: string;
};

const businessTagPatterns: Array<[string, RegExp]> = [
  ["status:pendingRecruitment", /待征召|征召中|招募中/],
  ["status:challenging", /挑战中|进行中/],
  ["status:completed", /已完成|完成/],
  ["status:closed", /已关闭|关闭/],
  ["status:reviewing", /评审中|审核中/],
  ["status:open", /开启|开放|open/i],
  ["status:resolved", /已解决|resolved/i],
];

const hierarchyLayerPatterns: Array<[string, RegExp]> = [
  ["objective", /目标/],
  ["metric", /指标|结果/],
  ["task", /任务/],
  ["subtask", /子任务|检查项/],
];

const semanticClassPattern = /(^|[-_])(comment|message|thread|list|table|row|card|objective|result|task|subtask|metric|status)([-_]|$)/i;
const listLikeClassPattern = /(^|[-_])(list|table|timeline|thread-list|task-list|objective-list|result-list|subtask-list|card-list)([-_]|$)/i;
const domainListPattern =
  /(^|[-_])(comment|message|thread|objective|metric|task|subtask|bounty|feedback|ticket|result)[-_]?(list|table|row|item|items|tree|thread|panel)([-_]|$)/i;
const domainItemPattern = /(^|[-_])(comment|message|thread|objective|metric|task|subtask|bounty|feedback|ticket|result)([-_]|$)/i;
const layoutRegionPattern =
  /(^|[-_])(app|shell|layout|topbar|toolbar|sidebar|footer|header|nav|tabs|actions|dashboard|surface|metric-card|card|panel|section|container|content|wrapper|space|stack|grid|row|col|center|bottom|main)([-_]|$)/i;

export function analyzeRepeatableRegions(root: DomTreeNodeSnapshot | null, routePattern: string): RepeatableRegionAnalysis {
  if (!root) {
    return { regions: [], collapsedVisibleText: "" };
  }

  const regions = new Map<string, RepeatableRegionRecord>();
  const collapsedVisibleText = collapseNode(root, ["body"], [], routePattern, regions).replace(/\s+/g, " ").trim();

  return {
    regions: Array.from(regions.values()).sort((left, right) => left.abstractionKey.localeCompare(right.abstractionKey)),
    collapsedVisibleText,
  };
}

function collapseNode(
  node: DomTreeNodeSnapshot,
  path: string[],
  ancestors: DomTreeNodeSnapshot[],
  routePattern: string,
  regions: Map<string, RepeatableRegionRecord>,
): string {
  const region = detectRegion(node, path, ancestors, routePattern);
  if (region) {
    const record = createRegionRecord(region, routePattern);
    regions.set(record.signature, record);
    recordNestedRegions(node, path, ancestors, routePattern, regions);
    return `[repeatable:${record.abstractionKey}]`;
  }

  const childText = node.children.map((child, index) =>
    collapseNode(child, [...path, `${child.tag}:${index}`], [...ancestors, node], routePattern, regions),
  );
  return [node.textBucket, ...childText].filter((value) => value && value !== "none").join(" ");
}

function detectRegion(
  node: DomTreeNodeSnapshot,
  path: string[],
  ancestors: DomTreeNodeSnapshot[],
  routePattern: string,
): RegionCandidate | null {
  const semantic = semanticKind(node);
  const component = componentName(node) ?? regionLabel(node, semantic ?? "list");
  const parentComponent = nearestParentComponentName(ancestors);
  if (semantic === "comment" && isEmptyCommentRegion(node)) {
    return {
      routePattern,
      selector: node.selector,
      regionPath: path.join(">"),
      kind: "comment",
      label: regionLabel(node, "comment"),
      componentName: component,
      parentComponentName: parentComponent,
      presence: "none",
      itemShape: "comment:none",
      businessTags: [],
      hierarchyLayers: [],
    };
  }

  const grouped = groupRepeatableChildren(node);
  const repeatedGroups = Array.from(grouped.entries())
    .map(([itemShape, children]) => ({ itemShape, children }))
    .filter(({ children }) => children.length >= 2 || (children.length === 1 && isExplicitListLikeContainer(node)));

  if (repeatedGroups.length === 0) {
    return null;
  }

  const dominant = repeatedGroups.sort((left, right) => right.children.length - left.children.length)[0];
  if (!dominant) {
    return null;
  }

  const kind = semantic ?? repeatableKindFromChildren(dominant.children);
  const tags = unionSorted(dominant.children.flatMap((child) => businessTags(child.subtreeTextBucket)));
  const layers = unionSorted(dominant.children.flatMap((child) => hierarchyLayers(child.subtreeTextBucket)));
  const candidate: RegionCandidate = {
    routePattern,
    selector: node.selector,
    regionPath: path.join(">"),
    kind,
    label: regionLabel(node, kind),
    componentName: component,
    parentComponentName: parentComponent,
    presence: "some",
    itemShape: dominant.itemShape,
    businessTags: tags,
    hierarchyLayers: layers,
  };
  return isMeaningfulRepeatableRegion(candidate, node, dominant.children) ? candidate : null;
}

function createRegionRecord(candidate: RegionCandidate, routePattern: string): RepeatableRegionRecord {
  const signatureSource = {
    routePattern,
    kind: candidate.kind,
    label: candidate.label,
    itemShape: candidate.itemShape,
    regionPath: candidate.regionPath,
  };
  const signature = `repeatable:${shortHash(stableStringify(signatureSource))}`;
  const abstractionSource = {
    routePattern,
    kind: candidate.kind,
    label: candidate.label,
    componentName: candidate.componentName,
    parentComponentName: candidate.parentComponentName,
    presence: candidate.presence,
    itemShape: candidate.itemShape,
    businessTags: candidate.businessTags,
    hierarchyLayers: candidate.hierarchyLayers,
  };

  return {
    id: `R-${shortHash(signature)}`,
    signature,
    abstractionKey: stableStringify(abstractionSource),
    routePattern,
    kind: candidate.kind,
    label: candidate.label,
    componentName: candidate.componentName,
    parentComponentName: candidate.parentComponentName,
    selector: candidate.selector,
    presence: candidate.presence,
    itemShape: candidate.itemShape,
    businessTags: candidate.businessTags,
    hierarchyLayers: candidate.hierarchyLayers,
  };
}

function recordNestedRegions(
  node: DomTreeNodeSnapshot,
  path: string[],
  ancestors: DomTreeNodeSnapshot[],
  routePattern: string,
  regions: Map<string, RepeatableRegionRecord>,
) {
  for (const [index, child] of node.children.entries()) {
    const childPath = [...path, `${child.tag}:${index}`];
    const childAncestors = [...ancestors, node];
    const childRegion = detectRegion(child, childPath, childAncestors, routePattern);
    if (childRegion) {
      const record = createRegionRecord(childRegion, routePattern);
      regions.set(record.signature, record);
    }
    recordNestedRegions(child, childPath, childAncestors, routePattern, regions);
  }
}

function groupRepeatableChildren(node: DomTreeNodeSnapshot) {
  const groups = new Map<string, DomTreeNodeSnapshot[]>();
  for (const child of node.children) {
    if (isStructuralNoise(child)) {
      continue;
    }
    const shape = itemShape(child);
    groups.set(shape, [...(groups.get(shape) ?? []), child]);
  }
  return groups;
}

function itemShape(node: DomTreeNodeSnapshot): string {
  return stableStringify({
    tag: node.tag,
    role: node.role,
    semanticClass: semanticClassTokens(node),
    childShape: node.children.filter((child) => !isStructuralNoise(child)).map((child) => `${child.tag}:${child.role}`),
    targetHints: node.children
      .flatMap((child) => interactiveHints(child))
      .slice(0, 8)
      .sort(),
  });
}

function interactiveHints(node: DomTreeNodeSnapshot): string[] {
  const self =
    ["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "option", "combobox", "textbox", "select"].includes(node.role) ||
    ["button", "a", "input", "textarea", "select"].includes(node.tag)
      ? [`${node.tag}:${node.role}:${node.textBucket}`]
      : [];
  return [...self, ...node.children.flatMap((child) => interactiveHints(child))];
}

function isListLikeContainer(node: DomTreeNodeSnapshot) {
  const classText = node.classTokens.join(" ");
  const dataText = Object.entries(node.dataAttributes)
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");
  return (
    isExplicitListLikeContainer(node) ||
    node.children.length >= 2 && (listLikeClassPattern.test(classText) || /thread-list|list/i.test(dataText))
  );
}

function isExplicitListLikeContainer(node: DomTreeNodeSnapshot) {
  const classText = node.classTokens.join(" ");
  const dataText = Object.entries(node.dataAttributes)
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");
  return (
    ["ul", "ol", "tbody"].includes(node.tag) ||
    node.role === "list" ||
    listLikeClassPattern.test(classText) ||
    /thread-list|comment-list|task-list|objective-list|result-list|subtask-list/i.test(dataText)
  );
}

function isMeaningfulRepeatableRegion(
  candidate: RegionCandidate,
  node: DomTreeNodeSnapshot,
  repeatedChildren: DomTreeNodeSnapshot[],
) {
  if (candidate.kind === "comment") {
    return true;
  }

  const regionName = [
    candidate.label,
    candidate.componentName,
    Object.entries(node.dataAttributes)
      .map(([key, value]) => `${key}:${value}`)
      .join(" "),
    node.classTokens.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const childName = repeatedChildren.map((child) => `${child.classTokens.join(" ")} ${child.textBucket} ${child.subtreeTextBucket}`).join(" ");
  const hasDomainContainer = domainListPattern.test(regionName);
  const hasDomainItems = repeatedChildren.length >= 2 && domainItemPattern.test(childName);
  const isExplicitDomainList =
    (["ul", "ol", "tbody"].includes(node.tag) || node.role === "list" || node.role === "table") && domainItemPattern.test(childName);
  const isLayoutContainer = layoutRegionPattern.test(regionName);
  const hasBusinessState = candidate.businessTags.length > 0 || candidate.hierarchyLayers.length > 0;

  if (isLayoutContainer && !hasDomainContainer && !isExplicitDomainList) {
    return false;
  }

  if (hasDomainContainer || ((hasDomainItems || isExplicitDomainList) && hasBusinessState)) {
    return true;
  }

  if (!hasBusinessState || isLayoutContainer) {
    return false;
  }

  return false;
}

function semanticKind(node: DomTreeNodeSnapshot): RepeatableRegionRecord["kind"] | null {
  const haystack = [
    node.tag,
    node.role,
    node.textBucket,
    node.classTokens.join(" "),
    Object.entries(node.dataAttributes)
      .map(([key, value]) => `${key}:${value}`)
      .join(" "),
  ].join(" ");

  if (/comment|评论|回复|message|thread/i.test(haystack)) {
    return "comment";
  }
  if (/目标|指标|结果|任务|子任务|objective|result|task|subtask/i.test(haystack)) {
    return "hierarchy";
  }
  if (/list|table|列表|清单/i.test(haystack)) {
    return "list";
  }
  return null;
}

function repeatableKindFromChildren(children: DomTreeNodeSnapshot[]): RepeatableRegionRecord["kind"] {
  const haystack = children.map((child) => `${child.textBucket} ${child.subtreeTextBucket} ${child.classTokens.join(" ")}`).join(" ");
  if (/comment|评论|回复|message|thread/i.test(haystack)) {
    return "comment";
  }
  if (/目标|指标|结果|任务|子任务|objective|result|task|subtask/i.test(haystack)) {
    return "hierarchy";
  }
  return "list";
}

function isEmptyCommentRegion(node: DomTreeNodeSnapshot) {
  return /暂无评论|暂无回复|no comments|no replies/i.test(node.subtreeTextBucket);
}

function regionLabel(node: DomTreeNodeSnapshot, kind: RepeatableRegionRecord["kind"]) {
  const dataLabel = node.dataAttributes["data-comment-panel"] ? "comment-panel" : undefined;
  if (dataLabel) {
    return dataLabel;
  }
  const semanticClass = semanticClassTokens(node)[0];
  if (semanticClass) {
    return semanticClass;
  }
  if (node.textBucket && node.textBucket !== "none") {
    return node.textBucket.slice(0, 32);
  }
  return kind;
}

function componentName(node: DomTreeNodeSnapshot) {
  const dataComponent = node.dataAttributes["data-component"] || node.dataAttributes["data-testid"] || node.dataAttributes["data-test-id"];
  if (dataComponent) {
    return dataComponent;
  }
  const semanticClass = semanticClassTokens(node)[0];
  if (semanticClass) {
    return semanticClass;
  }
  const namedClass = node.classTokens.find((token) => !isUtilityClassToken(token));
  if (namedClass) {
    return namedClass;
  }
  return null;
}

function nearestParentComponentName(ancestors: DomTreeNodeSnapshot[]) {
  for (const ancestor of ancestors.slice().reverse()) {
    const name = componentName(ancestor);
    if (name) {
      return name;
    }
  }
  return "body";
}

function businessTags(text: string) {
  return businessTagPatterns.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function hierarchyLayers(text: string) {
  return hierarchyLayerPatterns.filter(([, pattern]) => pattern.test(text)).map(([layer]) => layer);
}

function semanticClassTokens(node: DomTreeNodeSnapshot) {
  return node.classTokens
    .filter((token) => semanticClassPattern.test(token))
    .sort();
}

function isUtilityClassToken(token: string) {
  return /^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|items-|justify-|content-|gap-|p[trblxy]?-\d|m[trblxy]?-\d|w-|h-|min-|max-|text-|font-|leading-|tracking-|bg-|border|rounded|shadow|overflow-|z-|opacity-|transition|duration|ease-|cursor-|select-|sr-only)/.test(
    token,
  );
}

function isStructuralNoise(node: DomTreeNodeSnapshot) {
  return ["script", "style", "svg", "path"].includes(node.tag);
}

function unionSorted(values: string[]) {
  return Array.from(new Set(values)).sort();
}
