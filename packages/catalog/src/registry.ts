// SDK Phase 3 — catalog registry.
//
// Maps catalog ids to `CatalogEntry`. Finite + curated by design
// (§sdk.md §6.1): new entries land in code review, never emitted
// inline by documents or agents. The registry is the single
// auditable definition of "what UI is allowed to exist."

import type { CatalogEntry } from "./types";

export interface CatalogRegistry {
  /** Add an entry. Duplicate ids throw — like the panel registry,
   *  collisions surface as configuration bugs at startup. */
  register(entry: CatalogEntry): void;
  /** Look up an entry by id. Returns undefined for unknown ids;
   *  the composition renderer surfaces this as a visible "unknown
   *  catalog entry" placeholder rather than throwing. */
  get(id: string): CatalogEntry | undefined;
  /** List every registered entry — used by the catalog audit
   *  surface (which leaves declare which writes) and by future
   *  bundle-loader machinery. */
  list(): CatalogEntry[];
}

export function createCatalogRegistry(): CatalogRegistry {
  const byId = new Map<string, CatalogEntry>();
  return {
    register(entry) {
      if (byId.has(entry.id)) {
        throw new Error(
          `CatalogRegistry: catalog id "${entry.id}" already registered`,
        );
      }
      byId.set(entry.id, entry);
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
  };
}
