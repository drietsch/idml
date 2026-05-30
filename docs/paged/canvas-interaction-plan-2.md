# Canvas Interaction Plan — Part 2 (post-H deferred work)

*Follow-up to `canvas-interaction-plan.md` and the Phase A–H landings
(`docs/paged/` history). Phases A–H shipped the gesture spine
(selection, marquee, oriented hit-testing, translate, resize, rotate,
scale, snap, multi-select union handles, image content gestures,
Alt-duplicate, vector path-point editing at the Rust/mutate layer) +
zoom-aware snap + group-leaf descent. This document is the
**actionable backlog** for everything we deliberately deferred.*

*Scope note: same as plan 1 — renderer/scene-graph + canvas-app
layer. Below the shell/bundle architecture. Builds on the existing
`NodeSnapshot` / `NodeMutation` / `GestureSession` primitives without
adding new mechanism unless explicitly called out.*

---

## 0. Where this sits

Plan 1 (§A–F) defined the gesture spine and the in-document
interaction primitives. Plan 1 §E and the implementation's Phase G/H
added snap, modifier conventions, multi-select handles, image content
gestures (translate / rotate / scale), Alt-duplicate, and the
Rust/mutate layer for vector path-point editing.

What's missing from the user-facing canvas is split across five
self-contained tracks:

| Track | Title | One-line summary |
|---|---|---|
| **I** | Path-edit mode + handles UI | The Rust layer for path-point dragging ships in Phase H.5; the on-canvas anchor + Bezier-handle chrome and the "path edit mode" toggle don't. |
| **J** | Path topology — add / delete / toggle curve type | H.5 drags existing path points. Adding / removing anchors and toggling smooth-vs-corner are separate mutate operations. |
| **K** | Cross-spread Alt-duplicate | Phase H.4's `CloneTranslate` inserts into the source's host spread. Drag-duplicating across pages / spreads needs a separate path. |
| **L** | Group transform | Translating a "selected group" today moves each leaf — visually correct, but the group's own `<Group ItemTransform>` doesn't change, so reserialization loses the group structure. |
| **M** | Layers panel + layer operations | Visibility / lock toggles are already read by hit-testing (Phase A §5.1); the **write** side and the panel UI are not yet wired. |

Plus a track **N — smaller polish** for items that don't merit their
own phase but are individually visible (modal group context, ruler
guides, smart-alignment guides, cursor affordances, tool-toolbox
expansion).

Tracks I–N can land **independently** and in any order; the
dependencies are minimal. Recommended sequencing is at the end of
this document.

---

## 1. What shipped in Phases A–H (one-liners, for the reader)

- **A** — Element selection + oriented hit-test + marquee + layer
  visibility/locked gating + group descent (hit-test returns leaf +
  `group_chain`).
- **B** — Gesture spine (`begin/update/commit/cancel`), `idml-mutate`
  bridge, unified `LoggedMutation` undo log, translate via
  `SetProperty{FrameBounds}`.
- **C** — 8 resize handles, opposite-edge / center-anchor / aspect-
  lock modifiers.
- **D** — `PropertyPath::FrameTransform` + `Value::Transform`, rotate
  (Shift snaps to 15°), scale (Shift locks aspect), rotated-frame
  translate via FrameTransform tx/ty, rotation handle.
- **E** — Snap (page edges + sibling frames + centres) with snap
  lines, Shift-constrain translate, multi-select Batch commit.
