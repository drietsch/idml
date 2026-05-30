// SDK Phase 5 (v1 sweep) — Color panel.
//
// Per `panel-catalog-and-sdk-extension.md` §6 Tier 2b. v1
// surface:
//
//   - Fill swatch picker (composition row).
//   - Fill tint scrub (composition row).
//   - Resolved colour readout — RGB hex + CMYK percentages
//     for the current fill, fetched via `client.colorPreview`.
//
// CMYK/RGB editor sliders that *mutate* a swatch's channel
// values are a v2 follow-up: they need
// `Operation::SetSwatchValue` + a Color NodeId routing variant.
// The wire (`RequestColorPreview` → `ColorPreviewReply`) is
// already in place; the editor sliders would dispatch
// `client.mutate({ op: "setSwatchValue", ... })`.

import { useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useBindings,
  useCanvasClient,
} from "@verso/shell";
import type { ColorPreview, Value } from "@verso/client";

import { appCatalogRegistry } from "./catalog-registry";
import { colorComposition } from "./color.composition";

const FILL_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameFillColor" as const,
  },
};

function unwrapColorRef(v: Value | null): string | null {
  if (!v) return null;
  if (v.type !== "colorRef") return null;
  return (v.value as string | null) ?? null;
}

export function ColorPanel() {
  const client = useCanvasClient();
  const resolved = useBindings(FILL_BINDING);
  const fillRef = unwrapColorRef(resolved.value.value);
  const [preview, setPreview] = useState<ColorPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!fillRef) {
      setPreview(null);
      return;
    }
    void client.colorPreview(fillRef).then((p) => {
      if (cancelled) return;
      setPreview(p);
    });
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        if (!fillRef) return;
        void client.colorPreview(fillRef).then((p) => {
          if (cancelled) return;
          setPreview(p);
        });
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, fillRef]);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-3" data-color-panel="ready">
        <CompositionRenderer composition={colorComposition} />
        {preview ? (
          <div
            className="border-t border-input pt-3 flex flex-col gap-1 text-xs"
            data-color-preview
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-6 h-6 border border-input rounded"
                style={{ background: preview.rgbHex }}
                data-color-swatch
              />
              <span className="font-medium">{preview.name}</span>
              <span className="text-muted-foreground">
                {preview.model}
              </span>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-x-2">
              <span className="text-muted-foreground">RGB</span>
              <span data-color-rgb>{preview.rgbHex}</span>
              {preview.cmyk ? (
                <>
                  <span className="text-muted-foreground">CMYK</span>
                  <span data-color-cmyk>
                    {preview.cmyk
                      .map((v) => `${v.toFixed(0)}%`)
                      .join(" / ")}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">CMYK</span>
                  <span className="text-muted-foreground">—</span>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </CatalogRegistryProvider>
  );
}
