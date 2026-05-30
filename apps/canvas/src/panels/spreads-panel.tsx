// SDK Phase 5 (v1 sweep) — Spreads panel.
//
// Read-only list of every spread in the document. Per
// `panel-catalog-and-sdk-extension.md` §5.1 + §6 Tier 1.
// `documentCollection:spreads` accessor walks `scene.spreads`.

import { useCollection } from "@verso/shell";
import type { SpreadSummary } from "@verso/client";

export function SpreadsPanel() {
  const items = useCollection<SpreadSummary>("spreads");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-spreads-panel="loading"
      >
        Loading spreads…
      </div>
    );
  }
  return (
    <div className="p-3" data-spreads-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Spreads
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-spreads
        >
          No spreads.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-spread-list>
          {items.map((s) => (
            <li
              key={s.selfId}
              className="text-xs px-2 py-1"
              data-spread-id={s.selfId}
            >
              <span>{s.label}</span>
              <span className="ml-2 text-muted-foreground">
                {s.pageCount} page{s.pageCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
