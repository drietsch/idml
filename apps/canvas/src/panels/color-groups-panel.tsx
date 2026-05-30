// SDK Phase 5 (v1 sweep) — Color Groups panel.
//
// Read-only list of every `<ColorGroup>` defined in the
// document. Per `panel-catalog-and-sdk-extension.md` §5.1 +
// Tier 2b. Per-group "filter Swatches panel to this group" is
// a v2 affordance.

import { useCollection } from "@verso/shell";
import type { ColorGroupSummary } from "@verso/client";

export function ColorGroupsPanel() {
  const items = useCollection<ColorGroupSummary>("colorGroups");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-color-groups-panel="loading"
      >
        Loading color groups…
      </div>
    );
  }
  return (
    <div className="p-3" data-color-groups-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Color Groups
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-color-groups
        >
          No color groups in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-color-group-list>
          {items.map((group) => (
            <li
              key={group.selfId}
              className="text-xs px-2 py-1"
              data-group-id={group.selfId}
            >
              <span>{group.name}</span>
              <span className="ml-2 text-muted-foreground">
                {group.members.length} swatch
                {group.members.length === 1 ? "" : "es"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