- **F** — Image content gesture (`TranslateContent`, edits
  Rectangle's `image_item_transform`).
- **G** — Rotated-frame resize (inverse-rotate the delta through the
  frame's linear part), rotated-frame `TranslateContent`,
  `RotateContent` / `ScaleContent`, zoom-aware snap tolerance,
  multi-select union handles (corner → matrix Scale, rotation handle
  → Rotate).
- **H** — Per-page snap targets (multi-page selections); content-
  grabber visual hint; group descent via double-click; Alt-duplicate
  via `NodeSpec::CloneTranslate`; vector path-point Rust layer
  (`PropertyPath::FramePathPoint`, `PathPointAddress`,
  `GestureType::PathEdit`).

---

## 2. Architectural commitments (carried forward)

These haven't changed from `canvas-interaction-plan.md` §2 and govern
every track below:

- **Gesture geometry stays in Rust.** TS receives pointer events,
  decides the active tool + what was hit, calls
  `begin/update/commit/cancel`, draws the overlay chrome.
- **Application state ≠ document state.** Selection, active tool,
  active group context, marquee rect, in-flight gesture overlay all
  live in app state. Document state changes only via Operations.
- **One Cmd-Z timeline.** Tracks I/J/K/L/M all log through
  `idml_mutate::apply` and end up on the unified `LoggedMutation`
  log. No track introduces a parallel mutation path.
- **Coordinate spaces.** Hit-testing, gesture deltas, and overlay
  handles operate in spread / document pt; viewport conversion is at
  draw time only. Frame-inner deltas are derived via
  `inverse_rotate_delta` (Phase G/H pattern).
- **Snap, modifiers, and union handles are gestures' concerns.**
  Every track that adds a new gesture variant reuses the
  `compute_node_mutation` dispatch, `NodeMutation` enum, snap pass,
  and union-handle rendering. No track sprouts its own pointer
  pipeline.

---

## 3. Track I — Path-edit mode + handles UI

**Goal:** when a Polygon is selected and the user enters "path edit
mode", the overlay renders each anchor + its left/right Bezier
handles; clicking an anchor or handle drags it via the existing
`GestureType::PathEdit` (already wired at the Rust layer in Phase
H.5). Mirrors InDesign's Direct Selection / Pen Tool affordance.

### 3.1 Application-state additions

- `activeTool: 'select' | 'text' | 'pathEdit'` (extend the existing
  V / T toggle to V / T / P).
- `pathEditTargetId: ElementId | null` — the polygon currently being
  edited. Single-element only for v1; multi-polygon path edit is
  Track-J-or-later scope.

### 3.2 Channel additions

- New `MainToWorkerKind::RequestPathPoints { id: ElementId }` →
  `WorkerToMainKind::PathPoints { items: Vec<PathPointGeometry> }`,
  where each `PathPointGeometry` carries the anchor + left + right
  in page-local pt (transformed through `item_transform`) plus the
  flat anchor `index` and per-subpath membership for the overlay's
  rendering (so it can draw the subpath outlines separately).
- The `Polygon`'s `anchors` already lives in idml-parse; the
  model-side `path_point_geometry(id)` walks `polygon.anchors`,
  composes with the spread origin + page lookup, returns the
  flat list.

### 3.3 Overlay chrome (TS)

When `activeTool === 'pathEdit'` and `pathEditTargetId` is a
selected Polygon:

- Hide the normal selection chrome + Phase C resize handles + Phase
  D rotation handle. Path-edit mode replaces them.
- Render the polygon's subpath strokes (a polyline through the
  anchor positions) in a dimmed colour, just enough to remind the
  user what they're editing.
- For each anchor: render a filled square (5–6 CSS px) at the
  anchor position. Tagged `data-handle="path-anchor"`
  `data-index="<i>"`.
- For each anchor's two direction handles when they differ from
  the anchor: render a tether line from anchor → handle, plus a
  smaller round handle at the tip. Tagged `data-handle="path-left"`
  or `data-handle="path-right"` with the same `data-index`.
- All handles are inverse-scaled to stay constant in CSS px,
  identical to Phase C's resize handles.

### 3.4 Pointer routing (TS)

`ViewportCanvas.tsx` pointerdown reads `data-handle` + `data-index`:

- `data-handle === 'path-anchor'` →
  `client.beginGesture([targetId], { kind: 'pathEdit', address: { index, role: 'anchor' } })`.
- Similarly `'path-left'` / `'path-right'` → role `left` / `right`.
- Pointer events on the polygon body (when not on a handle) clear
  selection only — they do not start a Translate. (Path edit mode
  is exclusively for editing the path; the user exits the mode to
  translate.)

### 3.5 Entering / exiting path edit mode

- Double-click on a Polygon → enter mode + `pathEditTargetId = id`.
  (Reuses the existing double-click hit-test from Phase H.3 — the
  click handler checks the element kind before deciding "group" vs
  "path edit".)
- Pressing `Escape` or selecting another element → exit mode.
- Switching the V/T/P tool to V or T → exit mode.

### 3.6 Acceptance criteria

- **AC-I-1 Render.** Selecting a Polygon and entering path edit
  mode renders one handle per anchor + tethered direction handles
  for each non-degenerate Bezier control. Inverse-scaled at any
  zoom.
- **AC-I-2 Drag anchor.** Dragging an anchor moves the anchor and
  both handles by the same delta (Phase H.5 already implements
  this at the apply layer). Committed `PathAnchor.anchor` equals
  snapshot + delta within float tolerance.
- **AC-I-3 Drag handle.** Dragging a left or right handle moves
  only that handle; anchor + opposite handle stay put.
- **AC-I-4 Rotation-aware.** A rotated Polygon's anchors are still
  draggable in world space; the gesture inverse-rotates the delta
  through `item_transform` (already wired in Phase H.5's
  `compute_node_mutation`).
- **AC-I-5 Undo.** Cmd-Z restores the polygon's anchor array
  byte-for-byte (already covered by Phase H.5's integration tests).

### 3.7 Critical files

| File | Change |
|---|---|
| `crates/idml-canvas/src/channel.rs` | New `RequestPathPoints` + `PathPoints` envelopes; `PathPointGeometry` shape carrying page-local positions + per-subpath spans. |
| `crates/idml-canvas/src/model.rs` | `path_point_geometry(id) → Vec<PathPointGeometry>`. Walks `Polygon.anchors`, composes with `item_transform`, locates host page, returns page-local positions. |
| `crates/idml-canvas-wasm/src/lib.rs` | Match arm for `RequestPathPoints`. |
| `apps/canvas/src/channel/protocol.ts` | `PathPointGeometry` mirror; new `requestPathPoints` request kind + `pathPoints` reply. |
| `apps/canvas/src/channel/client.ts` | `pathPointGeometry(id)`. |
| `apps/canvas/src/ui/CanvasApp.tsx` | `activeTool` adds `'pathEdit'`; `pathEditTargetId` state; tool toggle button. |
| `apps/canvas/src/ui/Overlay.tsx` | `PathEditChrome` component (anchors + tethered handles + dimmed subpath strokes). |
| `apps/canvas/src/ui/ViewportCanvas.tsx` | Path-edit-mode dispatch: handle pointerdown → `pathEdit` gesture. |
| `apps/canvas/tests/path-edit.spec.ts` *(new)* | AC-I-1..5 via the dev hooks. |

### 3.8 Effort + risk

- **Effort.** M (3–6 days). The Rust layer is done; this is overlay
  chrome + routing + a new request envelope.
- **Risk.** Low. The Phase H.5 integration tests already lock down
  the math; new code is rendering + dispatch.

---

## 4. Track J — Path topology (add / delete / curve-type toggle)

**Goal:** full vector editing parity. Click-on-segment inserts an
anchor mid-segment; delete-with-Backspace removes the selected
anchor; double-click-on-anchor toggles smooth ↔ corner.

### 4.1 Operations

Three new `idml_mutate` operations, each on Polygon:

- `PropertyPath::PathPointInsert` + `Value::PathPointInsert { index, anchor: PathAnchor }`
  — inserts a new PathPoint at `anchor_index = index`. Inverse:
  `PathPointRemove { index }`.
- `PropertyPath::PathPointRemove` + `Value::PathPointRemove { index }`
  — removes the PathPoint at `index`. Inverse:
  `PathPointInsert { index, anchor: <captured PathAnchor> }`.
- `PropertyPath::PathPointCurveType` + `Value::Toggle(bool)` or a
  dedicated `Value::CurveType { smooth: bool }` — toggles a
  PathPoint between corner (Bezier handles equal to anchor) and
  smooth (handles symmetric about anchor). Inverse: the previous
  flag.

Implementation note: PathPointArray indices are flat across
subpaths. Insert + remove must update `subpath_starts` to keep the
contour boundaries correct. The apply layer's helpers maintain
that invariant.

### 4.2 Gestures (or click handlers)

These don't need new GestureType variants — they're one-shot
commits, not drags:

- **Insert.** Pointerdown on a path segment between two anchors in
  path-edit mode → compute the segment's parametric `t` at the
  click → emit `SetProperty{PathPointInsert, …}` with the
  computed `PathAnchor` (anchor at the click, left/right derived
  from de Casteljau).
- **Delete.** Backspace / Delete in path-edit mode with a selected
  anchor → emit `SetProperty{PathPointRemove, …}`.
- **Curve type toggle.** Double-click on an anchor → emit the
  toggle. Smooth ↔ corner.

### 4.3 Acceptance criteria

- **AC-J-1** Insert: clicking a segment adds one anchor at the
  click position; the path's visible shape is unchanged (the
  de-Casteljau split preserves the curve).
- **AC-J-2** Delete: removing an anchor shrinks the path's point
  count by 1; the remaining anchors stay put; the path's overall
  shape adapts (the segment between the two now-adjacent anchors
  uses their existing handles).
- **AC-J-3** Curve type toggle: smooth → corner zeroes the handles;
  corner → smooth derives handles from neighbour-segment tangents
  (standard 1/3-of-distance heuristic).
- **AC-J-4** Compound paths: subpath boundaries (`subpath_starts`)
  stay correct after every insert / remove. Compound polygons
  (e.g. donut shapes) keep their hole.
- **AC-J-5** Undo: every op round-trips bytewise.

### 4.4 Critical files

| File | Change |
|---|---|
| `crates/idml-mutate/src/operation.rs` | New `PropertyPath` variants + `Value` variants for insert / remove / toggle. |
| `crates/idml-mutate/src/apply.rs` | Three new apply arms for `(Polygon, PathPointInsert|Remove|CurveType)`. |
| `crates/idml-mutate/src/invert.rs` | Inverse paths for the three new ops. |
| `apps/canvas/src/ui/Overlay.tsx` | Segment hit zones for insert; selected-anchor highlight for delete. |
| `apps/canvas/src/ui/ViewportCanvas.tsx` | Path-edit-mode pointer routing for segment clicks, anchor double-clicks, Backspace. |
| `crates/idml-canvas/tests/path_topology.rs` *(new)* | AC-J-1..5 |
| `apps/canvas/tests/path-topology.spec.ts` *(new)* | UI-level smoke. |

### 4.5 Effort + risk

- **Effort.** L (1–2 weeks). The de-Casteljau split + smooth-curve
  handle derivation are the math-heavy bits; everything else is
  apply-arm plumbing.
- **Risk.** Medium. Compound-path bookkeeping (`subpath_starts`) is
  fiddly. Test against fixtures with holes and open subpaths.

---

## 5. Track K — Cross-spread Alt-duplicate

**Goal:** dragging an Alt-held selection from one spread (page) to
another commits the duplicate into the destination spread, not the
source's spread.

### 5.1 The current limitation

Phase H.4's `apply_insert_clone_translate` finds the source's host
spread and inserts there. The world-space delta is treated as a
spread-local shift. For a drag that crosses page boundaries, the
result is "duplicate on the source's spread with a delta that may
be larger than the source's spread, landing visually offscreen". The
user expects the duplicate to land on whatever page the pointer is
currently over.

### 5.2 Design

Extend `NodeSpec::CloneTranslate` with an optional
`destination_spread_id: Option<String>`. When `Some`, the apply
path:

1. Finds the source globally.
2. Deep-clones the source's parser struct.
3. Locates the destination spread by `self_id`.
4. Adjusts the bounds / transform so the duplicate lands at the
   correct page-local position on the destination. Two coord
   conversions:
   - World pointer position → destination page-local pt →
     destination spread-coord pt.
   - Source's bounds + transform → destination spread coords
     (subtract source spread origin, add destination spread origin
     before applying the per-element drag offset).
5. Inserts into the destination's appropriate per-kind vec.

When `None`, falls back to the Phase H.4 behavior (source spread).

The gesture spine grows a `host_spread_at(pointer)` resolution:
when the pointer leaves the source's spread, switch the duplicate's
destination_spread_id mid-update so the preview tracks where the
release will land.

### 5.3 Acceptance criteria

- **AC-K-1** Drag-duplicate within the same spread: behaves
  identically to Phase H.4 (no regression).
- **AC-K-2** Drag-duplicate crossing into a different spread: the
  duplicate appears on the destination spread at the pointer's
  page-local position. Original stays on the source spread
  unchanged.
- **AC-K-3** Preview: `update_gesture` reflects the destination
  switch live — the user sees the ghost frame "jump" onto the new
  spread once the pointer crosses.
- **AC-K-4** Undo: single Cmd-Z removes the duplicate regardless of
  spread; subsequent redo re-creates on the correct spread.

### 5.4 Critical files

| File | Change |
|---|---|
| `crates/idml-mutate/src/operation.rs` | `NodeSpec::CloneTranslate` gains `destination_spread_id: Option<String>`. |
| `crates/idml-mutate/src/apply.rs` | `apply_insert_clone_translate` handles the cross-spread case. |
| `crates/idml-canvas/src/gesture.rs` | Update / commit resolve the destination spread per the current pointer position. |
| `apps/canvas/tests/cross-spread-duplicate.spec.ts` *(new)* | AC-K-1..4 via the dev hooks. |

### 5.5 Effort + risk

- **Effort.** M (3–6 days).
- **Risk.** Low. The hardest bit is the destination-resolution
  on pointer move; the apply path is a straightforward extension.

---

## 6. Track L — Group transform (mutable Group `ItemTransform`)

**Goal:** when the user selects a Group and rotates/scales it, the
**Group's own** `<Group ItemTransform>` changes — not just its
leaves. Reserialization preserves the group structure with its
transform attribute intact.

### 6.1 The current limitation

Phase H.3 implements double-click-to-enter-group by replacing the
element selection with the group's leaves. Subsequent gestures
operate on each leaf independently. For translate this is fine
(rigid leaf-translation is indistinguishable from group-translate
in render output). For rotate/scale it visually works because each
leaf gets the same rotation about the same pivot — but the leaves'
transforms diverge from the group's, and the next reserialization
no longer reflects a single grouped transform.

Note: parser comment in `spread.rs:141-144` says "group members'
transforms already compose the group's transform" — so the leaves
were *baked* on parse. Track L mutates the **group's**
`ItemTransform` and rebases the leaves accordingly.

### 6.2 Design

Two paths:

**Path A — group-level operation.** Add `NodeId::Group` support to
`apply.rs` for `FrameTransform` (and the future Group-level
`FrameBounds`). The apply layer mutates the Group's
`item_transform` AND rebases each leaf's transform so the rendered
output is unchanged from the user's perspective (since the leaf
transforms include the group's transform pre-baked, mutating only
the group would visually shift everything).

