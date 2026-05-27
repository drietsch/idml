// Wire protocol between the shell (main thread) and a bundle
// kernel (Web Worker). Strictly JSON-serializable — no React
// components, no functions, no DOM references cross the boundary.
//
// Bundles register contributions by posting `BundleToShell`
// messages; the shell invokes registered commands by posting
// `ShellToBundle.invoke` and resolving on the matching
// `BundleToShell.invokeResult`. Disposal is signalled by
// `deactivate`.

import type { DockEdge } from "../registries/types";

export type ShellToBundle =
  | {
      kind: "activate";
      bundleId: string;
      /** Capability tokens the bundle is granted. Step 4 hands every
       * bundle the same tokens; per-bundle capability tiers come
       * with the inspector-as-bundle work. */
      capabilities: string[];
    }
  | {
      kind: "deactivate";
    }
  | {
      kind: "invoke";
      /** Correlates `invokeResult` back to the shell-side promise
       * that initiated the call. */
      requestId: string;
      commandId: string;
      payload?: unknown;
    };

export type BundleToShell =
  | {
      kind: "ready";
    }
  | {
      kind: "registerCommand";
      id: string;
      title: string;
      category?: string;
    }
  | {
      kind: "registerKeybinding";
      key: string;
      commandId: string;
    }
  | {
      kind: "registerMenuItem";
      path: string;
      commandId: string;
      order?: number;
      group?: string;
    }
  | {
      kind: "registerSemanticGroup";
      name: string;
      defaultDock: DockEdge;
    }
  | {
      kind: "invokeResult";
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
    }
  | {
      kind: "log";
      level: "info" | "warn" | "error";
      message: string;
    };
