# IDML Faithful Renderer — Technical Specification

**Version:** 0.2 (Draft)
**Status:** Working draft for review
**Audience:** Engineering leads, product, architecture review
**Last updated:** 2026-04-24

**Change from v0.1:** Backend strategy revised to WebGPU-only via `wgpu`, with a Vello-inspired tile-based compute rasterizer. Canvas2D, WebGL, and SVG backends removed. Multi-target support (browser + native) added as a first-class architectural property rather than a future option.

-----

## 1. Summary

A renderer for Adobe InDesign Markup Language (IDML) documents. Consumes an `.idml` package and produces pixel-faithful output on a WebGPU surface (browser) or via a native graphics API (desktop, server). The core is implemented in Rust and compiled to both WebAssembly (for browsers) and native targets (via `wgpu`’s Vulkan/Metal/DX12 backends). A thin TypeScript API surfaces the renderer to host applications.

The goal is print-grade fidelity — output a print professional would accept as a proof against the same document rendered by InDesign itself.

This is a multi-year engineering commitment. The spec defines scope, architecture, and phased delivery.

-----

## 2. Goals

- **Faithful rendering.** Visual output matches InDesign’s PDF export within defined tolerance thresholds (§13).
- **WebGPU-first.** Single backend, built on compute shaders. No fallback to legacy APIs.
- **Deterministic output.** Same IDML and asset set produces byte-identical output across runs and platforms.
- **Multi-target by default.** The same Rust core renders in browsers (WASM + WebGPU) and natively (Vulkan/Metal/DX12). Native builds support server-side rendering and desktop integration.
- **Performance parity with native rendering.** Browser output performance within 2× of native. No CPU-bound rasterization.
- **Embeddable.** Library, not application. Host controls viewport, UI, document lifecycle.

## 3. Non-Goals

- **Authoring.** Renderer only, no editing surface.
- **Third-party InDesign plugin data.** Extensions outside standard IDML elements are ignored.
- **Round-tripping.** Read-only. No IDML emission.
- **Font fallback in fidelity mode.** Missing fonts are fatal errors. A separate preview mode may permit fallbacks with visual warnings.
- **WebGPU emulation for unsupported browsers.** If `navigator.gpu` is absent, the renderer reports an unsupported-platform error. No silent degradation.
- **Pre-WebGPU browsers.** Safari < 17.4, Chrome < 113, Firefox < 141, any mobile browser without WebGPU exposure. Explicitly out of scope.

-----

## 4. Fidelity Targets

Measured against a reference PDF exported from InDesign at 300 DPI, color-managed to sRGB.

|Dimension                          |Target                                               |Notes                                 |
|-----------------------------------|-----------------------------------------------------|--------------------------------------|
|Glyph position                     |≤ 0.25 pt RMS per line                               |Measured after shaping + line-breaking|
|Line break points                  |100% match on calibrated corpus                      |Paragraph Composer parity             |
|Color (sRGB output)                |ΔE2000 ≤ 1.0 mean, ≤ 2.5 p99                         |Per-pixel sampled                     |
|Geometry (vector)                  |≤ 0.1 pt deviation                                   |Paths, strokes, fills                 |
|Raster placement                   |Exact pixel alignment                                |Same resampling filter family         |
|Transparency flattening            |Visual match; documented exceptions for extreme cases|                                      |
|Cross-platform (browser vs. native)|Byte-identical output                                |Same wgpu pipeline, same shaders      |

Fidelity is a release gate. A regression corpus enforces it (§13).

-----

## 5. Architecture

### 5.1 High-level

```
┌─────────────────────────────────────────────────────────────┐
│                      Host application                      │
│              (browser JS/TS, or native host)                │
└───────────────────────┬─────────────────────────────────────┘
                        │ TS or Rust API
┌───────────────────────▼─────────────────────────────────────┐
│                   Binding layer (thin)                      │
│       (wasm-bindgen for browser; native Rust API)           │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                       Rust core                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  IDML    │  │  Scene   │  │   Text   │  │    Color    │  │
│  │  parser  │──│  graph   │──│  engine  │──│   manager   │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Display-list compositor (CPU)                │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ structured buffers
┌───────────────────────▼─────────────────────────────────────┐
│                      wgpu / WebGPU                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tile-based compute rasterizer (WGSL shaders)        │   │
│  │  — path rasterization, compositing, blending,        │   │
│  │    effects, color transforms                         │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ GPU surface
                    Browser canvas
                    or native window
                    or offscreen texture
```

