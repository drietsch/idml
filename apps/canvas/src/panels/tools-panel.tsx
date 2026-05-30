// SDK Phase 5 (named sweep) — Tools panel.
//
// Expert leaf consuming the existing `useSelection` context's
// `activeTool` / `setActiveTool` pair. Writes target application
// state, not document state — the `writes: ["selection"]` audit
// tag from `panel-catalog-and-sdk-extension.md` §10 applies.
//
// v1 ships the two tools the canvas spine already routes pointer
// events through: Select (default) and Text (caret/typing).
// Additional tools (Pen / Pencil / etc) land as their gestures
// gain canvas-side handlers.

import { useSelection, type ActiveTool } from "@verso/shell";

interface ToolDef {
  value: ActiveTool;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { value: "select", label: "Select", shortcut: "V" },
  { value: "text", label: "Text", shortcut: "T" },
];

export function ToolsPanel() {
  const { activeTool, setActiveTool } = useSelection();
  return (
    <div className="p-3" data-tools-panel="ready">
      <div
        className="flex flex-col gap-0.5"
        role="group"
        aria-label="Tools"
      >
        {TOOLS.map((tool) => {
          const active = activeTool === tool.value;
          return (
            <button
              type="button"
              key={tool.value}
              data-tool={tool.value}
              data-active={active ? "true" : "false"}
              className={`flex items-center justify-between text-xs px-2 py-1 border border-input rounded ${
                active ? "bg-muted/80" : "bg-background"
              }`}
              onClick={() => setActiveTool(tool.value)}
            >
              <span>{tool.label}</span>
              <span className="text-muted-foreground">{tool.shortcut}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
