// Type tool (T) — click into a text frame to enter type mode.
//
// M2 scope: clicking on a text frame parks the caret at the end of
// its first paragraph (paragraph-granular caret). Glyph-precise
// pixel→byte mapping arrives in M3 once the renderer hands out
// per-line metadata. The tool's job is to recognise the frame,
// derive its parent story, and emit a `type-mode-enter` signal that
// the EditorApp turns into a TextEditOverlay mount.

import type { Tool, ToolContext, ToolEvent, ToolResult } from "./tool";
import { cssToPagePt } from "./tool";

/** Augmented result type that carries a "type-mode" payload back to
 *  the EditorApp. We piggy-back on the existing ToolResult shape via
 *  the `commands` array — the EditorApp recognises a special
 *  `EnterTypeMode` synthetic command and consumes it without sending
 *  to wasm. Keeping the contract narrow means tools never reach into
 *  React state directly. */
export interface EnterTypeModeSignal {
  signal: "EnterTypeMode";
  frame: string;
  storyId: string | null;
}

export type TypeToolHook = (signal: EnterTypeModeSignal) => void;

let activeHook: TypeToolHook | null = null;

export function setTypeToolHook(hook: TypeToolHook | null) {
  activeHook = hook;
}

export const typeTool: Tool = {
  id: "type" as any,
  label: "Type",
  hotkey: "T",

  defaultCursor() {
    return "text";
  },

  onPointerDown(ev: ToolEvent, ctx: ToolContext): ToolResult {
    if (ev.button !== 0) return {};
    const { xPt, yPt } = cssToPagePt(ev.cssX, ev.cssY, ctx.viewport);
    const hit = ctx.hitTest(xPt, yPt);
    if (!hit) {
      activeHook?.({ signal: "EnterTypeMode", frame: "", storyId: null });
      return { selection: null };
    }
    activeHook?.({ signal: "EnterTypeMode", frame: hit, storyId: null });
    return { selection: hit };
  },

  onPointerMove(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    return {};
  },

  onPointerUp(_ev: ToolEvent, _ctx: ToolContext): ToolResult {
    return {};
  },
};
