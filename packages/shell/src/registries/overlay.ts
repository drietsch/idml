import type { ComponentType } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { Camera } from "@verso/client";
// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId } from "@verso/client";

import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Page geometry resolved into document-space rects, keyed by id.
 * Contributions iterate this when their visuals reference page
 * positions (caret, marquee, page captions). Each rect's origin is
 * the document-space top-left in points.
 */
export interface OverlayPageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Props every overlay contribution receives. Kept intentionally
 * thin — most overlays read their own data from shell contexts
 * (selection, hover, document, gesture state) rather than
 * receiving it as flat props. The handful of fields here are the
 * ones a contribution can't reasonably do without and would
 * otherwise have to re-derive from registries.
 */
export interface OverlayProps {
  /** Editor handle — registries, client, contexts. Resolved to
   *  `VersoEditor` at the bind site; left `unknown` here so the
   *  registry file doesn't depend on the editor module. */
  verso: unknown;
  /** Camera at current frame. */
  camera: Camera;
  /** Page rectangles in document space, in page-id order. */
  pageRects: ReadonlyMap<PageId, OverlayPageRect>;
}

/**
 * Declarative overlay manifest. Mirrors PanelContribution: a stable
 * id, a React render component, plus z-order + visibility metadata.
 *
 * Each contribution renders into a shared SVG root the OverlayHost
 * provides — they should return SVG nodes (or a fragment of them).
 * Z-order is the registry's only ordering hint; ties break on
 * insertion order.
 */
export interface OverlayContribution {
  /** Stable identifier. Format: `<namespace>.<overlay>`. */
  id: string;

  /** Render component. Mounted inside a shared SVG by OverlayHost. */
  render: ComponentType<OverlayProps>;

  /** Z-order; higher renders on top. Default 100. */
  z?: number;

  /** Optional visibility predicate. When `false`, the host skips
   * mounting the component (its hooks don't run). */
  when?: VisibilityPredicate;
}

export type OverlayRegistryEvent =
  | { kind: "registered"; contribution: OverlayContribution }
  | { kind: "unregistered"; id: string };

export interface OverlayRegistry {
  register(contribution: OverlayContribution): Disposable;
  unregister(id: string): void;
  get(id: string): OverlayContribution | undefined;
  list(): OverlayContribution[];
  onChange(handler: (event: OverlayRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `OverlayRegistry`. Same insertion-order +
 * Disposable contract as `createPanelRegistry`.
 */
export function createOverlayRegistry(): OverlayRegistry {
  const byId = new Map<string, OverlayContribution>();
  const listeners = new Set<(event: OverlayRegistryEvent) => void>();

  function emit(event: OverlayRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `OverlayRegistry: id "${contribution.id}" already registered`,
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
