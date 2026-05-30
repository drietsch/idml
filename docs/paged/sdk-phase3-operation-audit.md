# Paged SDK — Phase 3 Operation-Layer Audit

**Status:** Reference. Audit conducted against HEAD `ae5bc0d` (read-only).
**Owner of follow-through:** Phase 3 critical-path work, per `docs/paged/sdk-implementation-plan.md` §3d.
**Purpose:** Map every Phase 3 + Phase 5 panel field onto the existing `PropertyPath` / `Value` / apply-arm / snapshot surface so the gaps are known before Phase 3 starts. Per `sdk.md` invariant 8 ("panel friction is specification"), Phase 3 does not close while a panel papers over a missing Operation.

The relevant gap-anticipation note in the plan is §3d: the plan explicitly flags `CharacterFontSize | CharacterLeading | CharacterTracking | CharacterFillColor` and `MovePage` as needing verification. This audit goes wider — every panel the plan names plus the Phase 5 panels.

---

## 1. Current `PropertyPath` variants

All in `crates/idml-mutate/src/operation.rs:89-156`. **15 variants total.**

- **`FrameBounds`** — `[top, left, bottom, right]` geometric bounds. (op.rs:91)
- **`FrameFillColor`** — swatch self_id ref; `None` = no fill. (op.rs:94)
- **`FrameStrokeColor`** — swatch self_id ref. (op.rs:96)
- **`FrameStrokeWeight`** — pt; `None` = inherit doc default. (op.rs:100)
- **`FrameOpacity`** — percent 0..=100; `None` = inherit doc default. (op.rs:105)
- **`FrameTransform`** — 2D affine `[a,b,c,d,tx,ty]`; `None` = identity. (op.rs:111)
- **`ImageContentTransform`** — Rectangle's inner `<Image>` ItemTransform. (op.rs:117)
- **`FramePathPoint`** — one Bezier handle on a path-bearing element. (op.rs:122)
- **`PathPointInsert`** — Track J insert anchor at flat index. (op.rs:128)
- **`PathPointRemove`** — Track J remove anchor at flat index. (op.rs:134)
- **`PathPointCurveType`** — Track J corner/smooth toggle. (op.rs:140)
- **`LayerVisible`** — Track M layer visibility flag. (op.rs:146)
- **`LayerLocked`** — Track M layer lock flag. (op.rs:150)
- **`LayerPrintable`** — Track M layer printable flag. (op.rs:153)
- **`LayerName`** — Track M layer rename. (op.rs:155)

There is no `Character*` path, no `Paragraph*` path, no `BlendMode`, no `DropShadow*`, no `StrokeDashPattern`/`StrokeAlignment`/`StrokeLineCap`/`StrokeLineJoin`/`StrokeMiterLimit`, no `FillTint`/`StrokeTint`, no `Locked` (page-item lock), no `Page*` paths.

## 2. Current `Value` variants

All in `crates/idml-mutate/src/operation.rs:248-316`. **9 variants total.**

- **`Bounds([f32; 4])`** — frame bounds. (op.rs:249)
- **`ColorRef(Option<String>)`** — swatch self_id ref. (op.rs:250)
- **`Length(Option<f32>)`** — single float, unit implicit per property. (op.rs:256)
- **`Transform(Option<[f32; 6]>)`** — 2D affine. (op.rs:261)
- **`PathPoint { address, position }`** — addressed handle move. (op.rs:265)
- **`PathPointInsert { index, anchor, prev_subpath_starts }`** — Track J insert payload. (op.rs:280)
- **`PathPointRemove { index, prev_subpath_starts }`** — Track J remove payload. (op.rs:291)
- **`PathPointCurveType { index, smooth, prev }`** — Track J curve-type toggle payload. (op.rs:303)
- **`Bool(bool)`** — layer flags. (op.rs:312)
- **`Text(String)`** — layer name. (op.rs:315)

There is no enum-string variant (no `Value::Enum`), no `Value::FloatArray`, no shadow/effect payload, no `Value::Color { rgb/cmyk }` struct (only swatch refs).

## 3. Apply-arm coverage

