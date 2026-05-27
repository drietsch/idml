// Layout persistence. Two storage scopes:
// 1. `verso.layout.current` — single snapshot, auto-persisted on
//    every layout change with a 500ms debounce.
// 2. `verso.layout.perspectives` — JSON map `{name: snapshot}` of
//    named perspectives the user has explicitly saved + JSON-
//    exportable for cross-device portability.
//
// Step 3 shipped scope 1; Step 4e adds scope 2 plus the commands +
// menu items that drive it.

import type {
  DockingSubstrate,
  LayoutSnapshot,
} from "../docking/substrate";
import type { Disposable } from "../registries/types";

const STORAGE_KEY = "verso.layout.current";
const PERSPECTIVES_KEY = "verso.layout.perspectives";
const DEBOUNCE_MS = 500;

/**
 * Custom event fired on `window` whenever the named-perspectives
 * map changes. The shell subscribes to keep auto-generated
 * `verso.perspective.load.<name>` / `delete.<name>` commands in
 * sync. Distinct from the built-in `storage` event because the
 * latter only fires for cross-tab writes.
 */
export const PERSPECTIVES_CHANGED_EVENT = "verso:perspectives-changed";

function emitPerspectivesChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(PERSPECTIVES_CHANGED_EVENT));
  } catch {
    // Non-DOM environment — silent.
  }
}

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

// ── Named perspectives ────────────────────────────────────────

function readPerspectives(): Record<string, LayoutSnapshot> {
  try {
    const raw = localStorage.getItem(PERSPECTIVES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, LayoutSnapshot>)
      : {};
  } catch {
    return {};
  }
}

function writePerspectives(value: Record<string, LayoutSnapshot>): void {
  try {
    localStorage.setItem(PERSPECTIVES_KEY, JSON.stringify(value));
    emitPerspectivesChanged();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("verso: perspectives persist failed", err);
  }
}

/** Returns the names of saved perspectives, sorted alphabetically. */
export function listPerspectives(): string[] {
  return Object.keys(readPerspectives()).sort();
}

export function getPerspective(name: string): LayoutSnapshot | null {
  const all = readPerspectives();
  return name in all ? all[name] : null;
}

/** Save the supplied snapshot under `name`. Overwrites any previous
 * perspective with the same name. */
export function savePerspective(name: string, snapshot: LayoutSnapshot): void {
  const all = readPerspectives();
  all[name] = snapshot;
  writePerspectives(all);
}

export function deletePerspective(name: string): void {
  const all = readPerspectives();
  if (!(name in all)) return;
  delete all[name];
  writePerspectives(all);
}

/** JSON-stringify a single perspective for download. */
export function exportPerspective(name: string): string | null {
  const snapshot = getPerspective(name);
  if (snapshot === null) return null;
  return JSON.stringify(
    { name, snapshot, exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

/** Restore a perspective from JSON produced by `exportPerspective`.
 * `name` overrides the embedded name (lets the user import under a
 * different label without clobbering an existing one). */
export function importPerspective(name: string, json: string): void {
  const parsed = JSON.parse(json) as {
    name?: string;
    snapshot?: LayoutSnapshot;
  };
  if (!parsed || !("snapshot" in parsed) || parsed.snapshot === undefined) {
    throw new Error(
      "verso: importPerspective expects a JSON object with a `snapshot` field",
    );
  }
  savePerspective(name, parsed.snapshot);
}
