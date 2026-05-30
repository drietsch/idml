# Briefing — Paged: The IDML Living Documentation

**Product:** Paged — a native renderer for paged media, starting with IDML.
**Docs site:** `docs.paged.media` (apex `paged.media`).
**Status:** v1.1 — name and domains resolved; supersedes v1.0.
**Nature:** A standalone, independent documentation project. Not affiliated with any other company or product, and distinct from the CSS-based Paged.js project (see §6.1).
**Audience for this briefing:** Engineering leadership, lead architects, anyone who will author or own a section.

---

## 0. What changed since v0.1

This version is a clean rewrite, not a patch. Three things moved:

1. **The project is independent.** Earlier framing tied the docs to a parent company (Labs alignment, a parent licensing philosophy, parent-domain SEO bootstrapping). All of that is gone. The docs stand on their own and earn their own authority. Every part of the rationale, licensing, and discovery plan is rebuilt on that footing.
2. **The clean-room protocol now governs structure, not just prose.** The single most important correction: copyright protects selection and arrangement, not only wording. The protocol (§6.1) now explicitly forbids mirroring the source spec's organization, not just its sentences.
3. **The discovery plan is honest about cold-start and thin content.** No parent domain means the site starts from zero authority. The indexing strategy (§9) is rebuilt around that reality, including not letting search engines see half-finished pages.

Naming and domains are now **resolved** (the product is Paged; the docs live at `docs.paged.media`) and recorded in §10/§14. The relationship to the editor product remains an open decision (§14).

---

## 1. What the docs are

A long-form, public, **living** reference for the IDML file format and the renderer/parser we are building around it. It is a website, built on Fumadocs (Next.js + MDX), that grows toward roughly 200 pages across three reader tiers.

Two principles govern everything else, and everything in this briefing is downstream of them:

**It is our description, authored from first principles.** We do not reproduce, closely paraphrase, or structurally mirror anyone else's specification. We rebuild the explanation of IDML from our own constructed example files and from what we learn writing the renderer. The format's element names are facts we may use freely; the *explanation* of the format is ours to write.

**It is a living artifact, not a one-shot deliverable.** Every meaningful thing the renderer teaches us produces or updates a page. The code and the docs move together, enforced mechanically, not by good intentions.

What it is *about*: the IDML file format, and our renderer/parser for it. What it is *not* about: InDesign as an application. That boundary is load-bearing and defended in §5.

### Positioning — settled by the name

The name resolves the framing fork. The product is **Paged**, at `paged.media`: this signals the **category** (paged media) while naming a **product** ("Paged"), not claiming to *be* the field the way a bare "Paged Media" project would. So the docs sit at the broad framing — a paged-media reference with **IDML as its deep, opinionated core** — rather than the narrow "one file format" framing.

Two consequences follow, both deliberate:

- **The IA carries a thin category layer above the IDML core.** Foundations and the top of the tree can speak to paged media as a space (what it is, how the web approaches it, where IDML fits) before descending into the IDML depth that is the actual moat. The IDML content is identical to the narrow framing; the broad framing only adds a shallow, honest top-of-funnel.
- **It only stays honest if the renderer's ambition matches.** Paged is positioned as a general paged-media renderer whose first and deepest input format is IDML. The docs should not over-promise breadth the renderer does not have — the category layer stays thin until the renderer earns more of it.

This does not change the build order: the IDML core is written first regardless (§11).

This briefing is written for the **narrow framing by default** (IDML reference) because it is the safer, more defensible starting point, with explicit hooks (§6, §11) for widening later if the project's ambition and the chosen domain point that way. The decision does not block content: the IDML core is identical under either framing.

---

## 2. Objectives and non-objectives

### Objectives

