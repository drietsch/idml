import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useContentSelection } from "../state/content-selection-context";

/**
 * Text caret + selection-range rects. Both come from
 * ContentSelectionContext; the caret animates opacity, the rects are
 * filled translucent blue. Caret width inverse-scales so it stays
 * ~1.5 CSS px at any zoom.
 */
function CaretRender(props: OverlayProps) {
  const { caret, selectionRects } = useContentSelection();
  if (!caret && selectionRects.length === 0) return null;
  const inv = 1 / props.camera.scale;

  return (
    <>
      {selectionRects.map((r, i) => {
        const pr = props.pageRects.get(r.pageId);
        if (!pr) return null;
        return (
          <rect
            key={`range:${i}`}
            x={pr.x + r.leftPt}
            y={pr.y + r.topPt}
            width={r.widthPt}
            height={r.heightPt}
            fill="#2563eb"
            fillOpacity={0.25}
            pointerEvents="none"
          />
        );
      })}
      {caret && renderCaret(caret, props, inv)}
    </>
  );
}

function renderCaret(
  caret: NonNullable<ReturnType<typeof useContentSelection>["caret"]>,
  props: OverlayProps,
  inv: number,
) {
  const pr = props.pageRects.get(caret.pageId);
  if (!pr) return null;
  const width = 1.5 * inv;
  return (
    <rect
      x={pr.x + caret.xPt - width / 2}
      y={pr.y + caret.topPt}
      width={width}
      height={caret.heightPt}
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

export const caretContribution: OverlayContribution = {
  id: "paged.caret",
  render: CaretRender,
  z: 600,
};
