// Rulers + grid overlay.
//
// Top + left rulers in CSS-px tracking the viewport. M3 ships axis-
// aligned rulers in pt only (tick step adapts to zoom so labels stay
// readable); unit-system selector lives in M4. The grid toggle
// renders a subtle SVG grid every 50pt for design alignment.

import { useMemo } from "react";

const RULER_THICKNESS = 18;

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface Props {
  viewport: Viewport;
  width: number; // wrapper CSS width
  height: number; // wrapper CSS height
  visible: boolean;
  showGrid: boolean;
}

/** Pick a tick step (in pt) such that ticks land roughly every 50px
 *  on screen, rounded to a nice value (10/20/50/100/200/500/1000…). */
function chooseStepPt(zoom: number): number {
  const targetCssPx = 50;
  const raw = targetCssPx / Math.max(0.001, zoom);
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c <= raw) best = c;
  }
  return best;
}

export function Rulers({ viewport, width, height, visible, showGrid }: Props) {
  const stepPt = useMemo(() => chooseStepPt(viewport.zoom), [viewport.zoom]);
  if (!visible) return null;

  // Horizontal ruler ticks: walk from the leftmost visible pt to the
  // right edge, stepping by stepPt.
  const minPtX = (-viewport.panX) / viewport.zoom;
  const maxPtX = (width - viewport.panX) / viewport.zoom;
  const startX = Math.floor(minPtX / stepPt) * stepPt;
  const xs: { pt: number; cssX: number }[] = [];
  for (let pt = startX; pt <= maxPtX; pt += stepPt) {
    const cssX = pt * viewport.zoom + viewport.panX;
    if (cssX >= 0 && cssX <= width) xs.push({ pt, cssX });
  }

  const minPtY = (-viewport.panY) / viewport.zoom;
  const maxPtY = (height - viewport.panY) / viewport.zoom;
  const startY = Math.floor(minPtY / stepPt) * stepPt;
  const ys: { pt: number; cssY: number }[] = [];
  for (let pt = startY; pt <= maxPtY; pt += stepPt) {
    const cssY = pt * viewport.zoom + viewport.panY;
    if (cssY >= 0 && cssY <= height) ys.push({ pt, cssY });
  }

  return (
    <>
      <div
        className="ruler ruler-top"
        style={{ height: `${RULER_THICKNESS}px` }}
      >
        {xs.map(({ pt, cssX }) => (
          <span
            key={pt}
            className="ruler-tick"
            style={{ left: `${cssX}px` }}
          >
            {Math.round(pt)}
          </span>
        ))}
      </div>
      <div
        className="ruler ruler-left"
        style={{ width: `${RULER_THICKNESS}px` }}
      >
        {ys.map(({ pt, cssY }) => (
          <span
            key={pt}
            className="ruler-tick ruler-tick-v"
            style={{ top: `${cssY}px` }}
          >
            {Math.round(pt)}
          </span>
        ))}
      </div>
      {showGrid && (
        <svg className="grid-overlay" width={width} height={height}>
          {xs.map(({ pt, cssX }) => (
            <line
              key={`gx-${pt}`}
              x1={cssX}
              y1={0}
              x2={cssX}
              y2={height}
              stroke="rgba(74, 142, 209, 0.1)"
              strokeWidth={1}
            />
          ))}
          {ys.map(({ pt, cssY }) => (
            <line
              key={`gy-${pt}`}
              x1={0}
              y1={cssY}
              x2={width}
              y2={cssY}
              stroke="rgba(74, 142, 209, 0.1)"
              strokeWidth={1}
            />
          ))}
        </svg>
      )}
    </>
  );
}