Every `PropertyPath::*` arm traced from `crates/idml-mutate/src/apply.rs`. The inverse is computed via `invert_set_property` (which simply wraps the `previous_value` returned by each apply arm — see `crates/idml-mutate/src/invert.rs:19-25`), so any arm that returns a `previous` value has a correct inverse by construction.

| PropertyPath | Apply arm? | Inverse? | Notes |
|---|---|---|---|
| `FrameBounds` | yes — TextFrame (apply.rs:119), Rectangle (apply.rs:147) | yes (Value::Bounds prev) | Oval / Polygon / GraphicLine / Group missing. |
| `FrameFillColor` | yes — TextFrame (133), Rectangle (161) | yes | Other shape kinds missing; Group has no fill. |
| `FrameStrokeColor` | yes — TextFrame (176), Rectangle (190) | yes | Other shape kinds missing. |
| `FrameStrokeWeight` | yes — TextFrame (204), Rectangle (218) | yes | Other shape kinds missing. |
| `FrameOpacity` | yes — TextFrame (232), Rectangle (246) | yes | Other shape kinds missing. Group `<TransparencySetting>` not wired. |
| `FrameTransform` | yes — TextFrame (261), Group (284), Rectangle (298) | yes | Oval / Polygon / GraphicLine arms not implemented. |
| `ImageContentTransform` | yes — Rectangle only (417) | yes | Correct scoping — only Rectangle hosts image content. |
| `FramePathPoint` | yes — Polygon / TextFrame / Rectangle / GraphicLine fan-out (315) | yes (Value::PathPoint prev_pos) | Track J fan-out. |
| `PathPointInsert` | yes — `apply_path_point_insert` (94) | yes (paired Remove) | Track J. |
| `PathPointRemove` | yes — `apply_path_point_remove` (103) | yes (paired Insert w/ captured anchor) | Track J. |
| `PathPointCurveType` | yes — `apply_path_point_curve_type` (112) | yes (carries `prev` for bytewise undo) | Track J. |
| `LayerVisible` | yes (apply.rs:363) | yes | Track M. |
| `LayerLocked` | yes (apply.rs:377) | yes | Track M. |
| `LayerPrintable` | yes (apply.rs:390) | yes | Track M. |
| `LayerName` | yes (apply.rs:404) | yes (Value::Text prev) | Track M. |

Any unmatched `(NodeId, PropertyPath)` pair falls through to the apply.rs:431 default arm which returns `OperationError::UnsupportedProperty`. **Conclusion: no `PropertyPath` lacks an apply arm for the element kinds explicitly mentioned in its docstring.** Additional shape kinds for fill/stroke/etc. would need new arms.

## 4. Element-property snapshot coverage

The read snapshot is `CanvasModel::element_properties` at `crates/idml-canvas/src/model.rs:1122-1225`. It returns one `Vec<PropertyEntry>` per element. Two element-kind branches: `ElementId::TextFrame` (1133-1169) and `ElementId::Rectangle` (1170-1206). All other kinds fall through to `_ => None` (1211).

| PropertyPath | Surfaced by `element_properties`? | Element kinds | Notes |
|---|---|---|---|
| `FrameBounds` | yes | TextFrame, Rectangle | (model.rs:1140, 1177) |
| `FrameFillColor` | yes | TextFrame, Rectangle | (1153, 1190) |
| `FrameStrokeColor` | yes | TextFrame, Rectangle | (1157, 1194) |
| `FrameStrokeWeight` | yes | TextFrame, Rectangle | (1161, 1198) |
| `FrameOpacity` | yes | TextFrame, Rectangle | (1165, 1202) |
| `FrameTransform` | yes | TextFrame, Rectangle | (1149, 1186) |
| `ImageContentTransform` | **no** | (would be Rectangle) | apply arm exists; read side does not emit. |
| `FramePathPoint` | **N/A** | not a snapshot-shaped property | Path-edit overlays go through `RequestPathAnchors`, not Inspector. |
| `PathPointInsert/Remove/CurveType` | **N/A** | structural | Same as above. |
| `LayerVisible/Locked/Printable/Name` | **no via `element_properties`**, **yes via `CanvasModel::layers()`** (model.rs:1098-1115) | Layer | Layers panel reads `LayerSummary`, not `ElementProperties`. The two read shapes coexist. |
| (Oval / Polygon / GraphicLine / Group snapshot) | **no** | Oval, Polygon, GraphicLine, Group | The `_ => None` branch at model.rs:1211 leaves all other kinds without a snapshot — the Inspector can't show their fill/stroke even though `FramePathPoint`-style writes via gestures still work for path kinds. Read-side gap. |