### 5.2 Component responsibilities

- **IDML parser.** Unzips IDML, streams XML into typed Rust structs, validates against supported schema subset.
- **Scene graph.** In-memory representation of spreads, pages, stories, frames, styles. Immutable post-construction.
- **Text engine.** Shapes, breaks, composes stories into frame-bound layouts. Produces positioned glyph runs with associated style state.
- **Color manager.** ICC-based transforms. Resolves all colors to a linear working space for GPU compositing. Final sRGB conversion happens in a shader.
- **Display-list compositor.** Walks the laid-out scene graph and emits a structured command buffer: paths, fills, clips, blend state, effects. This buffer is the handoff to the GPU.
- **GPU rasterizer.** Tile-based compute pipeline. Reads the display list as storage buffers, produces the final framebuffer. Vello-inspired architecture.
- **Binding layer.** Exposes a Promise-based API in browsers, an idiomatic Rust API natively. Manages asset resolution callbacks.

### 5.3 Rendering backend

**WebGPU via `wgpu`.** Single backend. Shaders in WGSL. In browsers, `wgpu` targets `navigator.gpu` directly. Natively, `wgpu` targets Vulkan (Linux/Windows), Metal (macOS/iOS), or DX12 (Windows). Same shader source, same Rust code, same fidelity output.

**No legacy fallback.** If WebGPU is unavailable at runtime, the renderer returns a clear error and exits. Hosts that need broad compatibility should gate the renderer behind their own feature detection.

**Rationale.**

- Compute shaders enable tile-based path rasterization with correct antialiasing, which is where this renderer spends most of its GPU time.
- Storage buffers let us ship structured display-list data to the GPU without awkward texture-packing.
- Explicit pipeline state eliminates a class of hidden-state bugs that matter acutely in a fidelity-critical renderer.
- A single backend means one fidelity contract, one regression corpus, one set of shaders to debug.
- Native targets via `wgpu` are essentially free: server-side rendering and desktop apps become a recompile, not a rewrite.

-----

## 6. Data Model

### 6.1 IDML package structure

IDML is a ZIP container:

- `designmap.xml` — root manifest
- `Resources/Graphic.xml`, `Fonts.xml`, `Styles.xml`, `Preferences.xml`
- `MasterSpreads/MasterSpread_*.xml`
- `Spreads/Spread_*.xml`
- `Stories/Story_*.xml`
- `META-INF/container.xml`, `mimetype`

The parser follows `designmap.xml` and builds a resolved document tree. Unknown elements are logged but do not fail parsing (forward compatibility).

### 6.2 Internal scene graph

Immutable, reference-counted (`Arc`), indexable by ID:

```
Document
├── Resources (fonts, colors, styles, ICC profiles)
├── MasterSpreads[]
└── Spreads[]
    └── Pages[]
        └── Frames[] (TextFrame | GraphicFrame | Group)
            ├── geometry (path, transform)
            ├── fill / stroke
            ├── effects[]
            └── content (Story ref | Image | nested Frames)
Stories[]
└── Paragraphs[]
    └── CharacterRuns[]
        └── styled characters
```

Style resolution happens at scene-graph construction: paragraph → character → local overrides are flattened into effective per-run style objects.

### 6.3 Display list

The output of the compositor and the input to the GPU rasterizer. A flat, indexable command stream:

```rust
enum DisplayCommand {
    FillPath { path_id: u32, paint: Paint, transform: Mat3, clip: Option<ClipId> },
    StrokePath { path_id: u32, stroke: Stroke, paint: Paint, transform: Mat3, clip: Option<ClipId> },
    DrawImage { image_id: u32, rect: Rect, transform: Mat3, resampler: Resampler, clip: Option<ClipId> },
    PushLayer { bounds: Rect, blend_mode: BlendMode, opacity: f32, mask: Option<MaskId> },
    PopLayer,
    PushClip { path_id: u32, transform: Mat3 },
    PopClip,
    // ... effects encoded as layer push/pop with shader parameters
}
```

