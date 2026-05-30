// SDK Phase 3 — shared catalog registry singleton.
//
// One registry per app, built lazily on first access. All
// declarative panels mount this same instance via
// `CatalogRegistryProvider`. A fresh instance per panel would
// also work (CatalogRegistry is plain data) but the singleton
// keeps the registration cost a one-time event.

import { createCatalogRegistry, type CatalogRegistry } from "@paged-media/catalog";
import { registerBuiltInCatalogEntries } from "@paged-media/shell";

let singleton: CatalogRegistry | null = null;

export function appCatalogRegistry(): CatalogRegistry {
  if (!singleton) {
    singleton = createCatalogRegistry();
    registerBuiltInCatalogEntries(singleton);
  }
  return singleton;
}
