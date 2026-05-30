# Canvas Interaction Plan — selection, gestures, transforms

*Implementation plan for the direct-manipulation primitives on the
Paged canvas: element selection, hit-testing, the gesture spine, and
frame transforms (move / resize / rotate / scale). Companion to
`editor-architecture.md` (the Operation/Gesture-channel and
document/application-state model) and `canvas.md` (the four-tier
pipeline, the overlay layer §9, and the Phase-3 editor acceptance
criteria §11.3). This document is the concrete, code-grounded
sequencing the briefings deliberately left abstract.*

*Scope note: this is renderer/scene-graph-layer + canvas-app work. It
is **below** the shell and bundle system in the four-layer
architecture — it builds the Gesture API surface and the
selection-state foundation that a later `paged.selection` /
`paged.transform` bundle will consume. None of it requires the shell
to exist, so it is safe to build now without committing the
shell/bundle architecture. See "The toolbox" at the end for how this
relates to the eventual shell.*

---

## 0. Where this sits

The interaction primitives the user listed — caret, text selection,
element selection, multi-select, drag-and-drop, scaling, rotation —
split into **two domains at very different maturity levels**. This
plan is almost entirely about the second.

| Domain | State today |
|---|---|
| **Text-level** (caret, text range selection, paragraph selection) | Largely built at the model level. See §1.1. Remaining work is UI polish + keyboard nav, not new architecture. Out of scope here except where it intersects element selection. |
| **Element-level** (frame / image / vector selection, multi-select, marquee, move, resize, rotate, scale, drag-and-drop) | Essentially greenfield. No selection set, no gesture layer, no transform Operations, hit-testing is AABB-only. **This plan.** |

Target acceptance criteria from `canvas.md` §11.3:

- **AC-E-6** Frame manipulation — move/resize/rotate produce correct
  document geometry *and* correct visual feedback.
- **AC-E-7** Mutation determinism — replaying a recorded log is
  byte-identical.
- **AC-E-8** Undo correctness — undo/redo round-trips to the same state.
- **AC-E-9** Zoom-independence — identical mutations at 5% / 100% /
  800% zoom produce identical document state.

This plan additionally defines **AC-E-10 … AC-E-16** (new, §6) for
element selection, marquee, oriented hit-testing, pivot rotation,
snapping, and multi-select transforms.

---

## 1. Grounding: what exists vs the gaps

### 1.1 What exists (and is solid)

**Text selection + caret (model level).** `crates/paged-canvas/src/`:

- `selection.rs` — `ContentSelection { story_id, start, end, affinity }`,
  content-addressed so it survives re-layout (AC-E-9 for text). Has
  `shift_for_insert` / `shift_for_delete`.
- `geometry.rs` — `caret_geometry()` and `selection_geometry()` turn a
  `ContentSelection` + `BuiltDocument` into a `CaretGeometry` /
  `Vec<SelectionRect>`. **This is the query pattern the gesture
  overlay should mirror**: ephemeral state in, page-local geometry out.
- `hit.rs::story_offset_at_point` — click → character offset.

**Hit-testing (coarse).** `hit.rs::hit_test(page_id, doc_point)`
returns the topmost frame whose **axis-aligned bounding box** contains
the point, across text frames → rectangles → ovals → polygons, each in
reverse order. Returns `frame_id`, `story_id`, page-local
`frame_bounds`, and `offset_within_story`.

**Camera + coordinate transforms.** `camera.rs::Camera { scale, tx, ty }`
with `to_viewport` / `to_document`, backed by the `SharedArrayBuffer`
contract. The TS side already maps viewport↔doc (`viewportToDoc` in
`apps/canvas/src/channel/camera.ts`).

**The Operation log (canonical mutation primitive).** `crates/paged-mutate/`:

- `operation.rs` — `Operation { SetProperty, InsertNode, RemoveNode,
  MoveNode, Batch }` — exactly the canonical set from
  `editor-architecture.md`. `PropertyPath { FrameBounds, FrameFillColor }`,
  `Value { Bounds([f32;4]), ColorRef }`.