**Read-side gap shortlist:**
1. `ImageContentTransform` apply arm exists, no snapshot entry.
2. Oval / Polygon / GraphicLine / Group: no entries at all, even for the common bounds + transform that gate hit-testing. Inspector can't display them.
3. Layer properties live in `LayerSummary` (model.rs:1106-1113), not `PropertyEntry` — surfaces fine for the Layers panel but a generic catalog renderer would need a uniform shape (this is a Phase 3 design question, not an Operation gap).

## 5. Phase 3 + Phase 5 panel gap matrix

Effort key: **S** ≤1 h (add to existing match arm or read snapshot), **M** ~1 day (new path + apply + inverse + snapshot + tests), **L** ≥1 day (new `Value` variant or new parse-side wiring).

### Character panel

The Character composition the plan shows already names `characterFontSize`, `characterLeading`, `characterTracking`, `characterFillColor` — none of which exist as `PropertyPath`. Underlying parser fields are on `CharacterRun` in `crates/idml-parse/src/story.rs:626-700` and on `CharacterStyleDef`/`ParagraphStyleDef` in `crates/idml-parse/src/styles.rs:316-622`, so the Rust side has the data; the bridge is `Operation::SetProperty` and the read snapshot.

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Font family | `CharacterFontFamily` | NEW-PATH | `Value::Text(String)` (existing) | M | Maps to `CharacterRun.font` (story.rs:628). Requires choosing the addressing model (StoryId+range vs frame-level placeholder). |
| Font style (weight/slant) | `CharacterFontStyle` | NEW-PATH | `Value::Text` | M | `CharacterRun.font_style` (story.rs:629). Range-addressing question shared with all char paths. |
| Font size | `CharacterFontSize` | NEW-PATH | `Value::Length` (existing) | M | `CharacterRun.point_size` (story.rs:630). Named in plan §3d. |
| Leading | `CharacterLeading` | NEW-PATH | `Value::Length` | M | `CharacterRun.leading` (story.rs:676). Named in plan §3d. |
| Tracking | `CharacterTracking` | NEW-PATH | `Value::Length` | M | `CharacterRun.tracking` (story.rs:667), 1/1000 em. Named in plan §3d. |
| Kerning | `CharacterKerningMethod` / `CharacterKerningValue` | NEW-PATH | `Value::Text` + `Value::Length` | M | Parser doesn't currently surface `KerningMethod`/`KerningValue` on `CharacterRun`; check before pricing. |
| Fill color | `CharacterFillColor` | NEW-PATH | `Value::ColorRef` (existing) | M | `CharacterRun.fill_color` (story.rs:633). Named in plan §3d. |
| Baseline shift | `CharacterBaselineShift` | NEW-PATH | `Value::Length` | M | `CharacterRun.baseline_shift` (story.rs:648). |
| Character case | `CharacterCapitalization` | NEW-PATH | `Value::Text` (or new `Value::Enum`) | M | `CharacterRun.capitalization` (story.rs:645): `Normal | SmallCaps | AllCaps | CapToSmallCap`. |
| Underline | `CharacterUnderline` | NEW-PATH | `Value::Bool` (existing) | M | `CharacterRun.underline` (story.rs:669). |
| Strikethrough | `CharacterStrikethrough` | NEW-PATH | `Value::Bool` | M | `CharacterRun.strikethru` (story.rs:671). |
| Language | `CharacterLanguage` | NEW-PATH | `Value::Text` | M | Parser-side: not visible on `CharacterRun` today (no field grep hit); confirm before committing — may be on `ParagraphStyleDef`. **TBD: not present today.** |

All 12 Character fields are NEW-PATH today. The Value side is mostly served by existing variants (`Length`, `Text`, `ColorRef`, `Bool`). A `Value::Enum` would tighten safety on `Capitalization` / `KerningMethod` but `Value::Text` is the cheap path.

### Paragraph panel

