import { useEffect, useState, type MouseEvent } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  ElementId,
  PathAnchorsResult,
} from "../../../../apps/canvas/src/channel/protocol";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";

import { applyAffine, inverseApplyAffine } from "./affine";
import {
  closestTOnCubic,
  splitSegmentDeCasteljau,
  type Pt,
} from "./path-math";

/**
 * Step 5c — path-edit chrome.
 *
 * Renders one square dot per anchor and a round dot pair (left /
 * right Bezier handles) on a single-selected path-bearing element
 * when `useSelection().pathEditMode` is on. Handles tag themselves
 * with `data-path-anchor="<index>:<role>"` so ViewportCanvas's
 * pointer router can begin a `PathEdit { address }` gesture once
 * the routing is wired up (5c follow-up).
 *
 * Data source: `client.pathAnchors(id)` over the canvas channel.
 * The fetch fires once per selection change and once when path-
 * edit mode toggles on; the result lives in component-local state
 * so the host doesn't need to subscribe to anchor updates between
 * fetches.
 */
function PathEditRender(props: OverlayProps) {
  const {
    elementSelection,
    pathEditMode,
    selectedAnchorIndex,
    setSelectedAnchorIndex,
  } = useSelection();
  const client = useCanvasClient();
  const [anchors, setAnchors] = useState<PathAnchorsResult | null>(null);
  const target = pathEditMode && elementSelection.length === 1
    ? elementSelection[0]
    : null;

  useEffect(() => {
    if (!target) {
      setAnchors(null);
      return;
    }
    let cancelled = false;
    void client
      .pathAnchors(target)
      .then((result) => {
        if (!cancelled) setAnchors(result);
      })
      .catch(() => {
        if (!cancelled) setAnchors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, target?.kind, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to mutation-applied notifications so the overlay
  // refreshes its anchor table after a Track-J insert/remove/
  // curve-type mutation lands. Without this, the chrome would
  // show stale anchor positions until the next selection change.
  useEffect(() => {
    if (!target) return;
    const off = client.subscribe((msg) => {
      if (
        msg.kind !== "mutationApplied" &&
        msg.kind !== "undoApplied" &&
        msg.kind !== "redoApplied"
      ) {
        return;
      }
      void client.pathAnchors(target).then((result) => setAnchors(result));
    });
    return off;
  }, [client, target?.kind, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target || !anchors || anchors.anchors.length === 0) return null;
  const pr = props.pageRects.get(anchors.pageId);
  if (!pr) return null;

  const inv = 1 / props.camera.scale;
  const matrix = anchors.itemTransform ?? null;

  // Track J fan-out — path-topology mutations accept Polygon,
  // TextFrame, Rectangle, GraphicLine (all four carry the same
  // `anchors` table). Oval / Group don't and stay read-only.
  const editTarget: ElementId | null =
    target.kind === "polygon" ||
    target.kind === "textFrame" ||
    target.kind === "rectangle" ||
    target.kind === "graphicLine"
      ? target
      : null;

  const onAnchorDown = (i: number) => () => {
    if (editTarget === null) return;
    setSelectedAnchorIndex(i);
  };

  const onAnchorDoubleClick = (i: number) => (e: MouseEvent<SVGElement>) => {
    if (editTarget === null) return;
    e.preventDefault();
    e.stopPropagation();
    const a = anchors.anchors[i];
    if (!a) return;
    // "Currently corner" iff both handles coincide with the
    // anchor (IDML's zero-handle convention for sharp corners).
    const isCorner =
      Math.hypot(a.left[0] - a.anchor[0], a.left[1] - a.anchor[1]) < 1e-3 &&
      Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1]) < 1e-3;
    void client.mutate({
      op: "pathPointCurveType",
      args: { elementId: editTarget, index: i, smooth: isCorner },
    });
  };

  // Track J — segment click → curve-preserving insert. The
  // handler maps the click into the path's local coords (inverse
  // itemTransform), finds the closest parametric `t` on the
  // segment's cubic via the de-Casteljau-friendly closest-point
  // search, runs the split to get the new anchor + adjusted
  // neighbour handles, and dispatches a Batch of three
  // mutations so the whole insert lands as one undo entry.
  //
  // `closingSubEnd != null` flags the wraparound (last → first)
  // segment of a closed subpath. The new anchor lands at flat
  // index `closingSubEnd`, becoming the new last anchor of that
  // subpath; the apply layer's default strictly-greater starts
  // rule would assign it to the NEXT subpath instead, so we
  // pass an explicit `prevSubpathStarts` override that bumps the
  // boundary entry. For the last subpath's closing edge (where
  // `closingSubEnd === anchors.length`) no entry needs bumping
  // and the override is omitted.
  const onSegmentDown =
    (segStart: number, segEnd: number, closingSubEnd: number | null) =>
    (e: MouseEvent<SVGPathElement>) => {
      if (editTarget === null) return;
      e.preventDefault();
      e.stopPropagation();
      // The hit zone is an SVG element inside the overlay's root
      // <svg>. `currentTarget.ownerSVGElement` gives us the root;
      // its bounding rect lets us translate clientX/Y → doc-space.
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const docPt = pt.matrixTransform(ctm.inverse());
      // doc-space → page-local → path-local (inverse itemTransform).
      const pageLocal: Pt = [docPt.x - pr.x, docPt.y - pr.y];
      const pathLocal = inverseApplyAffine(matrix, pageLocal[0], pageLocal[1]);
      if (!pathLocal) return;
      const sA = anchors.anchors[segStart];
      const eA = anchors.anchors[segEnd];
      if (!sA || !eA) return;
      const start: Pt = sA.anchor;
      const startRight: Pt = sA.right;
      const endLeft: Pt = eA.left;
      const end: Pt = eA.anchor;
      const t = closestTOnCubic(start, startRight, endLeft, end, pathLocal);
      const split = splitSegmentDeCasteljau(
        start,
        startRight,
        endLeft,
        end,
        t,
      );
      // Dispatch order matters: update both endpoint handles AT
      // their OLD flat indices first, then insert the new anchor.
      // For internal segments the insert index is segStart + 1.
      // For closing edges (wraparound segments) the new anchor
      // lands at the subpath's END (`closingSubEnd`) — anchor
      // indices segStart and segEnd refer to positions that
      // straddle a subpath boundary, so neither would adjust if
      // we used segStart + 1.
      const insertIdx =
        closingSubEnd !== null ? closingSubEnd : segStart + 1;
      // For closing-edge inserts at a subpath boundary the apply
      // layer's default rule (strictly-greater) doesn't bump the
      // boundary entry; supply explicit post-Insert starts so the
      // new anchor stays inside the prior subpath.
      let prevSubpathStarts: number[] | undefined;
      if (
        closingSubEnd !== null &&
        closingSubEnd < anchors.anchors.length
      ) {
        prevSubpathStarts = Array.from(anchors.subpathStarts, (s) =>
          s >= closingSubEnd ? s + 1 : s,
        );
      }
      const ops = [
        {
          op: "pathPointSet" as const,
          args: {
            elementId: editTarget,
            index: segStart,
            role: "right" as const,
            position: split.startRight as [number, number],
          },
        },
        {
          op: "pathPointSet" as const,
          args: {
            elementId: editTarget,
            index: segEnd,
            role: "left" as const,
            position: split.endLeft as [number, number],
          },
        },
        {
          op: "pathPointInsert" as const,
          args: {
            elementId: editTarget,
            index: insertIdx,
            anchor: {
              anchor: split.midAnchor as [number, number],
              left: split.midLeft as [number, number],
              right: split.midRight as [number, number],
            },
            ...(prevSubpathStarts !== undefined
              ? { prevSubpathStarts }
              : {}),
          },
        },
      ];
      void client.mutate({ op: "batch", args: { ops } });
    };

  // Track J — segment pairs for insert hit zones. One entry per
  // adjacent (start, end) pair WITHIN a subpath. Closed subpaths
  // also get a wraparound (last → first) entry; its third tuple
  // slot carries the subpath's `subEnd` so `onSegmentDown` can
  // route the insert to the boundary instead of `segStart + 1`.
  // Track J fan-out: hit zones surface for any path-bearing
  // element (Polygon / TextFrame / Rectangle / GraphicLine).
  type SegPair = readonly [number, number, number | null];
  const segmentPairs: SegPair[] = [];
  if (editTarget !== null) {
    const n = anchors.anchors.length;
    const starts = anchors.subpathStarts.length > 0 ? anchors.subpathStarts : [0];
    for (let si = 0; si < starts.length; si++) {
      const subStart = starts[si];
      const subEnd = si + 1 < starts.length ? starts[si + 1] : n;
      for (let i = subStart; i + 1 < subEnd; i++) {
        segmentPairs.push([i, i + 1, null]);
      }
      // Closed-subpath wraparound. `subpathOpen` is parallel to
      // ranges built from `subpathStarts`; missing entries default
      // to closed (matches the renderer's `unwrap_or(false)`).
      const isOpen = anchors.subpathOpen?.[si] ?? false;
      if (!isOpen && subEnd - subStart >= 2) {
        segmentPairs.push([subEnd - 1, subStart, subEnd]);
      }
    }
  }

  return (
    <g>
      {segmentPairs.map(([s, t, closing], idx) => {
        const sA = anchors.anchors[s];
        const eA = anchors.anchors[t];
        if (!sA || !eA) return null;
        const [sx, sy] = applyAffine(matrix, sA.anchor[0], sA.anchor[1]);
        const [srx, sry] = applyAffine(matrix, sA.right[0], sA.right[1]);
        const [elx, ely] = applyAffine(matrix, eA.left[0], eA.left[1]);
        const [ex, ey] = applyAffine(matrix, eA.anchor[0], eA.anchor[1]);
        const d =
          `M ${pr.x + sx} ${pr.y + sy} ` +
          `C ${pr.x + srx} ${pr.y + sry}, ` +
          `${pr.x + elx} ${pr.y + ely}, ` +
          `${pr.x + ex} ${pr.y + ey}`;
        // Inverse-scaled stroke width keeps the hit zone constant
        // in CSS px. 8px is generous enough that off-curve clicks
        // still land — the closest-t solver projects to the
        // nearest on-curve point regardless of where the click
        // lands inside the stroke.
        return (
          <path
            key={`seg:${idx}`}
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={8 * inv}
            onPointerDown={onSegmentDown(s, t, closing)}
            style={{ cursor: "copy", pointerEvents: "stroke" }}
          />
        );
      })}
      {anchors.anchors.map((a, i) => {
        const [ax, ay] = applyAffine(matrix, a.anchor[0], a.anchor[1]);
        const [lx, ly] = applyAffine(matrix, a.left[0], a.left[1]);
        const [rx, ry] = applyAffine(matrix, a.right[0], a.right[1]);
        const a_x = pr.x + ax;
        const a_y = pr.y + ay;
        const l_x = pr.x + lx;
        const l_y = pr.y + ly;
        const r_x = pr.x + rx;
        const r_y = pr.y + ry;
        // Skip handle visuals when a handle coincides with the
        // anchor (corner-point with no Bezier — IDML zero-length
        // handles). Keeps the chrome tidy on sharp corners.
        const hasLeft = Math.hypot(lx - ax, ly - ay) > 1e-3;
        const hasRight = Math.hypot(rx - ax, ry - ay) > 1e-3;
        const isSelected = selectedAnchorIndex === i;
        return (
          <g key={i}>
            {hasLeft && (
              <line
                x1={a_x}
                y1={a_y}
                x2={l_x}
                y2={l_y}
                stroke="#2563eb"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {hasRight && (
              <line
                x1={a_x}
                y1={a_y}
                x2={r_x}
                y2={r_y}
                stroke="#2563eb"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {hasLeft && renderHandleDot(l_x, l_y, inv, `${i}:left`)}
            {hasRight && renderHandleDot(r_x, r_y, inv, `${i}:right`)}
            {renderAnchorDot(
              a_x,
              a_y,
              inv,
              `${i}:anchor`,
              isSelected,
              onAnchorDown(i),
              onAnchorDoubleClick(i),
            )}
          </g>
        );
      })}
      {renderSubpathMarkers(anchors, pr, matrix, inv)}
    </g>
  );
}

function renderAnchorDot(
  x: number,
  y: number,
  inv: number,
  address: string,
  selected: boolean,
  onPointerDown?: () => void,
  onDoubleClick?: (e: MouseEvent<SVGElement>) => void,
) {
  const visiblePx = 7;
  const hitPx = 11;
  // Track J — selected anchor fills blue + thicker stroke so the
  // Backspace target is unambiguous.
  const fill = selected ? "#2563eb" : "white";
  const strokeWidth = selected ? 2 : 1;
  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`}>
      <rect
        x={-hitPx / 2}
        y={-hitPx / 2}
        width={hitPx}
        height={hitPx}
        fill="transparent"
        data-path-anchor={address}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
      <rect
        x={-visiblePx / 2}
        y={-visiblePx / 2}
        width={visiblePx}
        height={visiblePx}
        fill={fill}
        stroke="#2563eb"
        strokeWidth={strokeWidth}
        data-path-anchor={address}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
    </g>
  );
}

function renderHandleDot(x: number, y: number, inv: number, address: string) {
  const visiblePx = 5;
  const hitPx = 10;
  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`}>
      <circle
        cx={0}
        cy={0}
        r={hitPx / 2}
        fill="transparent"
        data-path-anchor={address}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
      <circle
        cx={0}
        cy={0}
        r={visiblePx / 2}
        fill="#2563eb"
        stroke="white"
        strokeWidth={1}
        data-path-anchor={address}
        style={{ cursor: "pointer", pointerEvents: "all" }}
      />
    </g>
  );
}

function renderSubpathMarkers(
  anchors: PathAnchorsResult,
  pr: { x: number; y: number },
  matrix: readonly [number, number, number, number, number, number] | null,
  inv: number,
) {
  // Ring each subpath's first anchor so compound paths (a square
  // with a hole) make their contour boundaries visible.
  if (anchors.subpathStarts.length === 0) return null;
  return (
    <>
      {anchors.subpathStarts.map((startIdx, i) => {
        const a = anchors.anchors[startIdx];
        if (!a) return null;
        const [ax, ay] = applyAffine(matrix, a.anchor[0], a.anchor[1]);
        return (
          <circle
            key={`subpath:${i}`}
            cx={pr.x + ax}
            cy={pr.y + ay}
            r={10 * inv}
            fill="none"
            stroke="#2563eb"
            strokeOpacity={0.4}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        );
      })}
    </>
  );
}

export const pathEditContribution: OverlayContribution = {
  id: "verso.path-edit",
  render: PathEditRender,
  // Above selection chrome / handles so the anchor dots aren't
  // hidden behind them, but below the marquee + snap-lines (which
  // belong on top during an active drag).
  z: 350,
};

/**
 * Step 5c — element-kind filter for the path-edit affordance.
 * Used by the Enter-key binding: only Polygons / Rectangles /
 * TextFrames / GraphicLines have a `<PathGeometry>` worth editing.
 * Ovals are declared by GeometricBounds only.
 */
export function elementSupportsPathEdit(id: ElementId | undefined): boolean {
  if (!id) return false;
  return (
    id.kind === "polygon" ||
    id.kind === "rectangle" ||
    id.kind === "textFrame" ||
    id.kind === "graphicLine"
  );
}
