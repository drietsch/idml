import { LengthInput } from "./LengthInput";
import type { LengthUnit } from "./units";

export interface BoundsInputProps {
  /** Bounds in points as `[top, left, bottom, right]` (IDML wire shape). */
  valuePt: [number, number, number, number];
  /** Initial display unit for all four cells. */
  defaultUnit?: LengthUnit;
  /** Fires on every change. */
  onChangePt: (value: [number, number, number, number]) => void;
  /** Fires on Enter / blur / scrub commit. */
  onCommitPt?: (value: [number, number, number, number]) => void;
  disabled?: boolean;
}

/**
 * Inspector P1 — 4-cell length composite for a frame's
 * `[top, left, bottom, right]` bounds. Each cell is a
 * `LengthInput` (unit-aware + scrub-aware). The two rows lay out
 * left-to-right matching the geometric layout (top spans the top
 * row; left/right flank the bottom row; bottom occupies the bottom
 * row — same convention InDesign's transform panel uses).
 */
export function BoundsInput(props: BoundsInputProps) {
  const {
    valuePt,
    defaultUnit = "pt",
    onChangePt,
    onCommitPt,
    disabled = false,
  } = props;
  const [top, left, bottom, right] = valuePt;

  const set = (idx: 0 | 1 | 2 | 3, next: number, commit: boolean) => {
    const out: [number, number, number, number] = [top, left, bottom, right];
    out[idx] = next;
    onChangePt(out);
    if (commit) onCommitPt?.(out);
  };

  return (
    <div className="grid grid-cols-2 gap-1" data-bounds-input>
      <LengthInput
        valuePt={top}
        defaultUnit={defaultUnit}
        label="T"
        disabled={disabled}
        onChangePt={(v) => set(0, v, false)}
        onCommitPt={(v) => set(0, v, true)}
        aria-label="top"
      />
      <LengthInput
        valuePt={left}
        defaultUnit={defaultUnit}
        label="L"
        disabled={disabled}
        onChangePt={(v) => set(1, v, false)}
        onCommitPt={(v) => set(1, v, true)}
        aria-label="left"
      />
      <LengthInput
        valuePt={bottom}
        defaultUnit={defaultUnit}
        label="B"
        disabled={disabled}
        onChangePt={(v) => set(2, v, false)}
        onCommitPt={(v) => set(2, v, true)}
        aria-label="bottom"
      />
      <LengthInput
        valuePt={right}
        defaultUnit={defaultUnit}
        label="R"
        disabled={disabled}
        onChangePt={(v) => set(3, v, false)}
        onCommitPt={(v) => set(3, v, true)}
        aria-label="right"
      />
    </div>
  );
}
