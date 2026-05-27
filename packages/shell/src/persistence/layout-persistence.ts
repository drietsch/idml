// Layout persistence — debounced serialise on every layout change,
// restore on mount. Two storage scopes (current layout vs. saved
// perspectives) with distinct policies; Step 3 ships only the
// `current` scope, perspectives wait for Step 4's command surface.

import type {
  DockingSubstrate,
  LayoutSnapshot,
} from "../docking/substrate";
import type { Disposable } from "../registries/types";

const STORAGE_KEY = "verso.layout.current";
const DEBOUNCE_MS = 500;

/**
 * Wires the substrate's `onLayoutChange` into a debounced
 * `localStorage.setItem`. Returned `Disposable` cancels any pending
 * write + drops the subscription.
 */
export function setupLayoutPersistence(
  substrate: DockingSubstrate,
): Disposable {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sub = substrate.onLayoutChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const snapshot = substrate.serialize();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch (err) {
        // Quota exceeded, JSON cycles, etc. Better to log than to
        // crash the whole shell.
        // eslint-disable-next-line no-console
        console.warn("verso: layout persist failed", err);
      }
    }, DEBOUNCE_MS);
  });

  return {
    dispose: () => {
      if (timer) clearTimeout(timer);
      sub.dispose();
    },
  };
}

/**
 * Restore a previously-persisted layout, falling back to
 * `defaultLayout()` on missing / malformed data. Schema changes
 * between Verso versions invalidate stored snapshots; the
 * defensive fallback keeps the shell mountable when that
 * happens.
 */
export function restoreLayoutOrDefault(
  substrate: DockingSubstrate,
  defaultLayout: () => void,
): void {
  const raw = readStored();
  if (!raw) {
    defaultLayout();
    return;
  }
  try {
    const snapshot = JSON.parse(raw) as LayoutSnapshot;
    substrate.restore(snapshot);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("verso: failed to restore layout, using default", err);
    clearStored();
    defaultLayout();
  }
}

/** Drop the persisted layout. Useful for the dev console + tests. */
export function clearStoredLayout(): void {
  clearStored();
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStored(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (Safari private mode, etc.) — silent.
  }
}
