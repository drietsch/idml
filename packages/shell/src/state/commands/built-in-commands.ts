// Step 4 — shell-owned built-in commands. Registered automatically
// from ShellChrome so every app gets the palette toggle + panel
// toggles without writing them itself.

import { notifyPalette } from "../../chrome/CommandPalette";
import {
  deletePerspective,
  exportPerspective,
  getPerspective,
  importPerspective,
  savePerspective,
} from "../../persistence/layout-persistence";
import type { PanelContribution, CommandContribution } from "../../registries";
import type { PagedEditor } from "../paged-editor";

export const PAGED_PALETTE_TOGGLE = "paged.palette.toggle";

/**
 * Toggles the command palette. Bound to Cmd+K via the keybinding
 * registry; can also be invoked from a menu or programmatically.
 */
export const PALETTE_TOGGLE_COMMAND: CommandContribution = {
  id: PAGED_PALETTE_TOGGLE,
  title: "Toggle Command Palette",
  category: "View",
  handler: () => {
    notifyPalette("toggle");
  },
};

/**
 * Shorthand for the keybinding contribution that routes Cmd+K
 * (and Ctrl+K on non-Mac) to the palette-toggle command.
 */
export const PALETTE_TOGGLE_KEYBINDING = {
  key: "cmd+k",
  command: PAGED_PALETTE_TOGGLE,
} as const;

/**
 * Same as above for non-Mac platforms — `cmd` aliases `meta` so
 * the macOS form covers the Cmd key; this entry covers Ctrl+K on
 * Linux / Windows. Both are registered so either modifier works
 * regardless of platform.
 */
export const PALETTE_TOGGLE_KEYBINDING_CTRL = {
  key: "ctrl+k",
  command: PAGED_PALETTE_TOGGLE,
} as const;

/**
 * Build a show/hide command pair for a panel contribution. The
 * commands key off the substrate's `addPanel` / `removePanel` —
 * which the substrate owns, not the registry — so handler bodies
 * read `paged.substrate` and bail when it's null (the
 * pre-DockviewRoot-onReady window).
 *
 * IDs follow `paged.panel.show.{id}` / `.hide.{id}` so bundles can
 * bind keybindings to a panel toggle without depending on the
 * substrate implementation.
 */
export function buildPanelToggleCommands(
  panel: PanelContribution,
): [CommandContribution, CommandContribution] {
  const show: CommandContribution = {
    id: `paged.panel.show.${panel.id}`,
    title: `Show: ${panel.title}`,
    category: "View",
    handler: (paged) => {
      const editor = paged as PagedEditor;
      const substrate = editor.substrate;
      if (!substrate) return;
      // Add the panel idempotently; the substrate no-ops when the
      // panel already exists.
      substrate.addPanel({
        id: panel.id,
        title: panel.title,
        component: panel.component,
        semanticGroup: panel.defaultGroup ?? panel.id,
        defaultDock: panel.defaultDock ?? "right",
        closable: panel.closable ?? true,
        movable: panel.movable ?? true,
        hideTabHeader: panel.id === "paged.canvas",
      });
    },
  };
  const hide: CommandContribution = {
    id: `paged.panel.hide.${panel.id}`,
    title: `Hide: ${panel.title}`,
    category: "View",
    handler: (paged) => {
      const editor = paged as PagedEditor;
      const substrate = editor.substrate;
      if (!substrate) return;
      // The substrate's `removePanel` takes a PanelHandle but only
      // reads `handle.id` — fabricate a minimal one.
      substrate.removePanel({ id: panel.id, groupId: "" });
    },
  };
  return [show, hide];
}

// ── Perspective commands ──────────────────────────────────────

export const PAGED_PERSPECTIVE_SAVE_AS = "paged.perspective.saveAs";
export const PAGED_PERSPECTIVE_EXPORT = "paged.perspective.export";
export const PAGED_PERSPECTIVE_IMPORT = "paged.perspective.import";

/**
 * Prompt the user for a perspective name, then snapshot the current
 * layout into it. `window.prompt` is the placeholder UX until the
 * palette grows an input-prompt mode (Step 4 follow-up).
 */
export const PERSPECTIVE_SAVE_AS_COMMAND: CommandContribution = {
  id: PAGED_PERSPECTIVE_SAVE_AS,
  title: "Save Perspective…",
  category: "View",
  handler: (paged) => {
    const editor = paged as PagedEditor;
    const substrate = editor.substrate;
    if (!substrate) return;
    const name = window.prompt("Save perspective as:");
    if (!name) return;
    savePerspective(name, substrate.serialize());
  },
};

/** Export the named perspective as a downloadable JSON file. */
export const PERSPECTIVE_EXPORT_COMMAND: CommandContribution = {
  id: PAGED_PERSPECTIVE_EXPORT,
  title: "Export Perspective…",
  category: "View",
  handler: () => {
    const name = window.prompt("Export perspective named:");
    if (!name) return;
    const json = exportPerspective(name);
    if (json === null) {
      window.alert(`Perspective "${name}" not found.`);
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paged-perspective-${name}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },
};

/** Open a file picker, read the JSON, save under a user-supplied
 * name. The embedded `name` field is ignored — the user names it on
 * import so existing perspectives aren't accidentally clobbered. */
export const PERSPECTIVE_IMPORT_COMMAND: CommandContribution = {
  id: PAGED_PERSPECTIVE_IMPORT,
  title: "Import Perspective…",
  category: "View",
  handler: async () => {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!file) return;
    const json = await file.text();
    const name = window.prompt(
      "Import this perspective under what name?",
      file.name.replace(/\.json$/i, ""),
    );
    if (!name) return;
    try {
      importPerspective(name, json);
    } catch (err) {
      window.alert(`Import failed: ${String(err)}`);
    }
  },
};

/**
 * Build a load/delete command pair for a named perspective. Auto-
 * registered as perspectives are saved + disposed as they're
 * removed. IDs follow `paged.perspective.load.<name>` / `.delete.<name>`.
 */
export function buildPerspectiveLifecycleCommands(
  name: string,
): [CommandContribution, CommandContribution] {
  const load: CommandContribution = {
    id: `paged.perspective.load.${name}`,
    title: `Load Perspective: ${name}`,
    category: "View",
    handler: (paged) => {
      const editor = paged as PagedEditor;
      const substrate = editor.substrate;
      if (!substrate) return;
      const snapshot = getPerspective(name);
      if (snapshot === null) {
        window.alert(`Perspective "${name}" not found.`);
        return;
      }
      substrate.restore(snapshot);
    },
  };
  const del: CommandContribution = {
    id: `paged.perspective.delete.${name}`,
    title: `Delete Perspective: ${name}`,
    category: "View",
    handler: () => {
      if (!window.confirm(`Delete perspective "${name}"?`)) return;
      deletePerspective(name);
    },
  };
  return [load, del];
}
