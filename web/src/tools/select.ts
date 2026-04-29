// Select tool (V) — click selects a frame, drag moves it.
//
// Drag protocol:
//  - pointerDown on a frame: select it; record `(startCssX, startCssY)`
//    and the cumulative delta in page-pt.
//  - pointerMove: emit a transient `MoveFrame` whose dx/dy is the
//    change since the *last* move (so the project's absolute frame
//    position tracks the cursor).
//  - pointerUp: revert the cumulative transient, then apply one
//    committed `MoveFrame` carrying the total delta. The renderer
//    sees the same final geometry; the undo stack sees one entry.

import type { Tool, ToolContext, ToolEvent, ToolResult } from "./tool";
import { cssToPagePt } from "./tool";
import type { Command } from "../editor/EditorClient";

interface DragState {
  frame: string;
  startXPt: number;
  startYPt: number;
  startBbox: { x: number; y: number; w: number; h: number };
  appliedDx: number;
  appliedDy: number;
}

let drag: DragState | null = null;

export const selectTool: Tool = {
  id: "select",
  label: "Select",
  hotkey: "V",

  defaultCursor() {
    return "default";
  },

  onPointerDown(ev: ToolEvent, ctx: ToolContext): ToolResult {
    if (ev.button !== 0) return {};
    const { xPt, yPt } = cssToPagePt(ev.cssX, ev.cssY, ctx.viewport);
    const hit = ctx.hitTest(xPt, yPt);
    if (!hit) {
      drag = null;
      return { selection: null, guides: [] };
    }
    const bbox = ctx.frameBboxPagePt(hit) ?? { x: 0, y: 0, w: 0, h: 0 };
    drag = {
      frame: hit,
      startXPt: xPt,
      startYPt: yPt,
      startBbox: bbox,
      appliedDx: 0,
      appliedDy: 0,
    };
    return { selection: hit, cursor: "move", guides: [] };
  },

  onPointerMove(ev: ToolEvent, ctx: ToolContext): ToolResult {
    if (!drag) return {};
    const { xPt, yPt } = cssToPagePt(ev.cssX, ev.cssY, ctx.viewport);
    let totalDx = xPt - drag.startXPt;
    let totalDy = yPt - drag.startYPt;
    // Snap-aware drag: ask the engine where the moved bbox would
    // land, then add the snap delta. Threshold scales inversely with
    // zoom so the snap radius is constant in screen space.
    const predictedBbox = {
      x: drag.startBbox.x + totalDx,
      y: drag.startBbox.y + totalDy,
      w: drag.startBbox.w,
      h: drag.startBbox.h,
    };
    const threshold = 8 / ctx.viewport.zoom;
    const snap = ctx.computeSnap(predictedBbox, drag.frame, threshold);
    totalDx += snap.dxPt;
    totalDy += snap.dyPt;
    const stepDx = totalDx - drag.appliedDx;
    const stepDy = totalDy - drag.appliedDy;
    if (stepDx === 0 && stepDy === 0) return { guides: snap.guides };
    drag.appliedDx = totalDx;
    drag.appliedDy = totalDy;
    const cmd: Command = {
      type: "MoveFrame",
      frame: { kind: "Frame", id: drag.frame },
      dx_pt: stepDx,
      dy_pt: stepDy,
      transient: true,
    };
    return { commands: [cmd], guides: snap.guides };
  },

  onPointerUp(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    if (!drag) return {};
    const { frame, appliedDx, appliedDy } = drag;
    drag = null;
    if (appliedDx === 0 && appliedDy === 0) {
      return { cursor: "default", guides: [] };
    }
    // Revert the cumulative transient (so the project sits at the
    // pre-gesture state) and then commit one canonical MoveFrame.
    // Both transient + committed go through the same wasm entry; the
    // committed one is what lands on the undo stack.
    const revert: Command = {
      type: "MoveFrame",
      frame: { kind: "Frame", id: frame },
      dx_pt: -appliedDx,
      dy_pt: -appliedDy,
      transient: true,
    };
    const commit: Command = {
      type: "MoveFrame",
      frame: { kind: "Frame", id: frame },
      dx_pt: appliedDx,
      dy_pt: appliedDy,
      transient: false,
    };
    return { commands: [revert, commit], cursor: "default", guides: [] };
  },
};
