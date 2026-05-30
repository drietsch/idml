// SDK Phase 3 — Stroke panel.
//
// Declarative composition over the existing FrameStrokeWeight +
// FrameStrokeColor apply arms. Element-scope bindings.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { strokeComposition } from "./stroke.composition";

export function StrokePanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-stroke-panel="ready">
        <CompositionRenderer composition={strokeComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
