// SDK Phase 5 (v1 sweep) — Bookmarks panel.

import { useCollection } from "@verso/shell";
import type { BookmarkSummary } from "@verso/client";

export function BookmarksPanel() {
  const items = useCollection<BookmarkSummary>("bookmarks");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-bookmarks-panel="loading"
      >
        Loading bookmarks…
      </div>
    );
  }
  return (
    <div className="p-3" data-bookmarks-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Bookmarks
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-bookmarks
        >
          No bookmarks in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-bookmark-list>
          {items.map((b) => (
            <li
              key={b.selfId}
              className="text-xs px-2 py-1"
              data-bookmark-id={b.selfId}
            >
              <span>{b.name}</span>
              {b.destination ? (
                <span className="ml-2 text-muted-foreground">
                  → {b.destination}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
