// SDK Phase 5 (v1 sweep) — Condition Sets panel.
//
// Read-only list of every `<ConditionSet>` defined in the
// document. Per `panel-catalog-and-sdk-extension.md` §5.1 +
// Tier 1. Per-set "show only this set" toggle is v2 work (needs
// `Operation::ActivateConditionSet`).

import { useCollection } from "@paged-media/shell";
import type { ConditionSetSummary } from "@paged-media/client";

export function ConditionSetsPanel() {
  const items = useCollection<ConditionSetSummary>("conditionSets");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-condition-sets-panel="loading"
      >
        Loading condition sets…
      </div>
    );
  }
  return (
    <div className="p-3" data-condition-sets-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Condition Sets
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-condition-sets
        >
          No condition sets in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-condition-set-list>
          {items.map((set) => (
            <li
              key={set.selfId}
              className="text-xs px-2 py-1"
              data-set-id={set.selfId}
            >
              <span>{set.name}</span>
              <span className="ml-2 text-muted-foreground">
                {set.conditions.length} condition
                {set.conditions.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
