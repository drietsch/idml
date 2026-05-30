// SDK Phase 3 — Stroke panel as a declarative composition.
//
// Element-scope bindings — they resolve against the single selected
// page item. Uses ONLY existing apply arms + snapshots
// (FrameStrokeWeight, FrameStrokeColor) — no new Rust needed. The
// catalog's primitive leaves (Length, ColorSwatch) accept any
// `Value::Length` / `Value::ColorRef` regardless of which path
// the composition binds them to.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const strokeComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Stroke" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_LENGTH,
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
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeColor",
        },
      },
    },
    {
      // SDK Phase 5 (v1 sweep) — end-cap toggle-group. Three
      // IDML enum values; Rectangle / Oval / Polygon /
      // GraphicLine carry the field, TextFrame does not (the
      // apply arm returns UnsupportedProperty when wired to a
      // text frame).
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "End cap",
        options: [
          { value: "ButtEndCap", label: "—" },
          { value: "RoundEndCap", label: "○" },
          { value: "ProjectingEndCap", label: "□" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeEndCap",
        },
      },
    },
  ],
};