- A self-authored, technically deep, well-presented online reference for IDML, covering the format end-to-end: package anatomy, geometry, stories, styles, frames, tables, typography, color, images, and the real-world edge cases.
- Documentation of the renderer/parser internals and the design decisions behind them.
- Three distinct reader tiers with explicit reading paths.
- A clean-room content protocol that makes intellectual-property risk effectively zero — across both wording *and* structure.
- Production-deployed early, with continuous deploys on every change.

### Non-objectives

- **Not a competitor to the official format specification.** We point to the authoritative spec as the normative source; we explain the format for humans. We never position ourselves as normative.
- **Not a marketing site.** No calls to action, no signup forms, no product pitching inside chapter content.
- **Not documentation for InDesign as an application.** Scope is the *file format* and *our renderer*. Application how-tos are out.
- **Not the home of the editor product's documentation — by default.** The renderer and the (separate) editor/SDK are different audiences and probably different doc properties. This is an open decision (§15); the default is "separate, deliberately," to avoid one site trying to serve format readers and SDK integrators at once.
- **Not multilingual in phase 1.** English until the structure stabilizes.

---

## 3. Strategic rationale

Why this is worth real engineering time.

**It converts private expertise into public reputation.** A multi-year browser-based renderer accumulates rare knowledge about a format almost nobody understands deeply. Writing that down in public is what turns it from a private asset into a reputation — which compounds in recruiting, in the contributor pipeline, and in the trust of anyone evaluating the renderer.

Be honest about *which* kind of moat this is. The documented knowledge itself is **given away** — deliberately, under a permissive license (§10). We are not building an *information* moat where we are the only ones who hold the knowledge; a permissive license means anyone may reuse it. We are building a *reputation* moat: being known as the people who wrote the canonical reference, and owning the renderer that the reference describes. That is a sound strategy, but only if we are clear-eyed that the give is the knowledge and the keep is the reputation and the code. Treating the docs as a secret would defeat the purpose; treating them as a reputation investment is the point.

**It collapses onboarding.** New renderer engineers currently learn the format by reading source and asking colleagues. A written reference turns weeks of ramp into days, and the reference improves every time someone hits a gap while onboarding.

**The public literature is thin.** The authoritative spec is a PDF (effectively unindexable), plus a scatter of blog posts and tool docs. A modern, well-structured, searchable site can become the de facto first result for format questions — but only if discovery is done right, which is not automatic (§9).

---

## 4. Audience model

Three tiers, each with explicit reading paths and a difficulty label on every page.

| Tier | Reader | Core question | Examples of what they ask |
| ---- | ------ | ------------- | ------------------------- |
| 🟢 **Beginner** | Has heard of IDML, maybe received a file | "What is this thing?" | How is it different from the binary native format? What's inside if I unzip it? How do paragraphs and frames relate? |
| 🟡 **Intermediate** | Integrating IDML into a tool or pipeline | "How do I work with it?" | How do I modify a paragraph style? Extract all text from a multi-spread document? How does the coordinate system actually work? |
| 🔴 **Pro** | Renderer engineer, print-tech specialist, integrator at the edges | "How does it really work, and where are the edges?" | What is the exact line-breaking behavior? How are OpenType features applied? Which real-world quirks exist and how does the renderer handle them? |

Inside each tier we use the **Diátaxis** model — tutorials, how-to guides, reference, explanation — so a single page never tries to do four jobs at once. A page is one tier and one Diátaxis mode. If a page wants to be two things, it is two pages.

The difficulty label is not decoration. It drives the reading paths ("Start here" sequences), it warns beginners off pro material, and it is the first thing a reviewer checks: *is this page actually written at the tier it claims?*

---

## 5. Information architecture

Top-level sections become folders under `content/docs/`. The ordering below is a reader's progression, roughly beginner-to-pro, **not** the source spec's element order — this is the structural independence rule (§6.1) applied to the IA itself.

