# IDML Sample Generator — Technical Briefing

**Goal.** Extend the IDML Renderer App with a sample-generation subsystem that produces a curated corpus of IDML files exercising every feature in the IDML File Format Specification v8.0 (520 pages, Adobe 2012). Each generated file is then opened in Adobe InDesign and re-exported as a reference PDF, giving the renderer a deterministic ground truth to diff against.

**Source of truth.** The IDML specification (Adobe, March 2012, v8.0, 520 pp.) is the primary reference for structural correctness. InDesign's actual export behavior is the secondary reference — and where the two disagree, **InDesign wins**, because the renderer's job is to match what InDesign produces, not what the spec says it should produce. Real-world IDML diverges from the spec in small but important ways (extra attributes, undocumented enum values, version-stamped namespaces).

---

## 1. Strategic Approach

The intuitive temptation is to build "one giant kitchen-sink IDML file" that uses everything at once. **Resist it.** A kitchen-sink file is impossible to debug: when the renderer's output diverges from InDesign's PDF, the divergence cannot be localized to whether the bug is in stroke-dash rendering, transparency flattening, the interaction of the two, or something else entirely.

The correct architecture is a **matrix of small, focused files** plus a small number of **integration files** that combine features deliberately. Concretely, three tiers:

**Tier 1 — Atomic feature files.** One IDML per feature variant. Examples: `stroke-dash-3-2.idml`, `stroke-end-cap-round.idml`, `paragraph-justify-fully.idml`, `gradient-radial-cmyk.idml`. Each file isolates a single rendering concern. Aim for ~400–600 of these across the spec.

**Tier 2 — Pairwise/combinatorial files.** Combinations of features known to interact: transparency × spot color, drop shadow × rotated frame, table × threaded text, anchored object on text-on-path, opacity on a group containing a graphic frame with a clipping path, blend mode inside a nested group with its own opacity. Aim for ~100–200 of these, derived from a documented interaction matrix rather than guessed.

**Tier 3 — Realistic-document files.** A small set (10–20) of plausible end-user documents: a magazine spread, a data-sheet, a multi-language brochure, a CJK vertical-text layout, a tabular financial report. These catch emergent issues atomic files cannot — interaction between layout and content, threading across many frames, master spread overrides at scale.

**Why this works.** When the renderer produces a wrong PDF, a failing Tier 1 file points directly at the broken feature. A Tier 2 failure with all its constituent Tier 1 files passing points at an interaction bug. A Tier 3 failure with all relevant Tier 1 and Tier 2 files passing usually points at order-of-operations or accumulation-of-error issues. The hierarchy is the debugger.

---

## 2. Generator Architecture

The generator should be a **library** with a thin CLI on top, not a script. The internal structure should mirror the IDML package itself:

```
generator/
├── core/
│   ├── package.ts          # UCF/Zip writer, mimetype, container.xml
│   ├── designmap.ts        # designmap.xml writer
│   ├── ids.ts              # Self-attribute generation (deterministic)
│   └── geometry.ts         # ItemTransform matrices, PathGeometry helpers
├── builders/
│   ├── spread.ts           # Spread, MasterSpread, Page
│   ├── story.ts            # Story, ParagraphStyleRange, CharacterStyleRange
│   ├── frame.ts            # Rectangle, Oval, GraphicLine, Polygon, TextFrame
│   ├── table.ts            # Table, Row, Column, Cell
│   ├── resources.ts        # Graphic.xml, Fonts.xml, Styles.xml, Preferences.xml
│   ├── effects.ts          # Transparency, FeatherSetting, ShadowSetting, etc.
│   └── interactive.ts      # Buttons, MultiState, Animation, Behaviors
├── fixtures/
│   ├── text/               # Lipsum, CJK pangrams, RTL samples, Unicode edge cases
│   ├── images/             # Test images: TIFF, JPEG, PNG, EPS, PDF, AI, PSD
│   └── fonts/              # Known-installed fonts; a font registry
├── samples/
│   ├── tier1/              # Atomic feature files (one per variant)
│   ├── tier2/              # Combinatorial files
│   └── tier3/              # Realistic documents
├── matrix/
│   ├── enums.ts            # All enum values from the spec, machine-readable
│   ├── attributes.ts       # Attribute → applicable element mapping
│   └── coverage.ts         # Coverage tracking
└── cli.ts
```

**Determinism is non-negotiable.** Every IDML file must be byte-identical across runs. This means:

