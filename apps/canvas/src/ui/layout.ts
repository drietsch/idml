// Document-space page layout helpers.
//
// Pages stack vertically with a fixed gap; spreads are TBD (Phase 2).
// All coordinates are in points (pt), the IDML unit. The camera
// transform maps these to viewport (CSS) pixels.

import type { Camera } from "../channel/camera";

export interface PageRect {
  /** Top-left x in document space (pt). */
  x: number;
  /** Top-left y in document space (pt). */
  y: number;
  /** Width in document space (pt). */
  w: number;
  /** Height in document space (pt). */
  h: number;
}

/**
 * Stack `pageSizesPt` vertically with `gapPt` between adjacent pages.
 * Returns one rect per page, in the same order as the input.
 * Result is centred-x within the document (each page starts at x=0,
 * letting the viewport's pan + a centred default camera handle
 * horizontal alignment).
 */
export function layoutPages(
  pageSizesPt: ReadonlyArray<readonly [number, number]>,
  gapPt = 24,
): PageRect[] {
  const out: PageRect[] = [];
  let y = 0;
  for (const [w, h] of pageSizesPt) {
    out.push({ x: 0, y, w, h });
    y += h + gapPt;
  }
  return out;
}

/**
 * Total bounding box of all pages in document space. Used by
 * fit-to-document and to constrain pan bounds.
 */
export function documentBounds(rects: ReadonlyArray<PageRect>): PageRect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Camera that fits `rect` (document space) into a viewport of the
 * given pixel size, with a margin. Centres the rect in the viewport.
 * Used for fit-to-document on load and fit-to-page on navigator click.
 */
export function fitCamera(
  viewportWidthPx: number,
  viewportHeightPx: number,
  rect: PageRect,
  marginPx = 40,
): Camera {
  if (rect.w <= 0 || rect.h <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const scaleX = (viewportWidthPx - 2 * marginPx) / rect.w;
  const scaleY = (viewportHeightPx - 2 * marginPx) / rect.h;
  const scale = Math.max(0.01, Math.min(scaleX, scaleY));
  const tx = (viewportWidthPx - rect.w * scale) / 2 - rect.x * scale;
  const ty = (viewportHeightPx - rect.h * scale) / 2 - rect.y * scale;
  return { scale, tx, ty };
}

/** Apply a zoom-to-cursor zoom delta. `factor > 1` zooms in. */
export function zoomAt(
  cam: Camera,
  cursorViewportX: number,
  cursorViewportY: number,
  factor: number,
  minScale = 0.05,
  maxScale = 16,
): Camera {
  const newScale = Math.max(minScale, Math.min(maxScale, cam.scale * factor));
  if (newScale === cam.scale) return cam;
  // Keep the document point under the cursor stationary.
  const docX = (cursorViewportX - cam.tx) / cam.scale;
  const docY = (cursorViewportY - cam.ty) / cam.scale;
  return {
    scale: newScale,
    tx: cursorViewportX - docX * newScale,
    ty: cursorViewportY - docY * newScale,
  };
}
