import { useEffect, useState, type MouseEvent } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  ElementId,
  PathAnchorsResult,
} from "../../../../apps/canvas/src/channel/protocol";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";

import { applyAffine } from "./affine";

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

  // Track J — only Polygons accept the new path-topology mutations.
  // We still render anchors for other path-bearing elements (5c
  // behaviour); we just don't wire the click → dispatch on them.
  const polygonId = target.kind === "polygon" ? target.id : null;

  const onAnchorDown = (i: number) => () => {
    if (polygonId === null) return;
    setSelectedAnchorIndex(i);
  };

  const onAnchorDoubleClick = (i: number) => (e: MouseEvent<SVGElement>) => {
    if (polygonId === null) return;
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
      args: { polygonId, index: i, smooth: isCorner },
    });
  };

  return (
    <g>
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
