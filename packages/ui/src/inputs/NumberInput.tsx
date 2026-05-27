import { useEffect, useRef, useState } from "react";
import { useScrubGesture } from "@verso/shell";

export interface NumberInputProps {
  /** Current value. Treated as controlled — caller drives. */
  value: number;
  /** Fires on every change (scrub update + keyboard edit + commit). */
  onChange: (value: number) => void;
  /** Optional final-value notifier for keyboard "Enter" / blur and
   * for scrub commits. Useful when the caller wants to debounce
   * non-final updates differently. */
  onCommit?: (value: number) => void;
  /** Document-space units per pixel of scrub-drag. Default 1. */
  step?: number;
  /** Clamp range. */
  min?: number;
  max?: number;
  /** Decimal places. Default 2. */
  precision?: number;
  /** Optional label shown on the drag handle (the small chip on the
   * left of the input). Typical values: "X", "Y", "W", "Pt". */
  label?: string;
  /** Disabled flag — disables both the input and the scrub handle. */
  disabled?: boolean;
  /** Extra className applied to the wrapper. */
  className?: string;
  /** Aria-label for accessibility. */
  "aria-label"?: string;
}

/**
 * Numeric input + scrub handle. Drag the leading chip horizontally
 * to scrub the value; type into the input to edit directly. Both
 * paths fire `onChange`; `onCommit` fires on Enter/blur/scrub-end.
 *
 * Held Shift = fine increments (×0.1). Held Alt = coarse (×10).
 * Escape during a scrub cancels and snaps back to the pre-scrub value.
 */
export function NumberInput(props: NumberInputProps) {
  const {
    value,
    onChange,
    onCommit,
    step = 1,
    min,
    max,
    precision = 2,
    label = "",
    disabled = false,
    className = "",
  } = props;

  // Mirror the controlled value into a local text-state so the user
  // can type a partial number ("3.") without us snapping it back.
  const [text, setText] = useState<string>(value.toString());
  const lastCommittedRef = useRef<number>(value);

  // Re-sync local text when the controlled `value` prop changes
  // from outside while the field is NOT focused.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(value.toString());
      lastCommittedRef.current = value;
    }
  }, [value]);

  const scrub = useScrubGesture({
    initial: value,
    step,
    min,
    max,
    precision,
    onUpdate: (next) => {
      setText(next.toString());
      onChange(next);
    },
    onCommit: (next, initial) => {
      lastCommittedRef.current = next;
      onCommit?.(next);
      // Notify even if onChange already fired during the drag; the
      // explicit commit is part of the API contract.
      if (next !== initial) onChange(next);
    },
    onCancel: () => {
      setText(value.toString());
      onChange(value);
    },
  });

  const commitText = () => {
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) {
      // Snap back to the last committed value on garbage input.
      setText(lastCommittedRef.current.toString());
      return;
    }
    let v = parsed;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    const factor = Math.pow(10, precision);
    v = Math.round(v * factor) / factor;
    setText(v.toString());
    lastCommittedRef.current = v;
    onChange(v);
    onCommit?.(v);
  };

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded border border-input bg-background text-sm h-7 ${className}`}
      data-disabled={disabled || undefined}
    >
      {label && (
        <span
          ref={scrub.bind}
          className="px-2 inline-flex items-center select-none cursor-ew-resize text-muted-foreground bg-muted/40 border-r border-input font-medium"
          aria-hidden="true"
          style={{ touchAction: "none" }}
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        className="flex-1 min-w-0 px-2 bg-transparent outline-none focus:ring-1 focus:ring-ring focus:ring-inset"
        aria-label={props["aria-label"]}
        onChange={(e) => {
          setText(e.target.value);
          // Live-update if the partial value parses cleanly.
          const parsed = Number.parseFloat(e.target.value);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(lastCommittedRef.current.toString());
            inputRef.current?.blur();
          }
        }}
      />
      {scrub.isScrubbing && (
        <span className="sr-only" aria-live="polite">
          scrubbing: {scrub.value}
        </span>
      )}
    </div>
  );
}
