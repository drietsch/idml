import { useState } from "react";

export interface ColorPickerProps {
  /** Current swatch reference (e.g. `"Color/Red"`). `null` ⇒ unset. */
  value: string | null;
  /** Fires on Enter / blur / explicit clear with the new swatch ref. */
  onCommit: (value: string | null) => void;
  /** Optional palette to choose from. When provided the popover lists
   *  swatch buttons; otherwise the picker is text-only. */
  palette?: Array<{ id: string; label: string; preview?: string }>;
  disabled?: boolean;
}

/**
 * Inspector P1 — minimal swatch-reference editor. Displays the
 * current swatch id with a small colour chip (when a palette
 * provides a preview hex) and a text input for direct edits.
 *
 * v1 is text-driven so the inspector ships before the palette
 * pipeline lands. The `palette` prop is the seam for the v2
 * popover-with-swatch-grid — pass swatch refs derived from the
 * document's `Graphic` palette and the picker renders them as
 * clickable chips.
 */
export function ColorPicker(props: ColorPickerProps) {
  const { value, onCommit, palette, disabled = false } = props;
  const [text, setText] = useState<string>(value ?? "");
  // Re-sync when controlled value changes from outside.
  if (text !== (value ?? "") && document.activeElement?.tagName !== "INPUT") {
    setText(value ?? "");
  }

  const preview =
    value !== null
      ? palette?.find((p) => p.id === value)?.preview ?? null
      : null;

  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded border border-input bg-background text-sm h-7"
      data-color-picker
      data-value={value ?? ""}
    >
      <span
        className="w-7 inline-block border-r border-input"
        style={{ background: preview ?? "transparent" }}
        aria-hidden="true"
        title={value ?? "no fill"}
      />
      <input
        type="text"
        value={text}
        disabled={disabled}
        className="flex-1 min-w-0 px-2 bg-transparent outline-none focus:ring-1 focus:ring-ring focus:ring-inset"
        placeholder="swatch id (e.g. Color/Red)"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const trimmed = text.trim();
          const next = trimmed === "" ? null : trimmed;
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setText(value ?? "");
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="swatch reference"
      />
    </div>
  );
}
