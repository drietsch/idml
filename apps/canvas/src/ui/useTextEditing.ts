// Keyboard typing → mutation dispatch.
//
// Phase 3 UI-2 — when there's a `ContentSelection`, intercept printable
// keystrokes + Backspace/Delete and route them through the worker's
// `Mutation` channel. Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z drive Undo/Redo.
//
// Selection updates happen optimistically on the main thread (insert
// at offset O shifts the caret to O+len) so the caret stays in step
// with typing; the worker's authoritative `MutationApplied` reply
// confirms or supersedes via subsequent caret queries.

import { useEffect } from "react";
import type { CanvasClient } from "@verso/client";
import type { ContentSelection } from "@verso/client";

export interface TextEditingContext {
  client: CanvasClient | null;
  selection: ContentSelection | null;
  setSelection: (s: ContentSelection | null) => void;
}

export function useTextEditing(ctx: TextEditingContext) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const sel = ctx.selection;
      const client = ctx.client;
      if (!client) return;

      const cmd = e.metaKey || e.ctrlKey;

      // Cmd+Z / Cmd+Shift+Z. Always handled when client exists,
      // regardless of selection state.
      if (cmd && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          void client.redo();
        } else {
          void client.undo();
        }
        return;
      }

      // The remaining shortcuts require an active selection.
      if (!sel) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        if (sel.start === sel.end && sel.start === 0) return;
        if (sel.start === sel.end) {
          // Caret: delete one character backwards.
          const start = sel.start - 1;
          const end = sel.start;
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start, end },
          });
          ctx.setSelection({
            ...sel,
            start,
            end: start,
            affinity: false,
          });
        } else {
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end },
          });
          ctx.setSelection({ ...sel, end: sel.start, affinity: false });
        }
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        if (sel.start === sel.end) {
          // Forward delete — defer correct end-of-story handling
          // (worker will reject if out of range).
          void client.mutate({
            op: "deleteRange",
            args: {
              storyId: sel.storyId,
              start: sel.start,
              end: sel.start + 1,
            },
          });
        } else {
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end },
          });
          ctx.setSelection({ ...sel, end: sel.start, affinity: false });
        }
        return;
      }

      // Printable input. e.key is "a", "A", " ", etc. for character
      // keys; "Enter" / "Tab" / arrow keys handled elsewhere.
      if (e.key.length === 1 && !cmd && !e.altKey) {
        e.preventDefault();
        const text = e.key;
        // Optimistic local shift: caret advances by 1.
        if (sel.start === sel.end) {
          void client.mutate({
            op: "insertText",
            args: { storyId: sel.storyId, offset: sel.start, text },
          });
          ctx.setSelection({
            ...sel,
            start: sel.start + text.length,
            end: sel.start + text.length,
            affinity: false,
          });
        } else {
          // Range selection: replace = delete + insert. Send as two
          // ops; the worker applies them in order.
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end },
          });
          void client.mutate({
            op: "insertText",
            args: { storyId: sel.storyId, offset: sel.start, text },
          });
          ctx.setSelection({
            ...sel,
            start: sel.start + text.length,
            end: sel.start + text.length,
            affinity: false,
          });
        }
        return;
      }

      // Left / Right arrows move the caret.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const newOffset = Math.max(0, sel.start + delta);
        if (e.shiftKey) {
          // Extend selection from the anchor (start) toward newOffset.
          ctx.setSelection({
            ...sel,
            start: Math.min(sel.start, newOffset),
            end: Math.max(sel.end, newOffset),
          });
        } else {
          ctx.setSelection({
            ...sel,
            start: newOffset,
            end: newOffset,
            affinity: false,
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
