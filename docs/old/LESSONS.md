# LESSONS — misshapen IDML concepts

A running notebook of IDML concepts that feel structurally wrong, with notes
on the shape they probably should have. Not "this was hard to implement" but
"this is the wrong shape for the underlying problem." The notebook is the
spine of the eventual 2026+ design document and is most valuable to update
*now*, while the insight is fresh — after the renderer phase, only "we did
it this way" survives and the *why* fades.

Format per entry: **IDML shape → suggested shape**, plus a short *why* and
optionally a *cost* note (what we paid to make IDML's shape work).

## Seeded entries (from `docs/inspector.md`)

### Story-and-textframe split with override attributes

**IDML:** A `<Story>` owns content; `<TextFrame>` elements reference the
story and host it; override attributes can locally alter style. Frames are
threaded via `NextTextFrame`.

**Should be:** Rope-as-content + frames-as-views into the rope. The content
is one logical sequence; frames are layout-and-presentation views that
display some range of that sequence with optional view-local overrides.

**Why:** Threading is a presentation concern, not a content concern. The
content has no "next frame" — it has a position in a rope. Views know where
their windows start and end. This separation makes collaborative editing,
multi-output rendering, and content-vs-presentation reactivity tractable.

**Cost we paid:** `StoryEmitter` carries a lot of per-frame bookkeeping
state (frame chain index, vertical-justify command ranges, numbered-list
counter persistence across frame splits, table physical-row sequences). All
of that is structural workaround for "the frame is also the line-distribution
unit." A rope-view model wouldn't need it.

### Anchored objects as a separate positioning mechanism

**IDML:** Anchored objects (`<TextFrame>` / `<Rectangle>` / `<Group>` nested
inside a `<CharacterStyleRange>`) have their own positioning model with
per-edge attribute capture.

**Should be:** General parent-relative positioning constraint. An anchored
object is just a child whose layout origin is a text-flow position; that's
one positioning constraint family among several (grid-cell, frame-relative,
page-relative, viewport-relative). One constraint system, multiple sources
of position.

**Why:** Adobe modeled this as a special case because the text engine and
the layout engine grew up separately. In a system designed from scratch,
they're the same engine and anchored-to-text is one constraint kind.

### Paragraph composer as a per-paragraph attribute

**IDML:** Each paragraph carries an `AppliedComposer` (single-line composer
vs. paragraph composer). The choice is paragraph-local.

**Should be:** Document-level layout strategy with paragraph-level hints. A
document chooses a composition strategy (greedy / Knuth-Plass / column-balance /
multi-column-vertical-justify). Paragraphs hint about their preferences
(don't-break-this-pair, prefer-no-hyphenation) but don't choose the global
algorithm.

**Why:** Mixing single-line and multi-line composers within a document
produces inconsistent typography and is mostly a holdover from
performance-bound era engines. Composition is a layout property, not a
content property.

### Color groups as a flat list with manual reference

**IDML:** Swatches live in `Graphic/`; references are stringly typed
(`Color/Red`, `Color/Pantone286`). No typing on the reference; no
relationships expressed.

**Should be:** Typed reference into a color graph. A color reference is a
typed handle (`Reference<Color>`); colors have relationships (tinted-from,
gradient-stop-of, derived-from). The graph form lets the editor surface
relationships and lets renderer-side validation enforce them.

**Why:** The stringly-typed model means every name lookup is a runtime
failure mode rather than a compile-time invariant; "rename a swatch" is a
text replace across the whole document; gradient stops can't be edited as
a related set.

### Master pages as a special inheritance model

**IDML:** Master spreads (`<MasterSpread>`) are referenced by document
spreads; overrides happen via per-frame `OverriddenPageItemProps` or
similar attribute capture.

**Should be:** General template/instance with override tracking. A spread
is an instance of a template; overrides are a tracked diff layer. The same
shape covers tables, repeating groups, slide masters, brand templates, and
component instances.

**Why:** Master pages are one instance of "template + overrides" but the
implementation is special-purpose. Generalizing this primitive is the
backbone of a real templating story for the 2026+ app.

## New entries (append below)

<!-- New misshapen concepts go here. Format:

### Short, evocative title

**IDML:** ...
**Should be:** ...
**Why:** ...
**Cost we paid:** ...   (optional)

-->