1. **Foundations** — what IDML is, the binary-to-XML lineage, why a package format exists, how to read one by hand
2. **Package anatomy** — the ZIP/container structure, the root design map, the resource and content parts, how the parts reference each other
3. **Geometry & coordinates** — units, origin, transforms, path-point anatomy, the coordinate gotchas
4. **Layout model** — spreads, pages, page items, stacking, master spreads, override resolution
5. **Stories & text** — story structure, paragraph and character ranges, runs, inline and anchored objects, threading, overset
6. **Styles** — paragraph, character, object, cell, table styles; groups, inheritance, local overrides, conflict resolution
7. **Frames & paths** — text frames, primitives, custom and compound paths, geometric bounds, fitting, insets
8. **Tables** — the table model, cells, rows, columns, headers/footers, merged cells, tables in text flow
9. **Typography** — fonts and references, OpenType, kerning and tracking, justification, hyphenation, composer behavior, drop caps, tabs
10. **Color & swatches** — color models, spot vs. process, gradients, tints, ICC, mixed inks
11. **Images & graphics** — placed images, links vs. embeds, the major image formats, transforms, clipping
12. **Cross-references & hyperlinks**
13. **Master spreads & overrides**
14. **Layers**
15. **Sections, page numbering, variables**
16. **Conditional text**
17. **Anchored & inline objects**
18. **Tagged XML inside IDML** — the structured-content layer
19. **Companion formats** — snippets, libraries, story-only files, assignment files; when each applies
20. **Round-tripping & version compatibility**
21. **Edge cases & real-world quirks** — the depth that makes the site worth citing
22. **Comparisons** — IDML vs. other document and layout formats; positioning
23. **The renderer** — architecture, crate map, parsing, model, layout, composition, rendering pipeline
24. **The parser internals** — reader, validation, recovery, error model, performance, memory
25. **Test corpus** — how and what we test against
26. **Cookbook** — task recipes
27. **Glossary**

A candidate chapter tree beneath these (~160 slots, growing to ~200 with cookbook and edge cases) lives in the project repo, not in this briefing, so it can evolve without re-issuing the briefing.

**The arrangement test for the IA:** every section and ordering decision must be justifiable by *reader progression or reader task*, never by "this is the order the source spec presents things in." When the two happen to coincide (some structure is intrinsic to the format), that is fine — but the *reason of record* is always the reader, and a reviewer can ask for that reason.

---

## 6. How the docs work — the operating model

This section is the heart of the briefing. Anyone can imagine a docs site; what makes this one work is the machinery below.

### 6.1 The clean-room content protocol

Mandatory for every contributor. This is the project's most important governance rule, and it now covers two layers — wording and arrangement.

**Wording.**
- **No verbatim text** from the authoritative spec, its cookbook, or any application documentation. Ever — not even short quoted excerpts.
- **No close paraphrase.** Rewriting a paragraph by swapping a few words is reproduction, not paraphrase. If you are writing with the spec open, close it.
- **Element and attribute names are facts, not expression.** We use the real XML element names because they are functional identifiers, not copyrightable prose. This is the same reasoning courts have applied to API declarations: naming the thing is not copying the explanation of the thing.
- **Examples are ours.** Every snippet on the site comes from a file we authored (§6.2). No copy-paste from anyone else's samples.

**Arrangement (new in v1.0, and the most overlooked risk).**
- **No structural mirroring.** Copyright protects selection, structure, and arrangement, not only sentences. A page can be 100% original prose and still be a derivative work if its organization tracks the source spec's table of contents section-by-section, element-by-element.
- **Organize by the reader, derive from the reader.** Our IA (§5) and every page outline is organized around reader progression and reader tasks. When a reviewer asks "why is this section here, in this order?", the answer of record is a reader reason, never "because that's the spec's order."
- **Where structure is intrinsic** to the format (a package genuinely contains these parts; a story genuinely nests these ranges), describing that structure is describing a fact and is fine. The line is between *describing the format's structure* (fact) and *adopting the spec's presentation of it* (expression).

