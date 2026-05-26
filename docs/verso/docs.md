# Technical Briefing — IDML Living Documentation on Fumadocs

**Working title:** *The IDML Book* (placeholder)
**Location:** `websites/docs` (new Fumadocs/Next.js app inside the renderer monorepo)
**Audience for this briefing:** Engineering leadership, lead architects, product
**Status:** Draft v0.1 — for review with Herbert, Christian, and the renderer team

---

## 1. Executive summary

We will build a long-form, public, living documentation site about the IDML file format and our renderer/parser. The site lives at `websites/docs`, built on **Fumadocs** (Next.js + MDX), and grows toward **200+ pages across three audience tiers** (beginner, intermediate, pro).

Two principles govern everything that follows:

1. **It is our description, not Adobe's.** We never reproduce or closely paraphrase Adobe's spec text. We rebuild the explanation of IDML from first principles, from our own constructed examples, and from what we learn by writing the renderer in `crates/`.
2. **It is a living artifact, not a one-shot deliverable.** Every meaningful renderer learning generates or updates a page. The crates and the docs evolve together.

The strategic outcome is threefold: (a) **the canonical web reference for IDML**, which we control, (b) **an onboarding textbook** for new renderer engineers, and (c) **a discoverability surface** that channels typography, print-tech, and Pimcore-Labs talent toward us.

---

## 2. Objectives and non-objectives

### Objectives

- Produce a self-authored, technically deep, beautifully presented online reference for IDML.
- Cover the format end-to-end: package anatomy, geometry, stories, styles, tables, typography, color, images, edge cases.
- Document the renderer/parser internals (`crates/*`) and the design decisions behind them.
- Serve three distinct audience tiers with explicit reading paths.
- Establish a clean-room content protocol that makes IP risk effectively zero.
- Be production-deployed from week 2 with continuous deploys on every PR.

### Non-objectives

- Not a replacement or competitor for Adobe's official spec. We point readers to Adobe's spec as the authoritative source; we explain IDML for humans.
- Not a marketing site. No CTAs, no signup forms, no Pimcore product pitching inside chapter content (linkbacks in the footer are fine).
- Not a documentation site for InDesign as an application. Scope is the *file format* and *our renderer*.
- Not translated to other languages in phase 1. English only until structure stabilizes.

---

## 3. Strategic rationale

**Why invest in this.**

- **Knowledge moat.** A multi-year WebGPU IDML renderer accumulates rare expertise. Writing it down externally is what converts that expertise from a private asset into a public reputation — which compounds in recruiting, contributor pipeline, and customer trust.
- **SEO and discovery.** The current public IDML literature is thin: Adobe's PDF spec (unindexable), a handful of blog posts, a few translation-tool docs. A modern Fumadocs site with structured content and search becomes the de facto first hit on "IDML <anything>" within 6–9 months.
- **Onboarding leverage.** New engineers joining the renderer effort currently learn IDML by reading source code and asking colleagues. A written textbook collapses that ramp from weeks to days.
- **Pimcore Labs alignment.** This is a textbook Labs artifact: openly licensed, technically substantive, community-friendly, with a clear connection to a real Pimcore product (the renderer). It belongs in the `pimcore-labs/` GitHub namespace under POCL.
- **Cortex/Spine narrative fit.** Documentation that captures behavioral signal from a running system is exactly the substrate-non-replicability story we tell about Cortex. The IDML docs are a small, public, focused proof point of that idea.

---

## 4. Audience model

We commit to three tiers, each with explicit reading paths and difficulty labels on every page (`🟢 Beginner`, `🟡 Intermediate`, `🔴 Pro`).

### 🟢 Beginner — "What is this thing?"

A developer who has heard of IDML, perhaps received a file, and wants to understand what is inside it and why. Typical questions:

- What is IDML and how is it different from INDD?
- What's inside an IDML file if I unzip it?
- How do I look at the XML of a story?
- How do paragraphs and text frames relate?

### 🟡 Intermediate — "How do I work with it?"

A developer integrating IDML into a tool, pipeline, or workflow. Typical questions:

