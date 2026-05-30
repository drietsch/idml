// SDK Phase 3 — Paragraph panel.
//
// Declarative composition over the ParagraphSpaceBefore /
// ParagraphSpaceAfter / ParagraphFirstLineIndent apply arms.
// Content-scope bindings; the apply layer rounds the range to
// whole paragraphs (paragraphs are atomic).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { paragraphComposition } from "./paragraph.composition";

export function ParagraphPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-paragraph-panel="ready">
        <CompositionRenderer composition={paragraphComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