**Sourcing, in order of preference.**
1. **Our own constructed files** — small files we author, then describe from what we observe.
2. **Observed renderer/parser behavior** — what our code does with real inputs, including edge cases. This is the source no one else has, and it is where the site's distinctive value comes from.
3. **The authoritative spec, for orientation only** — to learn *what topics exist* and *what the canonical element names are*. Never as a source of explanatory text or organization.

**Enforcement.**
- Every content change carries a confirmation: *"I have not copied, closely paraphrased, or structurally mirrored source material in this change."* A rotating senior reviewer confirms before merge.
- An automated similarity check runs in CI as the mechanical backstop, because human discipline fails under deadline. Two caveats make this real work rather than a checkbox: it must compare *connective prose* with the shared technical vocabulary masked (otherwise every page trips on "ParagraphStyleRange" and reviewers learn to ignore it), and standing it up means holding the source text inside CI for comparison — an internal, non-distributed use that should be a conscious decision, not an accident. Budget it as a small build, not a flag.

**One attribution, everywhere.** A single footer line states that IDML is a published file format owned by its vendor, that this documentation is an independent description by the Paged project, and that it is not affiliated with or endorsed by the vendor. That is the only vendor-related boilerplate anywhere on the site. Vendor names appear descriptively only — never in titles, branding, or anywhere implying origin or endorsement.

**One differentiation, prominently.** Because Paged at `paged.media` sits visually close to the CSS-based **Paged.js** project (`pagedjs.org`) for the same audience, a clear one-line distinction appears in a prominent place (footer or About): *Paged is a native renderer for paged media, starting with IDML — a separate project from the CSS-based Paged.js polyfill.* We arrive as a sibling in the paged-media family, credit Paged.js and the CSS Paged Media modules where relevant, and never imply a fork or an affiliation.

### 6.2 The example system — the spine of the project

Every chapter that explains part of the format is anchored on at least one **first-class example**. Examples are owned, versioned, and round-tripped through our parser. This is the mechanism that makes "living" true rather than aspirational.

**Conventions.**
- All examples live in one shared `examples/` directory and are *imported* into MDX, never duplicated. The renderer test suite and the docs site both consume the same files. A single broken example fails both — which means a doc page can never silently drift away from what the parser actually accepts.
- Each example is the **minimum viable fragment** that demonstrates one concept. No noise.
- Every snippet has four views, served by custom components: **raw** (syntax-highlighted, copy button), **annotated** (line-by-line callouts), **tree** (a collapsible structural view of the same XML), and **live preview** (§6.2.1) — the rendered result, editable in place.
- Longer examples get a **diff view** showing what changes when (say) a style is overridden.

**The CI gate is the whole point.** Every example passes the parser's validation in CI. If the parser stops accepting an example, the page that depends on it is visibly broken in the same build — immediately, not three releases later. This is the single most robust mechanism in the project and it should be treated as the headline feature of "how the docs work," above anything generated or automated.

**Example types we build:** the smallest possible valid file; one minimal example per major element; a few real-world patterns (a magazine spread, a two-column article); and pathological cases (deeply nested overrides, broken cross-references, oversized stories) — the pathological ones feed the edge-cases section that makes the site worth citing.

#### 6.2.1 The live preview — the headline reader-facing feature

If the CI gate is the project's robustness spine, the live preview is its reason to visit. A reader edits the example XML and immediately sees **our actual renderer** paint the result. No other IDML documentation can do this, because no one else owns a renderer; it is the single feature that turns the site from a reference into a playground, and it is only possible because the same renderer that ships is the one rendering the page.

It is also the visible surface of the example-CI spine: the file in the preview is the file that passes CI, so the playground and the test corpus are one artifact.

