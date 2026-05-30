// SDK Phase 5 (v1 sweep) — Conditions panel.
//
// Read-only expert leaf listing every `<Condition>` defined in
// the document. Per `panel-catalog-and-sdk-extension.md` §5.1 +
// §6 Tier 1. Per-condition visibility toggle lands when
// `Operation::SetConditionVisible` ships.

import { useCollection } from "@paged-media/shell";
import type { ConditionSummary } from "@paged-media/client";

export function ConditionsPanel() {
  const conditions = useCollection<ConditionSummary>("conditions");
  if (conditions === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-conditions-panel="loading"
      >
        Loading conditions…
      </div>
    );
  }
  return (
    <div className="p-3" data-conditions-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Conditions
      </div>
      {conditions.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-conditions
        >
          No conditions in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-condition-list>
          {conditions.map((cond) => (
            <li
              key={cond.selfId}
              className="text-xs px-2 py-1 flex items-center gap-2"
              data-condition-id={cond.selfId}
              data-condition-visible={cond.visible ? "true" : "false"}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  cond.visible ? "bg-foreground/80" : "bg-foreground/20"
                }`}
                aria-hidden
              />
              <span>{cond.name}</span>
              {cond.indicatorMethod ? (
                <span className="ml-2 text-muted-foreground">
                  {cond.indicatorMethod}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
