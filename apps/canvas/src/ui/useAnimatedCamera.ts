// rAF-driven camera tween.
//
// Discrete jumps (navigator click → fit-to-page, Ctrl+0 → fit-to-doc,
// Ctrl+1 → 100% zoom) feel snappy when animated over ~200 ms with a
// cubic ease-out; pan/zoom from input stays instantaneous because
// every frame is already at the correct position.
//
// The hook exposes `animateTo(target, ms?)` that cancels any
// in-flight animation and starts a new one. The actual frame-by-frame
// camera updates flow through the same `setCamera` callback the
// caller uses for direct writes — so the SAB stays the single
// source of truth for the worker.

import { useCallback, useEffect, useRef } from "react";
import type { Camera } from "../channel/camera";

export interface AnimateOptions {
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 220;

export function useAnimatedCamera(
  current: Camera,
  setCamera: (cam: Camera) => void,
) {
  const rafRef = useRef<number | null>(null);
  // Track the latest `setCamera` + `current` via refs so the
  // animation callback always reads fresh values without
  // re-subscribing.
  const setCameraRef = useRef(setCamera);
  const currentRef = useRef(current);
  setCameraRef.current = setCamera;
  currentRef.current = current;

  // Cancel any in-flight tween on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const animateTo = useCallback(
    (target: Camera, opts: AnimateOptions = {}) => {
      const duration = opts.durationMs ?? DEFAULT_DURATION_MS;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const start = currentRef.current;
      // No-op if already at target (within float tolerance).
      if (
        nearly(start.scale, target.scale) &&
        nearly(start.tx, target.tx) &&
        nearly(start.ty, target.ty)
      ) {
        return;
      }
      // Trivial duration → snap.
      if (duration <= 16) {
        setCameraRef.current(target);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = easeOutCubic(t);
        setCameraRef.current({
          scale: lerp(start.scale, target.scale, eased),
          tx: lerp(start.tx, target.tx, eased),
          ty: lerp(start.ty, target.ty, eased),
        });
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [],
  );

  return animateTo;
}

function easeOutCubic(t: number): number {
  const k = 1 - t;
  return 1 - k * k * k;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function nearly(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) < eps;
}
