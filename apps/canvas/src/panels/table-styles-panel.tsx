// SDK Phase 5 (v1 sweep) — Table Styles panel.
//
// Read-only list of every table style. Companion to Cell Styles
// with the same wire-shape-only caveat for the apply path
// (AppliedTableStyle is reserved for Tier 2d / v2).

import { useCollection } from "@paged-media/shell";
import type { TableStyleSummary } from "@paged-media/client";

export function TableStylesPanel() {
  const items = useCollection<TableStyleSummary>("tableStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-table-styles-panel="loading"
      >
        Loading table styles…
      </div>
    );
  }
  return (
    <div className="p-3" data-table-styles-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Table Styles
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-table-styles
        >
          No table styles.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-table-style-list>
          {items.map((s) => (
            <li
              key={s.selfId}
              className="text-xs px-2 py-1"
              data-style-id={s.selfId}
            >
              <span>{s.name}</span>
              {s.basedOn ? (
                <span className="ml-2 text-muted-foreground">
                  ← {s.basedOn}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
