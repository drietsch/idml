import type { ComponentType } from "react";

import type { DockEdge, Disposable, VisibilityPredicate } from "./types";

/**
 * Lifecycle handle dockview passes into a panel. Bundles never
 * read this directly — the substrate wraps it so panel code only
 * sees the high-level `verso` handle.
 */
export interface PanelApi {
  // Step 3e fleshes this out alongside `DockingSubstrate`.
  id: string;
}

/**
 * Props every panel component receives. Step 3d defines the shape;
 * Step 3f mounts panels through it.
 */
export interface PanelProps {
  /** Editor handle — context providers, registries, client. */
  verso: unknown; // Resolved to VersoEditor in the editor module.
  /** Substrate-provided lifecycle. */
  api: PanelApi;
}

/**
 * Declarative panel manifest. Panels are data: a stable id, a
 * title, a React component, and placement / visibility metadata.
 */
export interface PanelContribution {
  /** Stable identifier. Format: `<namespace>.<panel>`. */
  id: string;

  /** Human-readable title shown in the tab header. */
  title: string;

  /** The React component to render inside the panel. */
  component: ComponentType<PanelProps>;

  /** Initial dock edge. Users may rearrange; this is initial only. */
  defaultDock?: DockEdge;

  /** Semantic group name. Panels with the same group land in one
   * dockview group at startup. */
  defaultGroup?: string;

  /** Optional icon name for the tab header. */
  icon?: string;

  /** Optional visibility predicate against application state. */
  when?: VisibilityPredicate;

  /** Whether the panel is closable. Defaults to true. */
  closable?: boolean;

  /** Whether the panel can be moved. Defaults to true. */
  movable?: boolean;
}

export type PanelRegistryEvent =
  | { kind: "registered"; contribution: PanelContribution }
  | { kind: "unregistered"; id: string };

export interface PanelRegistry {
  register(contribution: PanelContribution): Disposable;
  unregister(id: string): void;
  get(id: string): PanelContribution | undefined;
  list(): PanelContribution[];
  onChange(handler: (event: PanelRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `PanelRegistry`. Insertion order is preserved so
 * the substrate can rely on a deterministic mount sequence.
 */
export function createPanelRegistry(): PanelRegistry {
  const byId = new Map<string, PanelContribution>();
  const listeners = new Set<(event: PanelRegistryEvent) => void>();

  function emit(event: PanelRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `PanelRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) {
        emit({ kind: "unregistered", id });
      }
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
    onChange(handler) {
      listeners.add(handler);
      return {
        dispose() {
          listeners.delete(handler);
        },
      };
    },
  };
}
