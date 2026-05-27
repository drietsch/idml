// Step 4 — shell-owned built-in commands. Registered automatically
// from ShellChrome so every app gets the palette toggle + panel
// toggles without writing them itself.

import { notifyPalette } from "../../chrome/CommandPalette";
import type { PanelContribution, CommandContribution } from "../../registries";
import type { VersoEditor } from "../verso-editor";

export const VERSO_PALETTE_TOGGLE = "verso.palette.toggle";

/**
 * Toggles the command palette. Bound to Cmd+K via the keybinding
 * registry; can also be invoked from a menu or programmatically.
 */
export const PALETTE_TOGGLE_COMMAND: CommandContribution = {
  id: VERSO_PALETTE_TOGGLE,
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
  command: VERSO_PALETTE_TOGGLE,
} as const;

/**
 * Same as above for non-Mac platforms — `cmd` aliases `meta` so
 * the macOS form covers the Cmd key; this entry covers Ctrl+K on
 * Linux / Windows. Both are registered so either modifier works
 * regardless of platform.
 */
export const PALETTE_TOGGLE_KEYBINDING_CTRL = {
  key: "ctrl+k",
  command: VERSO_PALETTE_TOGGLE,
} as const;

/**
 * Build a show/hide command pair for a panel contribution. The
 * commands key off the substrate's `addPanel` / `removePanel` —
 * which the substrate owns, not the registry — so handler bodies
 * read `verso.substrate` and bail when it's null (the
 * pre-DockviewRoot-onReady window).
 *
 * IDs follow `verso.panel.show.{id}` / `.hide.{id}` so bundles can
 * bind keybindings to a panel toggle without depending on the
 * substrate implementation.
 */
export function buildPanelToggleCommands(
  panel: PanelContribution,
): [CommandContribution, CommandContribution] {
  const show: CommandContribution = {
    id: `verso.panel.show.${panel.id}`,
    title: `Show: ${panel.title}`,
    category: "View",
    handler: (verso) => {
      const editor = verso as VersoEditor;
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
        hideTabHeader: panel.id === "verso.canvas",
      });
    },
  };
  const hide: CommandContribution = {
    id: `verso.panel.hide.${panel.id}`,
    title: `Hide: ${panel.title}`,
    category: "View",
    handler: (verso) => {
      const editor = verso as VersoEditor;
      const substrate = editor.substrate;
      if (!substrate) return;
      // The substrate's `removePanel` takes a PanelHandle but only
      // reads `handle.id` — fabricate a minimal one.
      substrate.removePanel({ id: panel.id, groupId: "" });
    },
  };
  return [show, hide];
}