Paths are indexed into a separate buffer of tessellated bezier segments. Text is expanded to filled paths (one `FillPath` per glyph, or batched by style run). This unifies text and vector rendering through the same GPU pipeline.

-----

## 7. Rendering Pipeline

```
IDML bytes
   │
   ▼
[Parse] → Document AST
   │
   ▼
[Resolve] → Scene graph with resolved styles, links, assets
   │
   ▼
[Layout] → Text composed into frames; geometry finalized
   │
   ▼
[Compose] → Display list + path buffer + paint buffer
   │
   ▼
[Upload] → GPU storage buffers
   │
   ▼
[Coarse binning] → per-tile command lists (compute pass 1)
   │
   ▼
[Fine rasterization] → per-tile pixel output (compute pass 2)
   │
   ▼
[Present] → WebGPU surface or offscreen texture
```

Stages are independently testable and cacheable. Re-rendering at a different zoom level re-runs from [Upload] onward; layout is reused. Scrolling re-runs only [Fine rasterization] for newly visible tiles.

-----

## 8. Text Engine

The highest-risk subsystem. Roughly 40% of project effort.

### 8.1 Shaping

- **Library:** `rustybuzz` (pure-Rust HarfBuzz port) or HarfBuzz-in-WASM if we hit parity issues.
- OpenType features, complex scripts (Arabic, Devanagari, CJK), ligatures, contextual alternates.
- Font metrics via `ttf-parser`.
- Per-run shaping: each character run (homogeneous style) shaped independently, results concatenated.

### 8.2 Line breaking

- **Algorithm:** Knuth-Plass with penalty weights calibrated against InDesign’s Paragraph Composer.
- Justification parameters (word space, letter space, glyph scaling min/desired/max) from paragraph style.
- Optical margin alignment: per-glyph offset table.
- Keeps, widows, orphans, column balancing as soft constraints.

**Open problem:** InDesign’s penalty weights are not published. Reverse-engineered from calibration corpus (§13). Ongoing refinement expected.

### 8.3 Hyphenation

- **Library:** `hyphenation` crate (TeX patterns) plus language-specific dictionaries.
- Dictionary parity: InDesign uses Proximity dictionaries by default. Options: license Proximity data, or ship TeX patterns and document divergence on edge cases.
- User-defined exceptions from IDML preferences honored.

### 8.4 Glyph rasterization

- Shaped glyphs positioned by the text engine become `FillPath` commands in the display list.
- Glyph outlines extracted from fonts by `ttf-parser`, passed through the GPU rasterizer like any other path. **No separate text rendering path.**
- This means text and vector graphics share antialiasing, subpixel positioning, and blending behavior by construction. Fidelity divergence between text and vectors becomes structurally impossible.
- Glyph cache: repeated glyphs in the same style keyed by (glyph_id, font, size, transform) — tessellated path data is cached in a GPU buffer to avoid re-tessellation per instance.

### 8.5 Composition features

|Feature                                 |Priority|Notes                                             |
|----------------------------------------|--------|--------------------------------------------------|
|Left/right/center/justify               |P0      |Baseline                                          |
|Optical kerning                         |P0      |Own implementation, matches InDesign approximately|
|Metric kerning                          |P0      |From font                                         |
|Optical margin alignment                |P1      |Per-glyph calibration table                       |
|Tab stops (left, right, center, decimal)|P0      |                                                  |
|Drop caps                               |P1      |Multi-line with style override                    |
|Nested styles                           |P1      |Mid-paragraph character style changes by delimiter|
|GREP styles                             |P2      |Regex-triggered character styles                  |
|Bullets and numbering                   |P1      |                                                  |
|Footnotes                               |P2      |Interacts with main flow composition              |
|Tables                                  |P2      |Separate composition subsystem                    |
|Text on path                            |P2      |Geometry-driven baseline                          |
|Composite fonts (CJK)                   |P3      |Mojikumi rules                                    |
|Text wrap around objects                |P1      |Complex interaction with line breaking            |
|Anchored objects                        |P2      |Inline and custom-positioned                      |

### 8.6 Font handling

- Fonts are not bundled. Host provides font bytes via resolver callback.
- Missing fonts produce fatal errors with a list of required fonts (family, style, PostScript name).
- No font substitution in fidelity mode. Preview mode may allow fallbacks with visual warnings.
- Font subsetting not our responsibility — we consume full TTF/OTF.