**Architecture — a sibling, not a shrunk app.** The preview is a small, special-purpose WASM/canvas component that links the **renderer core only** (parse → model → layout → render) and nothing from the editor — no panels, no SDK, no gesture spine, no dockview. It is a second, minimal adapter over the renderer core, a sibling of the editor, built by composition. It is explicitly *not* the editor app with features removed: dead-code elimination across the app's dependency graph is unreliable in WASM and a docs page may boot several previews, so the minimal dependency graph must be guaranteed by construction, not hoped for via tree-shaking. Building it is also a litmus test for the renderer-core/app boundary — if it needs code currently living in the editor (the parse-to-scene glue, color, fonts), that code belongs in a shared crate, and pushing it down benefits the editor too.

**GPU-only, by decision.** The preview runs on WebGPU, using the same GPU renderer the editor ships. There is no WebGL or CPU fallback and no pre-rendered raster path — deliberately. WebGPU is Baseline across all major browsers as of early 2026; the absence case is handled as a message, not a second renderer. When `navigator.gpu` is absent, the preview pane shows a one-line "live preview requires WebGPU" note and the raw / annotated / tree views carry the page on their own. This keeps the component single-path and removes the "which renderer is canonical / do the backends diverge" question entirely: there is one renderer, so the rendered output is always authoritative.

**Editable fragment, complete package underneath.** Examples are often a single story or spread, but the renderer wants a complete package. The preview holds a complete minimal package and exposes only the chapter-relevant part as editable; on edit it recomposes the package with the edited part and re-renders. The rendered thing is therefore always a valid, complete package — identical to what CI validates — while the reader only sees and edits the part the chapter is about.

**Diagnostics as teaching.** Readers will break the XML — that is the point. The headless API returns diagnostics alongside the raster (`render() -> { raster, diagnostics }`), and the component surfaces parser/layout errors inline instead of showing a blank canvas. "You removed the parent-story reference; here is the error the parser raises" is one of the most valuable things the feature can teach.

**Shape.** A `preview` crate (headless, renderer-core only) exposing a small `PreviewSession` — load a package, set an edited part, get back raster + diagnostics — compiled to WASM; plus a thin JS wrapper that owns the editable input, debounces, and renders to canvas. It depends on the renderer-core/app boundary being clean, so it is not a Phase-0 item (§11).


### 6.3 Living documentation and drift control

The docs are tied to the code by mechanism, not discipline.

- **Examples in CI** (§6.2) — the primary defense. Behavior drift breaks a build.
- **Ownership mapping.** A lightweight map from crate paths to doc paths, wired through code ownership, so that a change to a crate flags the doc pages that describe it. The change and its doc update land together, or the change is blocked.
- **A "what did we learn?" cadence.** Every renderer sprint review ends with a short round: what did we learn about the format this sprint? Findings become new pages or amend existing ones. This is how tacit knowledge becomes written knowledge before it evaporates.

**The code-to-docs generation bridge is a Phase-2 nice-to-have, not the spine — and it rests on shaky ground.** The appealing idea is to generate reference pages from the renderer's own doc metadata. Be careful here: the toolchain's structured-doc-export format is still unstable and nightly-only, with the output format changing between compiler versions and stabilization not yet done as of mid-2026. A generator built on it will break on toolchain bumps unless we pin a toolchain for doc generation and accept periodic maintenance. And auto-generated reference reads like a reference dump, not an explanation — it serves the pro reference tier and nothing else. So: build it later if at all, pin the toolchain if we do, and never let it be mistaken for the project's value. The value is the example-CI loop and the hand-written explanation; generation is a convenience on top.

### 6.4 Authoring workflow

- **Ownership.** Each top-level section has a named owner accountable for its quality, completeness, and freshness.
- **Authoring.** Anyone with repo access can open a content change. Owners review.
- **The clean-room confirmation** (§6.1) is non-negotiable on every content change.
- **Drift rule.** When a crate changes behavior, its doc pages update in the same change or the change is blocked (§6.3).

### 6.5 Style guide essentials

