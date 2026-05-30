// SDK Phase 5 (v1 sweep) — Cross References panel.

import { useCollection } from "@paged-media/shell";
import type { CrossReferenceSummary } from "@paged-media/client";

export function CrossReferencesPanel() {
  const items = useCollection<CrossReferenceSummary>("crossReferences");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cross-references-panel="loading"
      >
        Loading cross-references…
      </div>
    );
  }
  return (
    <div className="p-3" data-cross-references-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Cross References
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-cross-references
        >
          No cross-references in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-cross-reference-list>
          {items.map((x) => (
            <li
              key={x.selfId}
              className="text-xs px-2 py-1"
              data-xref-id={x.selfId}
            >
              <span>{x.name}</span>
              {x.format ? (
                <span className="ml-2 text-muted-foreground">
                  ({x.format})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
