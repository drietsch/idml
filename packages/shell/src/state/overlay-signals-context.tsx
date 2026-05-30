import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  HitResult,
  PageId,
  SnapLine,
} from "@paged-media/client";

/**
 * Result of a click hit-test, kept for the overlay's click-marker
 * chrome. `docPoint` is the document-space click location (page-
 * local pt shifted by the page origin); `hit` is the worker's
 * resolved hit — element + optional frame bounds. Lives in shell
 * because the overlay layer that reads it lives in shell.
 */
export interface SelectionState {
  pageId: PageId;
  docPoint: [number, number];
  hit: HitResult;
}

/**
 * Live marquee rect rendered while the user drags. Page-local pt;
 * the overlay shifts by the page origin at draw time.
 */
export interface MarqueeRectPageLocal {
  pageId: PageId;
  /** `[top, left, bottom, right]` in page-local pt. */
  rect: [number, number, number, number];
}

interface OverlaySignalsValue {
  /** Last click hit-result. Cleared when the user clicks empty space. */
  hitSelection: SelectionState | null;
  setHitSelection: (value: SelectionState | null) => void;
  /** Active drag marquee, or null when no drag is in progress. */
  marqueeRect: MarqueeRectPageLocal | null;
  setMarqueeRect: (value: MarqueeRectPageLocal | null) => void;
  /** Snap guides from the active gesture. Empty when not snapping. */
  snapLines: ReadonlyArray<SnapLine>;
  setSnapLines: (value: ReadonlyArray<SnapLine>) => void;
}

const Context = createContext<OverlaySignalsValue | null>(null);

/**
 * Holds the transient overlay signals that aren't already in a
 * dedicated context (selection, document, content-selection).
 * Writers: ViewportCanvas (pointer + drag handling). Readers:
 * overlay contributions in `packages/shell/src/overlays/`.
 *
 * Keeping this in a context — instead of threading the values
 * through `OverlayHost` props — means a new overlay contribution
 * can subscribe to only the signals it actually needs and skip the
 * render churn for the rest.
 */
export function OverlaySignalsProvider({ children }: PropsWithChildren) {
  const [hitSelection, setHitSelection] = useState<SelectionState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRectPageLocal | null>(
    null,
  );
  const [snapLines, setSnapLines] = useState<ReadonlyArray<SnapLine>>([]);

  const value = useMemo<OverlaySignalsValue>(
    () => ({
      hitSelection,
      setHitSelection,
      marqueeRect,
      setMarqueeRect,
      snapLines,
      setSnapLines,
    }),
    [hitSelection, marqueeRect, snapLines],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOverlaySignals(): OverlaySignalsValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useOverlaySignals called outside OverlaySignalsProvider");
  }
  return ctx;
}

/**
 * Optional variant used inside overlay components — returns `null`
 * if no provider is mounted, so an overlay can render gracefully
 * when its host hasn't been wired up yet (during partial migrations).
 */
export function useOptionalOverlaySignals(): OverlaySignalsValue | null {
  return useContext(Context);
}