A one-page style guide is a Phase-0 deliverable. Its non-negotiables: short sentences; one concept per page; examples before explanation; no marketing voice; the page's tier and Diátaxis mode declared and honored. The full guide lives in the repo; these five rules are the spine.

### 6.6 Visual and diagram strategy

Text alone will not carry 200 pages; every major concept earns a diagram. Package anatomy gets exploded-view diagrams of the container and its parts. The coordinate system gets annotated vector diagrams with the origin and the coordinate spaces. Style inheritance gets resolution-order trees. Text flow gets frame-to-frame threading visualizations. The parser gets pipeline block diagrams.

Diagram source lives in the repo alongside content — vector formats for hand-authored diagrams, a text-based diagramming syntax for sequence and architecture diagrams, raster only for genuine raster content like screenshots of rendered output. The visual identity is **its own neutral, restrained system** — a technical reference, not a product surface: reserved palette, monospace for XML, generous whitespace.

---

## 7. Technical setup

**Stack.** Next.js (App Router) with Fumadocs Core, UI, and MDX. All content in MDX with a small set of custom components — the example views (raw / annotated / tree), the live-preview component (§6.2.1, a WASM/canvas embed over the renderer core), an example-embed wrapper, and a difficulty label. Syntax highlighting via a Shiki-based highlighter with a small grammar tweak for our annotation syntax. In-site search via the Fumadocs default to start; a hosted search service is a later upgrade once content stabilizes. TypeScript throughout. Package manager and workspace conventions match the renderer monorepo.

**Repo layout.** The docs site lives in its own subtree of the renderer monorepo (e.g. `websites/docs`). The `examples/` directory is shared between the renderer test suite and the docs site — one source of truth, one CI, one change cycle. Co-location is deliberate: it is what makes the drift-control mechanism (§6.3) cheap.

**Custom components — phasing.** The three static example-view components plus the difficulty label are the first thing built, because every content page depends on them — roughly 3–4 days of one frontend engineer, before page-writing, not after. The **live-preview component is separate and later** (§11): it depends on a clean headless renderer-core boundary and a WASM build of the `preview` crate, so it cannot land in Phase 0. Pages are authored with the static views from day one; the preview is layered in once the renderer core exposes the headless API, and it enhances pages that already work without it.

**Deployment.** A managed Next.js host with per-change preview URLs and continuous production deploys. Switchable later if economics change.

**Versioning.** Docs version to the **renderer's** minor version, not to the format's spec versions. The format's version is *data inside the docs* (a page can say "this changed at format version N"), not a site-wide version switcher.

---

## 8. Discoverability and indexing strategy

The site's discovery goal — becoming the first result for format questions — is real but not automatic, and two naive moves work against it.

**The site starts cold.** As an independent project, there is no parent domain to inherit authority from — `paged.media` begins at zero. That is a known cost of an independent, exact-match domain, not a problem to solve; the work is earning authority through content depth and inbound links over months. The exact-match domain helps for category queries once authority builds, but gives no head start.

**Public from day one — but do not let crawlers see stubs.** Going public early is correct: crawl history and inbound-link runway compound over time. But search engines rank thin, half-finished pages poorly, and a slow drip of stubs can establish a low-quality baseline that is harder to climb out of than starting later with depth. The resolution: **public from day one, but `noindex` every incomplete page**, and let crawlers see only finished, deep pages. The crawler's first and every impression of the site is finished work. Lift `noindex` per page as it reaches real depth.

The rest is standard and non-negotiable from launch: strong information architecture, accurate metadata, a sitemap, no authentication gating, and inbound links from wherever the project legitimately appears.

We instrument privacy-respecting analytics from day one so we have a baseline to measure against. Given a European base, a cookieless, GDPR-friendly analytics tool is the natural choice and avoids a consent-banner.

---

## 9. Licensing

Two separate decisions, both now independent of any parent-company licensing philosophy.

