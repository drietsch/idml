// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementGeometryItem } from "../../../../apps/canvas/src/channel/protocol";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useSelection } from "../state/selection-context";

import { applyAffine } from "./affine";
import { groupByPage, unionAabb } from "./selection-chrome";

const TETHER_PX = 24;
const ROTATE_R = 5;

/**
 * Rotation handle floating above the top-centre of the selection.
 *
 * - Single selection: the tether follows the oriented frame's local
 *   +Y direction, so a rotated frame's handle tracks the rotation.
 * - Multi-selection: the union AABB's top-centre, with a straight
 *   vertical tether (no orientation to follow).
 *
 * Carries `data-handle="rotate"`; ViewportCanvas's pointerdown
 * routes that dataset to a Rotate gesture.
 */
function RotateHandleRender(props: OverlayProps) {
  const { elementGeometry } = useSelection();
  if (elementGeometry.length === 0) return null;
  if (elementGeometry.length === 1) {
    return renderSingle(elementGeometry[0], props);
  }
  return renderUnion(elementGeometry, props);
}

function renderSingle(item: ElementGeometryItem, props: OverlayProps) {
  const pr = props.pageRects.get(item.pageId);
  if (!pr) return null;
  const [top, left, _bottom, right] = item.bounds;
  const cx = (left + right) * 0.5;
  const [tcx, tcy] = applyAffine(item.itemTransform, cx, top);
  const inv = 1 / props.camera.scale;
  const [upx, upy] = applyAffine(item.itemTransform, cx, top - 1);
  let dx = upx - tcx;
  let dy = upy - tcy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const dxDoc = dx * TETHER_PX * inv;
  const dyDoc = dy * TETHER_PX * inv;
  const hx = pr.x + tcx + dxDoc;
  const hy = pr.y + tcy + dyDoc;
  return renderTether(pr.x + tcx, pr.y + tcy, hx, hy, inv, "single");
}

function renderUnion(
  geometry: ReadonlyArray<ElementGeometryItem>,
  props: OverlayProps,
) {
  const byPage = groupByPage(geometry);
  const inv = 1 / props.camera.scale;
  const tethers: React.ReactNode[] = [];
  for (const [pageId, items] of byPage) {
    const pr = props.pageRects.get(pageId);
    if (!pr) continue;
    const bb = unionAabb(items);
    if (!bb) continue;
    const tcx = pr.x + (bb.minX + bb.maxX) * 0.5;
    const tcy = pr.y + bb.minY;
    const hx = tcx;
    const hy = tcy - TETHER_PX * inv;
    tethers.push(renderTether(tcx, tcy, hx, hy, inv, `union:${pageId}`));
  }
  return <>{tethers}</>;
}

function renderTether(
  tx: number,
  ty: number,
  hx: number,
  hy: number,
  inv: number,
  key: string,
) {
  return (
    <g key={key}>
      <line
        x1={tx}
        y1={ty}
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
          r={ROTATE_R + 4}
          fill="transparent"
          data-handle="rotate"
          style={{ cursor: "grab", pointerEvents: "all" }}
        />
        <circle
          cx={0}
          cy={0}
          r={ROTATE_R}
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

export const rotateHandleContribution: OverlayContribution = {
  id: "verso.rotate-handle",
  render: RotateHandleRender,
  z: 310,
};