The rebase: if the old group transform is `G`, the new is `G'`, then
each leaf's effective composition was `M_leaf` where
`M_leaf = G * L_leaf_local`. We want `M_leaf' = G' * L_leaf_local`, so
`M_leaf' = G' * inv(G) * M_leaf`. Each leaf's `item_transform`
becomes `G' * inv(G) * old_item_transform`.

For un-rotated groups this is identity-on-identity, no change. For
rotate/scale, the leaves get the inverse of the old rotation +
the new rotation composed in.

**Path B — alternative: store the group transform separately + apply
at render time.** Less invasive but means the renderer needs to
know about "group context" when emitting commands, which is a
bigger architectural shift. Path A is preferred.

### 6.3 Active group context

The double-click descent from H.3 expanded to leaves; we'd extend
it with a "modal active group" application state:

- `activeGroup: ElementId | null` — when set, selection lives inside
  the group; pointerdown on a non-member clears + exits.
- Selecting the group itself (single-click on a leaf when no active
  group is set) selects the **outermost** containing group → the
  group itself becomes `elementSelection = [groupId]`.
- Double-click → enter the group → `activeGroup = groupId`,
  `elementSelection = [hitLeaf]`. Subsequent clicks scope to the
  group's leaves.
- Escape exits the active group.

### 6.4 Acceptance criteria