-----

## 9. Color Management

### 9.1 Model

- Every color reference carries explicit color space: `DeviceCMYK`, `DeviceRGB`, `DeviceGray`, `Lab`, spot, or ICC-based.
- Document working spaces (CMYK and RGB) loaded from IDML preferences or defaulted to standards (Coated FOGRA39, sRGB IEC61966-2.1).
- Spot colors have Lab definitions in the IDML swatch; converted to working CMYK for proof or linear RGB for screen.

### 9.2 CPU transforms

- **Library:** Little CMS (`lcms2`) compiled to WASM and linked natively.
- ICC transforms at display-list construction time: all paint colors resolved to a linear RGB working space before shipping to the GPU.
- Rendering intent per object (default: Relative Colorimetric with black point compensation).

### 9.3 GPU compositing

- All blending happens in linear RGB on the GPU. This is correct by construction — linear light is required for physically meaningful blending and no additional logic is needed.
- Final fragment shader converts linear RGB → sRGB (or target output space) per pixel.
- Overprint simulation: when enabled, overprinting objects composite in a CMYK buffer before final conversion. Implemented as a separate render target.

### 9.4 Output modes

- **Screen:** 8-bit sRGB output, gamma-correct.
- **Proof:** output to a specified ICC profile, 16-bit linear intermediate for host consumption.
- **Raw linear:** 16-bit linear RGB framebuffer for hosts that want to apply their own final transform.

-----

## 10. Graphics & Effects

### 10.1 Path rasterization

- **Approach:** tile-based compute, Vello-inspired.
- Coarse pass: for each 16×16 pixel tile, determine which display-list commands intersect. Produce a per-tile command list.
- Fine pass: each tile’s compute workgroup rasterizes its command list into the output framebuffer. Antialiasing by area coverage computation (analytic, not multisampled).
- Handles overlapping paths, self-intersecting paths, even-odd and non-zero fill rules.

### 10.2 Reference implementation

**Study Vello (Linebender) seriously before writing our own rasterizer.** Options:

1. **Use Vello directly.** Deepest integration, fastest path to working rasterization. Constrained by Vello’s feature set and update cadence.
1. **Fork Vello.** Full control; maintenance burden.
1. **Build our own, Vello-inspired.** Maximum flexibility, highest risk.

Decision: start with option 1. Fork (option 2) if we hit blocking limitations. Never option 3 unless Vello becomes unmaintained.

### 10.3 Raster placement

- Supported formats: JPEG, PNG, TIFF (LZW/ZIP/JPEG compression), PSD (flattened + layer comps), AI/PDF (via embedded PDF.js or `pdf-rs`), SVG (limited subset).
- Resampling on GPU via shader: bicubic by default (matches InDesign’s “High Quality Display”). Nearest and bilinear available.
- Embedded ICC profiles honored; images without a profile assumed sRGB.
- Clipping paths (from TIFF/PSD) applied during placement as path clips in the display list.

### 10.4 Effects

All effects implemented as compute shader passes operating on layer textures:

|Effect                                  |Implementation                                       |Priority|
|----------------------------------------|-----------------------------------------------------|--------|
|Drop shadow                             |Two-pass separable Gaussian + offset + color multiply|P0      |
|Inner shadow                            |Inverted clip variant                                |P1      |
|Outer glow                              |Blur + additive blend                                |P1      |
|Inner glow                              |Blur + clip + blend                                  |P1      |
|Bevel and emboss                        |Height map from alpha + Lambert/specular             |P2      |
|Satin                                   |Blurred contour blend                                |P3      |
|Basic feather                           |Alpha gradient on bounding box                       |P0      |
|Directional feather                     |Per-edge alpha                                       |P1      |
|Gradient feather                        |User-defined alpha ramp                              |P1      |
|Opacity                                 |Per-object alpha in paint                            |P0      |
|Blend modes (all PDF 1.7)               |Per-mode WGSL shader function                        |P0      |
|Transparency groups (isolated, knockout)|Intermediate render targets with flag                |P1      |

Blend modes implemented per PDF 1.7 spec directly in WGSL — no reliance on fixed-function blending. This gives correct semantics for all PDF blend modes including `Color`, `Luminosity`, `Hue`, `Saturation`.