Sources: `CharacterRun`-adjacent `ParagraphStyleDef` in `crates/idml-parse/src/styles.rs:544-622` plus `ParagraphStyleRange`-level fields on `Story`.

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Alignment | `ParagraphJustification` | NEW-PATH | `Value::Text` (or new `Value::Enum`) | M | `ParagraphStyleDef.justification` (styles.rs:569) — closed enum `Justification`. |
| Justification (full/last-line) | `ParagraphJustification`-multi-knob | NEW-PATH | `Value::Text` | M | Same field handles "Force"/"Right"/etc. |
| Space before | `ParagraphSpaceBefore` | NEW-PATH | `Value::Length` | M | `ParagraphStyleDef.space_before` (styles.rs:571). |
| Space after | `ParagraphSpaceAfter` | NEW-PATH | `Value::Length` | M | `ParagraphStyleDef.space_after` (styles.rs:572). |
| Left indent | `ParagraphLeftIndent` | NEW-PATH | `Value::Length` | M | Parser-side: not surfaced in styles.rs lines scanned. **TBD: confirm field exists.** |
| Right indent | `ParagraphRightIndent` | NEW-PATH | `Value::Length` | M | Same TBD as left indent. |
| First-line indent | `ParagraphFirstLineIndent` | NEW-PATH | `Value::Length` | M | `ParagraphStyleDef.first_line_indent` (styles.rs:570). |
| Hyphenation toggle | `ParagraphHyphenation` | NEW-PATH | `Value::Bool` | M | Parser-side field presence not verified. |
| Hanging punctuation | `ParagraphHangingPunctuation` | NEW-PATH | `Value::Bool` | M | TBD. |
| Drop-cap lines | `ParagraphDropCapLines` | NEW-PATH | `Value::Length` (or new int) | M | Story-side `<ParagraphStyleRange DropCapCharacters>` (story.rs:206). |
| Drop-cap characters | `ParagraphDropCapCharacters` | NEW-PATH | `Value::Length` | M | Same source. |

All 11 Paragraph fields are NEW-PATH. The "range vs frame" addressing question is shared with Character: the canvas inspector today only addresses frames (`ElementId::TextFrame(_)`). Per-range writes need either a richer `NodeId::StoryRange { story_id, start, end }` or an apply-side convention that uniform-paragraph-style frames lift these as frame-level overrides.

### Stroke panel

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Weight | `FrameStrokeWeight` | **OK** | `Value::Length` | — | apply.rs:204, 218; snapshot at model.rs:1161, 1198. |
| Color | `FrameStrokeColor` | **OK** | `Value::ColorRef` | — | apply.rs:176, 190; snapshot at model.rs:1157, 1194. |
| Dash pattern | `FrameStrokeDashPattern` | NEW-PATH + NEW-VALUE | `Value::FloatArray(Vec<f32>)` (new) | L | Parser carries `stroke_type` as a string ref to a `<StrokeStyle>` (spread.rs:625); raw dash array isn't a frame-level override — InDesign stores it on the StrokeStyle definition. Two design options: (a) add a frame-level `StrokeDashPattern` override variant, (b) make `Stroke type` a name ref (NEW-PATH `FrameStrokeType` w/ existing `Value::Text`). Option (b) is much cheaper. |
| Stroke type / dash gap | `FrameStrokeType` | NEW-PATH | `Value::Text` | M | If we go option (b) above. |
| Miter limit | `FrameStrokeMiterLimit` | NEW-PATH | `Value::Length` | M | `Rectangle.miter_limit` (spread.rs:643). TextFrame doesn't carry this field — parser-side asymmetry. |
| Line join | `FrameStrokeLineJoin` | NEW-PATH | `Value::Text` (or `Value::Enum`) | M | `Rectangle.end_join` (spread.rs:636-639), `MiterEndJoin | RoundEndJoin | BevelEndJoin`. |
| Line cap | `FrameStrokeLineCap` | NEW-PATH | `Value::Text` | M | `Rectangle.end_cap` (spread.rs:632-635), `ButtEndCap | RoundEndCap | ProjectingEndCap`. |
| Alignment (inside/outside/center) | `FrameStrokeAlignment` | NEW-PATH | `Value::Text` | M | `Rectangle.stroke_alignment` (spread.rs:626-631). |
| Tint | `FrameStrokeTint` | NEW-PATH | `Value::Length` | M | Frame-level `fill_tint`/stroke tint exists on TextFrame (story.rs:640 for CharacterRun.fill_tint); need a frame-side check — **TBD: confirm parser field on TextFrame/Rectangle**. |

