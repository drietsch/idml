// SDK Phase 5 (v1 sweep) — Index panel.
//
// Read-only list of every `<Topic>` defined for the document's
// index. Per `panel-catalog-and-sdk-extension.md` §5.1 + Tier 1.
// Hierarchical nesting is flattened to one entry per Self — the
// IDML schema allows nested `<Topic>` but for v1 we surface the
// flat list.

import { useCollection } from "@paged-media/shell";
import type { IndexTopicSummary } from "@paged-media/client";

export function IndexPanel() {
  const items = useCollection<IndexTopicSummary>("indexTopics");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-index-panel="loading"
      >
        Loading index…
      </div>
    );
  }
  return (
    <div className="p-3" data-index-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Index
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-index
        >
          No index topics in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-index-topic-list>
          {items.map((t) => (
            <li
              key={t.selfId}
              className="text-xs px-2 py-1"
              data-topic-id={t.selfId}
            >
              <span>{t.name}</span>
              {t.sortOrder ? (
                <span className="ml-2 text-muted-foreground">
                  ({t.sortOrder})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