- **AC-L-1 Single-click selects group.** Clicking inside a grouped
  frame selects the outermost containing group (was: selected the
  leaf in Phase H.3). Behavior change; gate behind a feature flag
  if needed for smooth migration.
- **AC-L-2 Translate group.** Translating a group-selected element
  shifts the group's `item_transform.tx/ty` + rebases leaves;
  reserialization preserves the group.
- **AC-L-3 Rotate group.** Rotating about the group's centroid
  mutates `Group.item_transform`'s 2×2 part; leaves' transforms
  are correctly rebased so the rendered output matches.
- **AC-L-4 Enter group → edit leaf.** Double-click descends;
  subsequent clicks select within the group; Escape exits.
- **AC-L-5 Undo.** Group transforms round-trip on Cmd-Z; the
  leaves' transforms are restored along with the group's.

### 6.5 Critical files

| File | Change |
|---|---|
| `crates/idml-mutate/src/apply.rs` | New apply arms for `(Group, FrameBounds)`, `(Group, FrameTransform)` that mutate the Group + rebase leaves. |
| `crates/idml-canvas/src/gesture.rs` | `snapshot_for` handles `ElementId::Group(_)`, capturing both the Group transform and every leaf's transform for the rebase. |
| `apps/canvas/src/ui/CanvasApp.tsx` | `activeGroup` state; double-click handler updates it. |
| `apps/canvas/src/ui/ViewportCanvas.tsx` | Pointer routing scopes hit-tests to `activeGroup`'s leaves when set. |
| `crates/idml-canvas/tests/group_transform.rs` *(new)* | AC-L-1..5 |
| `apps/canvas/tests/group-transform.spec.ts` *(new)* | UI-level smoke. |