- `apply.rs` — single mutation entry `apply(doc, op)`; implements
  `SetProperty{FrameBounds}` and `{FrameFillColor}` for **TextFrame and
  Rectangle**, captures the previous value, and builds the inverse.
- `invert.rs` — algebraic inverses; `SetProperty(new) → SetProperty(prev)`.
- `history.rs` — undo/redo stacks.

**The channel.** `channel.rs` already carries the *envelope* for frame
mutations — `Mutation::MoveFrame { frame_id, transform: [f32;6] }`,
`ResizeFrame { frame_id, bounds }`, `InsertFrame`, `DeleteFrame` — and
the `HitTest` / `SetSelection` / `Undo` / `Redo` messages. The TS
client (`apps/canvas/src/channel/client.ts`) exposes `mutate`,
`setSelection`, `undo`, `redo`, `caretGeometry`, `selectionGeometry`.

**Pointer plumbing.** `apps/canvas/src/ui/ViewportCanvas.tsx` already
does pointer capture, a `dragStateRef`, click-vs-drag discrimination
(`CLICK_DRAG_THRESHOLD_PX`), `viewportToDoc`, and an `onHit` → `hitTest`
round-trip. The overlay (`Overlay.tsx`) already renders
`SelectionChrome`, `TextCaret`, `SelectionAnts`, `AnchorBadges`,
`PageCaption` as an SVG layer.

### 1.2 The gaps

1. **No element-selection model.** `ContentSelection` is text-only.
   There is no set-of-selected-elements anywhere in Rust; the TS
   `SelectionState` is a single click marker + one frame outline.
2. **Hit-testing is AABB-only.** A rotated frame gets the bbox of its
   transformed corners (`hit.rs::transform_bbox`) → clicking the empty
   corner of a rotated frame's bbox false-positives; clicking through a
   hole in a compound path false-positives. No **group descent** (Group
   children aren't hit-tested). The per-kind z-order (text frames, then
   all rects, then all ovals…) is **not true document z-order**.
3. **No gesture layer.** No `begin/update/commit/cancel`, no ephemeral
   overlay. `Mutation::MoveFrame` / `ResizeFrame` exist on the wire but
   the worker rejects them with `WorkerError::NotImplemented`
   (`paged-canvas-wasm/src/lib.rs` ~L771/L830).
4. **No transform Operations.** `paged-mutate` has no `ItemTransform`
   property path — only `FrameBounds`. Rotation/scale (which live in
   the affine matrix) cannot yet be expressed as an Operation.
