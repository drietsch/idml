// SDK Phase 5 (v1 sweep) — Articles panel.
//
// Read-only list of every `<Article>` defined in the document.
// Per `panel-catalog-and-sdk-extension.md` §5.1 + Tier 1.

import { useCollection } from "@verso/shell";
import type { ArticleSummary } from "@verso/client";

export function ArticlesPanel() {
  const items = useCollection<ArticleSummary>("articles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-articles-panel="loading"
      >
        Loading articles…
      </div>
    );
  }
  return (
    <div className="p-3" data-articles-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Articles
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-articles
        >
          No articles in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-article-list>
          {items.map((a) => (
            <li
              key={a.selfId}
              className="text-xs px-2 py-1"
              data-article-id={a.selfId}
            >
              <span>{a.name}</span>
              <span className="ml-2 text-muted-foreground">
                {a.members.length} member{a.members.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
