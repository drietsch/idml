import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Step 3 stub. The real keybinding pipeline lands alongside the
 * bundle loader in Step 4 — until then the existing
 * `useKeyboardShortcuts` hook in apps/canvas remains the source
 * of truth for in-canvas keybindings.
 *
 * The interface is declared now so panel + command contributions
 * can reference it; `register` is a no-op so any third-party
 * registration calls just sit idle without throwing.
 */
export interface KeybindingContribution {
  key: string;
  command: string;
  when?: VisibilityPredicate;
}

export interface KeybindingRegistry {
  register(contribution: KeybindingContribution): Disposable;
}

export function createKeybindingRegistry(): KeybindingRegistry {
  return {
    register(_contribution) {
      // Step 3 no-op. The dispose handle still resolves cleanly so
      // contribution call sites don't need to special-case the
      // current stage.
      return {
        dispose() {
          /* no-op until Step 4 */
        },
      };
    },
  };
}
