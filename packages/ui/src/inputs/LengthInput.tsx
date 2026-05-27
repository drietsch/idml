import { useMemo, useState } from "react";

import { NumberInput, type NumberInputProps } from "./NumberInput";
import { convertLength, type LengthUnit } from "./units";

export interface LengthInputProps
  extends Omit<NumberInputProps, "value" | "onChange" | "onCommit"> {
  /** Value in points (the IDML-native unit). */
  valuePt: number;
  /** Initial display unit. The user can change it via the picker;
   * the underlying canonical value stays in points. */
  defaultUnit?: LengthUnit;
  /** Fires whenever the canonical (pt) value changes. */
  onChangePt: (valuePt: number) => void;
  onCommitPt?: (valuePt: number) => void;
}

const UNITS: LengthUnit[] = ["pt", "px", "mm", "cm", "in"];

/**
 * Numeric input with a unit picker. Internally stores everything
 * in points (IDML's canonical unit) and converts at display time;
 * the caller only ever sees pt values via `onChangePt` /
 * `onCommitPt`. Useful for frame bounds, margins, stroke weight —
 * anywhere the user wants to enter "in mm" without the renderer
 * caring.
 */
export function LengthInput(props: LengthInputProps) {
  const { valuePt, defaultUnit = "pt", onChangePt, onCommitPt, ...rest } = props;
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit);

  const displayValue = useMemo(
    () => convertLength(valuePt, "pt", unit),
    [valuePt, unit],
  );

  return (
    <div className="inline-flex items-stretch gap-1">
      <NumberInput
        {...rest}
        value={displayValue}
        onChange={(next) => onChangePt(convertLength(next, unit, "pt"))}
        onCommit={
          onCommitPt
            ? (next) => onCommitPt(convertLength(next, unit, "pt"))
            : undefined
        }
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as LengthUnit)}
        className="text-xs h-7 px-1 rounded border border-input bg-background text-foreground"
        aria-label="unit"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}
