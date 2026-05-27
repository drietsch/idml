// Step 5c — path-edit mode entry / exit.
//
// Lives next to the rest of apps/canvas's UI hooks (mirrors
// useKeyboardShortcuts.ts) so it can be mounted by the canvas
// integration component without dragging shell into canvas
// internals. Behaviour:
//
//   Enter (on a single path-bearing selection) → enter path-edit
//                                                mode.
//   Escape (while in path-edit mode)           → exit.
//   Selection clears or shrinks past a single  → exit.
//   element                                       (so a marquee
//                                                drag doesn't
//                                                leave the
//                                                overlay stuck).
//   Active tool changes                        → exit (text tool
//                                                conflicts with
//                                                path editing).

import { useEffect } from "react";

import { elementSupportsPathEdit, useSelection } from "@verso/shell";

export function usePathEditMode() {
  const {
    activeTool,
    elementSelection,
    pathEditMode,
    setPathEditMode,
  } = useSelection();

  // Enter / Escape bindings — skip when an editable element has
  // focus so typing in the command palette / inspector doesn't
  // toggle path-edit mode by accident.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "Enter") {
        if (pathEditMode) return; // already on; let other handlers see Enter
        if (elementSelection.length !== 1) return;
        if (!elementSupportsPathEdit(elementSelection[0])) return;
        e.preventDefault();
        setPathEditMode(true);
        return;
      }
      if (e.key === "Escape" && pathEditMode) {
        e.preventDefault();
        setPathEditMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathEditMode, elementSelection, setPathEditMode]);

  // Auto-exit when the selection isn't a single path-bearing
  // element any more (cleared, or grew to a multi-select).
  useEffect(() => {
    if (!pathEditMode) return;
    if (
      elementSelection.length !== 1 ||
      !elementSupportsPathEdit(elementSelection[0])
    ) {
      setPathEditMode(false);
    }
  }, [pathEditMode, elementSelection, setPathEditMode]);

  // Auto-exit on tool switch.
  useEffect(() => {
    if (pathEditMode && activeTool !== "select") {
      setPathEditMode(false);
    }
  }, [pathEditMode, activeTool, setPathEditMode]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