Of 9 Stroke fields, 2 are OK. 6 are NEW-PATH with existing Value variants (Text/Length). 1 is NEW-PATH + needs design decision (dash pattern vs stroke-type ref). Note: parser-side stroke fields presently live on `Rectangle` only — TextFrame's struct (spread.rs:256+) doesn't carry `end_cap`/`end_join`/`miter_limit`/`stroke_alignment`. That's a parser-side asymmetry the apply layer will have to mirror.

### Effects panel

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Opacity | `FrameOpacity` | **OK** | `Value::Length` | — | apply.rs:232, 246; snapshot at model.rs:1165, 1202. |
| Blend mode | `FrameBlendMode` | NEW-PATH | `Value::Text` (or `Value::Enum`) | M | Parsed (`Rectangle.blend_mode` spread.rs:671-674, `TextFrame.blend_mode` 350) but rasterizer doesn't honour non-Normal modes today. Writing to it persists into the doc without visible change. |
| Drop shadow (color/opacity/distance/angle/blur/spread) | `FrameDropShadow*` (≥6 leaf paths) **or** `FrameDropShadow` (composite) | NEW-PATH ×N + NEW-VALUE | `Value::Shadow { … }` (new) **or** one path per leaf | L | `DropShadowSetting` parsed at spread.rs:547-572 (opacity_pct + effect_color + distance/angle/blur/spread fields). Two design options: (a) one `Value::Shadow` struct → 1 path, 1 value; (b) 6+ leaf paths each using existing primitives. (a) is closer to InDesign's UI (apply atomically) and undo-friendly. |
| Inner shadow | `FrameInnerShadow*` | NEW-PATH ×N + likely NEW-VALUE | same as drop | L | `FrameEffects` exists (spread.rs:680) but the parser-side sub-fields for inner shadow aren't confirmed in the scan. **TBD: confirm `FrameEffects` carries inner-shadow fields**. |
| Outer glow | `FrameOuterGlow*` | NEW-PATH + likely NEW-VALUE | new | L | Same TBD. |
| Inner glow | `FrameInnerGlow*` | NEW-PATH + likely NEW-VALUE | new | L | Same TBD. |
| Bevel | `FrameBevel*` | NEW-PATH + likely NEW-VALUE | new | L | Same TBD. |

Of 6 Effects categories, 1 is OK (Opacity), 1 is NEW-PATH primitive-only (BlendMode), and 4 are NEW-PATH + NEW-VALUE composite. Effects is the most expensive Phase 5 panel by a wide margin.

### Object / Transform panel

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Bounds | `FrameBounds` | **OK** | `Value::Bounds` | — | apply.rs:119, 147; snapshot 1140, 1177. |
| Transform matrix | `FrameTransform` | **OK** | `Value::Transform` | — | apply.rs:261, 284, 298; snapshot 1149, 1186. |
| Explicit rotation | (derived from `FrameTransform`) | OK via decomposition | (composite write) | S | Panel can read+write through `FrameTransform`; the catalog renderer's `coerce` keyword is the place to fold rotation/scale extraction. Worth a `paged.input.angle` leaf rather than a Rust-side path. |
| Explicit scale | (derived from `FrameTransform`) | OK via decomposition | (composite write) | S | Same as rotation. |
| Anchor point | `FrameAnchorPoint` | NEW-PATH | `Value::Text` (9-point grid as enum) | M | Not a persisted IDML field — InDesign uses it for transform pivots. Could live as canvas-app state rather than a doc property. **Design call**: is this a doc property or an editor preference? |
| Locked (page-item lock) | `FrameLocked` | NEW-PATH | `Value::Bool` | M | Parser-side: TextFrame/Rectangle don't carry a `locked` flag in scan. **TBD: confirm parser field or define apply-side as a no-op until parsed.** |

Of 6 Object/Transform fields, 2-4 are OK (depending on rotation/scale decomposition), 1-2 are NEW-PATH with caveats.