- How do I modify a paragraph style in an IDML?
- How do I extract all the text from a multi-spread document?
- How does the coordinate system actually work?
- How do hyperlinks and cross-references resolve?

### 🔴 Pro — "How does it really work and where are the edges?"

A renderer engineer, a print-tech specialist, an integrator hitting edge cases. Typical questions:

- What is the exact line-breaking behavior and how does it differ from the InDesign composer?
- How are kerning pairs and OpenType features applied?
- What undefined or quirky behaviors exist in real-world IDML files, and how does our renderer handle them?
- How are master spread overrides resolved internally?

We adopt the **Diátaxis** model (Tutorials / How-to / Reference / Explanation) inside each tier so the same chapter never tries to do four jobs at once.

---

## 5. Information architecture

Top-level sections (Fumadocs sidebar). Each becomes a folder under `content/docs/`.

1. **Foundations** — what IDML is, history, INX→IDML transition, format philosophy
2. **Package anatomy** — ZIP structure, `designmap.xml`, MasterSpreads, Spreads, Stories, Resources, manifest
3. **Geometry & coordinates** — point units, origin, transformations, PathPoint anatomy
4. **Layout model** — spreads, pages, master spreads, page items
5. **Stories & text** — Story XML, ParagraphStyleRange, CharacterStyleRange, inline objects
6. **Styles** — paragraph, character, object, cell, table styles; inheritance and overrides
7. **Frames & paths** — TextFrame, Rectangle, Oval, Polygon, custom paths, geometric bounds
8. **Tables** — table model, cells, rows, columns
9. **Typography** — fonts, OpenType, kerning, tracking, justification, hyphenation
10. **Color & swatches** — color models, gradients, spot colors, ICC
11. **Images & graphics** — placed images, links vs. embeds, EPS/PSD/AI
12. **Cross-references & hyperlinks**
13. **Master spreads & overrides**
14. **Layers**
15. **Sections, page numbering, variables**
16. **Conditional text**
17. **Anchored & inline objects**
18. **Tagged XML inside IDML** — the meta layer for structured workflows
19. **Companion formats** — INDS (snippets), INDL (libraries), ICML (stories), ICMA
20. **Round-tripping & version compatibility**
21. **Edge cases & real-world quirks** — the moat
22. **Comparisons** — IDML vs. OOXML vs. ODF vs. PDF; positioning
23. **The renderer** — our crates, parsing, layout, composition, rendering pipeline
24. **The parser internals** — internal model, validation, recovery
25. **Test corpus** — how we test and what we test against
26. **Cookbook** — recipes ("modify a paragraph style", "extract all text", "swap an image")
27. **Glossary**

See **Appendix A** for the candidate chapter tree underneath these (≈160 chapter slots).

---

## 6. Content sourcing — the clean-room protocol

This is the most important governance rule of the project. It is mandatory for every contributor.

### Rules

1. **No verbatim text** from Adobe's *IDML File Format Specification*, the *IDML Cookbook*, or any Adobe-authored InDesign documentation. Ever. Not even short quoted excerpts.
2. **No close paraphrase.** Rewriting a paragraph by swapping a few words is reproduction, not paraphrase. If you find yourself with the spec open while writing, close it.
3. **Our descriptions derive from three sources**, in order of preference:
   - **(a) Our own constructed IDML files** — we author small `.idml` files in InDesign or by hand, then describe what we see.
   - **(b) Observed renderer/parser behavior** — what our crates do with real-world inputs, including edge cases.
   - **(c) The Adobe spec, used only for orientation** — to know *what topic exists* and *what the canonical element names are*. Never as a source of explanatory text.
4. **Element and attribute names are facts, not expression.** We use the same XML element names Adobe uses (`Spread`, `Story`, `ParagraphStyleRange`, etc.) because these are functional identifiers, not copyrightable content. This mirrors the *Google v. Oracle* reasoning on API declarations.
5. **Examples are ours.** Every XML snippet on the site comes from a file in `examples/` that we authored. No copy-paste from Adobe samples.
6. **One canonical attribution.** The site footer says: *"IDML is Adobe Systems' published file format for InDesign documents. This documentation is an independent description authored by the Pimcore IDML team and is not affiliated with or endorsed by Adobe."* That is the only Adobe-related boilerplate that appears anywhere.
7. **Trademark hygiene.** "Adobe" and "InDesign" are referenced descriptively only. Never in titles, branding, or anywhere that implies origin or endorsement.
8. **PR checklist gate.** Every content PR includes a confirmation checkbox: *"I have not copied or closely paraphrased Adobe-authored material in this PR."* Reviewer (rotating among senior engineers) confirms before merge.