- **The documentation content:** a permissive attribution license (CC BY 4.0 is the recommended default). Maximally reusable while preserving attribution. This is consistent with the reputation-moat strategy (§3): we *want* the knowledge to travel, with our name on it.
- **Code samples, components, and site configuration:** a permissive software license (MIT is the recommended default).
- **The renderer/parser itself:** a separate decision, owned by the renderer roadmap, not by this briefing — but it should be *made*, because it affects how openly the docs can describe and link to the code. Flag it; don't resolve it here.

A short, single legal review before public launch confirms the attribution line (§6.1) and the license choices. Patent/freedom-to-operate questions live with the renderer (text-composition algorithms are where any risk sits), not with this docs project.

---

## 10. Naming and domain (resolved)

The product is **Paged**. The apex domain is **`paged.media`**; the documentation site is **`docs.paged.media`**.

The reasoning, for the record:

- **"Paged" at `paged.media` names a product within its category without claiming to be the category.** That is the right side of the line: it captures the exact-match thematic domain and the paged-media community's vocabulary, while the *thing* is a product called Paged — not "Paged Media," the field. It resolves the positioning fork toward the broad framing (§1).
- **It avoids the earlier codename's problems** — no saturated common-word collision and no in-niche clash with another project's same-named documentation tool. `docs.paged.media` is a conventional docs subdomain readers expect to type.
- **Two residual items, both cheap and handled.** A prominent one-line differentiation from the CSS-based Paged.js project lives in the attribution (§6.1), so no one infers a fork or affiliation. And a quick trademark sanity check on "Paged" in the software class is worth doing before the name hardens into a logo and branding — "paged" is a common word, so a bare word-mark is weak; the goal is only to confirm no conflicting mark exists for layout/publishing software.

A category term like this carries near-zero trademark protection on its own — an accepted trade for the thematic fit and the exact-match domain.

---

## 11. Roadmap and phasing

Sequenced so that *every* phase yields a useful, shippable artifact — we never wait for completion to get value.

| Phase | Window | Deliverable |
| ----- | ------ | ----------- |
| **0 — Scaffolding** | Week 1–2 | Site exists, deploys, one page per content type, the three **static** example components (raw / annotated / tree) + difficulty label, style guide v1, clean-room protocol v1, analytics baseline, public soft-launch behind a "work in progress" banner with stubs `noindex`'d |
| **1 — Skeleton & cornerstones** | Month 1–2 | Top-level IA committed; ~20 cornerstone pages (Foundations + Package Anatomy + the first minimal-example walkthroughs); search working; sidebar and reading paths in place; **the live-preview component** (§6.2.1) once the renderer core exposes the headless WASM API — layered onto pages that already work without it |
| **2 — Beginner tier complete** | Month 3–4 | All beginner-tier pages across all sections (~50 pages); tutorials; basic examples; the "Start here" path complete and indexed |
| **3 — Intermediate tier** | Month 5–7 | +60–80 intermediate pages; how-to guides; edge-case patterns; richer examples; optional code-to-docs bridge if pursued |
| **4 — Pro tier** | Month 8–12 | +100 pro pages; reference; renderer internals; comparisons; the edge-cases depth |
| **Continuous** | Month 12+ | Living updates as the renderer evolves; versioning; possible second-language pass |

Roughly a 12-month plan to ~200 pages, at a capped 10–15% of per-engineer time in the early phases, ramping later.

---

