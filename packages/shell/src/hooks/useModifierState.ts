// Plan-2 §8.5 — observe keyboard modifier state.
//
// Overlays + cursors that change with held modifiers (e.g. the
// content-grabber donut surfacing only when Cmd is down, the path-edit
// pen cursor flipping between insert / delete) read from a single
// source of truth so they stay in sync. Browser pointermove events
// already carry modifier flags; pure keydown/keyup transitions (the
// user presses Cmd without moving the mouse) need their own listeners.
//
// Returns the current state; re-renders the consumer when any flag
// flips. Modifier state is per-window — a single mount in the shell
// is the cheapest pattern, but multiple subscribers are also fine
// because each one maintains its own React state via the hook.

import { useEffect, useState } from "react";

export interface ModifierState {
  /** macOS ⌘ or any other meta key. Combined with `ctrl` at the
   * consumer site only when the platform's Cmd semantic is intended. */
  meta: boolean;
  /** Standalone Ctrl key. macOS keeps this distinct from Cmd; on
   * Windows / Linux it's the canonical primary modifier. */
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** Platform-aware "Cmd" — `meta` on macOS, `ctrl` elsewhere. The
   * overlay system's existing modifier-aware code paths use this
   * fused flag (cf. ViewportCanvas's `cmd: e.metaKey || e.ctrlKey`). */
  cmd: boolean;
}

const EMPTY: ModifierState = {
  meta: false,
  ctrl: false,
  shift: false,
  alt: false,
  cmd: false,
};

export function useModifierState(): ModifierState {
  const [state, setState] = useState<ModifierState>(EMPTY);

  useEffect(() => {
    const apply = (e: KeyboardEvent | MouseEvent) => {
      const next: ModifierState = {
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        cmd: e.metaKey || e.ctrlKey,
      };
      setState((prev) => {
        if (
          prev.meta === next.meta &&
          prev.ctrl === next.ctrl &&
          prev.shift === next.shift &&
          prev.alt === next.alt
        ) {
          return prev;
        }
        return next;
      });
    };
    const blur = () => setState(EMPTY);
    window.addEventListener("keydown", apply);
    window.addEventListener("keyup", apply);
    // pointer events carry modifier flags too — useful when the user
    // presses a key WITHOUT focus (then moves the mouse over the
    // canvas: the first pointermove fixes our state).
    window.addEventListener("pointermove", apply);
    // Lose focus → assume all keys released. Avoids "stuck Cmd"
    // after the user Cmd-tabs away.
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", apply);
      window.removeEventListener("keyup", apply);
      window.removeEventListener("pointermove", apply);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return state;
}
