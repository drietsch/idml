import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { LayoutCacheStats } from "../../../../apps/canvas/src/channel/protocol";

/**
 * HUD-only state: FPS, GPU readiness, layout-cache stats. None of
 * it fits the five core application-state contexts and none of it
 * affects gestures or rendering correctness — it's purely the
 * instrumentation surface the canvas's debug HUD draws.
 *
 * Lives in its own context so the canvas panel (which displays
 * the HUD) can read it without the shell having to thread the
 * values through every prop.
 */
interface InstrumentationContextValue {
  /** Main-thread FPS, sampled via rAF. */
  fps: number;
  setFps: (fps: number) => void;

  /** Worker's WebGPU readiness; null until determined. */
  gpuActive: boolean | null;
  setGpuActive: (active: boolean | null) => void;

  /** Most recent rebuild's layout-cache stats. */
  layoutCacheStats: LayoutCacheStats | null;
  setLayoutCacheStats: (stats: LayoutCacheStats | null) => void;
}

const Context = createContext<InstrumentationContextValue | null>(null);

export function InstrumentationProvider({ children }: PropsWithChildren) {
  const [fps, setFps] = useState(0);
  const [gpuActive, setGpuActive] = useState<boolean | null>(null);
  const [layoutCacheStats, setLayoutCacheStats] =
    useState<LayoutCacheStats | null>(null);

  const value = useMemo<InstrumentationContextValue>(
    () => ({
      fps,
      setFps,
      gpuActive,
      setGpuActive,
      layoutCacheStats,
      setLayoutCacheStats,
    }),
    [fps, gpuActive, layoutCacheStats],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInstrumentation(): InstrumentationContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useInstrumentation called outside InstrumentationProvider",
    );
  }
  return ctx;
}
