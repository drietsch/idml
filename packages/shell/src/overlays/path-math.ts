// Track J — pure-TS path geometry helpers for the path-edit
// overlay. Mirrors `crates/paged-mutate/src/path_math.rs` so the
// click→t→split pipeline can run main-thread without a wasm
// boundary call. The math is tiny (six lerps + a 30-sample
// closest-point search); duplicating beats a worker round-trip
// for an interactive click.
//
// Coordinates are in the path's local frame ("frame inner
// coordinates" per the IDML spec — the same frame anchors live
// in). The overlay's segment hit-zone handler inverse-applies
// the polygon's itemTransform before calling these helpers.

export type Pt = readonly [number, number];

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

export interface SegmentSplit {
  /** Adjusted right handle on the segment-start anchor. */
  startRight: Pt;
  /** New mid-anchor's left handle. */
  midLeft: Pt;
  /** New mid-anchor's on-curve position. */
  midAnchor: Pt;
  /** New mid-anchor's right handle. */
  midRight: Pt;
  /** Adjusted left handle on the segment-end anchor. */
  endLeft: Pt;
}

/**
 * Split a cubic Bezier from `start → end` (with `startRight` =
 * start's outgoing handle and `endLeft` = end's incoming handle)
 * at parameter t ∈ [0, 1]. Returns the new mid-anchor + the four
 * adjusted handles. The two resulting segments trace the same
 * curve as the original. Mirrors `path_math::split_segment_de_casteljau`
 * in the Rust crate.
 */
export function splitSegmentDeCasteljau(
  start: Pt,
  startRight: Pt,
  endLeft: Pt,
  end: Pt,
  t: number,
): SegmentSplit {
  const q0 = lerp(start, startRight, t);
  const q1 = lerp(startRight, endLeft, t);
  const q2 = lerp(endLeft, end, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const mid = lerp(r0, r1, t);
  return {
    startRight: q0,
    midLeft: r0,
    midAnchor: mid,
    midRight: r1,
    endLeft: q2,
  };
}

/** Evaluate the cubic at parameter `t` — `B(t) = (1-t)^3 P0 +
 *  3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3`. */
export function evalCubic(
  start: Pt,
  startRight: Pt,
  endLeft: Pt,
  end: Pt,
  t: number,
): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * start[0] + w1 * startRight[0] + w2 * endLeft[0] + w3 * end[0],
    w0 * start[1] + w1 * startRight[1] + w2 * endLeft[1] + w3 * end[1],
  ];
}

/** Evaluate the cubic's derivative `B'(t) = 3(1-t)^2 (P1-P0) +
 *  6(1-t)t (P2-P1) + 3t^2 (P3-P2)`. Used by the Newton refinement
 *  in `closestTOnCubic`. */
function evalCubicDerivative(
  start: Pt,
  startRight: Pt,
  endLeft: Pt,
  end: Pt,
  t: number,
): Pt {
  const u = 1 - t;
  const w0 = 3 * u * u;
  const w1 = 6 * u * t;
  const w2 = 3 * t * t;
  return [
    w0 * (startRight[0] - start[0]) +
      w1 * (endLeft[0] - startRight[0]) +
      w2 * (end[0] - endLeft[0]),
    w0 * (startRight[1] - start[1]) +
      w1 * (endLeft[1] - startRight[1]) +
      w2 * (end[1] - endLeft[1]),
  ];
}

/**
 * Return the parameter `t ∈ [0, 1]` on the cubic Bezier that
 * minimises the Euclidean distance from `B(t)` to `click`. Two-
 * phase search: (1) coarse N-sample to find the best bucket,
 * (2) one Newton refinement step on the squared-distance
 * derivative.
 *
 * Newton: we want `f(t) = (B(t) - click) · B'(t) = 0`. One step
 * is `t' = t - f(t) / f'(t)`. Falls back to the coarse estimate
 * when `f'(t)` is too small for a stable update.
 *
 * 30 samples covers single-segment clicks robustly; the visible
 * gap between consecutive sample t-values on a 200pt-long
 * segment is ~7pt, well under the typical 4-8pt segment hit-
 * zone width.
 */
export function closestTOnCubic(
  start: Pt,
  startRight: Pt,
  endLeft: Pt,
  end: Pt,
  click: Pt,
  samples = 30,
): number {
  // (1) coarse search
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = evalCubic(start, startRight, endLeft, end, t);
    const dx = p[0] - click[0];
    const dy = p[1] - click[1];
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  // (2) Newton refinement.
  const p = evalCubic(start, startRight, endLeft, end, bestT);
  const pp = evalCubicDerivative(start, startRight, endLeft, end, bestT);
  const diff: Pt = [p[0] - click[0], p[1] - click[1]];
  // f(t) = diff · pp
  const f = diff[0] * pp[0] + diff[1] * pp[1];
  // f'(t) = |pp|^2 + diff · pp''
  // Skipping pp'' (the second derivative) under-counts but the
  // resulting Newton step still converges quickly given the
  // coarse-search starting point. Bias toward stability.
  const fp = pp[0] * pp[0] + pp[1] * pp[1];
  if (Math.abs(fp) < 1e-6) return bestT;
  const refined = bestT - f / fp;
  if (refined < 0 || refined > 1) return bestT;
  return refined;
}
