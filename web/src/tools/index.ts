// Public tool registry.

import { selectTool } from "./select";
import { handTool } from "./hand";
import { zoomTool } from "./zoom";
import { typeTool } from "./type";
import type { Tool } from "./tool";

export type ToolId = "select" | "hand" | "zoom" | "type";

export type { Tool, ToolContext, ToolEvent, ToolResult, Viewport } from "./tool";
export { cssToPagePt } from "./tool";
export { setTypeToolHook } from "./type";
export type { EnterTypeModeSignal, TypeToolHook } from "./type";

export const TOOLS: Record<ToolId, Tool> = {
  select: selectTool,
  hand: handTool,
  zoom: zoomTool,
  type: typeTool,
};

export const TOOL_LIST: Tool[] = [selectTool, typeTool, handTool, zoomTool];

export function toolByHotkey(key: string): Tool | undefined {
  const upper = key.toUpperCase();
  return TOOL_LIST.find((t) => t.hotkey === upper);
}
