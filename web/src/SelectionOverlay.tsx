// SVG overlay for the current selection. Sits absolutely over the
// canvas and renders a rectangle + 8 transform handles in CSS-px
// space. Per the plan: handles are DOM, not GPU. Pointer-event
// passthrough is on (`pointer-events: none` on the SVG, individually
// re-enabled on the handles) so the canvas still receives clicks
// outside the handles.
//
// Handles are interactive: each carries a directional role (n/e/s/w
// + corners). Pointer-down on a handle captures the pointer and
// emits transient `SetFrameBounds` commands during drag, with a
// non-transient commit on pointer-up. The role decides which edges
// move and which stay anchored.

import { useEffect, useRef, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";
import type { Viewport } from "./tools";

interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HandleRole = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  client: EditorClient | null;
  selection: string | null;
  viewport: Viewport;
  /** Editor epoch — bumps trigger a refetch of the bbox. */
  epoch: number;
  pageIndex: number;
  onCommandApplied: () => void;
}

const HANDLE_ROLES: HandleRole[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function SelectionOverlay({
  client,
  selection,
  viewport,
  epoch,
  pageIndex,
  onCommandApplied,
}: Props) {
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const lastReqRef = useRef<{ id: string | null; epoch: number } | null>(null);
  const dragRef = useRef<{
    role: HandleRole;
    startBbox: Bbox;
    startCssX: number;
    startCssY: number;
    appliedBbox: Bbox | null;
  } | null>(null);

  useEffect(() => {
    if (!client || !selection) {
      setBbox(null);
      return;
    }
    const last = lastReqRef.current;
    if (last && last.id === selection && last.epoch === epoch) return;
    lastReqRef.current = { id: selection, epoch };
    const b = client.frameBboxPagePt(pageIndex, selection);
    setBbox(b);
  }, [client, selection, viewport, epoch, pageIndex]);

  if (!bbox) return null;

  const x = bbox.x * viewport.zoom + viewport.panX;
  const y = bbox.y * viewport.zoom + viewport.panY;
  const w = bbox.w * viewport.zoom;
  const h = bbox.h * viewport.zoom;
  const handleSize = 8;
  const half = handleSize / 2;

  const handlePos: Record<HandleRole, [number, number]> = {
    nw: [x - half, y - half],
    n: [x + w / 2 - half, y - half],
    ne: [x + w - half, y - half],
    e: [x + w - half, y + h / 2 - half],
    se: [x + w - half, y + h - half],
    s: [x + w / 2 - half, y + h - half],
    sw: [x - half, y + h - half],
    w: [x - half, y + h / 2 - half],
  };

  function pageDeltaFromCss(dxCss: number, dyCss: number) {
    return { dxPt: dxCss / viewport.zoom, dyPt: dyCss / viewport.zoom };
  }

  function bboxForRole(
    role: HandleRole,
    start: Bbox,
    dxPt: number,
    dyPt: number,
  ): Bbox {
    let { x, y, w, h } = start;
    const right = x + w;
    const bottom = y + h;
    let newLeft = x;
    let newTop = y;
    let newRight = right;
    let newBottom = bottom;
    if (role === "nw" || role === "w" || role === "sw") newLeft = x + dxPt;
    if (role === "ne" || role === "e" || role === "se") newRight = right + dxPt;
    if (role === "nw" || role === "n" || role === "ne") newTop = y + dyPt;
    if (role === "sw" || role === "s" || role === "se") newBottom = bottom + dyPt;
    if (newRight - newLeft < 1) {
      if (role === "nw" || role === "w" || role === "sw") newLeft = newRight - 1;
      else newRight = newLeft + 1;
    }
    if (newBottom - newTop < 1) {
      if (role === "nw" || role === "n" || role === "ne") newTop = newBottom - 1;
      else newBottom = newTop + 1;
    }
    return {
      x: newLeft,
      y: newTop,
      w: newRight - newLeft,
      h: newBottom - newTop,
    };
  }

  function emitSetBounds(target: Bbox, transient: boolean) {
    if (!client || !selection) return;
    client.applyCommand({
      type: "SetFrameBounds",
      frame: { kind: "Frame", id: selection },
      x_pt: target.x,
      y_pt: target.y,
      w_pt: target.w,
      h_pt: target.h,
      transient,
    });
    onCommandApplied();
  }

  function onHandleDown(role: HandleRole, ev: React.PointerEvent<SVGRectElement>) {
    if (!bbox) return;
    ev.stopPropagation();
    ev.preventDefault();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    dragRef.current = {
      role,
      startBbox: { ...bbox },
      startCssX: ev.clientX,
      startCssY: ev.clientY,
      appliedBbox: null,
    };
  }

  function onHandleMove(ev: React.PointerEvent<SVGRectElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { dxPt, dyPt } = pageDeltaFromCss(
      ev.clientX - drag.startCssX,
      ev.clientY - drag.startCssY,
    );
    const target = bboxForRole(drag.role, drag.startBbox, dxPt, dyPt);
    drag.appliedBbox = target;
    emitSetBounds(target, true);
  }

  function onHandleUp(ev: React.PointerEvent<SVGRectElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try {
      (ev.target as Element).releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    if (!drag.appliedBbox) return;
    // Revert the cumulative transient with one transient back, then
    // commit the canonical bbox. Same revert + commit pattern the
    // Select tool uses for drag-move so undo lands a single entry.
    emitSetBounds(drag.startBbox, true);
    emitSetBounds(drag.appliedBbox, false);
  }

  return (
    <svg className="selection-overlay" xmlns="http://www.w3.org/2000/svg">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        className="selection-rect"
        fill="none"
      />
      {HANDLE_ROLES.map((role) => {
        const [hx, hy] = handlePos[role];
        return (
          <rect
            key={role}
            x={hx}
            y={hy}
            width={handleSize}
            height={handleSize}
            className={`selection-handle handle-${role}`}
            onPointerDown={(e) => onHandleDown(role, e)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          />
        );
      })}
    </svg>
  );
}