### 6.6 Effort + risk

- **Effort.** L (1–2 weeks). The rebase math is well-defined but the
  active-group modal state cuts across several files.
- **Risk.** Medium. AC-L-1 changes default click semantics; users
  who got used to "click → leaf" will notice. Phase 1 of the rollout
  can keep H.3's behavior (click = leaf, double-click = group)
  and add an explicit "select parent group" affordance instead of
  flipping the default.

---

## 7. Track M — Layers panel + layer operations

**Goal:** a panel that lists every `<Layer>` from the IDML, exposes
visibility / lock / printable toggles, supports renaming and
reordering, and lets the user move items between layers. This is
the missing **write** side of Phase A's `paged.layers` read-side
gating.

### 7.1 New operations

`idml-mutate`:

- `PropertyPath::LayerVisible` + `Value::Toggle(bool)` on
  `NodeId::Layer(self_id)`. Apply mutates
  `DesignMap.layers[i].visible`.
- `PropertyPath::LayerLocked` + same.
- `PropertyPath::LayerPrintable` + same.
- `PropertyPath::LayerName` + `Value::Text(String)`.
- `Operation::MoveLayer { layer_id, new_index }` for reordering.
- `PropertyPath::ItemLayer` (on `NodeId::TextFrame|Rectangle|...`)
  + `Value::Text(layer_self_id)` for re-assigning items.
