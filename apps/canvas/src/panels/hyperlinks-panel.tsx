// SDK Phase 5 (v1 sweep) — Hyperlinks panel.

import { useCollection } from "@verso/shell";
import type { HyperlinkSummary } from "@verso/client";

export function HyperlinksPanel() {
  const items = useCollection<HyperlinkSummary>("hyperlinks");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-hyperlinks-panel="loading"
      >
        Loading hyperlinks…
      </div>
    );
  }
  return (
    <div className="p-3" data-hyperlinks-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Hyperlinks
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-hyperlinks
        >
          No hyperlinks in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-hyperlink-list>
          {items.map((h) => (
            <li
              key={h.selfId}
              className="text-xs px-2 py-1"
              data-hyperlink-id={h.selfId}
              title={h.destination}
            >
              <span>{h.name}</span>
              {h.destination ? (
                <span className="ml-2 text-muted-foreground">
                  → {h.destination.length > 40 ? `${h.destination.slice(0, 40)}…` : h.destination}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
