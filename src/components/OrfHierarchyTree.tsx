import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";

const TREE_LINE_COLOR = "var(--orf-tree-line)";
const TREE_LINE_WIDTH = 1.8;
const TREE_RADIUS = 12;

const contentLeftByDepth: Record<1 | 2 | 3, number> = {
  1: 36,
  2: 42,
  3: 68,
};

type AnchorGeometry = {
  branchEndX?: number;
  bottom: number;
  centerX: number;
  centerY: number;
  left: number;
  parentId?: string;
};

type BranchTargetGeometry = {
  endOffset: number;
  rect: DOMRect;
};

type TreeGeometry = {
  height: number;
  paths: string[];
  width: number;
};

export function HierarchyCell({
  depth,
  children,
  className,
}: {
  depth: 1 | 2 | 3;
  isLast?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("relative flex min-w-0 items-center", className)} style={{ paddingLeft: `${contentLeftByDepth[depth]}px` }}>
      <div className="relative z-30 flex min-w-0 items-center gap-3">{children}</div>
    </div>
  );
}

export function HierarchyTreeOverlay({
  container,
}: {
  container: HTMLElement | null;
}) {
  const [geometry, setGeometry] = useState<TreeGeometry>({ width: 0, height: 0, paths: [] });

  useLayoutEffect(() => {
    if (!container) {
      return undefined;
    }

    let frame = 0;

    const measure = () => {
      frame = 0;
      const nextGeometry = getTreeGeometry(container);
      setGeometry((current) => (sameGeometry(current, nextGeometry) ? current : nextGeometry));
    };

    const scheduleMeasure = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(measure);
    };

    measure();

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [container]);

  if (geometry.paths.length === 0) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="orf-hierarchy-overlay pointer-events-none absolute left-0 top-0 z-20"
      data-hierarchy-tree-overlay="true"
      height={geometry.height}
      width={geometry.width}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      {geometry.paths.map((path, index) => (
        <path
          key={`${index}-${path}`}
          d={path}
          fill="none"
          className="orf-hierarchy-path"
          stroke={TREE_LINE_COLOR}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={TREE_LINE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function getTreeGeometry(container: HTMLElement): TreeGeometry {
  const containerRect = container.getBoundingClientRect();
  const branchTargets = new Map<string, BranchTargetGeometry>();
  const anchors = new Map<string, AnchorGeometry>();
  const childGroups = new Map<string, AnchorGeometry[]>();

  container.querySelectorAll<HTMLElement>("[data-hierarchy-branch-target]").forEach((element) => {
    const id = element.dataset.hierarchyBranchTarget;

    if (id) {
      branchTargets.set(id, {
        endOffset: Number(element.dataset.hierarchyBranchEndOffset ?? -6),
        rect: element.getBoundingClientRect(),
      });
    }
  });

  container.querySelectorAll<HTMLElement>("[data-hierarchy-anchor]").forEach((element) => {
    const id = element.dataset.hierarchyAnchor;

    if (!id) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const branchTarget = branchTargets.get(id);
    const geometry: AnchorGeometry = {
      branchEndX: branchTarget ? branchTarget.rect.left - containerRect.left + branchTarget.endOffset : undefined,
      bottom: rect.bottom - containerRect.top,
      centerX: rect.left - containerRect.left + rect.width / 2,
      centerY: rect.top - containerRect.top + rect.height / 2,
      left: rect.left - containerRect.left,
      parentId: element.dataset.hierarchyParent,
    };

    anchors.set(id, geometry);

    if (geometry.parentId) {
      const group = childGroups.get(geometry.parentId) ?? [];
      group.push(geometry);
      childGroups.set(geometry.parentId, group);
    }
  });

  const paths: string[] = [];

  childGroups.forEach((children, parentId) => {
    const parent = anchors.get(parentId);

    if (!parent) {
      return;
    }

    const sortedChildren = children.sort((left, right) => left.centerY - right.centerY);
    const lastChild = sortedChildren[sortedChildren.length - 1];
    const x = round(parent.centerX);
    const startY = round(parent.bottom);
    const endY = round(Math.max(startY, lastChild.centerY - TREE_RADIUS));

    if (endY > startY) {
      paths.push(`M ${x} ${startY} V ${endY}`);
    }

    sortedChildren.forEach((child) => {
      const y = round(child.centerY);
      const curveStartY = round(Math.max(startY, y - TREE_RADIUS));
      const curveX = round(x + TREE_RADIUS);
      const endX = round(Math.max(curveX, child.branchEndX ?? child.left - 8));

      paths.push(`M ${x} ${curveStartY} Q ${x} ${y} ${curveX} ${y} H ${endX}`);
    });
  });

  return {
    height: round(containerRect.height),
    paths,
    width: round(containerRect.width),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function sameGeometry(left: TreeGeometry, right: TreeGeometry) {
  return left.width === right.width && left.height === right.height && left.paths.length === right.paths.length && left.paths.every((path, index) => path === right.paths[index]);
}
