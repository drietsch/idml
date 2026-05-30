// SDK Phase 5 (named sweep) — Effects panel.
//
// Drop-shadow editor. Two layers:
//
// 1. Expert-leaf checkbox at the top, bound to
//    `selectionProperty:frameDropShadow` (Value::Bool). Toggles
//    the shadow on/off; the apply arm materialises a default
//    DropShadowSetting on true and clears on false.
//
// 2. CompositionRenderer below for the per-field editors
//    (Mode / X offset / Y offset / Size / Opacity / Color) —
//    all bound to `selectionProperty:frameDropShadow*` paths.
//    The apply arms materialise a default DropShadowSetting on
//    the first per-field write if the prior state was `None`,
//    so the user can dial in fields without flipping the
//    toggle first.
//
// Per `panel-catalog-and-sdk-extension.md` §6.2 expert-leaf
// pattern + the standard composition pattern combined.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useBindings,
} from "@paged-media/shell";
import type { Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { effectsComposition } from "./effects.composition";

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
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
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
        <div className="pt-3" data-drop-shadow-fields>
          <CompositionRenderer composition={effectsComposition} />
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