-----

## 11. Asset Pipeline

### 11.1 Resolution

Assets (fonts, linked images, ICC profiles) resolved through a host callback:

```typescript
interface AssetResolver {
  resolveFont(family: string, style: FontStyle): Promise<Uint8Array>;
  resolveImage(uri: string): Promise<Uint8Array>;
  resolveICCProfile(name: string): Promise<Uint8Array | null>;
}
```

Renderer does not fetch from URLs directly. Host controls caching, authorization, origin.

### 11.2 Embedded assets

IDML can contain embedded images (Base64 in `Graphic.xml`). Decoded inline, no resolver calls needed.

### 11.3 Preflight

Before rendering, a preflight pass enumerates required assets. Host can pre-load in parallel.

```typescript
const report = await renderer.preflight(idmlBytes);
// report.fonts, report.images, report.profiles
await Promise.all(report.fonts.map(preload));
const rendered = await renderer.render(idmlBytes, { resolver });
```

-----

## 12. Performance

### 12.1 Budgets

|Scenario                                  |Target (browser, WebGPU)|Target (native)|Hardware            |
|------------------------------------------|------------------------|---------------|--------------------|
|A4 page, text-heavy, no effects           |< 120 ms                |< 60 ms        |M2 MacBook          |
|A4 page, mixed text + images + drop shadow|< 250 ms                |< 120 ms       |M2 MacBook          |
|32-page document, cold start              |< 2 s                   |< 1 s          |M2 MacBook          |
|Re-render on zoom change (cached layout)  |< 30 ms                 |< 15 ms        |Same                |
|Pan/scroll (cached tiles)                 |60 fps                  |120 fps        |Same                |
|Memory per open document                  |< 200 MB for 50-page doc|< 200 MB       |Excluding tile cache|

Browser targets assume WebGPU with a reasonably current GPU. Native targets are roughly 2× faster due to lower driver overhead and higher workgroup sizes.

### 12.2 Strategies

- **Layout cache.** Scene graph and composed text layouts cached; zoom changes skip layout, re-run only from [Upload] onward.
- **Tile cache.** Rasterized tiles retained across frames. Invalidated only for tiles whose display-list commands changed.
- **Per-page isolation.** Pages rasterize independently. Off-screen pages deferred.
- **Progressive rendering.** Optional low-resolution preview pass (25% scale) before full resolution. Host opts in.
- **Async compute.** Coarse binning overlaps with fine rasterization of the previous page where the GPU supports multi-queue submission.

### 12.3 Startup

- WASM module target: < 3 MB compressed. Major contributors: rustybuzz, lcms2, Vello.
- Streamable compile via `WebAssembly.instantiateStreaming`.
- First-render initialization target: < 400 ms on warm cache.
- WebGPU adapter/device acquisition: ~50 ms typical.

-----

## 13. Fidelity Validation

### 13.1 Reference corpus

Curated set of IDML documents. Each paired with:

- InDesign-exported PDF at 300 DPI (ground truth)
- Expected renderer output (regenerated on corpus changes)
- Metadata: features exercised, known tolerance exceptions

Initial target: 500 documents across categories (marketing, editorial, packaging, CJK, RTL, tables, effects-heavy).

### 13.2 Diff methodology

Per corpus entry:

1. Render output to PNG at 300 DPI, sRGB.
1. Rasterize reference PDF at same DPI via Ghostscript or CoreGraphics.
1. Compute per-pixel ΔE2000 and SSIM.
1. Report regions exceeding tolerance with overlays.

Pass criteria: mean ΔE < 1.0, p99 ΔE < 2.5, no glyph misplaced by > 0.5 pt, SSIM > 0.99.

### 13.3 Cross-platform verification

Since the same wgpu pipeline runs on all platforms, output must be byte-identical across:

- Chrome + WebGPU on macOS
- Chrome + WebGPU on Linux
- Firefox + WebGPU on Linux
- Native Vulkan on Linux
- Native Metal on macOS
- Native DX12 on Windows

Any divergence is a driver bug or shader non-determinism and must be fixed. CI runs the corpus on all six targets per release.

### 13.4 CI integration

