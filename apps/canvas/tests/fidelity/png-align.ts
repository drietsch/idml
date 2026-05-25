// Sub-pixel PNG alignment.
//
// pdftoppm rasterises the reference PDF using the PDF's MediaBox
// (often rounded to whole points by InDesign), while the canvas
// snapshot rasterises the IDML's page (which keeps fractional pt
// like 595.276 × 841.89). At 144 DPI a 0.5pt difference becomes 1
// pixel, so the two PNGs come out the same width but one pixel off
// in height. `idml-diff` insists on identical dimensions, so we pad
// the smaller image to the bounding box with white before passing
// the pair through.
//
// Pad-with-white is the right semantics: extra pixels on the page
// background are sRGB ≈ #ffffff in both renderers, so ΔE ≈ 0 there.
// Capping the pad budget at 8 px stops a real misalignment from
// silently looking like a one-pixel shimmy.

import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const MAX_PAD_PX = 8;

export interface AlignedPair {
  /** Path of the (possibly rewritten) reference PNG. */
  refPath: string;
  /** Path of the (possibly rewritten) candidate PNG. */
  candPath: string;
  /** Pixel deltas the pair was padded by. */
  paddedRefBy: { width: number; height: number };
  paddedCandBy: { width: number; height: number };
}

function decode(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

function padWithWhite(src: PNG, targetW: number, targetH: number): PNG {
  if (src.width === targetW && src.height === targetH) return src;
  const out = new PNG({ width: targetW, height: targetH });
  // Fill background with opaque white.
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 0xff;
    out.data[i + 1] = 0xff;
    out.data[i + 2] = 0xff;
    out.data[i + 3] = 0xff;
  }
  for (let y = 0; y < src.height; y++) {
    const srcOff = y * src.width * 4;
    const dstOff = y * targetW * 4;
    src.data.copy(out.data, dstOff, srcOff, srcOff + src.width * 4);
  }
  return out;
}

/**
 * Pad both `refPath` and `candPath` so they have identical pixel
 * dimensions. Returns the input paths unchanged when dimensions
 * already match, or paths to padded copies (suffixed `.padded.png`)
 * when not. Throws when the mismatch is larger than `MAX_PAD_PX`.
 */
export function alignPngPair(refPath: string, candPath: string): AlignedPair {
  const ref = decode(refPath);
  const cand = decode(candPath);
  if (ref.width === cand.width && ref.height === cand.height) {
    return {
      refPath,
      candPath,
      paddedRefBy: { width: 0, height: 0 },
      paddedCandBy: { width: 0, height: 0 },
    };
  }
  const w = Math.max(ref.width, cand.width);
  const h = Math.max(ref.height, cand.height);
  const dw = Math.max(Math.abs(ref.width - cand.width), Math.abs(ref.width - cand.width));
  const dh = Math.max(Math.abs(ref.height - cand.height), Math.abs(ref.height - cand.height));
  if (dw > MAX_PAD_PX || dh > MAX_PAD_PX) {
    throw new Error(
      `dimension mismatch beyond pad budget (${MAX_PAD_PX}px): ref ${ref.width}x${ref.height} vs cand ${cand.width}x${cand.height}`,
    );
  }
  const refOut = padWithWhite(ref, w, h);
  const candOut = padWithWhite(cand, w, h);
  const refOutPath = refPath.replace(/\.png$/, ".padded.png");
  const candOutPath = candPath.replace(/\.png$/, ".padded.png");
  writeFileSync(refOutPath, PNG.sync.write(refOut));
  writeFileSync(candOutPath, PNG.sync.write(candOut));
  return {
    refPath: refOutPath,
    candPath: candOutPath,
    paddedRefBy: { width: w - ref.width, height: h - ref.height },
    paddedCandBy: { width: w - cand.width, height: h - cand.height },
  };
}
