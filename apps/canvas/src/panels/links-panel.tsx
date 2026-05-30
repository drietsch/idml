// SDK Phase 5 (named sweep) — Links panel.
//
// Read-only list of placed-image links across the document. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 1 / §5.1. Expert
// leaf wrapping `useCollection<LinkSummary>("links")`; the per-row
// actions (relocate / update / break link) land when their
// Operations ship.

import { useCollection } from "@verso/shell";
import type { LinkSummary } from "@verso/client";

export function LinksPanel() {
  const links = useCollection<LinkSummary>("links");
  if (links === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-links-panel="loading"
      >
        Loading links…
      </div>
    );
  }
  return (
    <div className="p-3" data-links-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Links
      </div>
      {links.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-links
        >
          No image links in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-link-list>
          {links.map((link) => {
            // The displayed name strips path prefixes for
            // legibility — full URI lives in the title attribute.
            const filename = link.uri.split("/").pop() ?? link.uri;
            return (
              <li
                key={link.hostSelfId}
                className="text-xs px-2 py-1"
                data-link-host={link.hostSelfId}
                data-link-kind={link.hostKind}
                title={link.uri}
              >
                <span>{filename}</span>
                <span className="ml-2 text-muted-foreground">
                  {link.hostKind} {link.hostSelfId}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
