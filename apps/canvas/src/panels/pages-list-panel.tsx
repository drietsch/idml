// SDK Phase 5 (v1 sweep) — Pages list panel.
//
// Read-only expert leaf rendering every built page in the
// document. Companion to the existing Navigator (which paints
// thumbnails); this surface exists so the
// `documentCollection:pages` wire is exercised end-to-end and a
// catalog-bindable list of pages is available to compositions
// that want a textual outline.

import { useCollection } from "@verso/shell";
import type { PageSummary } from "@verso/client";

export function PagesListPanel() {
  const items = useCollection<PageSummary>("pages");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-pages-list-panel="loading"
      >
        Loading pages…
      </div>
    );
  }
  return (
    <div className="p-3" data-pages-list-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Pages
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-pages
        >
          No pages.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-page-list>
          {items.map((p) => (
            <li
              key={p.selfId}
              className="text-xs px-2 py-1"
              data-page-id={p.selfId}
              data-page-index={p.index}
            >
              <span>Page {p.index}</span>
              <span className="ml-2 text-muted-foreground">
                {p.sizePt[0].toFixed(0)} × {p.sizePt[1].toFixed(0)} pt
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