### Licensing of our docs

Recommended: **CC BY 4.0** for content and **MIT** for code samples and Fumadocs configuration. Maximally permissive while preserving attribution. Aligns with POCL philosophy without inheriting POCL's source-availability mechanics, which are designed for product code, not docs.

### Patent / FTO posture

Spec implementation and documentation: low risk. The patent risk lives in the renderer crates (text composition algorithms specifically), not in this docs project. We note this here for completeness; the FTO conversation belongs to the renderer roadmap, not this briefing.

---

## 7. XML example strategy

Every chapter that explains a piece of the format is anchored on at least one **first-class XML example**. Examples are not throwaway — they are owned, versioned, and round-tripped through our parser.

### Conventions

- All examples live in `websites/docs/examples/` and are imported into MDX, not duplicated.
- Each example is the **minimum viable IDML fragment** that demonstrates the concept. No noise.
- Every snippet has three views:
  1. **Raw XML** (Shiki-highlighted, copy button).
  2. **Annotated walkthrough** (line-by-line callouts via a custom MDX component).
  3. **Tree view** (collapsible JSX renderer of the same XML).
- Long examples get a **diff view** showing what changes when (e.g.) a paragraph style is overridden.
- Every example file passes our parser's validation test in CI. If the parser breaks an example, the page is broken — visible immediately.

### Example types we will build

- **Smallest possible IDML** (one spread, one frame, one story, one paragraph).
- **Per-feature minimal examples** — one for each major element (TextFrame, Table, Hyperlink, etc.).
- **Real-world patterns** — magazine spread, two-column article, indexed table.
- **Pathological cases** — deeply nested style overrides, oversized stories, broken cross-references.

---

## 8. Visual and diagrammatic strategy

Text alone will not carry 200 pages. Every major concept gets a diagram.

- **Package anatomy** — exploded-view diagrams of the ZIP and its XML parts.
- **Coordinate system** — annotated SVGs with the InDesign origin, spread coordinates, item-relative coordinates.
- **Style inheritance** — tree diagrams showing the resolution order.
- **Text flow** — frame-to-frame story threading visualizations.
- **Parser pipeline** — block diagrams of how our crates process a file.

Visual identity is **its own neutral system** — not the enterprise-deck Pimcore Purple/Coral. The docs site reads as a *technical reference*, not a Pimcore product surface. Reserved restrained palette, monospace for XML, generous whitespace. Pimcore branding appears only in the footer.

Diagram source lives in the repo alongside content. SVG for static diagrams, Mermaid for sequence/architecture diagrams. No PNG/JPG except for genuine raster content (e.g., screenshots of rendered output).

---

## 9. Technical setup

### Stack

- **Next.js 15+** (App Router)
- **Fumadocs Core + Fumadocs UI + Fumadocs MDX**
- **MDX** for all content with a small set of custom components (XMLBlock, AnnotatedXML, TreeView, ExampleEmbed, Difficulty)
- **Search**: Orama (Fumadocs default) for in-site search; consider Algolia DocSearch once content stabilizes
- **Code highlighting**: Shiki with a custom IDML/XML grammar tweak for our annotation syntax
- **Diagrams**: Mermaid plugin for Fumadocs; raw SVG embeds for hand-authored diagrams
- **Package manager**: matches the monorepo (assume `pnpm` workspaces)
- **TypeScript** throughout

### Repo layout

