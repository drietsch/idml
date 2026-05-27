// `useScrubGesture` — UI primitive for drag-to-scrub interactions.
//
// Decoupled from the canvas on purpose: the hook knows about
// pointers and the begin/update/commit lifecycle, but not about
// IDML elements or the canvas worker. Consumers wire the
// `onUpdate` / `onCommit` callbacks to whatever surface owns the
// value — a number input, a slider, a camera scale, a future
// bundle's property handle.
//
// Pointer-down on the bound element starts a logical gesture;
// pointer-move accumulates delta; pointer-up commits; Escape /
// pointer-cancel rolls back. Pointer capture keeps the drag
// going when the cursor leaves the element. Modifier scalars
// follow the canvas convention: Shift = fine (default ×0.1),
// Alt = coarse (default ×10).

import { useCallback, useEffect, useRef, useState } from "react";

export interface ScrubGestureOptions {
  /** Current value when the scrub begins. */
  initial: number;
  /** Document-space units per pixel of horizontal drag. Default 1. */
  step?: number;
  /** Min / max clamps. */
  min?: number;
  max?: number;
  /** Decimal places to round to. Default 2. */
  precision?: number;
  /** Modifier-key scalars applied to `step`. Setting either to `1`
   * disables that modifier; passing `null` disables both. */
  modifiers?: { shift?: number; alt?: number } | null;
  /** Fires on begin + every pointer-move with the new value. */
  onUpdate?: (value: number, phase: "begin" | "update") => void;
  /** Fires on pointer-up if the gesture actually changed the value. */
  onCommit?: (value: number, initial: number) => void;
  /** Fires on Escape / pointer-cancel. */
  onCancel?: () => void;
}

export interface ScrubGesture {
  /** Ref callback — set on the draggable element. */
  bind: (element: HTMLElement | null) => void;
  /** True while a drag is in progress. */
  isScrubbing: boolean;
  /** Current value (initial when not scrubbing). */
  value: number;
}

interface DragState {
  startX: number;
  initial: number;
  pointerId: number;
}

const DEFAULT_PRECISION = 2;
const DEFAULT_SHIFT_SCALAR = 0.1;
const DEFAULT_ALT_SCALAR = 10;

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let v = value;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

function roundTo(value: number, precision: number): number {
  if (precision >= 10) return value;
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function useScrubGesture(options: ScrubGestureOptions): ScrubGesture {
  const { initial } = options;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [value, setValue] = useState<number>(initial);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  // Options + latest computed value tracked via refs so the pointer
  // handlers (registered once per element) see fresh values without
  // re-binding on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const latestValueRef = useRef<number>(initial);

  // Re-sync `value` to `initial` when the controlled initial value
  // changes from outside (e.g., the camera scale updated via a
  // different code path). Don't disturb an in-progress scrub.
  useEffect(() => {
    if (!dragRef.current) {
      setValue(initial);
      latestValueRef.current = initial;
    }
  }, [initial]);

  const bind = useCallback((el: HTMLElement | null) => {
    setElement(el);
  }, []);

  useEffect(() => {
    if (!element) return;

    const computeValue = (dx: number, shift: boolean, alt: boolean): number => {
      const o = optionsRef.current;
      const baseStep = o.step ?? 1;
      const mods = o.modifiers === null ? null : (o.modifiers ?? {});
      let scalar = 1;
      if (mods && shift) scalar *= mods.shift ?? DEFAULT_SHIFT_SCALAR;
      if (mods && alt) scalar *= mods.alt ?? DEFAULT_ALT_SCALAR;
      const delta = dx * baseStep * scalar;
      const start = dragRef.current?.initial ?? o.initial;
      return roundTo(
        clamp(start + delta, o.min, o.max),
        o.precision ?? DEFAULT_PRECISION,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return; // Primary only.
      event.preventDefault();
      const o = optionsRef.current;
      dragRef.current = {
        startX: event.clientX,
        initial: o.initial,
        pointerId: event.pointerId,
      };
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture can throw if the pointer is already captured;
        // we proceed without it (the move/up listeners on the
        // element still fire for as long as the element exists).
      }
      element.style.cursor = "ew-resize";
      setIsScrubbing(true);
      const next = computeValue(0, event.shiftKey, event.altKey);
      latestValueRef.current = next;
      setValue(next);
      optionsRef.current.onUpdate?.(next, "begin");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const next = computeValue(dx, event.shiftKey, event.altKey);
      latestValueRef.current = next;
      setValue(next);
      optionsRef.current.onUpdate?.(next, "update");
    };

    const finish = (commit: boolean) => {
      const state = dragRef.current;
      if (!state) return;
      try {
        element.releasePointerCapture(state.pointerId);
      } catch {
        // Already released.
      }
      element.style.cursor = "";
      dragRef.current = null;
      setIsScrubbing(false);
      const o = optionsRef.current;
      if (commit) {
        const finalValue = latestValueRef.current;
        if (finalValue !== state.initial) {
          o.onCommit?.(finalValue, state.initial);
        }
      } else {
        latestValueRef.current = state.initial;
        setValue(state.initial);
        o.onUpdate?.(state.initial, "update");
        o.onCancel?.();
      }
    };

    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dragRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [element]);

  return { bind, isScrubbing, value };
}
