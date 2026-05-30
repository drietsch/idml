// SDK Phase 5 (v1 sweep) — Master Pages panel.
//
// Read-only list of every master spread the document references
// via `AppliedMaster`. Per `panel-catalog-and-sdk-extension.md`
// §5.1 + §6 Tier 1. Per-master "apply to selected page" actions
// land when the `Operation::ApplyMasterToPage` ships.

import { useCollection } from "@verso/shell";
import type { MasterPageSummary } from "@verso/client";

export function MasterPagesPanel() {
  const items = useCollection<MasterPageSummary>("masterPages");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-master-pages-panel="loading"
      >
        Loading master pages…
      </div>
    );
  }
  return (
    <div className="p-3" data-master-pages-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Master Pages
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-master-pages
        >
          No master pages.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-master-page-list>
          {items.map((m) => (
            <li
              key={m.selfId}
              className="text-xs px-2 py-1"
              data-master-id={m.selfId}
            >
              <span>{m.label}</span>
              <span className="ml-2 text-muted-foreground">
                {m.pageCount} page{m.pageCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
