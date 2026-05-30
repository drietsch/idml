// SDK Phase 4 — canvas-app-specific commands.
//
// These are the actions that today live as direct event handlers
// (Cmd+Z, Cmd+0, the header file-picker button, etc.). Lifting them
// onto `CommandContribution`s means menu / palette / future bundle
// can all reach the same surface. The shell registers
// `paged.file.openIdml` and `paged.palette.toggle` itself; this
// module fills in the canvas-specific gaps:
//
//   paged.editor.undo / paged.editor.redo
//   paged.view.zoomIn / zoomOut / zoom100 / zoomFit
//
// The "Show: <panel>" Window-menu entries are deferred — the
// DockingSubstrate today exposes `addPanel` / `removePanel` but no
// `focusPanel` / `hasPanel` / `togglePanel`. A later commit can add
// that surface; the menu items follow once it exists.

import type {
  CommandContribution,
  KeybindingContribution,
} from "@paged-media/shell";

export const PAGED_EDITOR_UNDO = "paged.editor.undo";
export const PAGED_EDITOR_REDO = "paged.editor.redo";
export const PAGED_VIEW_ZOOM_IN = "paged.view.zoomIn";
export const PAGED_VIEW_ZOOM_OUT = "paged.view.zoomOut";
export const PAGED_VIEW_ZOOM_100 = "paged.view.zoom100";
export const PAGED_VIEW_ZOOM_FIT = "paged.view.zoomFit";

export interface AppCommandHandlers {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  zoom100: () => void;
  zoomFit: () => void;
}

/** Build the canvas-app's command set. `handlers` is the bag of
 *  closures owned by `CanvasAppIntegration` — it's wired in there
 *  so the commands close over the same camera + animateCamera
 *  bindings the keyboard shortcuts use. */
export function buildAppCommands(
  handlers: AppCommandHandlers,
): CommandContribution[] {
  return [
    {
      id: PAGED_EDITOR_UNDO,
      title: "Undo",
      category: "Edit",
      handler: () => handlers.undo(),
    },
    {
      id: PAGED_EDITOR_REDO,
      title: "Redo",
      category: "Edit",
      handler: () => handlers.redo(),
    },
    {
      id: PAGED_VIEW_ZOOM_IN,
      title: "Zoom In",
      category: "View",
      handler: () => handlers.zoomIn(),
    },
    {
      id: PAGED_VIEW_ZOOM_OUT,
      title: "Zoom Out",
      category: "View",
      handler: () => handlers.zoomOut(),
    },
    {
      id: PAGED_VIEW_ZOOM_100,
      title: "Zoom to 100%",
      category: "View",
      handler: () => handlers.zoom100(),
    },
    {
      id: PAGED_VIEW_ZOOM_FIT,
      title: "Fit Document",
      category: "View",
      handler: () => handlers.zoomFit(),
    },
  ];
}

/** Menu projection. Mirrors the command ids; the MenuBar renders
 *  these grouped by the leading path segment.
 *
 *  The shell already registers `File/Open IDML…` (pointing at
 *  `paged.file.openIdml`) and `View/Toggle Command Palette`, so
 *  this projection covers only the items unique to the canvas app:
 *  Edit > Undo/Redo and View > Zoom*. */
export const APP_MENU_ITEMS: Array<{
  path: string;
  command: string;
  order?: number;
  group?: string;
}> = [
  // Edit menu
  { path: "Edit/Undo", command: PAGED_EDITOR_UNDO, order: 10, group: "undo" },
  { path: "Edit/Redo", command: PAGED_EDITOR_REDO, order: 20, group: "undo" },
  // View menu
  { path: "View/Zoom In", command: PAGED_VIEW_ZOOM_IN, order: 20, group: "zoom" },
  { path: "View/Zoom Out", command: PAGED_VIEW_ZOOM_OUT, order: 30, group: "zoom" },
  { path: "View/Zoom to 100%", command: PAGED_VIEW_ZOOM_100, order: 40, group: "zoom" },
  { path: "View/Fit Document", command: PAGED_VIEW_ZOOM_FIT, order: 50, group: "zoom" },
];

/** Keybindings that route through the command registry. Cmd-Z /
 *  Cmd-Shift-Z stay in useTextEditing.ts for now — moving them
 *  would risk a race with command registration on cold start.
 *  Zoom keybindings are safe to add because no existing shortcut
 *  already binds Cmd+= / Cmd+- in the canvas. Both cmd (mac) and
 *  ctrl (linux/win) variants register so the command fires
 *  regardless of platform — the registry treats them as distinct
 *  contributions per the parseCombo modifier vocabulary
 *  (`cmd` / `meta`, `ctrl` / `control`, `alt` / `option`, `shift`). */
export const APP_KEYBINDINGS: KeybindingContribution[] = [
  { key: "cmd+=", command: PAGED_VIEW_ZOOM_IN },
  { key: "ctrl+=", command: PAGED_VIEW_ZOOM_IN },
  { key: "cmd+-", command: PAGED_VIEW_ZOOM_OUT },
  { key: "ctrl+-", command: PAGED_VIEW_ZOOM_OUT },
];
