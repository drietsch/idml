// Overlay layer over the canvas.
//
// Per spec §9, the overlay holds everything that's NOT document
// content: selection chrome, hover halos, page captions, snap guides,
// future caret + selection ants. Implemented as an SVG element so
// the children inherit the camera transform and stay positioned in
// document space, while line strokes use `vector-effect="non-scaling-stroke"`
// so they stay 2 px wide at any zoom.

import type { Camera } from "../channel/camera";
import type {
  CaretGeometry,
  ElementGeometryItem,
  ElementId,
  PageId,
  ResizeHandle,
  ResolutionResult,
  SelectionRect,
  SnapLine,
} from "../channel/protocol";
import type { PageRect } from "./layout";
import type { MarqueeRectPageLocal, SelectionState } from "./ViewportCanvas";

export interface OverlayProps {
  camera: Camera;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  selection: SelectionState | null;
  resolution: ResolutionResult | null;
  caret: CaretGeometry | null;
  selectionRects: ReadonlyArray<SelectionRect>;
  /** Phase A — selected element ids (no geometry of their own; that
   * arrives via `elementGeometry`). Kept on the props so the
   * `__canvas` dev hook can be inspected from Playwright. */
  elementSelection?: ReadonlyArray<ElementId>;
  /** Phase A — oriented geometry per selected element id. */
  elementGeometry?: ReadonlyArray<ElementGeometryItem>;
  /** Phase A — live marquee rect rendered while the user drags. */
  marqueeRect?: MarqueeRectPageLocal | null;
  /** Phase E — active snap guides; magenta non-scaling-stroke lines. */
  snapLines?: ReadonlyArray<SnapLine>;
  /** CSS-px viewport size. Needed to size the SVG. */
  width: number;
  height: number;
}

export function Overlay(props: OverlayProps) {
  const k = props.camera.scale;
  const transform = `matrix(${k}, 0, 0, ${k}, ${props.camera.tx}, ${props.camera.ty})`;
  return (
    <svg
      width={props.width}
      height={props.height}
      style={overlayStyle}
      // Transform is applied to a single inner group; the outer
      // SVG stays in CSS-pixel coords so caption labels can mix
      // doc-space-positioned <g>s with screen-space chrome.
    >
      <g transform={transform}>
        {/* Page captions: rendered as inverse-scaled text so each
            caption appears at a constant size regardless of zoom. */}
        {props.pageIds.map((id, i) => {
          const r = props.pageRects[i];
          return (
            <PageCaption key={id} rect={r} index={i} cameraScale={k} />
          );
        })}
        {/* Selection chrome */}
        {props.selection && (
          <SelectionChrome
            selection={props.selection}
            pageRects={props.pageRects}
            pageIds={props.pageIds}
            cameraScale={k}
          />
        )}
        {/* Anchor badges — one per heading anchor from Tier 3 */}
        {props.resolution && (
          <AnchorBadges
            resolution={props.resolution}
            pageRects={props.pageRects}
            pageIds={props.pageIds}
            cameraScale={k}
          />
        )}
        {/* Phase 3 — multi-line selection ants */}
        {props.selectionRects.length > 0 && (
          <SelectionAnts
            rects={props.selectionRects}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
          />
        )}
        {/* Phase 3 — glyph-positioned caret */}
        {props.caret && (
          <TextCaret
            caret={props.caret}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
            cameraScale={k}
          />
        )}
        {/* Phase A — element-selection chrome (oriented bbox per item) */}
        {props.elementGeometry && props.elementGeometry.length > 0 && (
          <ElementSelectionChrome
            geometry={props.elementGeometry}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
          />
        )}
        {/* Phase C — 8 resize handles on a single-element selection.
            Multi-select union-bbox handles arrive in Phase E. */}
        {props.elementGeometry && props.elementGeometry.length === 1 && (
          <ResizeHandlesChrome
            item={props.elementGeometry[0]}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
            cameraScale={k}
          />
        )}
        {/* Phase D — rotation handle above the top-centre resize
            handle, connected by a vertical tether. */}
        {props.elementGeometry && props.elementGeometry.length === 1 && (
          <RotationHandleChrome
            item={props.elementGeometry[0]}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
            cameraScale={k}
          />
        )}
        {/* Phase H — content-grabber badge on single-selected
            image-bearing Rectangles. Purely informational — hints
            that Cmd+drag opens content mode (TranslateContent). */}
        {props.elementGeometry &&
          props.elementGeometry.length === 1 &&
          props.elementGeometry[0].hasImage === true && (
            <ContentGrabberBadge
              item={props.elementGeometry[0]}
              pageIds={props.pageIds}
              pageRects={props.pageRects}
              cameraScale={k}
            />
          )}
        {/* Phase A — live marquee rect while drag is in progress */}
        {props.marqueeRect && (
          <MarqueeChrome
            marquee={props.marqueeRect}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
          />
        )}
        {/* Phase E — multi-select union bounding box. The Phase C
            handles render per-element on single-select; for N > 1 the
            union box gives the user a clear "what's selected" affordance.
            Phase G adds resize + rotation handles on the union box so
            multi-select can scale / rotate. */}
        {props.elementGeometry && props.elementGeometry.length > 1 && (
          <>
            <UnionSelectionChrome
              geometry={props.elementGeometry}
              pageIds={props.pageIds}
              pageRects={props.pageRects}
            />
            <UnionResizeHandles
              geometry={props.elementGeometry}
              pageIds={props.pageIds}
              pageRects={props.pageRects}
              cameraScale={k}
            />
          </>
        )}
        {/* Phase E — active snap guides. Drawn last so they sit above
            the selection chrome during a drag. */}
        {props.snapLines && props.snapLines.length > 0 && (
          <SnapGuides
            lines={props.snapLines}
            pageIds={props.pageIds}
            pageRects={props.pageRects}
          />
        )}
      </g>
    </svg>
  );
}

