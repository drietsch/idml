// SDK Phase 5 (v1 sweep) — Cell Styles panel.
//
// Read-only list of every cell style defined in the document.
// Per `panel-catalog-and-sdk-extension.md` §5.1 + §6 Tier 2c.
// The apply-an-entity path (AppliedCellStyle) is wire-shape only —
// the apply layer raises UnsupportedProperty until the Table
// NodeId surface (Tier 2d) lands. Until then this panel is
// purely informational.

import { useCollection } from "@paged-media/shell";
import type { CellStyleSummary } from "@paged-media/client";

export function CellStylesPanel() {
  const items = useCollection<CellStyleSummary>("cellStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cell-styles-panel="loading"
      >
        Loading cell styles…
      </div>
    );
  }
  return (
    <div className="p-3" data-cell-styles-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Cell Styles
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-cell-styles
        >
          No cell styles.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-cell-style-list>
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
