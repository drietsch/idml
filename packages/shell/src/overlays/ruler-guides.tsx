// Plan-2 §8.3 — ruler-guide overlay.
//
// Draws every `<Guide>` declared in the loaded IDML as a thin cyan
// line at its page-local location. The snap pass treats them as
// targets (see `idml-canvas::snap`), so this overlay is mostly
// informational — the visible line tells the user where the
// invisible snap target sits.
//
// Data source: `useDocument().handle.rulerGuides`. Empty for IDMLs
// without `<Guide>` elements (most synthetic fixtures); real
// InDesign exports often ship a handful per page.

import { useDocument } from "../state/document-context";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";

function RulerGuidesRender(props: OverlayProps) {
  const { handle } = useDocument();
  const guides = handle?.rulerGuides ?? [];
  if (guides.length === 0) return null;
  const inv = 1 / props.camera.scale;
  return (
    <g pointerEvents="none">
      {guides.map((g, i) => {
        const pr = props.pageRects.get(g.pageId);
        if (!pr) return null;
        if (g.orientation === "vertical") {
          // Vertical guide: vertical line at page-local x = location,
          // spanning the page's height in document space.
          const x = pr.x + g.location;
          return (
            <line
              key={i}
              x1={x}
              y1={pr.y}
              x2={x}
              y2={pr.y + pr.h}
              stroke="#06b6d4"
              strokeWidth={1 * inv}
              strokeOpacity={0.6}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        // Horizontal guide.
        const y = pr.y + g.location;
        return (
          <line
            key={i}
            x1={pr.x}
            y1={y}
            x2={pr.x + pr.w}
            y2={y}
            stroke="#06b6d4"
            strokeWidth={1 * inv}
            strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export const rulerGuidesContribution: OverlayContribution = {
  id: "paged.ruler-guides",
  render: RulerGuidesRender,
  // Below selection chrome / handles (z 200+) and snap lines (z 400+),
  // above the page decorations (z 50) — a quiet line on the page
  // that doesn't fight selection visibility.
  z: 75,
};
