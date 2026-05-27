/**
 * IDML stores affine transforms as `[a, b, c, d, tx, ty]`. The
 * mapping is:
 *
 *     x' = a*x + c*y + tx
 *     y' = b*x + d*y + ty
 *
 * Used by every selection-chrome contribution that needs to project
 * page-local corners through an element's `item_transform`.
 */
export type IdmlAffine = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export function applyAffine(
  m: IdmlAffine | null | undefined,
  x: number,
  y: number,
): [number, number] {
  if (!m) return [x, y];
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
