// Step 4 — shell-owned built-in commands. Registered automatically
// from ShellChrome so every app gets the palette toggle + panel
// toggles without writing them itself.

import { notifyPalette } from "../../chrome/CommandPalette";
import type { CommandContribution } from "../../registries";

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
