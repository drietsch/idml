// SDK Phase 5 (v1 sweep) — Fonts panel.
//
// Read-only list of every font family used in the document.
// The parse layer doesn't carry a font registry — fonts are
// referenced from runs + paragraph-style defaults + character-
// style defaults; the accessor walks them and dedups. Surface
// is "fonts in use", not "fonts installed".

import { useCollection } from "@paged-media/shell";
import type { FontSummary } from "@paged-media/client";

export function FontsPanel() {
  const items = useCollection<FontSummary>("fonts");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-fonts-panel="loading"
      >
        Loading fonts…
      </div>
    );
  }
  return (
    <div className="p-3" data-fonts-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Fonts
      </div>
      {items.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-fonts
        >
          No fonts in use.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-font-list>
          {items.map((f) => (
            <li
              key={f.family}
              className="text-xs px-2 py-1"
              data-font-family={f.family}
            >
              <span>{f.family}</span>
              <span className="ml-2 text-muted-foreground">
                {f.referenceCount} use{f.referenceCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
