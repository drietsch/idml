// Overlay layer over the canvas.
//
// Per spec §9, the overlay holds everything that's NOT document
// content: selection chrome, hover halos, page captions, snap guides,
// future caret + selection ants. Implemented as an SVG element so
// the children inherit the camera transform and stay positioned in
// document space, while line strokes use `vector-effect="non-scaling-stroke"`
// so they stay 2 px wide at any zoom.

import type { Camera } from "../channel/camera";
import type { PageId } from "../channel/protocol";
import type { PageRect } from "./layout";
import type { SelectionState } from "./ViewportCanvas";

export interface OverlayProps {
  camera: Camera;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  selection: SelectionState | null;
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
      </g>
    </svg>
  );
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
