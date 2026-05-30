import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";

/**
 * Click-marker chrome — page outline + frame outline + crosshair at
 * the clicked document point. Diagnostic value: makes the hit-test
 * pipeline observable. Older than the element-selection chrome and
 * may eventually retire, but kept while the hit pathway is still
 * the source of truth for text editing.
 */
function HitMarkerRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  const selection = signals?.hitSelection;
  if (!selection) return null;
  const pr = props.pageRects.get(selection.pageId);
  if (!pr) return null;

  const markerX = pr.x + selection.docPoint[0];
  const markerY = pr.y + selection.docPoint[1];
  const inv = 1 / props.camera.scale;

  return (
    <g>
      <rect
        x={pr.x}
        y={pr.y}
        width={pr.w}
        height={pr.h}
        fill="none"
        stroke="#2563eb"
        strokeOpacity="0.4"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {selection.hit.frameBounds && (
        <rect
          x={pr.x + selection.hit.frameBounds.left}
          y={pr.y + selection.hit.frameBounds.top}
          width={
            selection.hit.frameBounds.right - selection.hit.frameBounds.left
          }
          height={
            selection.hit.frameBounds.bottom - selection.hit.frameBounds.top
          }
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <g transform={`translate(${markerX}, ${markerY}) scale(${inv})`}>
        <line x1={-6} y1={0} x2={6} y2={0} stroke="#dc2626" strokeWidth={1.5} />
        <line x1={0} y1={-6} x2={0} y2={6} stroke="#dc2626" strokeWidth={1.5} />
        <circle cx={0} cy={0} r={2} fill="#dc2626" />
      </g>
    </g>
  );
}

export const hitMarkerContribution: OverlayContribution = {
  id: "paged.hit-marker",
  render: HitMarkerRender,
  z: 100,
};