- `Operation::InsertLayer { position, name }` /
  `Operation::RemoveLayer { layer_id }` for adding / deleting layers.

Each op captures its inverse in the standard way.

### 7.2 Channel additions

- `RequestLayers` → `Layers { items: Vec<LayerSummary> }` where
  `LayerSummary { self_id, name, visible, locked, printable, z }`.
- A worker subscription notification `LayersChanged` fires after
  every layer-affecting mutation so the panel re-renders.

### 7.3 Panel UI

- New `apps/canvas/src/ui/LayersPanel.tsx`. Reads layers via
  `client.requestLayers()`. Each row shows: visibility eye icon,
  lock icon, printable icon, name (editable on double-click), drag
  handle.
- Click toggles fire the matching `SetProperty` op via
  `client.mutate(...)`.
- Drag-reorder uses HTML5 drag/drop within the panel; on drop emits
  `MoveLayer`.
- Item-to-layer reassignment: drag an item's row from the layers
  panel (when the layer is expanded) — out of scope for v1; v1
  exposes only layer-level controls.

### 7.4 Acceptance criteria

- **AC-M-1 List.** Panel lists every IDML layer in top-first order
  matching `designmap.layers`.
- **AC-M-2 Visibility toggle.** Clicking the eye flips
  `layer.visible`; the canvas re-renders (the renderer's existing
  visibility predicate already honors this).
- **AC-M-3 Lock toggle.** Clicking the lock flips `layer.locked`;
  the canvas's hit-test (Phase A §5.1) immediately stops returning
  items on the now-locked layer.
- **AC-M-4 Rename.** Double-click renames the layer in place;
  committed name persists through reserialization.
- **AC-M-5 Reorder.** Drag-reordering changes the layer's z-order;
  the renderer's `layer_z_index` (from Phase A.0's shared helper)
  re-reads on next build and paints accordingly.
- **AC-M-6 Add / Delete.** "+" button adds a new layer below the
  selection; trash icon removes (with confirm if any items
  reference it).
- **AC-M-7 Undo.** Every layer op round-trips on Cmd-Z.

### 7.5 Critical files

| File | Change |
|---|---|
| `crates/idml-parse/src/designmap.rs` | `Layer` already has the fields; ensure they're `pub` for mutate access. |
| `crates/idml-mutate/src/operation.rs` | `NodeId::Layer(String)` variant; new property paths + value variants; `MoveLayer` / `InsertLayer` / `RemoveLayer` ops. |
| `crates/idml-mutate/src/apply.rs` | Apply arms for each new path / op. |
| `crates/idml-canvas/src/channel.rs` | `RequestLayers` + `Layers` envelopes; `LayersChanged` notification. |
| `crates/idml-canvas/src/model.rs` | `layers() → Vec<LayerSummary>` accessor; firing `LayersChanged` after layer-affecting mutations. |
| `apps/canvas/src/ui/LayersPanel.tsx` *(new)* | Panel component. |
| `apps/canvas/src/ui/CanvasApp.tsx` | Wire panel + subscribe to `LayersChanged`. |
| `apps/canvas/tests/layers-panel.spec.ts` *(new)* | AC-M-1..7. |

### 7.6 Effort + risk

- **Effort.** L (1–2 weeks). Multiple new ops + a real panel UI.
- **Risk.** Medium. Layer reorder needs `layer_z_index` re-read on
  the next render — verify the renderer picks it up without an
  explicit cache flush (Phase A.0 lifts it into a per-build call,
  so it does, but worth a unit test).

---

## 8. Track N — Smaller polish

Items that are individually small but visible. Group them however
suits the team's pace; none are blocking each other.

### 8.1 Modal group context

Distinct from H.3's "double-click → expand to leaves". Track L's
AC-L-4 covers this fully; if Track L is deprioritized, N.1 can ship
the modal-state piece alone without the Group-transform math (i.e.
double-click enters the group, subsequent clicks scope to leaves,
Escape exits — but rotate/scale still mutates leaves, not the
group).

### 8.2 Smart-alignment guides

