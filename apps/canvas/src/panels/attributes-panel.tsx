// SDK Phase 5 (v1 sweep) — Attributes panel.
//
// Read-write expert leaf for per-frame attributes that aren't
// covered by other panels. v1 surface: the Nonprinting toggle
// (excludes the frame from print/export passes; canvas still
// renders it). Per `panel-catalog-and-sdk-extension.md` §6
// Tier 5 + §10 audit register.
//
// Reuses the binding-hook pattern from Effects — wraps
// useBindings around a `selectionProperty:frameNonprinting`
// binding and renders a checkbox.

import { useBindings } from "@verso/shell";
import type { Value } from "@verso/client";

const NONPRINTING_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameNonprinting" as const,
  },
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

export function AttributesPanel() {
  const resolved = useBindings(NONPRINTING_BINDING);
  const np = resolved.value;
  const checked = unwrapBool(np.value);
  const indeterminate = checked === null;

  return (
    <div className="p-3" data-attributes-panel="ready">
      <fieldset className="border-t border-input pt-2">
        <legend className="text-xs font-medium uppercase text-muted-foreground px-1">
          Attributes
        </legend>
        <div className="grid grid-cols-[8rem_1fr] items-center gap-2 pt-2">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="attributes-nonprinting"
          >
            Nonprinting
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
              id="attributes-nonprinting"
              type="checkbox"
              checked={checked ?? false}
              data-nonprinting-toggle
              onChange={(e) => {
                np.onCommit?.({
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
