// Hidden-textarea text-edit overlay.
//
// When a text frame is in "type mode" (the user double-clicked a
// frame, or selected the Type tool and clicked into one), this
// component mounts an off-screen <textarea> that captures keyboard
// input + IME composition and translates it into editor commands.
//
// M2 scope: the textarea is the *input device* only — the canvas
// still paints the visible text. Caret placement uses a paragraph-
// granular model: clicking inside a frame parks the caret at the
// end of the frame's first paragraph (glyph-precise pixel→byte
// arrives in M3 with line metadata from the renderer). Even with
// that approximation, the user can type, see live updates on the
// canvas, undo, and apply Character/Paragraph attribute changes.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";

export interface TypeContext {
  storyId: string;
  /** Current paragraph index within the story. */
  paraIdx: number;
  /** Current byte offset within the paragraph. */
  byteOffset: number;
}

interface Props {
  client: EditorClient | null;
  active: boolean;
  ctx: TypeContext | null;
  onCtxChange: (ctx: TypeContext | null) => void;
  onCommandApplied: () => void;
  /** Caret CSS-px coordinates within the wrapper — used to position
   *  the hidden textarea so IME popups land near the user's gaze. */
  caretCss: { x: number; y: number } | null;
}

export function TextEditOverlay({
  client,
  active,
  ctx,
  onCtxChange,
  onCommandApplied,
  caretCss,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const compositionStartCtxRef = useRef<TypeContext | null>(null);
  const compositionPrevTextRef = useRef<string>("");
  const [coalesceKey, setCoalesceKey] = useState(0);
  const lastTypeAtRef = useRef<number>(0);

  // Focus the textarea when type mode opens.
  useEffect(() => {
    if (active && taRef.current) {
      taRef.current.focus();
    }
  }, [active]);

  const insertText = useCallback(
    (s: string, transient: boolean) => {
      if (!client || !ctx) return;
      // Coalesce commits made within 500 ms of the previous typing
      // event so undo collapses sustained typing into a single entry.
      const now = performance.now();
      let key = coalesceKey;
      if (now - lastTypeAtRef.current > 500) {
        key = key + 1;
        setCoalesceKey(key);
      }
      lastTypeAtRef.current = now;
      void transient;
      client.applyCommand({
        type: "InsertText",
        story: { id: ctx.storyId },
        para: ctx.paraIdx,
        byte_offset: ctx.byteOffset,
        text: s,
        coalesce: key,
      });
      onCtxChange({ ...ctx, byteOffset: ctx.byteOffset + utf8Len(s) });
      onCommandApplied();
    },
    [client, ctx, coalesceKey, onCtxChange, onCommandApplied],
  );

  const deleteRange = useCallback(
    (from: number, to: number) => {
      if (!client || !ctx) return;
      const now = performance.now();
      let key = coalesceKey;
      if (now - lastTypeAtRef.current > 500) {
        key = key + 1;
        setCoalesceKey(key);
      }
      lastTypeAtRef.current = now;
      client.applyCommand({
        type: "DeleteRange",
        story: { id: ctx.storyId },
        para: ctx.paraIdx,
        byte_from: from,
        byte_to: to,
        coalesce: key,
      });
      onCtxChange({ ...ctx, byteOffset: from });
      onCommandApplied();
    },
    [client, ctx, coalesceKey, onCtxChange, onCommandApplied],
  );

  function onKeyDown(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (composingRef.current) return; // IME owns the keystrokes
    if (!ctx) return;
    const meta = ev.metaKey || ev.ctrlKey;
    if (meta) return; // let the EditorApp handle ⌘Z, ⌘0 etc.
    if (ev.key === "Enter") {
      ev.preventDefault();
      client?.applyCommand({
        type: "SplitParagraph",
        story: { id: ctx.storyId },
        para: ctx.paraIdx,
        byte_offset: ctx.byteOffset,
      });
      onCtxChange({ storyId: ctx.storyId, paraIdx: ctx.paraIdx + 1, byteOffset: 0 });
      onCommandApplied();
      return;
    }
    if (ev.key === "Backspace") {
      ev.preventDefault();
      if (ctx.byteOffset > 0) {
        deleteRange(ctx.byteOffset - 1, ctx.byteOffset);
      } else if (ctx.paraIdx > 0) {
        // Merge with previous paragraph; caret lands at the join.
        const prevText = client?.paragraphText(ctx.storyId, ctx.paraIdx - 1) ?? "";
        client?.applyCommand({
          type: "MergeParagraph",
          story: { id: ctx.storyId },
          para: ctx.paraIdx - 1,
        });
        onCtxChange({
          storyId: ctx.storyId,
          paraIdx: ctx.paraIdx - 1,
          byteOffset: utf8Len(prevText),
        });
        onCommandApplied();
      }
      return;
    }
    if (ev.key === "Delete") {
      ev.preventDefault();
      const cur = client?.paragraphText(ctx.storyId, ctx.paraIdx) ?? "";
      if (ctx.byteOffset < utf8Len(cur)) {
        const next = nextCharBoundary(cur, ctx.byteOffset);
        deleteRange(ctx.byteOffset, next);
      } else {
        const total = client?.paragraphCount(ctx.storyId) ?? 0;
        if (ctx.paraIdx + 1 < total) {
          client?.applyCommand({
            type: "MergeParagraph",
            story: { id: ctx.storyId },
            para: ctx.paraIdx,
          });
          onCommandApplied();
        }
      }
      return;
    }
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      if (ctx.byteOffset > 0) {
        const cur = client?.paragraphText(ctx.storyId, ctx.paraIdx) ?? "";
        const prev = prevCharBoundary(cur, ctx.byteOffset);
        onCtxChange({ ...ctx, byteOffset: prev });
      } else if (ctx.paraIdx > 0) {
        const prevText =
          client?.paragraphText(ctx.storyId, ctx.paraIdx - 1) ?? "";
        onCtxChange({
          storyId: ctx.storyId,
          paraIdx: ctx.paraIdx - 1,
          byteOffset: utf8Len(prevText),
        });
      }
      return;
    }
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      const cur = client?.paragraphText(ctx.storyId, ctx.paraIdx) ?? "";
      if (ctx.byteOffset < utf8Len(cur)) {
        const next = nextCharBoundary(cur, ctx.byteOffset);
        onCtxChange({ ...ctx, byteOffset: next });
      } else {
        const total = client?.paragraphCount(ctx.storyId) ?? 0;
        if (ctx.paraIdx + 1 < total) {
          onCtxChange({
            storyId: ctx.storyId,
            paraIdx: ctx.paraIdx + 1,
            byteOffset: 0,
          });
        }
      }
      return;
    }
    if (ev.key === "Home") {
      ev.preventDefault();
      onCtxChange({ ...ctx, byteOffset: 0 });
      return;
    }
    if (ev.key === "End") {
      ev.preventDefault();
      const cur = client?.paragraphText(ctx.storyId, ctx.paraIdx) ?? "";
      onCtxChange({ ...ctx, byteOffset: utf8Len(cur) });
      return;
    }
  }

  function onBeforeInput(ev: React.FormEvent<HTMLTextAreaElement>) {
    const ie = ev.nativeEvent as InputEvent;
    if (composingRef.current) return; // composition path handles it
    if (ie.inputType === "insertText" && ie.data) {
      ev.preventDefault();
      insertText(ie.data, false);
    } else if (ie.inputType === "insertFromPaste" && ie.data) {
      ev.preventDefault();
      insertText(ie.data, false);
    }
  }

  function onCompositionStart(_ev: React.CompositionEvent<HTMLTextAreaElement>) {
    composingRef.current = true;
    compositionStartCtxRef.current = ctx ? { ...ctx } : null;
    compositionPrevTextRef.current = "";
  }

  function onCompositionUpdate(ev: React.CompositionEvent<HTMLTextAreaElement>) {
    const start = compositionStartCtxRef.current;
    if (!client || !start) return;
    const cur = ev.data ?? "";
    const prev = compositionPrevTextRef.current;
    // Replace the previous preedit with the new one as a single
    // ReplaceRange so undo only sees the final committed string.
    client.applyCommand({
      type: "ReplaceRange",
      story: { id: start.storyId },
      para: start.paraIdx,
      byte_from: start.byteOffset,
      byte_to: start.byteOffset + utf8Len(prev),
      text: cur,
      coalesce: -1, // never coalesces with anything else
    });
    compositionPrevTextRef.current = cur;
    onCtxChange({ ...start, byteOffset: start.byteOffset + utf8Len(cur) });
    onCommandApplied();
  }

  function onCompositionEnd(ev: React.CompositionEvent<HTMLTextAreaElement>) {
    composingRef.current = false;
    const final = ev.data ?? "";
    const start = compositionStartCtxRef.current;
    if (client && start) {
      client.applyCommand({
        type: "ReplaceRange",
        story: { id: start.storyId },
        para: start.paraIdx,
        byte_from: start.byteOffset,
        byte_to:
          start.byteOffset + utf8Len(compositionPrevTextRef.current),
        text: final,
        coalesce: null, // commit lands on undo stack
      });
      onCtxChange({ ...start, byteOffset: start.byteOffset + utf8Len(final) });
      onCommandApplied();
    }
    compositionStartCtxRef.current = null;
    compositionPrevTextRef.current = "";
    if (taRef.current) taRef.current.value = "";
  }

  if (!active) return null;
  const x = caretCss?.x ?? 0;
  const y = caretCss?.y ?? 0;
  return (
    <textarea
      ref={taRef}
      className="ime-bridge"
      style={{ left: `${x}px`, top: `${y}px` }}
      onKeyDown={onKeyDown}
      onBeforeInput={onBeforeInput}
      onCompositionStart={onCompositionStart}
      onCompositionUpdate={onCompositionUpdate}
      onCompositionEnd={onCompositionEnd}
      onBlur={() => onCtxChange(null)}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length;
}

function nextCharBoundary(s: string, byteOff: number): number {
  // Decode each code-point to know how many UTF-8 bytes to step.
  const enc = new TextEncoder();
  const bytes = enc.encode(s);
  if (byteOff >= bytes.length) return bytes.length;
  // UTF-8 lead byte categorisation.
  const b = bytes[byteOff]!;
  let len = 1;
  if (b < 0x80) len = 1;
  else if (b < 0xc0) len = 1; // continuation; best-effort step
  else if (b < 0xe0) len = 2;
  else if (b < 0xf0) len = 3;
  else len = 4;
  return Math.min(byteOff + len, bytes.length);
}

function prevCharBoundary(s: string, byteOff: number): number {
  if (byteOff <= 0) return 0;
  const bytes = new TextEncoder().encode(s);
  let i = Math.min(byteOff, bytes.length) - 1;
  while (i > 0 && (bytes[i]! & 0xc0) === 0x80) {
    i -= 1;
  }
  return i;
}
