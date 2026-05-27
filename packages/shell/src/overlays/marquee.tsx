import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";

/**
 * Live drag-selection rectangle. Reads from `OverlaySignalsContext`
 * so the marquee writer (ViewportCanvas) and the marquee renderer
 * stay decoupled — anyone who wants to draw a marquee
 * (a future "drag-select within a panel" gesture) writes the same
 * signal and the rendering survives.
 */
function MarqueeRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  if (!signals?.marqueeRect) return null;
  const m = signals.marqueeRect;
  const pr = props.pageRects.get(m.pageId);
  if (!pr) return null;
  const [top, left, bottom, right] = m.rect;
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

export const marqueeContribution: OverlayContribution = {
  id: "verso.marquee",
  render: MarqueeRender,
  z: 400,
};