Like InDesign's "Smart Guides". During a translate gesture, render
green guide lines when the moving frame's edge or centre aligns
with another frame's edge or centre (not just snap targets — pure
visual hint). Reuses the snap targets from Phase E/H.1; surface
**all** targets within tolerance, not just the closest. **Effort:** S.

### 8.3 Ruler guides

IDML files declare ruler guides (`<Guide>` elements). The parser
extracts them; the canvas overlay should render them, and the snap
pass should treat them as snap targets alongside page edges. **Effort:** M.

### 8.4 Constraint modifiers polish

Current modifier conventions:

- Shift constrains translate to dominant axis, snaps rotate to 15°,
  locks aspect on resize/scale.
- Alt resizes/scales from centre; alt-drag duplicates (Phase H.4).
- Cmd toggles selection on click; Cmd+corner-drag = matrix scale on
  resize; Cmd+body-drag = TranslateContent on image frames.

**Gaps:**

- No "snap-disable" modifier — InDesign uses Ctrl to temporarily
  disable snap. Wire `e.ctrlKey` (separately from `e.metaKey`) →
  pass `disable_snap: true` to `update_gesture` (new
  `GestureModifiers` field). **Effort:** S.
- Shift+rotate currently snaps to 15°; expose a setting for the
  snap step (rare but creative-tool standard). **Effort:** S.

### 8.5 Cursor affordances

Beyond Phase H.2's content-grabber donut:

- Hover-over-handle changes cursor to the handle's
  `ns-resize`/`ew-resize`/`nesw-resize`/`nwse-resize`/`grab`
  (already in place from Phase C/D).
- Cmd-hover on an image-bearing Rectangle's body changes the
  cursor to a "grab content" donut so the user knows Cmd+drag is
  available — currently the donut is permanent (Phase H.2) and
  doesn't follow the Cmd state. **Effort:** S.
- Path-edit-mode cursor over a polygon path segment: pen+ for
  insert, pen− over an anchor for delete, etc. **Effort:** S.

### 8.6 Tool registry foundation

Plan 1 §10 deferred the toolbox. As tracks I + M add tools (P for
path-edit, the Layers panel), the V/T/P/H toggle starts to feel
permanent. A tiny step toward the bundle-system toolbox is a
**tool registry** in app state: `tools: Tool[]` with a
`{ key, label, shortcut, accepts: (gesture) => boolean }` shape.
The header chrome renders them as buttons. Still no bundle system —
just the type that one will plug into later. **Effort:** S.

### 8.7 Group transform without modal mode

If Track L's modal "active group context" is heavy, ship a
narrower version: single-click on a leaf with a non-empty
`group_chain` selects the **outermost group** (changes selection,
no mode flip). Subsequent translate/rotate/scale uses the group's
own `ItemTransform`. The user never "enters" the group; they only
ever interact with the whole group. **Effort:** M (≈ Track L
minus the modal state).

---

## 9. Open design decisions

Resolve before the relevant track starts.

1. **Layer ordering on the wire.** `designmap.layers` is parsed
   top-first. The Layers panel renders top-first too. Move-layer
   ops use the **rendered** index (0 = topmost). Confirm no
   reverse-order surprises in tests.
2. **Path-point smooth-vs-corner heuristic.** When toggling
   corner → smooth, derive handles from neighbour distances by what
   fraction? Adobe uses ~1/3. Document the choice in
   `PathPointCurveType`'s apply comment.
3. **Cross-spread Alt-duplicate cursor feedback.** While dragging
   across spreads, does the preview frame "snap" to the new spread
   only when the pointer fully crosses, or progressively? v1
   recommends "fully cross" — atomic switch.
4. **Group-vs-leaf default selection (AC-L-1).** Changing
   single-click semantics is a UX shift. Recommendation: gate
   behind a setting "Select group on single click" defaulting OFF;
   the existing H.3 double-click stays as the fast path.
