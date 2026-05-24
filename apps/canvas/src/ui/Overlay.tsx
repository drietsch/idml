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
  PageId,
  ResolutionResult,
  SelectionRect,
} from "../channel/protocol";
import type { PageRect } from "./layout";
import type { SelectionState } from "./ViewportCanvas";

export interface OverlayProps {
  camera: Camera;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  selection: SelectionState | null;
  resolution: ResolutionResult | null;
  caret: CaretGeometry | null;
  selectionRects: ReadonlyArray<SelectionRect>;
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

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none", // never block pointer events from the canvas
  display: "block",
};
