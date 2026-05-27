import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type { DockingSubstrate } from "./substrate";

/**
 * The substrate context exposes the live `DockingSubstrate` to
 * consumers that need to call `serialize`/`restore`/`popoutGroup`
 * — typically the layout-persistence hook and the future
 * substrate-aware command handlers. Most code talks to the
 * registries, not the substrate, and never needs this context.
 *
 * Two-step exposure (state + setter) lets `DockviewRoot` defer
 * the substrate assignment until dockview's `onReady` fires,
 * while still wrapping consumers in the provider from the moment
 * the root mounts.
 */
interface DockingSubstrateContextValue {
  substrate: DockingSubstrate | null;
  setSubstrate: (s: DockingSubstrate | null) => void;
}

const Context = createContext<DockingSubstrateContextValue | null>(null);

export function DockingSubstrateProvider({ children }: PropsWithChildren) {
  const [substrate, setSubstrate] = useState<DockingSubstrate | null>(null);
  const value = useMemo<DockingSubstrateContextValue>(
    () => ({ substrate, setSubstrate }),
    [substrate],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Returns the live substrate, or null when DockviewRoot hasn't
 * mounted yet. Most consumers should treat null as "not ready"
 * and bail.
 */
export function useDockingSubstrate(): DockingSubstrate | null {
  const ctx = useContext(Context);
  return ctx?.substrate ?? null;
}

/**
 * Internal hook used by `DockviewRoot` to publish the substrate
 * into the context. Not part of the public API.
 */
export function useSetDockingSubstrate(): (s: DockingSubstrate | null) => void {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useSetDockingSubstrate called outside DockingSubstrateProvider",
    );
  }
  return ctx.setSubstrate;
}
