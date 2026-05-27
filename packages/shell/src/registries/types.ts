// Cross-registry shared types. Kept in their own module so each
// registry file can be read top-down without forward references.

/**
 * Returned by every `register` call so callers can clean up at
 * unmount time. Stable shape — the matching `dispose()` is the
 * only API surface this exposes.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Initial dock edge for a panel. Users may rearrange after mount;
 * this is initial-placement-only.
 */
export type DockEdge = "left" | "right" | "top" | "bottom" | "center";

/**
 * Predicate evaluated against application state to decide whether
 * a contribution is visible / enabled.
 *
 * The string form (e.g. `"selection.hasType('TextFrame')"`) is the
 * future bundle-friendly DSL; today only the function form is
 * implemented. The string variant resolves to the always-false
 * predicate so contributions that use the DSL are inert until the
 * evaluator lands.
 */
export type VisibilityPredicate =
  | string
  | ((state: unknown) => boolean);
