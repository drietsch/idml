// SDK Phase 3 — Stroke panel as a declarative composition.
//
// Element-scope bindings — they resolve against the single selected
// page item. Uses ONLY existing apply arms + snapshots
// (FrameStrokeWeight, FrameStrokeColor) — no new Rust needed. The
// catalog's primitive leaves (Length, ColorSwatch) accept any
// `Value::Length` / `Value::ColorRef` regardless of which path
// the composition binds them to.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLOR_SWATCH,
  VERSO_INPUT_LENGTH,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const strokeComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Stroke" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_LENGTH,
      props: { label: "Weight" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeWeight",
        },
      },
    },
    {
      catalogId: VERSO_INPUT_COLOR_SWATCH,
      props: { label: "Color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeColor",
        },
      },
    },
  ],
};