## 12. Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Copyright contamination from spec **wording** | Clean-room protocol (§6.1), per-change confirmation, rotating reviewer, CI similarity check on masked prose |
| Copyright contamination from spec **structure/arrangement** | The arrangement rule (§6.1, §5): organize by reader, justify ordering by reader reason, reviewer can challenge any structure |
| Doc–code drift as the renderer evolves | Examples in CI (§6.2), crate-to-doc ownership mapping, sprint-review learning cadence |
| Maintenance burden at 200+ pages | Per-section owners, the example-CI loop reducing silent rot, "deprecate before rewrite" policy |
| Scope creep into application how-tos | IA discipline, explicit non-objective (§2), reviewers push back |
| Audience confusion across tiers | Difficulty labels, explicit reading paths, one tier + one Diátaxis mode per page |
| Cold-start / thin-content SEO failure | Public early but `noindex` stubs (§8), depth-first indexing, strong IA, inbound links |
| Vendor pushback (trademark or perceived reproduction) | Disciplined descriptive use, the clean-room protocol, one short legal review before launch |
| Name/domain collision undermining discovery | Decide framing first, then name; trademark sanity pass; differentiate from category incumbents (§10) |
| Engineer time pulled from the renderer | Capped time budget in early phases (§11), code-derived sections later to reduce hand-written surface |

---

## 13. Success metrics

**Quantitative (12-month targets).** ~200 published pages; top-3 search result for a meaningful set of format-related queries; a depth signal (median session time well above a bounce); a handful of merged external-contributor changes; measurably shorter renderer-engineer onboarding to first useful contribution.

**Qualitative.** Renderer engineers say "I link people to our docs when they ask." External practitioners cite the site in posts, answers, and talks. Inbound recruiting mentions the docs unprompted.

A baseline is instrumented from day one (§8) so these are measured, not guessed.

---

## 14. Open decisions

These need owners and answers; several gate Phase 0. Resolved items are kept on the list, marked, so the decision history stays visible.

1. **Framing** — *resolved:* broad (a paged-media reference with IDML as its deep core), settled by the name (§1, §10).
2. **Name and domain** — *resolved:* product is **Paged**; apex `paged.media`; docs `docs.paged.media` (§10). Remaining: the trademark sanity check on "Paged" in the software class.
3. **Renderer/editor doc boundary** — does the editor/SDK get its own docs, share this site, or stay separate (§2, default: separate)? *Open.*
4. **Content license** — CC BY 4.0 recommended; confirm in legal review (§9). *Open.*
5. **Code license** — MIT recommended (§9). *Open.*
6. **Renderer license** — owned by the renderer roadmap, but must be made (§9). *Open.*
7. **Code-to-docs generation** — pursue in Phase 2 or skip; if pursued, pin the toolchain (§6.3). *Open.*
8. **Public-from-day-one** — *resolved:* yes, with `noindex` stubs (§8).
9. **Renderer-core/app boundary** — the live preview (§6.2.1) requires a headless render core (parse → model → layout → render) the editor and the preview both consume, exposable as a small WASM API. Confirm it exists or schedule its extraction; needed before Phase 1's preview work, and wanted regardless. *Open.*
10. **Preview rendering path** — *resolved:* WebGPU-only, the same GPU renderer the editor ships; no WebGL/CPU fallback and no pre-rendered raster. Absence of WebGPU is a one-line message, not a second renderer (§6.2.1).

---

## 15. Immediate next steps (Week 1–2)

1. Trademark sanity check on "Paged" in the software class; secure `paged.media` and `docs.paged.media`.
2. Confirm content and code licenses in a short legal review.
3. Decide the renderer/editor doc boundary (§14.3).
4. Schedule the renderer-core/app boundary extraction with the renderer team (§14.9) — gates the preview.
5. Scaffold the docs app, CI, and hosting at `docs.paged.media` with per-change previews.
6. Define the top-level IA in the repo (the section metadata files) — broad framing, thin category layer over the IDML core.
7. Draft the clean-room protocol v1 (wording **and** arrangement), the change template, and the ownership map.
8. Build the three **static** example components (raw / annotated / tree) and the difficulty label — they gate every page.
9. Write the style guide v1 (one page), including the Paged.js differentiation line.
10. Write ~5 cornerstone pages to validate tone and structure, then soft-launch with the WIP banner and stubs `noindex`'d.

---

*End of briefing v1.1.*