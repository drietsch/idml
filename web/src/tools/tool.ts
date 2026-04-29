// Tool framework. A tool is a pure object that returns handlers for
// pointer events; each handler returns a `ToolResult` describing the
// changes it wants applied (selection, viewport, commands). The
// EditorApp routes events through the active tool and applies the
// resulting changes — tools never call into the wasm directly.

import type { Command } from "../editor/EditorClient";

export type ToolId = "select" | "hand" | "zoom" | "type";

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface SnapHit {
  dxPt: number;
  dyPt: number;
  guides: { x_a: number; y_a: number; x_b: number; y_b: number }[];
}

export interface ToolContext {
  /** CSS pixel position of the wrapper's origin within the viewport. */
  viewport: Viewport;
  /** Device-pixel ratio. */
  dpr: number;
  /**
   * The currently displayed page's geometry. Page coords run from
   * (0,0) at the page's top-left in pt; the page is positioned on
   * the canvas at (panX, panY) and scaled by `zoom` (CSS-px/pt).
   */
  page: { widthPt: number; heightPt: number };
  /** Currently selected frame, if any. */
  selection: string | null;
  /**
   * Synchronous hit test against the working document at `(xPt, yPt)`
   * in *page-relative* pt. Returns the topmost frame id or null.
   */
  hitTest: (xPt: number, yPt: number) => string | null;
  /**
   * Synchronous bbox lookup for a frame in *page-relative* pt.
   * Returns null when the frame is not on the active page.
   */
  frameBboxPagePt: (
    frameId: string,
  ) => { x: number; y: number; w: number; h: number } | null;
  /**
   * Snap query: given the predicted moving-frame bbox in page-pt,
   * return a snap delta + the guide segments to render.
   */
  computeSnap: (
    bboxPagePt: { x: number; y: number; w: number; h: number },
    excludedFrameId: string | null,
    thresholdPt: number,
  ) => SnapHit;
}

export interface ToolResult {
  /** Replace the active selection. `undefined` keeps current. */
  selection?: string | null;
  /** Apply a partial viewport update (merges over current). */
  viewport?: Partial<Viewport>;
  /** Commands to apply, in order. */
  commands?: Command[];
  /** Cursor to set on the canvas while this tool is active. */
  cursor?: string;
  /** Snap guides to render this frame (overrides previous). `[]`
   *  clears any guides currently drawn; `undefined` keeps the
   *  previous set. */
  guides?: { x_a: number; y_a: number; x_b: number; y_b: number }[];
}

export interface ToolEvent {
  /** Canvas-relative CSS-px coordinates. */
  cssX: number;
  cssY: number;
  /** Pointer button state: `0` left, `1` middle, `2` right. */
  button: number;
  altKey: boolean;
  shiftKey: boolean;
  ctrlOrMeta: boolean;
}

export interface Tool {
  readonly id: ToolId;
  readonly label: string;
  readonly hotkey: string;
  defaultCursor(): string;
  onPointerDown(ev: ToolEvent, ctx: ToolContext): ToolResult;
  onPointerMove(ev: ToolEvent, ctx: ToolContext): ToolResult;
  onPointerUp(ev: ToolEvent, ctx: ToolContext): ToolResult;
}

/** Convert a canvas CSS-px point to page-pt for the displayed page. */
export function cssToPagePt(
  cssX: number,
  cssY: number,
  vp: Viewport,
): { xPt: number; yPt: number } {
  return {
    xPt: (cssX - vp.panX) / vp.zoom,
    yPt: (cssY - vp.panY) / vp.zoom,
  };
}