5. **The mutation-log fork.** `CanvasModel` (`model.rs`) has its **own**
   `TextOp`-based undo/redo log, separate from `paged-mutate`'s
   `Operation` log. `mutate.rs` carries an explicit comment that the
   two are meant to converge ("variants can be folded into
   `paged_mutate::Operation`"). `paged-canvas` does not yet depend on
   `paged-mutate`. **Frame gestures must commit through the
   `paged-mutate` log, so this fork has to be bridged** (§3.5).

---

## 2. Architectural commitments (load-bearing)

These are decided up front; everything below conforms to them.

### 2.1 Two channels: Operation (committed) vs Gesture (ephemeral)

Per `editor-architecture.md`: a drag produces **one** `Operation` at
commit, not one per pointer frame. During the drag, an **ephemeral
overlay** holds the in-progress transform and the renderer draws from
it. On `commit`, the worker diffs the overlay against the committed
state and applies exactly one `paged-mutate::Operation` (or a `Batch`
for multi-select), which yields the inverse + invalidation for free.
On `cancel`, the overlay is dropped and nothing enters the log.

### 2.2 Gesture geometry lives in Rust (`paged-canvas`), not TypeScript

Rotation-about-pivot, locked-aspect scale, marquee over rotated
objects, and snapping are real geometry and belong in one place — the
same crate as the rest of the renderer math. The TS layer's job stays
narrow: receive pointer events, decide the active tool + what was hit,
call `begin/update/commit/cancel` on the worker, and draw the 2D
overlay chrome (handles, marquee rect, snap lines). **No transform math
in TS** beyond the camera viewport↔doc mapping that already exists.

### 2.3 Document state vs application state

- **Document state** (persisted, undoable, in the scene graph, mutated
  only via Operations): frame bounds, `ItemTransform`, fill, z-order.
- **Application state** (per-user, ephemeral, *not* in the Operation
  log): the element-selection set, the active tool, the viewport, and
  the in-flight gesture overlay. Element selection lives in the canvas
  app + a worker mirror (so geometry queries have a stable read), the
  same split the text `ContentSelection` already uses via
  `SetSelection`. **Selecting a frame never produces an Operation** and
  Cmd-Z never changes selection.

### 2.4 Coordinate spaces

Four spaces, with the conversions already available:

```
viewport px ──Camera.to_document──► document pt
document pt ──(− page origin)─────► page-local pt   (per layout.ts pageRects / built_page.spread_origin)
page-local  ──(+ spread_origin)───► spread pt
spread pt   ──item_transform──────► the frame's own content-box coords
```

Hit-testing, gesture deltas, and overlay handles all operate in
**spread / document pt** and only convert to viewport px at draw time,
so everything is zoom-independent by construction (AC-E-9).

---

## 3. The mutation model for transforms

### 3.1 Move and resize reuse `FrameBounds` (no new Operation needed)

A **move** shifts all four bounds by `(dx, dy)`; a **resize** changes
the dragged edge(s). Both are expressible *today* as
`SetProperty{ FrameBounds, Value::Bounds }` for TextFrame and
Rectangle — `apply.rs` already implements it with inverse + the
`frame_geometry` invalidation hint. This makes translate/resize the
cheapest possible first slice: **no `paged-mutate` change required**,
only the gesture spine + overlay around it.

Caveat — the move-via-bounds vs move-via-transform decision: IDML
frames carry both `bounds` (the content box) and an optional
`item_transform` (placement + rotation + scale). For an
**un-rotated** frame, editing bounds is exact and keeps text reflow
intuitive. For a **rotated** frame, a screen-space translation must be
applied in the *parent* space, i.e. composed into `item_transform.tx/ty`,
not into bounds (which live in the rotated content-box space). So:

- Un-rotated frame, move/resize → `SetProperty{FrameBounds}`.
- Rotated frame, move → `SetProperty{FrameTransform}` (§3.2),
  composing the world-space delta through the inverse of the rotation.

### 3.2 Rotate and scale need a `FrameTransform` Operation (new)

Add to `paged-mutate`:

- `PropertyPath::FrameTransform`
- `Value::Transform([f32; 6])` (the 2D affine `[a b c d tx ty]`)
- `apply.rs`: handle `(TextFrame|Rectangle, FrameTransform)` — read the
  current `item_transform` (default identity `[1 0 0 1 0 0]` when
  `None`), set the new matrix, return `Value::Transform(prev)` as the
  inverse value. `invert_set_property` already handles this generically.
- Invalidation: `frame_geometry` (rotation/scale don't reflow text;
  matrix scale of a text frame is a *visual* scale, not a reflow — see
  the resize-vs-scale decision in §8).

This is a contained, ~1-file extension mirroring the existing
`FrameBounds` arm. Oval / Polygon / GraphicLine transform support
follows the same pattern when those node kinds graduate from
`apply.rs`'s Stage-1 set (currently TextFrame + Rectangle only).

### 3.3 The gesture → Operation mapping

| Gesture | Commit Operation |
|---|---|
| Translate (un-rotated) | `SetProperty{FrameBounds}` (shift all four) |
| Translate (rotated) | `SetProperty{FrameTransform}` |
| Resize edge/corner (text/rect) | `SetProperty{FrameBounds}` |
| Rotate about pivot | `SetProperty{FrameTransform}` |
| Scale about pivot | `SetProperty{FrameTransform}` (or `FrameBounds` for "resize" semantics — §8) |
| Multi-select any of the above | `Operation::Batch{ ops }` (one per node) |

### 3.4 Ephemeral overlay → preview rendering

The gesture overlay is a small map `node_id → TransformOverride`
(either a replacement `item_transform` or a replacement `bounds`) held
on `CanvasModel`. The Tier-4 display-list build for the affected page
composes the override when present. Because a gesture touches only the
selected nodes (usually 1, rarely dozens), re-emitting **just the
affected page's** display list per `update` is cheap and reuses the
existing dirty-page → re-render path (`PagesDirty` / `MutationApplied`
already carry `page_ids`). No new render architecture; the override is
an extra lookup in the page slice.

### 3.5 Bridging the mutation-log fork

`CanvasModel` currently owns a `TextOp` undo log; `paged-mutate` owns
the `Operation` log; the two are disjoint and `paged-canvas` doesn't
depend on `paged-mutate`. For frame gestures we need the `Operation`
log. Recommended bridge (smallest step that unifies undo):

1. Add `paged-mutate` as a dependency of `paged-canvas`.
2. Generalize `CanvasModel`'s undo log entry from `TextOp` to an enum
   `LoggedMutation { Text(TextOp), Frame(paged_mutate::AppliedOperation) }`
   so a single ordered undo stack covers both text edits and frame
   transforms (users expect one Cmd-Z timeline).
3. Route `Mutation::MoveFrame` / `ResizeFrame` (and new gesture-commit
   messages) through `paged_mutate::apply`, pushing the
   `AppliedOperation` onto the unified log.
4. Leave the `TextOp` path as-is for now; the eventual full convergence
   (folding `TextOp` into `paged_mutate::Operation`) is tracked
   separately and is **out of scope** for this plan.

This is the one cross-crate structural change; it should land early
(Phase B) because every committed gesture depends on it.

---

## 4. The gesture spine (new `paged-canvas` module)

New file `crates/paged-canvas/src/gesture.rs`:

```rust
pub enum GestureType {
    Translate,
    Resize { handle: ResizeHandle },          // 8 edge/corner handles
    Rotate { pivot: (f32, f32) },              // spread-coord pivot
    Scale  { pivot: (f32, f32), lock_aspect: bool },
    Marquee { mode: MarqueeMode },             // Replace | Add | Toggle
}

pub struct GestureHandle(u64);                 // opaque, monotone

pub enum GestureUpdate {
    PointerTo((f32, f32)),                      // current pointer, spread pt
    Modifiers { shift: bool, alt: bool },       // constrain / from-center / duplicate
}

// On CanvasModel:
fn begin_gesture(&mut self, nodes: &[NodeId], g: GestureType) -> GestureHandle;
fn update_gesture(&mut self, h: GestureHandle, u: GestureUpdate) -> Vec<PageId>; // dirty pages
fn commit_gesture(&mut self, h: GestureHandle) -> Result<AppliedOperation, ...>;
fn cancel_gesture(&mut self, h: GestureHandle) -> Vec<PageId>;
```

- `begin` snapshots each node's committed `(bounds, item_transform)`
  and allocates the overlay entry.
- `update` recomputes the overlay transform from the snapshot + the
  gesture parameters (this is where the pivot/lock-aspect/snap geometry
  lives) and returns the dirty page set.
- `commit` diffs overlay vs committed, builds the one
  `Operation`/`Batch`, applies via the §3.5 bridge, clears the overlay.
- `cancel` clears the overlay.

Marquee is special: it has no committed result (selection is
application state). `commit` of a `Marquee` returns the set of node ids
whose oriented bounds intersect the marquee rect (mode-combined with
the prior selection) rather than an `Operation`.

---

## 5. Hit-testing upgrade (`hit.rs`)

Three concrete improvements, in priority order:

1. **Oriented containment.** Instead of AABB-of-transformed-corners,
   test the point against the frame's actual oriented rectangle: map
   the point into the frame's content-box space via the inverse
   `item_transform`, then test against the raw `bounds`. Exact for
   rotated/sheared frames. (Compound-path / hole-accurate hit-testing
   using `subpath_starts` is a later refinement — flag, don't build.)
2. **True z-order (layer-aware).** Replace the per-kind sequential scan
   with a single pass over all page items, topmost-first. The order is
   **layer order first, then document order within a layer** — *not*
   raw spread document order. Source it from the *same* computation the
   renderer paints from: `crates/paged-renderer/src/pipeline.rs` already
   builds a `layer_z_index` (~L864) keyed by each item's `ItemLayer`.
   Hit-testing must consult that index (or a shared helper extracted
   from it) so selection and rendering can never disagree about which
   element is on top.
3. **Group descent.** When the topmost hit is a `Group`, descend into
   its children (composing the group's `item_transform`) so the user
   selects the leaf, with Group-level selection reachable via a
   modifier or double-click-to-enter. (Parser already surfaces Group;
   `apply.rs` doesn't mutate inside groups yet — selection can *read*
   group children before transforms inside groups are writable.)

`HitFilter` (already `Frame | Text | Any`) gains meaning: the select
tool uses `Frame`, the text tool uses `Text`.

### 5.1 Layers as an input to interaction

Layers already exist in the model and the renderer, and they gate
interaction in two ways that belong in *this* plan (the layer **model
and management UI** do not — see "out of scope" below).

- **The model.** `crates/paged-parse/src/designmap.rs:54` parses
  `Layer { self_id, name, visible, locked, printable }`. Every page
  item references its layer via `ItemLayer`.
- **Visibility gating.** The renderer already skips items on a layer
  where `visible && printable` is false (`pipeline.rs:832`).
  Hit-testing and marquee selection must apply the **same** gate — an
  item the user cannot see must not be selectable. Reuse the renderer's
  visibility predicate rather than re-deriving it.
- **Locked gating.** `locked` is documented in the parser as *"purely
  an editor concern; the renderer ignores it."* The selection layer is
  therefore the **first** consumer of `locked`: items on a locked layer
  are not hit-testable for selection (click falls through to whatever is
  selectable beneath, or clears). This is a selection-rule change in
  Phase A, not a render change.
- **Z-order.** Already covered by §5 #2 — the layer-aware order is the
  one selection must use.

**State-ambiguity note (for the later `paged.layers` work, not here).**
`editor-architecture.md` flags layer *visibility* as a
document-vs-application-state decision: "hidden in the document"
(persisted, affects export + all collaborators) vs. "hidden in my view"
(per-user application state). This plan only *reads* the current
`visible` flag to gate hit-testing; it does not decide that question.

**Out of scope here (→ `paged.layers`, build-sequence Step 7):**
creating / reordering / renaming layers, the visibility & lock toggles,
re-assigning items to layers (`ItemLayer`), and the Layers panel. Those
need *new* Operations (reorder layer, set `ItemLayer`, set
visibility/lock) and a panel UI — neither is a direct-manipulation
primitive.

---

## 6. New acceptance criteria

Continuing `canvas.md` §11.3's numbering:

- **AC-E-10 Element selection.** Click selects the topmost *selectable*
  element under the pointer (oriented, not AABB; skipping items on
  hidden or locked layers per §5.1); Shift/Cmd-click adds/toggles; click
  on empty canvas clears. Selection survives zoom, pan, and re-layout.
  Measurement: automated test over single/overlapping/rotated frames at
  3 zoom levels, plus a hidden-layer and a locked-layer case.
- **AC-E-11 Marquee.** Click-drag on empty canvas selects all elements
  whose oriented bounds intersect the marquee; Shift adds. Measurement:
  automated test with rotated + overlapping elements.
- **AC-E-12 Oriented hit-testing.** A click in the empty corner of a
  45°-rotated frame's AABB does **not** select it; a click inside the
  rotated rect does. Measurement: unit test in `hit.rs`.
- **AC-E-13 Translate.** Dragging a selected frame moves it; the
  committed bounds/transform equal the drag delta exactly; one undo
  entry per drag. Measurement: unit + Playwright.
- **AC-E-14 Resize.** Dragging an edge/corner handle resizes; opposite
  edge stays fixed (or center stays fixed with Alt); Shift locks aspect.
  Measurement: unit + visual.
- **AC-E-15 Rotate.** Dragging the rotation handle rotates about the
  selection pivot; Shift snaps to 15° increments; committed
  `item_transform` matches. Measurement: unit (matrix assertion) +
  visual.
- **AC-E-16 Multi-select transform.** A transform applied to a
  multi-selection commits as one `Batch` (one undo entry) and moves all
  members rigidly. Measurement: unit + undo round-trip.

AC-E-6/7/8/9 (existing) are satisfied incrementally as the phases land.

---

## 7. Phased delivery

Each phase is independently shippable and testable via `cargo test`
(Rust) + Playwright (`apps/canvas/tests/`). Effort: S ≈ 1–3 days,
M ≈ 3–6 days, L ≈ 1–2 weeks, for one focused engineer.

### Phase A — Element selection + hit-testing upgrade

**Goal:** click/shift-click/marquee selection of frames, exact under
rotation and z-order. Pure foundation; no mutation.

- **Rust** (`paged-canvas`):
  - New `ElementSelection { ids: Vec<NodeId> }` (application state) +
    set ops (set/add/toggle/remove/clear). Mirror to worker via a new
    `SetElementSelection` channel message (parallel to `SetSelection`).
  - `hit.rs`: oriented containment (#1), layer-aware z-order (#2,
    sourced from `pipeline.rs`'s `layer_z_index`), and layer
    visibility + locked gating (§5.1 — skip items on hidden/locked
    layers). Group descent (#3) can trail into Phase A.1 if it
    complicates the first landing.
  - Marquee intersection query (oriented-bounds ∩ rect).
- **Channel** (`channel.rs`): `SetElementSelection { ids }`,
  `RequestMarqueeHits { page_id, rect }` → reply with `Vec<NodeId>`.
  Extend `HitResult` to honor `HitFilter`.
- **TS** (`apps/canvas`):
  - `CanvasApp.tsx`: add `elementSelection` state + active-tool state
    (`"select" | "text"`), default `select`.
  - `ViewportCanvas.tsx`: on click (below drag threshold) with select
    tool → `hitTest` → set element selection; Shift/Cmd modifies; empty
    click clears. Marquee: drag on empty canvas draws a rect (overlay)
    and on release calls `RequestMarqueeHits`.
  - `Overlay.tsx`: draw a selection bounding box per selected element
    (oriented), plus the live marquee rect.
- **ACs:** AC-E-10, AC-E-11, AC-E-12.
- **Effort:** M. **Risk:** low; no document mutation.

### Phase B — Gesture spine + the log bridge + translate

**Goal:** the first real direct manipulation. Drag a frame; one undo
entry; preview at frame rate.

- **Rust:**
  - The §3.5 bridge: `paged-canvas` depends on `paged-mutate`; unified
    `LoggedMutation` enum; route frame commits through
    `paged_mutate::apply`.
  - `gesture.rs` (§4) with `GestureType::Translate` only.
  - Ephemeral overlay (§3.4) + page-slice compose hook in the Tier-4
    build.
- **Channel:** `BeginGesture { nodes, gesture }`, `UpdateGesture
  { handle, update }`, `CommitGesture { handle }`, `CancelGesture
  { handle }`; replies carry dirty `page_ids`. (Keep the existing
  `Mutation::MoveFrame` as the script-path equivalent; both land on the
  same `apply`.)
- **TS:** `ViewportCanvas.tsx` pointer handlers: pointerdown on a
  selected frame body → `BeginGesture(Translate)`; pointermove →
  `UpdateGesture(PointerTo)`; pointerup → `CommitGesture`; Escape →
  `CancelGesture`. Pointer capture already exists.
- **ACs:** AC-E-13, plus AC-E-7/8 (determinism + undo) for translate.
- **Effort:** L (the bridge + overlay are the cost). **Risk:** medium
  — the overlay→render compose path is the trickiest integration; de-
  risk by proving it with translate before adding rotate/scale.

### Phase C — Resize

**Goal:** edge/corner handles; opposite-edge/center anchoring;
aspect-lock.

- **Rust:** `GestureType::Resize { handle }`; map to
  `SetProperty{FrameBounds}`. Modifier handling (Alt = from center,
  Shift = lock aspect) in `update_gesture`.
- **TS:** `Overlay.tsx` renders the 8 handles on the selection box;
  pointerdown on a handle begins a `Resize` gesture (handle identity
  passed through).
- **ACs:** AC-E-14.
- **Effort:** M. **Risk:** low — reuses Phase B's spine + existing
  `FrameBounds`.

### Phase D — Rotate + scale

**Goal:** rotation handle + scale handles; the first transforms that
need the new `FrameTransform` Operation.

- **Rust:** `PropertyPath::FrameTransform` + `Value::Transform`
  (§3.2). `GestureType::Rotate { pivot }` and `Scale { pivot,
  lock_aspect }`; pivot = selection-box center by default. 15° snap on
  Shift for rotate. Resolve the resize-vs-scale semantics for text
  frames (§8) before shipping scale.
- **TS:** rotation handle above the selection box; scale via corner
  handles in a scale mode (or modifier). Overlay shows the rotated
  selection box + an angle readout.
- **ACs:** AC-E-15, AC-E-6 fully satisfied.
- **Effort:** M–L. **Risk:** medium — pivot math + the text-frame
  scale-vs-resize decision.

### Phase E — Multi-select transforms, snapping, modifiers

**Goal:** transform a whole selection rigidly; snap to guides; the
standard creative-tool modifier conventions.

- **Rust:** gestures accept N nodes; commit as `Operation::Batch`. A
  snapping pass in `update_gesture` (snap to page edges, frame edges,
  centers, and a small set of smart guides) returning snap lines for
  the overlay. Alt-drag = duplicate (Batch of Insert + transform).
- **TS:** marquee already feeds multi-selection (Phase A); overlay
  draws the union selection box + snap guide lines; modifier plumbing
  (Shift constrain, Alt duplicate).
- **ACs:** AC-E-16.
- **Effort:** L. **Risk:** medium — snapping is iterative-feel work.

### Phase F — Per-type manipulation (sketch only)

Deferred; listed so the spine is designed with them in mind.

- **Image** frames: content vs frame distinction (the
  `image_item_transform` already on `Rectangle`), fit/fill/crop, the
  content-grabber gesture.
- **Vector**: path-point editing — `GestureType::PathEdit
  { handle_index }`, correlated Bézier handles, using `subpath_starts`.

These reuse the same gesture spine + overlay; no new architecture.

---

## 8. Open design decisions (resolve before the relevant phase)

1. **Resize vs scale for text frames (Phase C/D).** InDesign
   distinguishes *resizing* a text frame (bounds change → text reflows)
   from *scaling* it (matrix scale → glyphs scale, no reflow). v1
   recommendation: edge/corner handles = **resize** (bounds, reflow)
   for text frames and rectangles; matrix **scale** is a distinct mode
   (e.g. Cmd-drag or the scale tool) and is the only path that touches
   `FrameTransform`'s `a/d`. Decide and document per
   `CLAUDE.md`'s "pick one consciously" rule.
2. **Mutation-log convergence (Phase B).** Bridge now (§3.5), full fold
   of `TextOp` into `paged_mutate::Operation` later. Confirm the unified
   `LoggedMutation` enum is acceptable as the interim shape.
3. **Move-via-bounds vs move-via-transform (Phase B/D).** Un-rotated →
   bounds; rotated → transform (§3.1). Confirm the renderer treats a
   frame with both a non-identity `item_transform` and shifted bounds
   correctly (it should — that's how IDML files arrive).
4. **Group transforms (Phase A.1/E).** Selection can *read* into groups
   before `apply.rs` can *mutate* group children. Decide whether
   editing inside groups is in-scope for this plan or deferred with the
   other `apply.rs` Stage-1 expansions (Oval/Polygon/GraphicLine).
5. **Snapping source (Phase E).** Where guide candidates come from
   (page edges, margins, sibling frames, ruler guides) and the snap
   tolerance in screen px (zoom-dependent) vs document pt.

---

## 9. Test strategy

- **Rust unit (`cargo test -p paged-canvas`, `-p paged-mutate`):**
  oriented hit-testing (AC-E-12), gesture math (translate/resize/rotate
  produce the asserted bounds/matrix), commit→Operation→inverse
  round-trips (AC-E-8), zoom-independence by running the same
  document-space gesture under different cameras (AC-E-9), Batch
  atomicity for multi-select.
- **Determinism (AC-E-7):** record a gesture-commit log, replay against
  a fresh `CanvasModel`, compare a state hash.
- **Playwright (`apps/canvas/tests/`):** the existing harness drives
  the real worker. Add interaction specs — click-select, marquee,
  drag-move, handle-resize, rotate — asserting overlay geometry and
  post-commit document state via the channel.
- **No fidelity-gate impact:** these are interaction tests; they don't
  touch `corpus/generated/diff.sh`. Keep it that way (don't let a
  gesture change alter a pinned render).

---

## 10. The toolbox (deferred; thin harness only now)

The user asked whether the shell's "first part" includes an
InDesign-style toolbox. Architecturally (`editor-architecture.md`):

- The **shell** owns the toolbox *container*, the tool registry, the
  active-tool application state, keybindings (V/T/H), and pointer
  routing — but it ships **empty**.
- Individual **tools** (`select.tool`, `text.tool`, …) are **bundle
  contributions**, arriving in the shell's Step 7 (`paged.selection`,
  `paged.transform`, `paged.text`).

So a real toolbox depends on the tool/bundle system, which depends on
the gesture primitives in this plan. The dependency order is: **Rust
primitives (this plan) → gesture bridge → tools that drive gestures →
toolbox UI to switch them.** For now, `apps/canvas` should carry only a
**thin throwaway tool toggle** (select ⇄ text) in `CanvasApp.tsx` to
exercise the primitives — explicitly *not* the shell toolbox, and not a
1:1 InDesign clone (keep recognizable conventions: V/T/H, left vertical
placement, Shift-constrain, Alt-duplicate; drop the 30-tool sprawl and
Adobe chrome).

---

## 11. Risks

- **Overlay→render compose path (Phase B)** is the highest-risk
  integration. Mitigation: prove it with translate (trivial geometry)
  before rotate/scale; re-emit only the affected page.
- **The log fork (§3.5)** touches `CanvasModel`'s undo path used by
  text editing. Mitigation: the `LoggedMutation` enum keeps the text
  path byte-identical; cover with the existing text undo tests + new
  frame undo tests in one run.
- **Hit-testing z-order** must match the renderer's paint order exactly
  or selection will feel wrong. Mitigation: source the layer-aware order
  from `pipeline.rs`'s `layer_z_index` (§5 #2 / §5.1), not a parallel
  ordering.
- **Scope creep into the shell.** This plan is deliberately
  shell-independent. Resist building bundle/tool infrastructure here —
  the thin tool toggle is the only TS-side concession.

---

## 12. Sequenced checklist

- [ ] **A** Element selection set + worker mirror + oriented hit-test +
      layer-aware z-order + hidden/locked-layer gating (§5.1); marquee.
      (AC-E-10/11/12)
- [ ] **B** `paged-mutate` bridge + unified undo log; `gesture.rs` +
      ephemeral overlay; translate end-to-end. (AC-E-13, AC-E-7/8)
- [ ] **C** Resize handles + anchoring + aspect-lock. (AC-E-14)
- [ ] **D** `FrameTransform` Operation; rotate + scale; resize-vs-scale
      decision. (AC-E-15, AC-E-6)
- [ ] **E** Multi-select Batch transforms; snapping; modifiers. (AC-E-16)
- [ ] **F** (later) image fit/crop; vector path-point editing.
- [ ] Group descent + group transforms (slot into A.1 / E per §8.4).
- [ ] Full `TextOp` → `paged_mutate::Operation` convergence (separate
      effort, post-plan).
