// SDK Phase 5 (named sweep) — Effects panel.
//
// Expert leaf wrapping `useBindings` against
// `selectionProperty:frameDropShadow` (Value::Bool). Renders a
// simple checkbox; on toggle, commits the new boolean through the
// existing apply layer. The apply arm materialises a default
// DropShadowSetting on true, clears on false (v1 collapse — see
// the path's doc comment for the trade-off).
//
// Per `panel-catalog-and-sdk-extension.md` §6.2 expert-leaf
// pattern. The §11.5 binding ceiling lets us declare the binding
// in code (TS), wired through the same `useBindings` hook the
// composition renderer uses internally — so the audit pipeline
// still picks the read/write paths up.

import { useBindings } from "@verso/shell";
import type { Value } from "@verso/client";

const DROP_SHADOW_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameDropShadow" as const,
  },
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

export function EffectsPanel() {
  const resolved = useBindings(DROP_SHADOW_BINDING);
  const dropShadow = resolved.value;
  const checked = unwrapBool(dropShadow.value);
  const indeterminate = checked === null;

  return (
    <div className="p-3" data-effects-panel="ready">
      <fieldset className="border-t border-input pt-2">
        <legend className="text-xs font-medium uppercase text-muted-foreground px-1">
          Effects
        </legend>
        <div className="grid grid-cols-[8rem_1fr] items-center gap-2 pt-2">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="effects-drop-shadow"
          >
            Drop shadow
          </label>
          {indeterminate ? (
            <span
              className="text-xs text-muted-foreground"
              data-mixed
            >
              —
            </span>
          ) : (
            <input
              id="effects-drop-shadow"
              type="checkbox"
              checked={checked ?? false}
              data-drop-shadow-toggle
              onChange={(e) => {
                dropShadow.onCommit?.({
                  type: "bool",
                  value: e.target.checked,
                } as Value);
              }}
            />
          )}
        </div>
      </fieldset>
    </div>
  );
}
