import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

// Step 3b: cross-package type-only imports. Resolved at typecheck;
// no runtime dep. Step 3-bindings (future) will extract
// apps/canvas/src/channel/{client,protocol,camera} into a shared
// @verso/canvas-bindings package and these paths normalize.
//
// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@verso/client";

const Context = createContext<CanvasClient | null>(null);

/**
 * Owns the single CanvasClient instance. The canvas app creates the
 * client in its entry point and passes it down through this provider
 * — the shell never constructs one, because the worker boot lives
 * outside the shell's responsibility surface.
 */
export function CanvasClientProvider({
  client,
  children,
}: PropsWithChildren<{ client: CanvasClient }>) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}

/**
 * Returns the active CanvasClient. Throws when called outside the
 * provider — every shell-side hook depends on it, so missing
 * setup is a programmer error worth surfacing loudly.
 */
export function useCanvasClient(): CanvasClient {
  const client = useContext(Context);
  if (!client) {
    throw new Error("useCanvasClient called outside CanvasClientProvider");
  }
  return client;
}

/**
 * Same as `useCanvasClient` but tolerates a missing provider —
 * returns `null` when nothing is wired up yet. Useful for the
 * brief window during mount where the client hasn't been created.
 */
export function useOptionalCanvasClient(): CanvasClient | null {
  return useContext(Context);
}