```
<repo-root>/
├── crates/                      # Rust renderer/parser (existing)
│   ├── idml-parser/
│   ├── idml-model/
│   ├── idml-renderer/
│   └── ...
├── examples/                    # Canonical IDML examples (single source of truth)
│   ├── 001-minimal/
│   ├── 010-styles/
│   └── ...
├── websites/
│   └── docs/                    # NEW — Fumadocs site
│       ├── app/
│       ├── content/
│       │   └── docs/
│       │       ├── foundations/
│       │       ├── package-anatomy/
│       │       └── ...
│       ├── components/
│       │   ├── XMLBlock.tsx
│       │   ├── AnnotatedXML.tsx
│       │   ├── TreeView.tsx
│       │   └── Difficulty.tsx
│       ├── public/
│       └── package.json
└── pnpm-workspace.yaml
```

The `examples/` folder is **shared** between the renderer test suite and the docs site. A single broken example fails both.

### Deployment

- **Vercel** for the docs site (cheapest path to good DX and previews; switchable later).
- **Per-PR preview URLs.**
- **Production domain decision pending** — see §15.

### Versioning

Fumadocs supports content versioning. We version the docs to **the renderer's minor version** (`v0.x`, `v1.x`, …), not to Adobe's IDML spec versions. Adobe spec version is data inside the docs, not a switcher.

---

## 10. Code → docs bridge

A first-class differentiator for this project: parts of the reference section are **generated from the crates**.

- A small tool (`tools/rustdoc-to-mdx/`) ingests `cargo doc --output-format=json` and produces MDX for the internal-model reference pages.
- Test cases in the parser become annotated example pages automatically. A test that asserts behavior on `examples/042-nested-overrides/file.idml` becomes a page demonstrating that behavior.
- "From the renderer log" callouts — short blocks where engineers note something they learned while debugging. Authored manually, but linked to the relevant crate file and commit.

This bridge is built in **Phase 2**, not Phase 0. Phase 0 ships static MDX only.

---

## 11. Editorial workflow

- **Ownership.** Each top-level IA section has a named owner (a senior engineer or PM). Owner is accountable for that section's quality, completeness, and freshness.
- **Authoring.** Anyone with repo access can open a content PR. Owners review.
- **Clean-room checkbox.** Every PR ticks the checkbox (§6). Non-negotiable.
- **Style guide.** Short sentences. One concept per page. Examples before explanation. No marketing voice. We will produce a one-page style guide as part of Phase 0.
- **Drift control.** When a crate changes behavior, the corresponding doc page is updated in the same PR or the PR is blocked. Enforced via `CODEOWNERS` plus a lightweight script that maps crate paths to doc paths.
- **"Living" cadence.** Every renderer sprint review ends with a 10-minute "what did we learn?" round. Findings either become new pages or amend existing ones.

---

## 12. Roadmap and phasing

| Phase | Window | Deliverable |
|-------|--------|-------------|
| **0 — Scaffolding** | Week 1–2 | `websites/docs` app exists, deploys, has 1 page per content type, style guide v1, clean-room protocol v1, domain live |
| **1 — Skeleton & cornerstones** | Month 1–2 | Top-level IA committed, ~20 cornerstone pages (Foundations + Package Anatomy + minimal example walkthroughs), search working, sidebar polished |
| **2 — Beginner track complete** | Month 3–4 | All Beginner-tier pages across all IA sections (≈50 pages total). Tutorials, basic XML examples, reading path "Start here" complete |
| **3 — Intermediate track** | Month 5–7 | +60–80 Intermediate pages. How-to guides, edge-case patterns, more complex examples. Code → docs bridge live |
| **4 — Pro track** | Month 8–12 | +100 Pro pages. Reference docs, renderer internals, comparison docs, the "edge cases" moat |
| **Continuous** | Month 12+ | Living updates as renderer evolves. Versioning. Possible second-language pass |

