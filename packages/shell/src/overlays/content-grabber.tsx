import { useModifierState } from "../hooks/useModifierState";
import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useSelection } from "../state/selection-context";

import { applyAffine } from "./affine";

/**
 * Phase H content-grabber donut at the centre of a single-selected
 * image-bearing Rectangle. Purely informational — hints that
 * Cmd+drag opens content mode. Pointer events disabled so the body
 * drag passes through.
 *
 * Plan-2 §8.5 — the donut only shows when Cmd is held so the chrome
 * doesn't clutter the static selection. Until N.5 the donut was
 * permanent; users learned to ignore it, defeating the affordance.
 */
function ContentGrabberRender(props: OverlayProps) {
  const { elementGeometry } = useSelection();
  const modifiers = useModifierState();
  if (!modifiers.cmd) return null;
  if (elementGeometry.length !== 1) return null;
  const item = elementGeometry[0];
  if (item.hasImage !== true) return null;
  const pr = props.pageRects.get(item.pageId);
  if (!pr) return null;
  const [top, left, bottom, right] = item.bounds;
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  const [wx, wy] = applyAffine(item.itemTransform, cx, cy);
  const inv = 1 / props.camera.scale;
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

export const contentGrabberContribution: OverlayContribution = {
  id: "verso.content-grabber",
  render: ContentGrabberRender,
  z: 320,
};
