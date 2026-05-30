import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";

/**
 * Active snap guides — magenta 1pt non-scaling-stroke lines spanning
 * the relevant page along the perpendicular axis. Drawn high in the
 * z-order so they sit above selection chrome during a drag.
 */
function SnapLinesRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  const lines = signals?.snapLines ?? [];
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((l, i) => {
        const pr = props.pageRects.get(l.pageId);
        if (!pr) return null;
        if (l.axis === "x") {
          return (
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
            />
          );
        }
        return (
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
          />
        );
      })}
    </>
  );
}

export const snapLinesContribution: OverlayContribution = {
  id: "paged.snap-lines",
  render: SnapLinesRender,
  z: 500,
};