function SelectionAnts(props: {
  rects: ReadonlyArray<SelectionRect>;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
}) {
  return (
    <>
      {props.rects.map((r, i) => {
        const idx = props.pageIds.indexOf(r.pageId);
        if (idx < 0) return null;
        const p = props.pageRects[idx];
        return (
          <rect
            key={i}
            x={p.x + r.leftPt}
            y={p.y + r.topPt}
            width={r.widthPt}
            height={r.heightPt}
            fill="#2563eb"
            fillOpacity={0.25}
            pointerEvents="none"
          />
        );
      })}
    </>
  );
}

function TextCaret(props: {
  caret: CaretGeometry;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  const idx = props.pageIds.indexOf(props.caret.pageId);
  if (idx < 0) return null;
  const p = props.pageRects[idx];
  // Caret width in CSS px; inverse-scale so it's always ~1.5 px.
  const width = 1.5 / props.cameraScale;
  return (
    <rect
      x={p.x + props.caret.xPt - width / 2}
      y={p.y + props.caret.topPt}
      width={width}
      height={props.caret.heightPt}
      fill="#1d4ed8"
      pointerEvents="none"
    >
      <animate
        attributeName="opacity"
        values="1;0;1"
        dur="1.05s"
        repeatCount="indefinite"
      />
    </rect>
  );
}

function AnchorBadges(props: {
  resolution: ResolutionResult;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  // Group anchors by containing page so badges from multiple
  // headings on the same page stack vertically instead of overlapping.
  type Entry = {
    anchorId: string;
    text: string;
    level: number;
    pageNumber: number;
  };
  const byPage = new Map<PageId, Entry[]>();
  for (const [anchorId, pos] of Object.entries(props.resolution.numbering)) {
    if (!pos.pageId) continue;
    const list = byPage.get(pos.pageId) ?? [];
    list.push({
      anchorId,
      text: pos.text,
      level: pos.level,
      pageNumber: pos.pageNumber,
    });
    byPage.set(pos.pageId, list);
  }

  const inv = 1 / props.cameraScale;
  const badges: React.ReactNode[] = [];
  for (const [pageId, anchors] of byPage) {
    const idx = props.pageIds.indexOf(pageId);
    if (idx < 0) continue;
    const r = props.pageRects[idx];
    // Stable order by level so siblings on the same page render
    // top-down by h1, h2, h3.
    anchors.sort((a, b) => a.level - b.level);
    anchors.forEach((a, i) => {
      const cx = r.x + 8 / props.cameraScale;
      const cy = r.y + (12 + i * 22) / props.cameraScale;
      const trimmed = a.text.length > 28 ? `${a.text.slice(0, 27)}…` : a.text;
      const label = `⚓ ${a.pageNumber} — ${trimmed}`;
      // Compute pixel width via a simple char heuristic so the
      // background rect tracks the text length. SVG <text>
      // intrinsic measurement requires a second pass after mount;
      // the heuristic is good enough for fixed-width-ish system UI.
      const labelWidthPx = 8 + label.length * 6.0;
      badges.push(
        <g
          key={`${pageId}:${a.anchorId}`}
          transform={`translate(${cx}, ${cy}) scale(${inv})`}
        >
          <rect
            x={0}
            y={-9}
            width={labelWidthPx}
            height={16}
            rx={3}
            fill="#10b981"
            fillOpacity="0.92"
          />
          <text
            x={4}
            y={3}
            fontSize={10}
            fontFamily="system-ui, sans-serif"
            fill="white"
          >
            {label}
          </text>
        </g>,
      );
    });
  }
  return <>{badges}</>;
}

function PageCaption(props: {
  rect: PageRect;
  index: number;
  cameraScale: number;
}) {
  // Position caption a small gap below the page. Inverse-scale the
  // text so it stays ~12 CSS px regardless of zoom.
  const cx = props.rect.x + props.rect.w / 2;
  const cy = props.rect.y + props.rect.h + 14 / props.cameraScale;
  const inv = 1 / props.cameraScale;
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${inv})`}>
      <text
        textAnchor="middle"
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fill="#6b7280"
      >
        page {props.index + 1}
      </text>
    </g>
  );
}

function SelectionChrome(props: {
  selection: SelectionState;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  const idx = props.pageIds.indexOf(props.selection.pageId);
  if (idx < 0) return null;
  const pageRect = props.pageRects[idx];

  // Click marker in document space — selection.docPoint is
  // page-local; shift by page origin.
  const markerX = pageRect.x + props.selection.docPoint[0];
  const markerY = pageRect.y + props.selection.docPoint[1];
  const inv = 1 / props.cameraScale;

  return (
    <g>
      {/* Page outline (subtle): highlight the page that holds the
          selection so it's clear which page was clicked. */}
      <rect
        x={pageRect.x}
        y={pageRect.y}
        width={pageRect.w}
        height={pageRect.h}
        fill="none"
        stroke="#2563eb"
        strokeOpacity="0.4"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {/* Frame outline (when hit succeeded). frame_bounds is in
          page-local coords; shift by page origin. */}
      {props.selection.hit.frameBounds && (
        <rect
          x={pageRect.x + props.selection.hit.frameBounds.left}
          y={pageRect.y + props.selection.hit.frameBounds.top}
          width={
            props.selection.hit.frameBounds.right -
            props.selection.hit.frameBounds.left
          }
          height={
            props.selection.hit.frameBounds.bottom -
            props.selection.hit.frameBounds.top
          }
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {/* Click marker — crosshair + dot. Inverse-scaled so the
          marker stays a constant size. */}
      <g transform={`translate(${markerX}, ${markerY}) scale(${inv})`}>
        <line
          x1={-6}
          y1={0}
          x2={6}
          y2={0}
          stroke="#dc2626"
          strokeWidth={1.5}
        />
        <line
          x1={0}
          y1={-6}
          x2={0}
          y2={6}
          stroke="#dc2626"
          strokeWidth={1.5}
        />
        <circle cx={0} cy={0} r={2} fill="#dc2626" />
      </g>
    </g>
  );
}

function ElementSelectionChrome(props: {
  geometry: ReadonlyArray<ElementGeometryItem>;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
}) {
  // For each selected element, apply its item_transform to the four
  // bounds corners and draw an oriented <polygon>. The transform is
  // composed (Group's transform baked in by the parser), so we don't
  // multiply through any group ancestry here.
  const out: React.ReactNode[] = [];
  for (const g of props.geometry) {
    const idx = props.pageIds.indexOf(g.pageId);
    if (idx < 0) continue;
    const pr = props.pageRects[idx];
    const [top, left, bottom, right] = g.bounds;
    const corners: Array<[number, number]> = [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ];
    const transformed = corners.map(([x, y]) =>
      applyAffine(g.itemTransform, x, y),
    );
    const pointsAttr = transformed
      .map(([x, y]) => `${pr.x + x},${pr.y + y}`)
      .join(" ");
    const key = `${g.id.kind}:${g.id.id}`;
    out.push(
      <polygon
        key={key}
        points={pointsAttr}
        fill="none"
        stroke="#2563eb"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />,
    );
  }
  return <>{out}</>;
}

function MarqueeChrome(props: {
  marquee: MarqueeRectPageLocal;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
}) {
  const idx = props.pageIds.indexOf(props.marquee.pageId);
  if (idx < 0) return null;
  const pr = props.pageRects[idx];
  const [top, left, bottom, right] = props.marquee.rect;
  return (
    <rect
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="#2563eb"
      fillOpacity={0.08}
      stroke="#2563eb"
      strokeWidth={1}
      strokeDasharray="4 2"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function applyAffine(
  m: [number, number, number, number, number, number] | null,
  x: number,
  y: number,
): [number, number] {
  if (!m) return [x, y];
  // IDML stores affines as `[a, b, c, d, tx, ty]` row-major-ish:
  //   x' = a*x + c*y + tx
  //   y' = b*x + d*y + ty
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Phase D — rotation handle. A small circle floating above the
 * top-centre resize handle, tethered by a vertical line. Carries
 * `data-handle="rotate"` so the wrapper's pointerdown routes to a
 * Rotate gesture instead of a Resize / Translate.
 */
function RotationHandleChrome(props: {
  item: ElementGeometryItem;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  const idx = props.pageIds.indexOf(props.item.pageId);
  if (idx < 0) return null;
  const pr = props.pageRects[idx];
  const [top, _left, _bottom, right] = props.item.bounds;
  const left = props.item.bounds[1];
  const cx = (left + right) * 0.5;
  // Top-centre of the (un-rotated) bounds in content-box space.
  const [tcx, tcy] = applyAffine(props.item.itemTransform, cx, top);
  // The rotation handle floats `tetherPx` CSS px above the top edge
  // along the rotated frame's local +Y → world direction. For an
  // un-rotated frame that's straight up in screen space; for a
  // rotated frame the handle follows the rotation.
  const inv = 1 / props.cameraScale;
  const tetherPx = 24;
  const radius = 5;
  // Compute the "up" direction in world coords by transforming the
  // local (cx, top-1) point and taking the unit vector from (tcx, tcy)
  // towards it.
  const [upx, upy] = applyAffine(props.item.itemTransform, cx, top - 1);
  let dx = upx - tcx;
  let dy = upy - tcy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // Convert tetherPx (CSS px) to doc-space pt: dividing by camera
  // scale puts the offset in world units before the SVG's matrix
  // scales it back to CSS px.
  const dxDoc = dx * tetherPx * inv;
  const dyDoc = dy * tetherPx * inv;
  const hx = pr.x + tcx + dxDoc;
  const hy = pr.y + tcy + dyDoc;
  return (
    <g>
      <line
        x1={pr.x + tcx}
        y1={pr.y + tcy}
        x2={hx}
        y2={hy}
        stroke="#2563eb"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <g transform={`translate(${hx}, ${hy}) scale(${inv})`}>
        {/* larger hit area for forgiving grab */}
        <circle
          cx={0}
          cy={0}
          r={radius + 4}
          fill="transparent"
          data-handle="rotate"
          style={{ cursor: "grab", pointerEvents: "all" }}
        />
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill="white"
          stroke="#2563eb"
          strokeWidth={1}
          data-handle="rotate"
          style={{ cursor: "grab", pointerEvents: "all" }}
        />
      </g>
    </g>
  );
}

/**
 * Phase C — eight resize handles. ViewportCanvas's pointerdown
 * checks `e.target.dataset.handle`; if present, it skips the
 * Translate-from-AABB path and begins a Resize gesture with the
 * tagged handle id.
 */
function ResizeHandlesChrome(props: {
  item: ElementGeometryItem;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  const idx = props.pageIds.indexOf(props.item.pageId);
  if (idx < 0) return null;
  const pr = props.pageRects[idx];
  const [top, left, bottom, right] = props.item.bounds;
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  const positions: Array<{ name: ResizeHandle; local: [number, number]; cursor: string }> = [
    { name: "northWest", local: [left, top], cursor: "nwse-resize" },
    { name: "north", local: [cx, top], cursor: "ns-resize" },
    { name: "northEast", local: [right, top], cursor: "nesw-resize" },
    { name: "east", local: [right, cy], cursor: "ew-resize" },
    { name: "southEast", local: [right, bottom], cursor: "nwse-resize" },
    { name: "south", local: [cx, bottom], cursor: "ns-resize" },
    { name: "southWest", local: [left, bottom], cursor: "nesw-resize" },
    { name: "west", local: [left, cy], cursor: "ew-resize" },
  ];
  // Handle pixel size — stays ~8 CSS px at any zoom by inverse-
  // scaling the wrapping <g>. The hit area is a touch larger than
  // the visible square so trackpads don't fight precise grabbing.
  const inv = 1 / props.cameraScale;
  const visiblePx = 8;
  const hitPx = 12;
  return (
    <>
      {positions.map(({ name, local, cursor }) => {
        const [wx, wy] = applyAffine(props.item.itemTransform, local[0], local[1]);
        const x = pr.x + wx;
        const y = pr.y + wy;
        return (
          <g key={name} transform={`translate(${x}, ${y}) scale(${inv})`}>
            <rect
              x={-hitPx / 2}
              y={-hitPx / 2}
              width={hitPx}
              height={hitPx}
              fill="transparent"
              data-handle={name}
              style={{ cursor, pointerEvents: "all" }}
            />
            <rect
              x={-visiblePx / 2}
              y={-visiblePx / 2}
              width={visiblePx}
              height={visiblePx}
              fill="white"
              stroke="#2563eb"
              strokeWidth={1}
              data-handle={name}
              style={{ cursor, pointerEvents: "all" }}
            />
          </g>
        );
      })}
    </>
  );
}

/**
 * Phase E — union selection chrome for multi-select. Draws a single
 * dashed rectangle around the AABB of every selected element's
 * oriented bbox. Per-element chrome continues to render for each item.
 */
function UnionSelectionChrome(props: {
  geometry: ReadonlyArray<ElementGeometryItem>;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
}) {
  // Group by page; render one union box per page so multi-page
  // selections don't cross the inter-page grey.
  const byPage = new Map<PageId, ElementGeometryItem[]>();
  for (const g of props.geometry) {
    const list = byPage.get(g.pageId) ?? [];
    list.push(g);
    byPage.set(g.pageId, list);
  }
  const out: React.ReactNode[] = [];
  for (const [pageId, items] of byPage) {
    const idx = props.pageIds.indexOf(pageId);
    if (idx < 0) continue;
    const pr = props.pageRects[idx];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const g of items) {
      const [top, left, bottom, right] = g.bounds;
      const corners: Array<[number, number]> = [
        applyAffine(g.itemTransform, left, top),
        applyAffine(g.itemTransform, right, top),
        applyAffine(g.itemTransform, right, bottom),
        applyAffine(g.itemTransform, left, bottom),
      ];
      for (const [x, y] of corners) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) continue;
    out.push(
      <rect
        key={pageId}
        x={pr.x + minX}
        y={pr.y + minY}
        width={maxX - minX}
        height={maxY - minY}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />,
    );
  }
  return <>{out}</>;
}

/**
 * Phase H — small visual hint at the centre of an image-bearing
 * Rectangle that the user can grab the content (Cmd+drag invokes
 * TranslateContent). Purely informational; pointer events stay
 * disabled so it doesn't block the underlying body-drag.
 */
function ContentGrabberBadge(props: {
  item: ElementGeometryItem;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  const idx = props.pageIds.indexOf(props.item.pageId);
  if (idx < 0) return null;
  const pr = props.pageRects[idx];
  const [top, left, bottom, right] = props.item.bounds;
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  const [wx, wy] = applyAffine(props.item.itemTransform, cx, cy);
  const inv = 1 / props.cameraScale;
  // A "donut" — concentric circles in the InDesign tradition.
  return (
    <g
      transform={`translate(${pr.x + wx}, ${pr.y + wy}) scale(${inv})`}
      pointerEvents="none"
    >
      <circle
        cx={0}
        cy={0}
        r={11}
        fill="white"
        fillOpacity={0.85}
        stroke="#2563eb"
        strokeWidth={1.5}
      />
      <circle cx={0} cy={0} r={4} fill="#2563eb" />
    </g>
  );
}

/**
 * Phase G — resize + rotation handles on the multi-select union
 * AABB. Per-page so a cross-page selection gets one handle set per
 * page. Tagged with `data-handle="<name>"` exactly like Phase C's
 * single-select handles; ViewportCanvas routes the union case to
 * Scale + Rotate gestures.
 */
function UnionResizeHandles(props: {
  geometry: ReadonlyArray<ElementGeometryItem>;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  cameraScale: number;
}) {
  // Group by page (same logic as UnionSelectionChrome).
  const byPage = new Map<PageId, ElementGeometryItem[]>();
  for (const g of props.geometry) {
    const list = byPage.get(g.pageId) ?? [];
    list.push(g);
    byPage.set(g.pageId, list);
  }
  const out: React.ReactNode[] = [];
  const inv = 1 / props.cameraScale;
  const visiblePx = 8;
  const hitPx = 12;
  const tetherPx = 24;
  const rotateR = 5;
  for (const [pageId, items] of byPage) {
    const idx = props.pageIds.indexOf(pageId);
    if (idx < 0) continue;
    const pr = props.pageRects[idx];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const g of items) {
      const [top, left, bottom, right] = g.bounds;
      const corners: Array<[number, number]> = [
        applyAffine(g.itemTransform, left, top),
        applyAffine(g.itemTransform, right, top),
        applyAffine(g.itemTransform, right, bottom),
        applyAffine(g.itemTransform, left, bottom),
      ];
      for (const [x, y] of corners) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) continue;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const positions: Array<{ name: ResizeHandle; pt: [number, number]; cursor: string }> = [
      { name: "northWest", pt: [minX, minY], cursor: "nwse-resize" },
      { name: "north", pt: [cx, minY], cursor: "ns-resize" },
      { name: "northEast", pt: [maxX, minY], cursor: "nesw-resize" },
      { name: "east", pt: [maxX, cy], cursor: "ew-resize" },
      { name: "southEast", pt: [maxX, maxY], cursor: "nwse-resize" },
      { name: "south", pt: [cx, maxY], cursor: "ns-resize" },
      { name: "southWest", pt: [minX, maxY], cursor: "nesw-resize" },
      { name: "west", pt: [minX, cy], cursor: "ew-resize" },
    ];
    for (const { name, pt, cursor } of positions) {
      const x = pr.x + pt[0];
      const y = pr.y + pt[1];
      out.push(
        <g key={`${pageId}:${name}`} transform={`translate(${x}, ${y}) scale(${inv})`}>
          <rect
            x={-hitPx / 2}
            y={-hitPx / 2}
            width={hitPx}
            height={hitPx}
            fill="transparent"
            data-handle={name}
            style={{ cursor, pointerEvents: "all" }}
          />
          <rect
            x={-visiblePx / 2}
            y={-visiblePx / 2}
            width={visiblePx}
            height={visiblePx}
            fill="white"
            stroke="#2563eb"
            strokeWidth={1}
            data-handle={name}
            style={{ cursor, pointerEvents: "all" }}
          />
        </g>,
      );
    }
    // Rotation handle above the union's top-centre.
    const tcx = pr.x + cx;
    const tcy = pr.y + minY;
    const hx = tcx;
    const hy = tcy - tetherPx * inv;
    out.push(
      <g key={`${pageId}:rotate`}>
        <line
          x1={tcx}
          y1={tcy}
          x2={hx}
          y2={hy}
          stroke="#2563eb"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <g transform={`translate(${hx}, ${hy}) scale(${inv})`}>
          <circle
            cx={0}
            cy={0}
            r={rotateR + 4}
            fill="transparent"
            data-handle="rotate"
            style={{ cursor: "grab", pointerEvents: "all" }}
          />
          <circle
            cx={0}
            cy={0}
            r={rotateR}
            fill="white"
            stroke="#2563eb"
            strokeWidth={1}
            data-handle="rotate"
            style={{ cursor: "grab", pointerEvents: "all" }}
          />
        </g>
      </g>,
    );
  }
  return <>{out}</>;
}

/**
 * Phase E — render the active snap guides. Each guide spans the
 * full page along the perpendicular axis. Magenta with a 1pt
 * non-scaling stroke so they pop against the document content.
 */
function SnapGuides(props: {
  lines: ReadonlyArray<SnapLine>;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
}) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < props.lines.length; i++) {
    const l = props.lines[i];
    const idx = props.pageIds.indexOf(l.pageId);
    if (idx < 0) continue;
    const pr = props.pageRects[idx];
    if (l.axis === "x") {
      // Vertical guide line at x = pr.x + l.position.
      out.push(
        <line
          key={i}
          x1={pr.x + l.position}
          y1={pr.y}
          x2={pr.x + l.position}
          y2={pr.y + pr.h}
          stroke="#ec4899"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
      );
    } else {
      // Horizontal guide line at y = pr.y + l.position.
      out.push(
        <line
          key={i}
          x1={pr.x}
          y1={pr.y + l.position}
          x2={pr.x + pr.w}
          y2={pr.y + l.position}
          stroke="#ec4899"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
      );
    }
  }
  return <>{out}</>;
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none", // never block pointer events from the canvas
  display: "block",
};
