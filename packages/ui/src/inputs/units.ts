// Length-unit conversion table. Internal canonical unit is points
// (pt) — IDML's native — so every conversion is `value × ratio` to
// reach pt from the source unit, or `value / ratio` to leave pt
// for the target unit.

export type LengthUnit = "pt" | "px" | "mm" | "cm" | "in";

/** Ratio table: how many points per one unit of `key`. */
export const POINTS_PER_UNIT: Record<LengthUnit, number> = {
  pt: 1,
  px: 1, // 1 CSS px ≈ 0.75 pt at the default 96 dpi; the editor
  // treats canvas pixels as points at 1:1 because the renderer
  // operates in points. Worth revisiting if a px-honest mode lands.
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};

/** Convert a value from `from` to `to`. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  const inPoints = value * POINTS_PER_UNIT[from];
  return inPoints / POINTS_PER_UNIT[to];
}