Fidelity tests run on every merge to `main`. Regressions block the merge. Corpus versioned — updates require typography reviewer sign-off.

### 13.5 Manual review

Weekly review of 5% sampled corpus by a typographer. Catches perceptual issues automated diff misses.

-----

## 14. API Surface

### 14.1 TypeScript (browser)

```typescript
export class IDMLRenderer {
  static async initialize(wasmUrl?: string): Promise<IDMLRenderer>;

  async preflight(idml: Uint8Array): Promise<PreflightReport>;

  async render(
    idml: Uint8Array,
    options: RenderOptions
  ): Promise<RenderedDocument>;
}

interface RenderOptions {
  resolver: AssetResolver;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  dpi?: number;                    // default: 96
  colorMode?: 'screen' | 'proof';
  proofProfile?: string;           // ICC name, for proof mode
  progressive?: boolean;
  onProgress?: (event: ProgressEvent) => void;
}

interface RenderedDocument {
  pages: RenderedPage[];
  warnings: Warning[];
}

interface RenderedPage {
  index: number;
  width: number;
  height: number;
  present(): void;                 // draw to bound canvas
  toImageBitmap(): Promise<ImageBitmap>;
  toBlob(type?: string): Promise<Blob>;
}
```

Error types are exhaustive and typed. Missing fonts, unsupported features, unsupported platform (no WebGPU), and parse errors each have distinct classes.

### 14.2 Rust (native)

```rust
pub struct Renderer { /* ... */ }

impl Renderer {
    pub async fn new() -> Result<Self, InitError>;

    pub fn preflight(&self, idml: &[u8]) -> Result<PreflightReport, ParseError>;

    pub async fn render(
        &self,
        idml: &[u8],
        options: RenderOptions<'_>,
    ) -> Result<RenderedDocument, RenderError>;
}
```

Native API mirrors the TS API semantically. Same fidelity contract.

-----

## 15. Build & Deployment

### 15.1 Build

- Rust workspace. Core crate plus per-subsystem crates (`idml-parse`, `idml-text`, `idml-color`, `idml-compose`, `idml-gpu`).
- Browser build: `wasm-pack` + `wasm-bindgen`.
- Native build: standard `cargo build --release`.
- Single source tree; platform-specific code isolated behind feature flags (`feature = "browser"` vs `feature = "native"`).

### 15.2 Distribution

- NPM package: `@pimcore/idml-renderer` (browser). ESM main, `.d.ts`, WASM as side-resource.
- Rust crate: `pimcore-idml-renderer` (crates.io or private registry) for native consumers.
- Versioned semver. Breaking API or fidelity changes are major versions.

### 15.3 Licensing

- Own code: commercial or POCL (TBD based on business model).
- Dependencies requiring audit:
  - wgpu (MIT/Apache-2.0) — permissive
  - Vello (MIT/Apache-2.0) — permissive
  - rustybuzz (MIT) — permissive
  - lcms2 (MIT) — permissive
  - Hyphenation dictionaries (varies — Proximity requires commercial license; TeX patterns LPPL)

-----

## 16. Phased Roadmap

### Phase 0: Foundation (months 1–3)

- Project scaffolding, CI, WASM + native build pipelines.
- `wgpu` integration; render a triangle in browser and natively with identical output.
- IDML parser for supported schema subset.
- Scene graph and style resolution.
- Fidelity corpus infrastructure (10 seed documents).

### Phase 1: Core rendering via Vello (months 3–9)

- Vello integration: paths, fills, strokes, gradients.
- Text shaping (rustybuzz) and naive line breaking.
- Text as paths through Vello.
- Linked image placement (JPEG, PNG).
- **Deliverable:** Renders simple marketing one-pagers recognizably; cross-platform byte-identical output.

### Phase 2: Text composition parity (months 9–18)

- Knuth-Plass composer with calibrated penalties.
- Justification, hyphenation, optical margin alignment.
- Paragraph and character styles fully supported.
- Tab stops, drop caps, nested styles.
- **Deliverable:** Passes fidelity tests on 200 text-focused corpus documents.

### Phase 3: Color and effects (months 15–24)

- Full ICC color management via lcms2.
- Transparency, blend modes, transparency groups.
- Drop shadows, feathering, glows (compute-shader pipelines).
- Spot color preview, overprint simulation.
- **Deliverable:** Passes fidelity tests on 400 corpus documents.

