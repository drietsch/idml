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

/**
 * Inverse of `applyAffine`. Maps a point from the parent
 * coordinate system back into the local one the affine projects
 * from. Used by the path-edit overlay's segment hit zone to
 * translate a page-local click into the polygon's inner
 * coordinate system before computing the closest cubic `t`.
 *
 * Returns `null` when the matrix is degenerate (det ≈ 0); the
 * caller can fall back to the identity-mapped position.
 */
export function inverseApplyAffine(
  m: IdmlAffine | null | undefined,
  x: number,
  y: number,
): [number, number] | null {
  if (!m) return [x, y];
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const dx = x - tx;
  const dy = y - ty;
  return [(d * dx - c * dy) * inv, (-b * dx + a * dy) * inv];
}