This is a **12-month plan to ~200 pages**. The roadmap is sequenced so that *any* phase yields a useful, shippable artifact — we never have to wait for completion to get value.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **Accidental copyright contamination** from spec text | Clean-room protocol (§6), PR checkbox, rotating reviewer, optional similarity check against the spec PDF in CI |
| **Doc–code drift** as the renderer evolves | Examples in CI, `CODEOWNERS` linking crate changes to doc pages, sprint-review "what we learned" cadence |
| **Maintenance burden** at 200+ pages | Per-section owners, code-derived sections to reduce hand-written surface area, "deprecate before rewrite" policy |
| **Scope creep into InDesign-as-application docs** | IA discipline; explicit non-objective in §2; PR reviewers push back |
| **Audience confusion** (beginner reading pro material) | Difficulty labels per page, explicit "Start here" reading paths, locked sidebar order |
| **Adobe pushback** (trademark or perceived spec reproduction) | Disciplined nominative use, clean-room protocol, one-line legal review by Laura before public launch |
| **SEO failure** (we build it, nobody finds it) | Strong information architecture, proper meta, sitemap, public from day one (no auth gating), link from `pimcore.com` and the Labs GitHub org |
| **Engineer time pulled away from renderer** | Cap per-engineer docs time at 10–15% in Phases 0–2; ramp later |

---

## 14. Success metrics

**Quantitative (12-month targets)**

- 200+ published pages
- Top-3 Google result for at least 30 IDML-related search queries
- Median session time ≥ 4 minutes (depth proof)
- ≥ 10 external contributor PRs merged
- Renderer-engineer onboarding time (first useful PR) reduced from current baseline

**Qualitative**

- Renderer engineers say *"I link people to our docs when they ask"*
- External practitioners cite us in blog posts, Stack Overflow answers, conference talks
- Inbound recruiting mentions the docs unprompted

We instrument basic analytics from day one (privacy-respecting — Plausible or similar) so we have a baseline.

---

## 15. Open decisions

These need answers before Phase 0 ships.

1. **Domain.** Options:
   - `docs.pimcore.com/idml` — discoverability via main domain
   - `idml.pimcore-labs.io` (or similar Labs domain) — Labs branding
   - `idml.dev` — appears taken by an unrelated third party; skip
   - **My recommendation:** Labs subdomain, with a prominent link from `pimcore.com`
2. **Content license.** CC BY 4.0 recommended (§6). Confirm with Laura.
3. **Code license** for examples and components. MIT recommended.
4. **Public from day one, or staged?** Recommend **public from day one** under a "Work in progress" banner. Staging hides the SEO compounding.
5. **Versioning of docs to renderer.** Confirm tying to renderer minor version, not IDML spec versions.
6. **GitHub home.** `pimcore-labs/idml-docs` or co-located with the renderer repo. Recommend co-located (one repo, one PR cycle, one CI).
7. **Translations.** English only in phase 1, confirmed. German pass when content stabilizes — Salzburg team can help.

---

## 16. Immediate next steps (Week 1–2)

| # | Action | Owner |
|---|--------|-------|
| 1 | Confirm domain choice (§15.1) | Dietz |
| 2 | Confirm content + code licenses with Laura | Dietz / Laura |
| 3 | Confirm GitHub home (§15.6) | Herbert |
| 4 | Scaffold `websites/docs` Fumadocs app + CI + Vercel project | Renderer team lead |
| 5 | Define top-level IA (`meta.json` files for all sections) | Renderer lead + Christian |
| 6 | Draft clean-room protocol v1 + PR template + CODEOWNERS | Renderer lead |
| 7 | Build the three custom MDX components (XMLBlock, AnnotatedXML, TreeView) | One frontend engineer, 3–4 days |
| 8 | Write 5 cornerstone pages to validate tone and structure | 2–3 engineers, 1 week |
| 9 | Style guide v1 (one page) | Christian |
| 10 | Public soft-launch with "WIP" banner | End of Week 2 |

---

## Appendix A — Candidate chapter tree

Indicative, not final. Numbers in parentheses are estimated chapter counts per section. Roughly 160 slots total; we will land near 200 once cookbook and edge-case content is included.