### Pages panel (Phase 3 — actively migrated)

Currently uses `Mutation::InsertPage` / `Mutation::DeletePage` envelopes in `crates/idml-canvas/src/channel.rs:798-804` but the model's translator at `model.rs:903` returns `None` for them, so they fall through and the worker reports `NotImplemented`. There are **no `InsertPage` / `DeletePage` / `MovePage` Operations** in `idml-mutate`.

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Reorder pages | `Operation::MovePage { page_id, new_index }` (new structural op) | **NEW-OP** (not a SetProperty) | n/a | L | Plan §3d names it. Mirror of `Operation::MoveLayer` (op.rs:414). Page lives under a Spread; the parse-side `Page` struct (spread.rs:213) lives in `Spread.pages`. Has page-overrides + master-page-transform implications on undo. |
| Insert page | `Operation::InsertPage { spread, position, master_id?, size? }` | **NEW-OP** | n/a | L | The `Mutation::InsertPage` envelope already exists (channel.rs:798) — just unwired. |
| Remove page | `Operation::RemovePage { page_id }` | **NEW-OP** | n/a | L | Mirror of `RemoveLayer` (op.rs:433). Need to capture frames-on-page for undo, like RemoveLayer captures flags. |
| Set page size | `PageBounds` | NEW-PATH | `Value::Bounds` (existing) | M | `Page.bounds` exists (spread.rs:222). Needs `NodeId::Page(_)` in apply arms; the variant already exists (op.rs:43). |
| Set page master | `PageAppliedMaster` | NEW-PATH | `Value::Text` (ref) | M | `Page.applied_master` (spread.rs:225). |

Pages is **the most concentrated structural-op gap** in the codebase. 3 brand-new top-level `Operation` variants (mirroring MoveLayer/InsertLayer/RemoveLayer) plus 2 `SetProperty` paths against `NodeId::Page`.

### Links panel (Phase 5)

Not yet exposed at any layer.

| Field | Implied PropertyPath | Status | Value type | Effort | Notes |
|---|---|---|---|---|---|
| Relink (path) | `LinkResourceURI` | NEW-PATH | `Value::Text` | M | Need to identify the node carrying the link — Rectangle holds `image_link: Option<String>` (spread.rs scanned around image fields). **TBD: confirm exact field name + addressing model.** |
| Embed / Unembed | `LinkEmbedded` | NEW-PATH | `Value::Bool` (plus side-effect of moving bytes in/out of `image_bytes`) | L | `Rectangle.image_bytes` (spread.rs:610) is the embed payload. Embed/unembed is a structural change requiring a Batch (set ref, move bytes). |
| Update from disk | (gesture only, not a property) | n/a | n/a | M | Not a `SetProperty` — needs a file-loader path on the host (likely outside Operation algebra). |

## 6. Layer-ops sanity

All seven Track M layer ops have apply + inverse, confirmed:

- `LayerVisible` — apply.rs:363; inverse via `Value::Bool(prev)`.
- `LayerLocked` — apply.rs:377; inverse via `Value::Bool(prev)`.
- `LayerPrintable` — apply.rs:390; inverse via `Value::Bool(prev)`.
- `LayerName` — apply.rs:404; inverse via `Value::Text(prev)`.
- `Operation::MoveLayer` — apply.rs:747-780; inverse is `MoveLayer { layer_id, new_index: original_index }`.
- `Operation::InsertLayer` — apply.rs:782-837; inverse is `RemoveLayer { layer_id }`.
- `Operation::RemoveLayer` — apply.rs:839-893; inverse is a `Batch { ops: [InsertLayer, Set(Name), Set(Visible), Set(Locked), Set(Printable)] }` — restores name + flags bytewise.

Read side: `CanvasModel::layers()` (model.rs:1098-1115) returns `Vec<LayerSummary>` with self_id + name + visible + locked + printable + z. **No gaps.** Track M is complete.

## 7. Summary recommendations

**Cheapest panel to land:** Object/Transform. Bounds + Transform are fully OK at both apply and snapshot layers. The "explicit rotation/scale" rows are just decompositions the catalog renderer can do on top of `FrameTransform`. Only AnchorPoint (a design call — likely editor pref, not a property) and Locked (parser-side TBD) are open. Effort: probably <1 day to ship the composition.