1. `Self` attributes generated from a stable hash of (sample-name, element-path, sequence), not random or sequential counters. Spec §10.1 ("Self") allows any unique string; use `u<base32(hash)>` to mimic InDesign's style without colliding with InDesign-generated IDs in mixed corpora.
2. Element/attribute order stable. While XML is unordered semantically, InDesign exports in a consistent order, and many IDML tools assume it. Mimic InDesign's order to keep diffs readable.
3. ZIP entries written in a fixed order with fixed timestamps (1980-01-01 — Zip's epoch — is conventional for reproducible builds) and no extra metadata.
4. Floating-point output rounded to a fixed precision (4 decimal places matches InDesign's typical export).

**Enum-driven generation.** Spec §9.4.2 ("Enumerations") lists hundreds of enums (e.g., `Justification`, `EndCap`, `BlendMode`, `RuleAbove`, `BalanceLinesStyle`). Encode these once in a single TypeScript enum module, then drive Tier 1 generation directly from it: for each enum value of a renderable attribute, emit one sample file. This is how you guarantee no enum value is forgotten.

**Schema sanity layer.** The spec ships a Relax NG grammar (referenced in spec §9.3). Validate every generated file against it before writing it to disk. This catches generator bugs early — invalid IDML may still open in InDesign (it is forgiving), but the resulting reference PDF will be unreliable.

---

## 3. Package Structure to Generate

Spec §8 defines the IDML package as a UCF/Zip container with this layout:

```
sample.idml                    (Zip archive)
├── mimetype                   (uncompressed, first entry, "application/vnd.adobe.indesign-idml-package")
├── META-INF/
│   └── container.xml          (rootfile pointer to designmap.xml)
├── designmap.xml              (document-level manifest)
├── Resources/
│   ├── Fonts.xml              (fonts and composite fonts)
│   ├── Styles.xml             (paragraph, character, object, table, cell, TOC styles)
│   ├── Graphic.xml            (swatches, colors, gradients, mixed inks, stroke styles)
│   └── Preferences.xml        (40+ preference categories)
├── MasterSpreads/
│   ├── MasterSpread_<id>.xml
│   └── ...
├── Spreads/
│   ├── Spread_<id>.xml
│   └── ...
├── Stories/
│   ├── Story_<id>.xml
│   └── ...
└── XML/
    ├── BackingStory.xml
    ├── Tags.xml
    └── Mapping.xml
```

**Critical rules from §8 and Appendix A:**

- `mimetype` must be the **first** Zip entry, **uncompressed (stored)**, with no extra fields. Renderers and InDesign use this to identify the file format before parsing the rest.
- File names inside the archive use forward slashes; case sensitivity must match (InDesign on macOS is case-insensitive but EPUB-style readers are not).
- `META-INF/container.xml` is technically optional per UCF but always present in InDesign exports — generate it.
- Component file names follow §8.2 ("IDML Component Names"). The format is `<type>_<self-attribute>.xml` for spreads, master spreads, and stories. For the generator, deriving the file name from the element's `Self` attribute keeps things consistent.

The generator's package writer should produce all of these even when their content is minimal (e.g., empty `Tags.xml` for samples without XML structure). InDesign's import is more reliable when the package is structurally complete.

---

## 4. Feature Coverage Matrix

The following sections enumerate every renderable feature area with the relevant spec section in parentheses. Each leaf bullet is a generation target — typically one or more atomic Tier 1 files. The list is comprehensive but not exhaustive; treat it as the seed from which to derive the actual sample plan.

### 4.1 Document and Package (§8, §10.2)

The document level is mostly invisible in the rendered output but affects everything downstream. Cover:

- **`designmap.xml` baseline** — minimal valid document, single page, single spread, no master applied.
- **Document preferences** — page size variants (A4, US Letter, custom), orientation, facing pages on/off, multiple page sizes within one document, bleed/slug values (zero, symmetric, asymmetric).
- **Document color management** — RGB working space, CMYK working space, intent variants (Spec §10.2 "Documents and Color Management").
- **Sections** (§10.2 "Section") — section start, section markers, page numbering styles (Arabic, Roman, alphabetic), section prefixes, "include section prefix when paginating".
- **Layers** (§10.2 "Layer") — single layer; multi-layer with mixed visibility; locked vs unlocked; layer color variants; print-on-export off.
- **Conditional text** (§10.2 "Condition", "ConditionSet") — multiple conditions, condition set, indicator variants (none, underline, strikethrough, highlight).
- **Text variables** (§10.2 "TextVariable") — chapter number, file name, last page number, modification date, output date, running header (paragraph style/character style), custom text.
- **Hyperlinks at document level** (§10.2 "Hyperlinks") — `HyperlinkURLDestination`, `HyperlinkPageDestination`, `HyperlinkExternalPageDestination`, `HyperlinkPageItemSource`. Note that `HyperlinkTextSource`/`HyperlinkTextDestination` live in stories, not designmap.
- **Bookmarks** (§10.2 "Bookmark") — flat and nested; bookmark linked to a page, to text, to a hyperlink destination.
- **Articles** (§10.2 "Article", "ArticleMember") — single article; multiple articles; article order affecting reflow export.
- **Cross-references** (§10.2 "CrossReferenceFormat") — paragraph cross-ref, page-number cross-ref, full-paragraph cross-ref, custom format.
- **Index** (§10.2 "Index", "Topic", "CrossReference") — single entry, page range entry, "see also" cross-reference.
- **Numbering lists** (§10.2 "NumberingList") — continued list, restart-per-story, restart-per-paragraph.
- **Preflight profiles and rule instances** (§10.2 "PreflightProfile", "PreflightRuleInstance") — included even if not rendered, since malformed entries can prevent InDesign from opening the file.

### 4.2 Spreads, Master Spreads, Pages (§10.3)

- **Single page; spread of two pages; spread of multiple pages.** Include the legal multi-page spreads (3, 4, 5+) with `AllowPageShuffle` false.
- **Master spreads** — `[None]`, single master, master based on another master, master with master-page items overridden on document pages, document-page-only items.
- **Page properties** — `MasterPageTransform`, `AppliedTrapPreset`, `OverridelList` (master overrides), `GeometricBounds`.
- **Spread properties** — `BindingLocation`, `ItemTransform` rotation in 90° increments (the spec restricts spread rotation to 90° steps).
- **`PageTransitionType`** — every enum value: `None`, `Blinds`, `Box`, `Comb`, `Cover`, `Dissolve`, `Fade`, `Page­Turn`, `Push`, `Split`, `Uncover`, `Wipe`, `Zoom` etc., plus direction and duration variants for those that support them.
- **Columns and margins** (§10.3 "Columns and Margins") — column count, gutter, balanced columns, custom margin per page.
- **Guides** (§10.3 "Guides") — ruler guides, column guides, guides locked/unlocked, guides on master spreads.
- **Baseline grid** — document baseline grid; per-frame baseline grid (`BaselineFrameGridOptions`).
- **Transparency flattener settings per spread** (§10.3 "Transparency Flattener Settings").

### 4.3 Page Items — Spline Items (§10.3.1)

The five spline-item element types (`Rectangle`, `Oval`, `GraphicLine`, `Polygon`, `TextFrame`) share a near-identical schema. Cover them with shared atomic files plus per-type specifics:

- **Geometry** — `PathGeometry` with `GeometryPathType` containing `PathPointArray` of `PathPointType` records. Cover open vs closed paths, straight segments, Bezier curves with various left/right direction handle configurations, multiple sub-paths in one frame (compound paths).
- **`ItemTransform`** — identity; translation only; rotation; scale; shear; combined (see §10.3.2 "Geometry in IDML" for the matrix conventions and the parent-relative coordinate system; this is famously where renderer bugs hide).
- **Corner options** (`CornerOption`, plus per-corner `TopLeftCornerOption` etc.) — every enum value: `None`, `Rounded`, `Inverse­Rounded`, `Bevel`, `Inset`, `Fancy`. Each per-corner attribute can differ from the others — generate at least one mixed-corner sample.
- **Fill** — solid color (CMYK, RGB, LAB, Spot); tint; gradient (linear, radial, with various angles, lengths, hilite positions); none.
- **Stroke** — every property combination: weight, alignment (`Center`, `Inside`, `Outside`), `EndCap` (`ButtEndCap`, `RoundEndCap`, `ProjectingEndCap`), `EndJoin` (`MiterEndJoin`, `RoundEndJoin`, `BevelEndJoin`), `MiterLimit`, `StrokeDashAndGap` patterns (solid, dashed, dotted, custom), `StrokeType` referencing built-in and custom stroke styles (§Graphics "Stroke Styles"), `LeftLineEnd` / `RightLineEnd` arrowhead enums, `GapColor` / `GapTint`, `OverprintStroke`, `OverprintGap`.
- **Visibility/print** — `Visible`, `Nonprinting`, `Locked`, `LocalDisplaySetting`.
- **Text wrap** — `TextWrapPreference` modes (`None`, `JumpObjectTextWrap`, `BoundingBoxTextWrap`, `Contour`, `JumpToNextColumnTextWrap`), offsets per side, contour source (alpha channel, Photoshop path, detect edges).
- **`TextFrame`-specific** — multi-column text frames, fixed column width, vertical justification (`Top`, `Center`, `Bottom`, `JustifyAlignment`), inset spacing (per-side), ignore wrap, first-baseline option (`Ascent`, `Cap­Height`, `Leading`, `x­Height`, `Fixed`, `Emboxheight`).
- **Anchored object positioning** — inline, above-line, custom; `AnchoredObjectSetting` variants (§Preferences "Anchored­Object­Setting").

### 4.4 Page Items — Graphics (§10.3.1, §Graphics)

Graphics live inside a container spline item (typically `Rectangle`). The generator needs sample asset files of each type:

- **`Image`** (raster) — TIFF (CMYK + RGB, with and without transparency, 8-bit and 16-bit), JPEG, PNG (with alpha), PSD (with layers, with clipping path, with alpha channel).
- **`PDF`** — single-page PDF, multi-page PDF with `PDFAttribute` page index, transparent PDF, PDF with embedded fonts.
- **`EPS`** — vector EPS, raster-containing EPS.
- **`AI`** files (treated as PDF by InDesign).
- **Frame fitting** (`FrameFittingOption` in §Preferences) — `None`, `FillProportionally`, `FitContentProportionally`, `FitContentToFrame`, `FitFrameToContent`, `CenterContent`. Each at multiple aspect ratios.
- **`ClippingPathSettings`** — none, alpha channel, Photoshop path, detect edges, user-modified path, with thresholds and tolerances.
- **`GraphicLayerOption`** — Photoshop layer visibility overrides.
- **Image color management** — embedded profile, document profile, document profile with rendering intent variants.

### 4.5 Page Items — Media and Interactive (§10.3.1)

- **`Movie`, `Sound`** — embedded vs linked; with poster image; with controller.
- **`Button`** (§10.3 "Buttons") — multi-state buttons, normal/rollover/click states, `Behavior` types (`GotoPageBehavior`, `GotoURLBehavior`, `OpenFileBehavior`, `MovieBehavior`, `SoundBehavior`, `ShowHideFieldsBehavior`, `AnimationBehavior` etc.).
- **`MultiStateObject`** (§10.3 "Multi-State Object") — multiple states, active state index.
- **Form fields** — `CheckBox`, `ComboBox`, `ListBox`, `RadioButton`, `TextBox`, `SignatureField`. Every property: tooltip, default value, list options.
- **Animation** (§10.3 "Animation Settings") — every motion preset enum, custom timing settings, `TimingSetting` element with multiple `TimingGroup` children, page-load triggers vs button-triggered.

### 4.6 Stories — Text (§10.4)

This is the largest area and probably 40% of total renderer surface. The `Story` element has 200+ simple attributes and 40+ complex ones (§10.4 intro). Atomic files should each hit one attribute or one small interaction.

**Story-level (§10.4.6 "Common Text Properties")**:
- `StoryDirection` (left-to-right, right-to-left, vertical right-to-left).
- `StoryPreference` properties — optical margin alignment, story direction, frame type.

**Paragraph-level — within `ParagraphStyleRange`**:
- `Justification` — every enum value: `LeftAlign`, `RightAlign`, `CenterAlign`, `LeftJustified`, `RightJustified`, `CenterJustified`, `FullyJustified`, `ToBindingSide`, `AwayFromBindingSide`.
- Indents — `LeftIndent`, `RightIndent`, `FirstLineIndent` (positive and negative), `LastLineIndent`.
- `SpaceBefore`, `SpaceAfter`.
- Composer — `SingleLineComposer` vs `ParagraphComposer` vs `AdobeWorldReadyParagraphComposer` vs `AdobeWorldReadySingleLineComposer` vs `AdobeJustificationComposer`.
- Hyphenation — `Hyphenation` on/off, `HyphenateLadderLimit`, `HyphenationZone`, `HyphenationLastWord`, `HyphenateAcrossColumns`.
- Justification settings — `MinimumWordSpacing`, `DesiredWordSpacing`, `MaximumWordSpacing`, ditto letter and glyph.
- `KeepWithNext`, `KeepWithPrevious`, `KeepLinesTogether`, `KeepFirstLines`, `KeepLastLines`, `KeepAllLinesTogether`, `StartParagraph` (`Anywhere`, `NextColumn`, `NextFrame`, `NextPage`, `NextOddPage`, `NextEvenPage`).
- Drop caps — `DropCapCharacters`, `DropCapLines`, `DropCapDetail` (cap-height alignment, descender clearance), drop cap style override.
- Rules above/below — `RuleAbove`, `RuleBelow`, with all their sub-properties (color, weight, offset, indent, type, gap color, overprint).
- Tabs — `TabList` with multiple `ListItem` `TabStop` records: alignment, position, leader characters, alignment characters.
- Bullets and numbering — `BulletsAndNumberingListType` (`NoList`, `BulletList`, `NumberedList`), `BulletChar`, `NumberingFormat` (every format), `NumberingExpression`, `NumberingLevel`, `NumberingContinue`, `NumberingStartAt`, `BulletsTextAfter`, `BulletsAlignment`.
- Paragraph shading — `ParagraphShadingOn` and all `ParagraphShading*` properties (color, tint, top/bottom offset, left/right offset, corner radius).
- Paragraph border — `ParagraphBorderOn` and all border properties.
- GREP styles — `GREPStyle` elements with regex and applied character style.
- Nested styles — `NestedStyle`, `NestedLineStyle`, `NestedGrepStyle` elements with delimiter and applied character style.
- Span columns and split column — `SpanColumnType`, `SpanColumnMin­SpaceAfter`, `SpanSplitColumnCount`, etc.

**Character-level — within `CharacterStyleRange`**:
- `AppliedFont`, `FontStyle`, `PointSize`, `Leading` (numeric or `Auto`), `Tracking`, `KerningMethod` (`Manual`, `Metrics`, `Optical`, `MetricsRomanOnly`), `KerningValue`, `BaselineShift`.
- `Capitalization` (`Normal`, `SmallCaps`, `AllCaps`, `CapToSmallCap`).
- `Position` (`Normal`, `Superscript`, `Subscript`, `OTSuperscript`, `OTSubscript`, `OTNumerator`, `OTDenominator`).
- Underline and strikethrough — every `Underline*` and `StrikeThru*` property: weight, offset, type, color, tint, gap color, overprint.
- `FillColor`, `FillTint`, `OverprintFill`, `StrokeColor`, `StrokeTint`, `StrokeWeight`, `OverprintStroke`.
- OpenType features — `OTFContextualAlternate`, `OTFDiscretionaryLigature`, `OTFFigureStyle` (`Default`, `Tabular­Lining`, `Proportional­Oldstyle`, `Proportional­Lining`, `Tabular­Oldstyle`), `OTFHistorical`, `OTFOrdinal`, `OTFFraction`, `OTFTitling`, `OTFSlashedZero`, `OTFSwash`, `OTFStylisticAlternate`, `OTFLocale`, `OTFMark`, `OTFLanguage`. Each with ON/OFF where applicable.
- Stylistic sets — `OTFStylisticSets` (1-20).
- Ligatures — `Ligatures` boolean.
- `NoBreak`.
- `RubyFlag` and ruby properties (alignment, position, type, font, size, color, overprint, scale).
- `Tatechuyoko` (and `TatechuyokoXOffset`, `TatechuyokoYOffset`).
- `Warichu` and warichu properties.
- `Kashidas`, `DiacriticPosition`, `DigitsType` for Middle-Eastern scripts.

**Special characters — child elements of `CharacterStyleRange`**:
- `Br` (paragraph break), `Content`-embedded special characters (forced line break, column break, frame break, page break, odd-page break, even-page break, soft hyphen, discretionary hyphen, non-breaking hyphen, em space, en space, hair space, thin space, sixth space, quarter space, third space, punctuation space, figure space, flush space, non-breaking space, fixed-width non-breaking space, zero-width non-joiner, zero-width joiner, indent-to-here, right-indent tab, end-nested-style-here, end-of-paragraph, end-of-story, marker types).
- `ChangeBar`, `Change` for tracked changes.
- `Note` — embedded notes.
- Index markers — `PageReference` and friends.
- Footnote — `Footnote` element with its own internal paragraphs.

### 4.7 Stories — Inline Elements (§10.4.10)

- **Tables** — see §4.9 below.
- **Anchored frames and graphics** — every `AnchoredObjectSetting` combination: positioning (inline, above-line, custom), reference point on anchored object and on anchor, X/Y values, `AnchorXOffset`, `AnchorYOffset`, `Spine­Relative`, vertical reference (`PageEdge`, `TextFrame`, `LineBaseline`, `LineXHeight`), prevent manual positioning.
- **Hyperlink text source / destination** — internal text-anchor link, URL link, external page link.
- **Cross-reference source** — paragraph cross-ref, page number cross-ref.
- **Form field inline** — inline `TextBox`, `CheckBox` etc.

### 4.8 Stories — XML Tagging (§10.4.9 "XML Elements in Text", §10.5 "XML Elements")

- `XMLElement` wrapping content within paragraph and character style ranges.
- `XMLAttribute` on tagged elements.
- `XMLInstruction`, `XMLComment`.
- Range-breaking interactions per §10.4.10 — XML element overlapping a character style range (XML wins; range splits).

### 4.9 Tables (§10.4.10 "Tables", "Cell")

- **Basic tables** — different row/column counts (1×1, 1×n, n×1, n×m); explicit `RowCount` and `ColumnCount`.
- **Headers and footers** — `HeaderRowCount`, `FooterRowCount`; tables that span across multiple frames showing repeating headers.
- **Cell types** — text cell, graphic cell (containing an image), nested-table cell.
- **Borders** — every per-side border attribute on the `Table` element (`TopBorder*`, `LeftBorder*`, `BottomBorder*`, `RightBorder*` — weight, type, color, tint, overprint, gap color, gap tint, gap overprint).
- **Alternating fills** — `AlternatingFills` (`None`, `AlternatingRows`, `AlternatingColumns`), with first/last skip counts and start row/column properties (count, color, weight, type, tint).
- **Merged cells** — horizontal merge, vertical merge, mixed merge; `MergedHorizontally`, `MergedVertically`, `RowSpan`, `ColumnSpan`.
- **Cell properties** — `CellStyle` reference, cell insets per side, vertical justification, rotation (0°, 90°, 180°, 270°), diagonal lines (`DiagonalLineInFront`, all `Diagonal*` properties, `DiagonalLineType` enum values).
- **Row properties** — `MinimumHeight`, `MaximumHeight`, `Height`, `RowType` (`HeaderRow`, `FooterRow`, `BodyRow`), `KeepWithNextRow`.
- **Column properties** — `Width`.
- **Table flow** — table that breaks across two threaded frames; table that exceeds its frame (overset).

### 4.10 Fonts (§Fonts)

- **`FontFamily`** with multiple `Font` children (Regular, Italic, Bold, Bold Italic, plus weights like Light, Black, Condensed where available).
- **OpenType vs TrueType vs PostScript** — generate samples that reference each, where the test fixture fonts exist.
- **Composite fonts** (§Fonts "Composite Font") — Japanese composite font referencing multiple base fonts for Latin/Kana/Kanji/punctuation.
- **Missing-font fallback** — sample with a font reference whose `FontFamily` or `Font` is not present in `Fonts.xml` (renderer behavior under missing fonts is itself a feature).

### 4.11 Colors and Swatches (§Graphics "Colors and Swatches")

- **Swatch types** — `[None]`, `[Paper]`, `[Black]`, `[Registration]`, named user colors, gradient swatches, mixed-ink swatches, mixed-ink-group swatches.
- **`Color` space** — `RGB`, `CMYK`, `LAB`, `Spot`, `MixedInk`. Each at multiple values including pure black, pure white, mid-gray, all-channel-100.
- **`Tint`** (§Graphics "Tint") — tint of a base color.
- **`Gradient`** — linear and radial; `GradientStop` arrays of length 2, 3, and many; stops with locations 0, 1, and intermediate; midpoint values not at 0.5.
- **`MixedInk`** and **`MixedInkGroup`** — multiple inks at varying percentages.
- **`Ink`** — process inks (cyan, magenta, yellow, black) and spot inks; `InkType` (`Normal`, `Opaque`, `OpaqueIgnore`, `Transparent`); ink alias for spot color simulation.

### 4.12 Stroke Styles (§Graphics "Stroke Styles")

- **Built-in styles** — `$ID/Solid`, `$ID/ThinThin`, `$ID/ThinThick`, `$ID/ThickThin`, `$ID/ThickThick`, `$ID/Dotted`, `$ID/Dashed`, `$ID/Wavy`, all variants.
- **Custom `StrokeStyle`** — dashed (with custom dash/gap pattern arrays), dotted (with custom dot diameter and gap), striped (with custom stripe widths summing to 1.0).

### 4.13 Effects and Transparency (§10.3 "Transparency", §Preferences "TransparencyDefaultContainerObject")

For each of fill, stroke, content (text), and object as a whole — the `TransparencySetting` and child effect elements:

- **`BlendingSetting`** — `BlendMode` every enum value (`Normal`, `Multiply`, `Screen`, `Overlay`, `SoftLight`, `HardLight`, `ColorDodge`, `ColorBurn`, `Darken`, `Lighten`, `Difference`, `Exclusion`, `Hue`, `Saturation`, `Color`, `Luminosity`); `Opacity` (0, 25, 50, 75, 100); `KnockoutGroup`, `IsolateBlending`.
- **`DropShadowSetting`** — applied yes/no, mode, color, opacity, blur, X/Y offset, distance, angle, use global light, honor other effects, knockout, spread.
- **`InnerShadowSetting`** — same coverage.
- **`OuterGlowSetting`**, **`InnerGlowSetting`** — technique (`Softer`, `Precise`), color, mode, noise, choke, source.
- **`BevelAndEmbossSetting`** — every style (`OuterBevel`, `InnerBevel`, `Emboss`, `PillowEmboss`), technique, depth, direction, size, soften, angle, altitude, highlight/shadow modes.
- **`SatinSetting`** — color, mode, opacity, angle, distance, size, invert.
- **`FeatherSetting`** — `BasicFeather`, `DirectionalFeather`, `GradientFeather`. For directional: per-side widths, choke, angle. For gradient: gradient stops, angle, length.
- **Effects on different targets** — same effect applied to fill only vs to text only vs to whole object — to verify the renderer routes effects correctly.

### 4.14 Styles (§Styles)

- **`ParagraphStyle`** — basic style with one property; style based on another (verify cascading); style with all 200+ properties set.
- **`ParagraphStyleGroup`** — flat and nested groups.
- **`CharacterStyle`** — same coverage; "based on" cascading.
- **`ObjectStyle`** — every category enabled/disabled (`EnableFill`, `EnableStroke`, `EnableEffects`, `EnableTextFrameGeneralOptions`, etc.).
- **`TableStyle`** — referencing cell styles for header/footer/body/left-column/right-column slots.
- **`CellStyle`**.
- **`TOCStyle`** — single-level and multi-level TOCs; with paragraph style filters; with leader characters.
- **`TrapPreset`** — at least one custom preset referenced from a page.
- **Style inheritance and override** — sample where a paragraph applies a style and locally overrides a single attribute. This catches "render local override correctly" bugs.

### 4.15 Preferences (§Preferences)

For renderer purposes, only some preferences affect output. Cover at minimum:

- `TransparencyPreference`, `TransparencyDefaultContainerObject`.
- `TextPreference` — smart quotes, optical kerning default, justify text next to object.
- `StoryPreference` — story direction default.
- `GridPreference`, `GuidePreference` — for visible-grid samples (typically not in print PDF).
- `MarginPreference`, `DocumentPreference`.
- `TextWrapPreference` global defaults.
- `BaselineFrameGridOption` document-level.
- `ChapterNumberPreference`, `FootnoteOption`.
- `PrintPreference`, `EPubExportPreference`, `HTMLExportPreference`, `XMLExportPreference` — typically don't affect print PDF but must be present and well-formed for InDesign to open the file.

### 4.16 Geometry — Cross-cutting (§10.3.2)

This is the highest-leverage area for renderer correctness. The spec dedicates §10.3.2 to it with worked examples in "Geometry Example."

- **Identity transform** — a frame at origin with identity `ItemTransform`.
- **Pure translation** — non-zero translate, identity scale/rotation.
- **Pure rotation** — 30°, 45°, 90°, 180°, 270°, 359°, very small angles (0.1°), negative angles.
- **Pure scaling** — uniform, non-uniform, negative scale (mirror), zero scale (degenerate).
- **Pure shear/skew** — horizontal, vertical, both.
- **Composite transforms** — translate then rotate; rotate then translate (different result); rotate around a non-origin point (decomposed as translate-rotate-translate).
- **Nested transforms** — page item inside a `Group` with its own `ItemTransform`; nested groups three-deep; rotated group containing a rotated child (verify that the renderer composes parent×child correctly and not child×parent).
- **`PathGeometry`** in object-local coordinates — vertices given in local coordinates; the `ItemTransform` then places the object on the spread; the `Spread` itself may have an `ItemTransform` (90°-multiple rotation per spec). Three layers of transformation that all must compose correctly.
- **Pasteboard coordinates** — items placed on the pasteboard (outside any page); spread coordinates; page coordinates; verify the renderer handles them per spec §10.3.2 "Pasteboard Coordinates" / "Spread Coordinates" / "Page Item Geometry."

### 4.17 Groups, Compound Paths, Nested Items (§10.3 "Group", §10.3.3 "Nested Objects and IDML Structure")

- Simple group of two items.
- Group containing groups three-deep.
- Group with effects on the group itself plus effects on a child.
- Compound path (a `Polygon` with multiple sub-paths in its `PathGeometry`) — even-odd fill rule visible.
- Item nested inside a group nested inside a group, where the innermost has rotation, the middle has scale, and the outermost has translation — to verify transform composition.

### 4.18 Text on Path

(Spec covers this within Spread/MasterSpread and `Story` — text frames with `TextPath`.)

- Text on an open Bezier path; text on a closed path; text on a circle; text on a star polygon.
- Path effects — `Rainbow`, `Skew`, `3DRibbon`, `Stair­Step`, `Gravity`.
- Text-on-path alignment to path — `Ascender`, `Descender`, `Center`, `Baseline`.
- Text-on-path alignment perpendicular — `LeftAlign`, `RightAlign`, `CenterAlign`.
- Inverted text on path (flow-direction reversal).

### 4.19 Footnotes and Endnotes

- Document with a single footnote.
- Document with footnotes on multiple pages and across threaded frames.
- Footnote numbering format variants; restart per page vs continuous.
- Footnote separator styles.

### 4.20 IDML Variants (Appendix B)

Out of scope for the primary renderer test corpus, but worth a short tier of files for completeness:

- **`.idms` Snippets** — single-XML-file IDML fragments.
- **`.icml`** — InCopy stand-alone story files.
- **`.icma`** — InCopy assignment files.

These should be in their own folder and not run through the same pass/fail pipeline as full IDML packages, since they don't produce a full PDF on their own.

---

## 5. Sample File Naming Convention

A predictable naming convention is essential for human navigation and for automated diffing. Recommended scheme:

```
<area>__<feature>__<variant>[__<modifier>].idml
```

Two underscores between segments, single underscores within. Examples:

```
text__justification__fully-justified.idml
text__justification__center-aligned.idml
text__drop-cap__3-lines-2-chars.idml
text__nested-style__delim-tab-applies-bold-italic.idml
spline__corner-option__inverse-rounded-2mm.idml
spline__stroke-dash__3-2-2-2-pattern.idml
gradient__radial__cmyk-3-stops.idml
gradient__linear__rgb-2-stops-angle-45.idml
table__merged__horizontal-2-cells-row-2.idml
effect__drop-shadow__on-text-only-multiply.idml
effect__feather__directional-asymmetric.idml
geometry__transform__rotate-45-then-translate.idml
geometry__nested__group-rotate-30-child-rotate-60.idml
xml__tagging__element-spans-2-paragraphs.idml
master__override__page-number-overridden.idml
```

Tier 2 files use a `combo__` prefix:

```
combo__transparency-x-spot-color__multiply-on-pantone-185.idml
combo__rotated-frame-x-drop-shadow__45deg-with-shadow.idml
```

Tier 3 files use a `realistic__` prefix and a descriptive name:

```
realistic__magazine-spread-2col.idml
realistic__cjk-vertical-tategumi.idml
realistic__financial-report-tables.idml
```

Each sample folder contains the `.idml`, the InDesign-exported reference PDF, and a small `meta.json` describing what the sample exercises:

```json
{
  "id": "text__drop-cap__3-lines-2-chars",
  "spec_section": "10.4 Stories — Common Text Properties (Drop caps)",
  "features": ["DropCapCharacters", "DropCapLines"],
  "tier": 1,
  "indesign_version": "2024.x",
  "notes": "Drop cap of 2 characters, 3 lines tall, default detail."
}
```

---

## 6. Validation Workflow

The end-to-end loop:

1. **Generate** — generator emits the `.idml`, validates against Relax NG, writes `meta.json`.
2. **Open in InDesign** — manually or scripted (ExtendScript / UXP) — and export reference PDF with a fixed preset (interactive PDF preset for interactive samples; high-quality print preset for the rest). Save as `<sample-id>.reference.pdf` next to the `.idml`.
3. **Render** — the renderer produces `<sample-id>.rendered.pdf`.
4. **Diff** — pixel-diff and structural-diff at high DPI (300 DPI minimum). Tools: `diff-pdf`, `pdf-diff`, or a custom rasterize-and-compare pipeline using ImageMagick + pixel-difference threshold.
5. **Triage** — diff results aggregated into a dashboard: per-tier pass rate, per-spec-section pass rate, per-feature pass rate. Failing samples linked to their `meta.json` so a developer immediately knows which spec area is broken.

**InDesign export automation.** A simple ExtendScript snippet can iterate every `.idml` in a folder, open it, export to PDF with a named preset, close it, and continue. This is essential at scale — manually exporting 600+ reference PDFs is not viable. The script should run with `app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;` to suppress dialogs.

**Reference PDF caveats.** InDesign's PDF export is not deterministic across versions; minor pixel-level shifts occur with point releases. Pin a specific InDesign version for the reference corpus and re-export only when consciously upgrading. Store the InDesign version in `meta.json`.

**Tolerance buckets.** Not all diffs are equal. A 1-pixel shift in a stroke is typically acceptable; a missing glyph is not. Configure the diff tool with categorized thresholds and report them separately.

---

## 7. Phased Roadmap

The corpus is too large to build at once. A four-phase plan focuses effort on the highest-impact areas first:

**Phase 1 — Skeleton (1–2 weeks).** Package writer (UCF/Zip + mimetype + container.xml + designmap.xml). Minimal `Spread` with one `Rectangle`. Hello-world `Story`. Validation against Relax NG. End-to-end: generator emits → InDesign opens → exports PDF → renderer renders → diff runs. ~10 files. The point is to prove the pipeline.

**Phase 2 — Geometry and primitives (3–4 weeks).** All spline-item types × geometry transformations × strokes/fills/gradients. ~150 atomic files. This phase typically uncovers the most renderer bugs because geometry composition is where most renderers cut corners.

**Phase 3 — Text (4–6 weeks).** Stories, paragraph and character style ranges, tables, anchored objects, special characters. ~200 atomic files. The longest phase; text is the largest surface in IDML.

**Phase 4 — Effects, interactive, edge cases (3–4 weeks).** Transparency, shadows, glows, beveling, feathering. Buttons and form fields if interactive PDF export is in scope. CJK and RTL coverage. ~100 atomic files plus the Tier 2 combinatorial files derived from interaction matrices.

**Ongoing — Tier 3 realistic documents and regressions.** Add a Tier 3 sample whenever a real-world IDML file uncovers a renderer bug; the bug then has a permanent regression test.

---

## 8. Pitfalls and Edge Cases

A non-exhaustive list of things that bite IDML renderers in practice and that the sample corpus should specifically target:

**Coordinate systems.** Spec §10.3.2 is unambiguous, but the multi-layer transformation (Spread `ItemTransform` × Page implicit transform × Group `ItemTransform` × Item `ItemTransform` × `PathGeometry` local coordinates) is where most renderers have at least one off-by-one error. Build samples that isolate each layer.

**Empty elements.** Spec §9.1.2 ("Use of Empty Elements"): IDML uses many empty elements as flags. A renderer that skips empty elements as "no content" silently loses information. Specifically test paths with single-point geometries, empty gradient stop lists (illegal but found in the wild), zero-page spreads.

**Self-attribute references.** Cross-references between files are by `Self` value, not by file name. A single misspelled `Self` attribute breaks an entire reference chain silently. Sample files should specifically include long reference chains (Story → ParagraphStyle → BasedOn ParagraphStyle → AppliedFont → FontFamily → Font).

**Style cascade and local overrides.** A `CharacterStyleRange` with both `AppliedCharacterStyle` and locally set `FontStyle` should render with the local override winning. A sample matrix combining "style sets X" × "local override sets X" × "local override sets Y while style sets X" catches override-precedence bugs.

**InDesign tolerance to broken files.** InDesign opens many invalid IDML files by silently repairing them. Your renderer probably does not. Generate borderline-invalid samples only after generating valid ones, and clearly mark them as "renderer should reject" vs "renderer should auto-recover".

**Font availability.** The renderer's environment must have the same fonts as InDesign's reference-export environment. Pin the test font set and refuse to generate samples that reference non-pinned fonts. When testing missing-font behavior, do so explicitly with a known-missing font name.

**Color management.** The same CMYK values rendered with two different ICC profiles produce visibly different PDFs. Pin the document and working-space profiles in every sample. For RGB-to-CMYK conversion samples, document the rendering intent in `meta.json`.

**ZIP edge cases.** UCF requires `mimetype` to be the first uncompressed entry. Some Zip libraries reorder entries or compress them by default. Test the package writer specifically: verify by hex-dumping the resulting `.idml` that the first entry is `mimetype` at offset 30 (after the local file header) and is stored with method 0.

**Encoding.** All IDML XML files are UTF-8. InDesign emits a BOM in some files and not others. Match its convention (BOM in `designmap.xml`; no BOM in story files — verify against an InDesign export). Include samples with non-Latin Unicode in the content (combining marks, surrogate pairs for emoji, mixed-script paragraphs).

**Threading.** A story spanning N text frames is not the same as N stories. The frame ordering in `PreviousTextFrame` / `NextTextFrame` chains determines reading order. Build samples with deliberately twisted threading (frame 3 → frame 1 → frame 2) to catch readers that assume document-order = thread-order.

**Master-page item overrides.** When a document page overrides a master-page item, the override appears as a normal page item on the document page, with `OverriddenMasterPageItem` referring to the master item. The renderer must merge master items with overrides correctly: master item present and not overridden → render from master; master item overridden → render override only; document-page-only item → render normally.

**Spec-vs-reality drift.** The IDML spec is from 2012 (CS5.5 / 7.5). Every InDesign release since has added attributes and enum values not in the spec. The generator should be schema-driven, but the schema should be augmented with every "found in real exports" attribute, with a comment indicating "not in v8.0 spec, observed in InDesign 20xx export."

**Footnote-in-table-in-anchored-frame.** Combinatorial nesting of inline elements is a renderer minefield. Build at least one Tier 2 sample for each three-level nesting that is legal per the schema.

---

## 9. Summary Checklist

A brief operational checklist for the sample-generator effort, suitable as a sprint-tracker breakdown:

- Set up the generator project skeleton with the directory structure in §2.
- Implement the UCF/Zip package writer; verify `mimetype` placement byte-by-byte.
- Implement deterministic `Self` ID generation.
- Encode all IDML enums from spec §9.4.2 in a single source-of-truth module.
- Validate every output against the IDML Relax NG schema.
- Build the Phase 1 skeleton corpus (10 files end-to-end).
- Automate the InDesign reference-export pipeline (ExtendScript / UXP).
- Set up the diff dashboard with per-section pass-rate tracking.
- Phase 2: geometry and primitives — 150 atomic files.
- Phase 3: text — 200 atomic files.
- Phase 4: effects, interactive, edge cases — 100 atomic files plus Tier 2 combos.
- Ongoing: Tier 3 realistic documents driven by real-world bug reports.

---

*Briefing version 1.0 — based on IDML File Format Specification v8.0 (Adobe, 2012). Update this document as the renderer encounters real-world IDML features outside the spec.*