5. **Layer panel item dragging.** v1 supports layer-level
   reordering only. Item-to-layer drag (changing `ItemLayer` by
   dragging a frame's row into a different layer) is v2.
6. **Smart guides density.** All-or-only-aligned-edges? Snap
   adjusts a single member; smart guides could draw guides for
   every aligned member. Recommend: surface guides only for the
   chosen snap targets per axis (one X guide + one Y guide per
   update, max) so the screen stays readable.

---

## 10. Test strategy

Same pattern as Phases A–H — Rust unit + integration for the apply
& gesture math, Playwright for the UI-level flows.

- **Rust unit** (`cargo test -p idml-mutate -p idml-canvas`):
  - Track I: model-side `path_point_geometry(id)` returns
    correct page-local positions for un-rotated + rotated polygons.
  - Track J: insert / remove / curve-type toggle apply paths;
    `subpath_starts` invariant after every op; compound paths.
  - Track K: `apply_insert_clone_translate` cross-spread routing.
  - Track L: Group transform with leaf rebase preserves rendered
    output. Hash the document's resolved geometry before/after to
    prove the rebase is correct.
  - Track M: every layer op + inverse; rename round-trips through
    serde.

- **Playwright** (`apps/canvas/tests/<track>.spec.ts`):
  - Track I: path-edit-mode entry, handle drag, undo. Use the
    `square-catalog-brochure-template` pack (image-heavy + has
    polygon shapes).
  - Track J: click-segment-add, Backspace-delete, double-click
    toggle.
  - Track K: drag a frame across spread boundary, assert the
    duplicate lands on the destination spread.
  - Track L: rotate a group; assert the Group's `ItemTransform`
    changed and the rendered output matches an expected reference
    image (the existing fidelity suite is the right grader).
  - Track M: panel renders, toggles fire mutations, undo reverts.

Estimate: ~5–10 new Playwright specs total across the five tracks.

---

## 11. Risks

- **Track L's leaf-rebase determinism.** Floating-point round-trips
  through matrix multiplication can drift. The Rust-unit test must
  hash the document's resolved geometry; if drift is real, the
  apply layer should snap to a canonical representation (e.g.,
  rounding tx/ty to a small grid) so subsequent group transforms
  don't accumulate noise.
- **Track J's segment hit zones.** Clicking *near* a segment vs *on*
  a segment is an ambiguity. Use a 6-CSS-px tolerance + draw the
  segment hit zone slightly thicker than the visible stroke so the
  user has a clear target.
- **Track M's reorder visual feedback.** Drag-reordering inside a
  React panel with smooth transitions is non-trivial. A simple
  drop-line indicator + immediate commit-on-drop is the v1
  baseline; animation is v2.
- **Track K's destination-resolution races.** The pointer may cross
  a spread boundary multiple times during a single drag. The
  destination_spread_id needs to track the current pointer; each
  `update_gesture` re-resolves. Make sure the preview snapshot's
  bounds shift correctly per destination — store the
  destination-spread's spread_origin separately for the math.

---

## 12. Sequenced checklist

A pragmatic order, low → high risk:

- [ ] **N.6 Tool registry foundation.** Quickest unlock; everyone
      else benefits. 0.5 day.
- [ ] **Track I.** Path-edit handles + mode toggle. The Rust layer
      is already shipped; this is pure UI. ~1 week.
- [ ] **Track K.** Cross-spread Alt-duplicate. Self-contained;
      builds on H.4. ~1 week.
- [ ] **N.2 Smart-alignment guides.** Cosmetic but high impact.
      ~2 days.
- [ ] **N.5 Cursor affordances.** Wraps up Phase H.2 + adds the
      Cmd-hover state. ~2 days.
- [ ] **Track M.** Layers panel. Long-tail but unblocks
      `paged.layers`. ~2 weeks.
- [ ] **Track J.** Path topology ops. Math-heavy. ~1.5 weeks.
- [ ] **Track L.** Group transform. Touches multiple files + UX
      shift in AC-L-1. ~2 weeks.
- [ ] **N.3 Ruler guides.** Once the layers/panels infrastructure
      exists. ~1 week.
- [ ] **N.4 Snap-disable modifier + step setting.** Catch-all
      polish; do alongside any track that touches snap. ~1 day.

Total estimated work: ~10 weeks of focused effort for the full
backlog. Tracks I + K + N.2 + N.5 + N.6 form a "next sprint"
shipping the highest user-visible wins for ~3 weeks.

---

## 13. What's still out of scope after Plan 2

These belong to **higher** layers, not this plan's canvas-app
layer:

- **The shell + bundle/tool registry.** Plan 1 §10 punted; the
  V/T/P toggle stays minimal until the shell lands. N.6's tool
  registry is the bridge but stops short of the registry being
  bundle-loaded.
- **Live collaboration / multi-user gestures.** The Operation log
  is replayable; a collaborative replication layer would consume
  it but is its own pass.
- **Performance optimization for Phase B's per-update rebuild.**
  Plan 1 §3.4 documents the v2 ephemeral overlay + per-page
  compose hook. Phase B's full-rebuild path works fine for ≤ 5-page
  packs, slows on bigger ones. Worth a dedicated perf pass once
  the editor has more day-to-day mileage.
- **Multi-language / IME for canvas text editing.** Inherited from
  Phase 1's text path; not a gesture-spine concern.
- **Print / export pipeline.** Mutations land back in the document;
  reserialization to IDML/PDF for export is outside the gesture
  spine.