### Phase 4: Advanced text and tables (months 21–30)

- Tables with full styling.
- Footnotes.
- Text on path.
- CJK composition (mojikumi, burasagari).
- Anchored objects.
- **Deliverable:** Passes fidelity tests on 500 corpus documents; editorial and CJK covered.

### Phase 5: Optimization and polish (months 27–36)

- Tile-cache sophistication for scroll/pan.
- Memory optimization for large documents.
- Progressive rendering.
- Native-target performance tuning.
- **Deliverable:** Meets all performance budgets; GA release.

Team assumption: 3–5 engineers plus one typographer consultant. Phase 2 slippage remains the largest schedule risk.

-----

## 17. Risks and Open Questions

### Technical risks

- **Paragraph Composer parity.** Single largest uncertainty. Reverse-engineering may not reach 100%. Mitigation: calibration corpus + documented tolerance exceptions.
- **Vello dependency.** If Vello’s roadmap diverges from our needs (e.g., color management, blend mode completeness), we fork or contribute upstream. Budget for upstream contributions in Phase 1–3.
- **WebGPU driver bugs.** Browser WebGPU implementations are still maturing. Some drivers produce non-deterministic output in edge cases (e.g., atomic operations, subgroup semantics). Mitigation: pin to deterministic shader patterns, document driver-specific workarounds, CI on all target browsers.
- **Hyphenation dictionary licensing.** Proximity dictionaries proprietary. TeX patterns diverge on edge cases. Mitigation: legal review early; bake dictionary version into fidelity contract.
- **PDF/AI placed graphics.** Rendering placed PDFs faithfully is its own renderer inside ours. Mitigation: delegate to PDF.js where possible; accept degraded fidelity for documented edge cases.
- **WASM size budget.** Vello + rustybuzz + lcms2 + parser + composer may exceed 3 MB compressed. Mitigation: selective compilation, dead-code elimination, splitting large assets into separate downloads.

### Product risks

- **Scope creep.** “Faithful” is unbounded. Mitigation: explicit tolerance contract; feature priority tiers (P0–P3); release notes documenting known deviations.
- **Font licensing on client side.** Fonts travel to the browser. Customers must ensure licensing permits this. Mitigation: documentation; partnerships with font licensing services.
- **Platform exclusion.** WebGPU-only means excluding users on older browsers or locked-down enterprise environments. Mitigation: position the renderer for contexts where platform control is feasible (modern enterprise dashboards, desktop apps, server rendering). Do not pitch as a universal drop-in.
- **Maintenance burden.** InDesign changes across versions; IDML schema evolves; WebGPU spec evolves. Dedicated maintainer role post-GA.

### Open questions

1. Do we support editable output (data-bound re-rendering with different content), or is that a layer above?
1. What is the server-side story? Native `wgpu` on Linux servers works; does it need headless GPU access (requires Vulkan-capable GPU in the server, or software Vulkan via lavapipe)? Budget infrastructure decision early.
1. Integration path with Pimcore Designer’s CE.SDK output: IDML as ingestion, export, or both?
1. Licensing model: commercial SDK, open-source with commercial support, bundled with Pimcore products?
1. Does the renderer expose intermediate representations (composed layouts, display lists) for tooling, or only final raster output?
1. Use Vello directly vs. fork: revisit at end of Phase 1 based on integration experience.

-----

## 18. Appendix: Reference Materials

- Adobe IDML Specification (https://www.adobe.com/devnet/indesign/documentation.html)
- PDF 1.7 Specification (ISO 32000-1) — blend modes and transparency semantics
- Knuth, D. & Plass, M., “Breaking Paragraphs into Lines,” *Software: Practice and Experience*, 1981
- ICC Specification v4.3
- WebGPU Specification (https://www.w3.org/TR/webgpu/)
- WGSL Specification (https://www.w3.org/TR/WGSL/)
- wgpu documentation (https://wgpu.rs/)
- Vello project (https://github.com/linebender/vello) — study before Phase 1
- Linebender blog posts on GPU 2D rendering — foundational reading
- HarfBuzz documentation (https://harfbuzz.github.io/)
- Little CMS documentation (https://www.littlecms.com/)

-----

*End of document.*