- **Foundations (8)** — What is IDML / History and INX transition / Format philosophy / IDML vs. INDD / Reading an IDML by hand / Tooling overview / Glossary primer / Reading paths by audience
- **Package anatomy (12)** — ZIP layout / `mimetype` / `META-INF/container.xml` / `designmap.xml` / Spreads folder / MasterSpreads folder / Stories folder / Resources folder / Backing-store XML / Manifest semantics / File ordering rules / Round-trip integrity
- **Geometry & coordinates (8)** — Units and points / Origin and axes / Transformation matrices / PathPoint anatomy / Geometric bounds vs. visible bounds / Spread coordinates / Item-relative coordinates / Coordinate gotchas
- **Layout model (8)** — Spreads / Pages / Page items / Stacking order / Layers / Master spreads / Override resolution / Spread navigation in XML
- **Stories & text (14)** — Story XML overview / ParagraphStyleRange / CharacterStyleRange / Text runs / Inline objects / Anchored objects / Story threading / Threaded frame chains / Overset text / Story linking across spreads / Text content vs. content references / Character escape rules / Whitespace and special characters / Story IDs and references
- **Styles (12)** — Style philosophy / Paragraph styles / Character styles / Object styles / Cell styles / Table styles / Style groups / Inheritance / Local overrides / Style imports / Conflict resolution / Style debugging
- **Frames & paths (10)** — TextFrame / Rectangle / Oval / Polygon / Custom paths / Compound paths / Path operations / Geometric bounds math / Frame fitting options / Frame insets
- **Tables (8)** — Table model / Cell / Row / Column / Header and footer rows / Merged cells / Table styles / Tables inside text flow
- **Typography (12)** — Fonts in IDML / Font references vs. embedded fonts / OpenType features / Kerning and tracking / Justification methods / Hyphenation / Composer behaviors / Drop caps / Bullets and numbering / Tab stops / Optical alignment / Glyph references
- **Color & swatches (8)** — Color models / Spot vs. process / Swatches / Gradients / Tints / ICC color profiles / Color management metadata / Mixed-ink swatches
- **Images & graphics (8)** — Placed images / Links vs. embeds / EPS / PSD / AI / Image transforms / Clipping paths / Resolution metadata
- **Cross-references & hyperlinks (6)** — Hyperlink model / Anchored destinations / Text destinations / URL destinations / Cross-references / Bookmark resolution
- **Master spreads & overrides (5)** — Master spread definition / Inheritance / Detach and override semantics / Override storage in XML / Multi-master scenarios
- **Layers (4)** — Layer model / Visibility / Printability / Layer-locked items
- **Sections, page numbering, variables (5)** — Section markers / Page numbering / Numbering styles / Text variables / Running headers
- **Conditional text (3)** — Condition model / Conditions in XML / Condition sets
- **Tagged XML inside IDML (4)** — Why InDesign has its own XML layer / Tagging model / Mapping styles to tags / Round-tripping tagged content
- **Companion formats (5)** — INDS (snippets) / INDL (libraries) / ICML (stories) / ICMA (assignments) / When to use which
- **Round-tripping & version compatibility (5)** — IDML across InDesign versions / Forward compatibility / Backward compatibility / Lost-in-translation patterns / Detecting source version
- **Edge cases & quirks (12)** — Encoding edge cases / Empty stories / Corrupt manifests / Mismatched IDs / Orphan references / Unicode normalization / Bidirectional text / Vertical text / Long-document patterns / Bookish patterns / Magazine patterns / Newspaper patterns
- **Comparisons (4)** — IDML vs. OOXML / IDML vs. ODF / IDML vs. PDF / IDML vs. HTML
- **The renderer (10)** — Architecture overview / Crate map / Parser crate / Model crate / Layout crate / Composer crate / Renderer crate / WebGPU pipeline / Color pipeline / Font pipeline
- **The parser internals (6)** — XML reader / Validation / Recovery / Error model / Performance characteristics / Memory model
- **Test corpus (4)** — How we test / Example files / Property-based tests / Fixture management
- **Cookbook (15)** — Modify a paragraph style / Extract all text / Swap an image / Add a hyperlink / Round-trip a document / Compare two IDMLs / Detect master overrides / Find broken cross-references / List all fonts used / Extract color usage / Convert IDML to plain text / Convert IDML to JSON / Diff stories across versions / Validate against a custom schema / Build a minimal IDML programmatically
- **Glossary (1)** — Continuously updated

---

*End of briefing v0.1.*