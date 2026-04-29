// Hand tool (H) — drag pans the viewport.
//
// Stateless except for a drag-start anchor. Doesn't issue commands;
// purely viewport. Active when the user picks the tool, or
// transiently when Space is held with any other tool active (the
// editor handles that "modifier-tool" path itself, so this module
// only needs to implement the pure form).

import type { Tool, ToolContext, ToolEvent, ToolResult } from "./tool";

interface PanState {
  startCssX: number;
  startCssY: number;
  startPanX: number;
  startPanY: number;
}

let pan: PanState | null = null;

export const handTool: Tool = {
  id: "hand",
  label: "Hand",
  hotkey: "H",

  defaultCursor() {
    return "grab";
  },

  onPointerDown(ev: ToolEvent, ctx: ToolContext): ToolResult {
    if (ev.button !== 0) return {};
    pan = {
      startCssX: ev.cssX,
      startCssY: ev.cssY,
      startPanX: ctx.viewport.panX,
      startPanY: ctx.viewport.panY,
    };
    return { cursor: "grabbing" };
  },

  onPointerMove(ev: ToolEvent, _ctx: ToolContext): ToolResult {
    if (!pan) return {};
    return {
      viewport: {
        panX: pan.startPanX + (ev.cssX - pan.startCssX),
        panY: pan.startPanY + (ev.cssY - pan.startCssY),
      },
    };
  },

  onPointerUp(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    pan = null;
    return { cursor: "grab" };
  },
};