**Most expensive panel:** **Effects** by far. 4 of 6 categories (drop shadow, inner shadow, outer glow, inner glow, bevel) need new composite Value variants and new addressing schemes for sub-properties. Plus the renderer doesn't honour blend modes today, so writes persist invisibly — that's a fidelity-asymmetry the plan should explicitly flag. **Pages** is second-most expensive because it adds 3 top-level structural `Operation` variants (not just SetProperty paths).

**Highest-value Value-variant adds (most panels reuse):**
1. `Value::Enum(String)` (or just `Value::Text` for the cheap path) — used by Capitalization (Character), Justification (Paragraph), BlendMode (Effects), Stroke Alignment / LineCap / LineJoin / StrokeType (Stroke), AnchorPoint (Object). 6+ uses.
2. A new addressing model for character/paragraph ranges — not strictly a Value variant but adjacent. Without it, every Character/Paragraph path needs a frame-level "apply to homogenous frame" convention or extends NodeId.
3. `Value::Shadow { color, opacity, distance, angle, blur, spread }` — used by 4 Effects categories. Pricier but unblocks the whole panel atomically.

**Structural finding worth elevating: the Operation layer is not yet symmetric across element kinds.** Apply arms exist for TextFrame + Rectangle but never Oval / Polygon (except path-point ops) / GraphicLine / Group for fill/stroke/opacity. The read snapshot is even narrower — only TextFrame + Rectangle entries. Phase 3 will hit this immediately the moment a user selects a polygon shape and opens Character/Paragraph/Effects: the panel will render empty. The plan's invariant 8 ("panel friction is specification") suggests **read-side parity is the Phase 3 prerequisite, not character/paragraph writes**.

**Phase 3 critical-path additions (5-10 PropertyPath needs).** For Character + Pages + Inspector parity to actually close Phase 3 acceptance (AC-3.2 + AC-3.6), in priority order:

1. `CharacterFontSize` (NEW-PATH, `Value::Length`) — named in plan §3d.
2. `CharacterLeading` (NEW-PATH, `Value::Length`) — named in plan §3d.
3. `CharacterTracking` (NEW-PATH, `Value::Length`) — named in plan §3d.
4. `CharacterFillColor` (NEW-PATH, `Value::ColorRef`) — named in plan §3d.
5. `Operation::MovePage` (NEW structural op) — named in plan §3d.
6. `Operation::InsertPage` (NEW structural op) — implied by `Mutation::InsertPage` already in the envelope.
7. `Operation::RemovePage` (NEW structural op) — implied by `Mutation::DeletePage`.
8. `CharacterFontFamily` (NEW-PATH, `Value::Text`) — first thing every user changes; bare-minimum Character.
9. `CharacterFontStyle` (NEW-PATH, `Value::Text`) — pairs with FontFamily.
10. Read-side: extend `element_properties` to emit `ImageContentTransform` for Rectangle, and add Oval / Polygon / GraphicLine / Group bounds + transform entries — without this the Inspector parity stays partial.

That's 7 new `PropertyPath` variants, 3 new top-level `Operation` variants, plus snapshot extensions. Every gap is **NEW-PATH-only** at the Value layer (uses existing `Length` / `ColorRef` / `Text` / `Bounds` variants); no new `Value` variant is on the Phase 3 critical path. `Value::Enum` is a quality-of-life add but `Value::Text` discriminants ship the same surface for less cost.

**Critical-path single risk (matching plan §11):** ~~the character/paragraph addressing model.~~ **RESOLVED 2026-05-29** — see `sdk-implementation-plan.md` §3c.1 ADR. Decision: **`NodeId::StoryRange { story_id, start, end }`** (Approach A — Range-as-NodeId). Half-open character-offset addressing matching IDML's native `<CharacterStyleRange>` serialization. Character / paragraph `PropertyPath`s address this variant. The binding model gains an optional `selectionProperty.scope: "element" | "content"` discriminator (the binding *kind* is unchanged; ceiling §11.5 holds). Prep landed: `NodeId::StoryRange` + 4 character `PropertyPath`s + `PropertyEntry.value: Option<Value>` + smoke tests. Apply arms + snapshot walk are Phase 3 proper.
