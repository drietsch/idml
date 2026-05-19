# `<ContentTransparencySetting>` design notes

Status: planning artefact. No code changes attached. Captures the
design for the next agent that picks up content-transparency parser
work — see commit `2c33465` (parser added a depth counter that
currently *skips* drop shadows nested under
`<ContentTransparencySetting>`).

## What `<ContentTransparencySetting>` means in IDML

IDML's `<Properties>` block on a placed page item can carry up to
four sibling transparency containers, each scoping a different set
of effects:

- `<TransparencySetting>` — applies to the frame as a whole (the
  default container; what every existing sample in the corpus uses).
- `<StrokeTransparencySetting>` — applies to the frame's stroke
  only.
- `<FillTransparencySetting>` — applies to the frame's fill only.
- `<ContentTransparencySetting>` — applies to the *content* of the
  frame: the placed image (for a Rectangle/Oval/Polygon graphic
  frame) or the contained text (for a TextFrame). The frame's own
  fill and stroke are unaffected.

Each container nests a `<BlendingSetting BlendMode="…" Opacity="…"/>`
plus optional effect children (`<DropShadowSetting>`,
`<InnerShadowSetting>`, `<FeatherSetting>`, …). The `BlendingSetting`
under `<ContentTransparencySetting>` is the one that affects content
compositing — a frame that puts blend mode `Multiply` under
`<ContentTransparencySetting>` while leaving `<TransparencySetting>`
default produces a layered effect: an image inside a rectangular
frame paints normally for the rectangle's fill but with `Multiply`
for the bitmap content. Real-export IDMLs from InDesign 2024 emit
this combination on placed-image frames where the content has been
given an opacity / blend mode but the holding rectangle is left
visible.

## Interaction with the `BeginBlendGroup` infrastructure

The new `BeginBlendGroup` / `EndBlendGroup` primitives (commits
`81c37fb`, `9c9b991`) are the right structural fit. Today the
orchestrator brackets the *entire* frame with a transparency group
when its `<TransparencySetting>` carries a non-Normal blend or
non-100% opacity. To honour `<ContentTransparencySetting>` we'd open
a *second*, nested group around just the content emit:

1. Outer (frame) group, opened by the existing
   `bracket_frame_with_blend_group` helper around the whole
   `emit_*_into` body, only when `<TransparencySetting>` is
   non-default.
2. Inner (content) group, opened around the content emit only —
   the placed image's `DisplayCommand::Image` for graphic frames,
   or the chain of `FillPath` glyph commands for text frames — when
   `<ContentTransparencySetting>` is non-default.

The existing CPU rasterizer fix (clips re-anchored to the active
group buffer) means a clipped placed image inside a content-group
now works correctly; that's one of the cases real-export IDMLs hit.

## Proposed orchestrator-side change

Extend the parser to capture two extra fields per shape:

```rust
content_blend_mode: Option<String>,
content_opacity:    Option<f32>,
content_drop_shadow: Option<DropShadowSetting>,
```

— populated from `<BlendingSetting>` / `<DropShadowSetting>` children
inside `<ContentTransparencySetting>` (replacing the current
"`content_transparency_depth` ⇒ skip" branch). Mirrors the already-
captured `stroke_drop_shadow` plumbing.

In the renderer's `emit_*_into` functions, sequence becomes:

1. Apply frame body group (existing path: `BeginBlendGroup` if
   `<TransparencySetting>` non-default).
2. Emit fill / stroke / corner / drop-shadow modules.
3. Apply content group: `BeginBlendGroup` over the content's
   geometry bounds if `content_*` non-default.
4. Emit content (text or image).
5. Pop content group.
6. Pop body group.

Step 5/6 are unconditional (matching existing push) so the bracket
helper keeps its symmetry.

## Open question: `IsolateBlending` and `KnockoutGroup`

The IDML `<BlendingSetting>` tag also carries `IsolateBlending="true"`
and `KnockoutGroup="true"` boolean flags. Their PDF semantics:

- `IsolateBlending` — group composites against transparent black
  rather than the backdrop, so blend modes inside the group only see
  *each other* and not the page below.
- `KnockoutGroup` — children inside the group don't blend with each
  other; each child overwrites the group buffer at its own bounds
  rather than alpha-compositing with siblings.

The current `BeginBlendGroup` implementation supports neither: it's a
non-isolated, non-knockout group. The corpus doesn't exercise either
flag — every IDML I've inspected leaves both unset.

**Recommendation**: defer until a real-export IDML or generator
sample exercises them. If we do need to support them:

- `IsolateBlending=true` ⇒ initialise the group buffer with
  transparent black rather than the standard alpha-zero (already the
  case in tiny-skia's `Pixmap::new` — *only* the composite-back
  semantic differs; we'd swap the SourceOver back to a SrcOver-onto-
  fresh-page path). Vello's `peniko::BlendMode` doesn't carry an
  isolation bit; we'd need to decide whether to model it as a full
  separate render target or as a pre-clear.
- `KnockoutGroup=true` ⇒ each child draw replaces (not composites)
  the group buffer at its bounds. tiny-skia's `BlendMode::Source`
  achieves this per-fill; we'd need to plumb a flag through
  `GroupFrame` and pick the per-draw composite mode based on it.

Both are uncommon enough that landing the basic
`<ContentTransparencySetting>` path first — without isolation /
knockout — is the right milestone.
