// Zoom tool (Z) — click zooms in 2× around the cursor;
// alt-click zooms out 2×. No drag handling for M1.

import type { Tool, ToolContext, ToolEvent, ToolResult } from "./tool";

const ZOOM_STEP = 2;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

export const zoomTool: Tool = {
  id: "zoom",
  label: "Zoom",
  hotkey: "Z",

  defaultCursor() {
    return "zoom-in";
  },

  onPointerDown(ev: ToolEvent, ctx: ToolContext): ToolResult {
    if (ev.button !== 0) return {};
    const factor = ev.altKey ? 1 / ZOOM_STEP : ZOOM_STEP;
    const next = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, ctx.viewport.zoom * factor),
    );
    if (next === ctx.viewport.zoom) return {};
    const ratio = next / ctx.viewport.zoom;
    return {
      viewport: {
        zoom: next,
        panX: ev.cssX - (ev.cssX - ctx.viewport.panX) * ratio,
        panY: ev.cssY - (ev.cssY - ctx.viewport.panY) * ratio,
      },
      cursor: ev.altKey ? "zoom-out" : "zoom-in",
    };
  },

  onPointerMove(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    return {};
  },

  onPointerUp(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    return {};
  },
};
