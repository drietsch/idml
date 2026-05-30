# `paged` Migration Plan

**From:** `drietsch/idml` (single repo, single Cargo workspace)
**To:** the `paged-media` GitHub org (six repos)
**Product:** paged · **Domain:** paged.media · **Owning entity:** And The Next GmbH
**Author context:** open rendering pipeline, closed commercial editor.

---

## 0. The storyline in one paragraph

`drietsch/idml` is a Rust monorepo containing a faithful IDML→pixels rendering
pipeline (10 crates + spikes), a frontend/editor surface, docs, a spec, and a
test corpus. It is being renamed to **paged** (product-first naming, because the
engine is format-agnostic and IDML is only the first input), split along a single
**licensing line** — the *pipeline is open, the editor is closed* — and re-homed
into the pre-created `paged-media` org. The work happens in a strict order:
**(1)** kill the dead `verso` name, **(2)** rename `idml`→`paged` while everything
is still one workspace so `cargo build` validates it once, **(3)** split into the
target repos with history preserved, **(4)** wire the repos and naming.

The single most important invariant: **the open/closed line and the repo line are
the same line.** Closed code (editor) never shares a working tree or git history
with the public repos.

---

## 1. Why these decisions (the reasoning, so it survives)

**Product naming, not format naming.** `idml`/`verso` prefixes get replaced by
`paged`. A renderer named after one input format boxes you in the day you ingest
anything else. Internal crates can stay descriptively named; the *published*
artifact and the org read as the product.

**The pipeline is open — dual-licensed MPL-2.0 + Paged Media Enterprise License.**
The whole render pipeline — including the fidelity-critical pieces (calibrated
Knuth-Plass composer, ICC color, Vello/WebGPU print path) — is public under the
**Mozilla Public License 2.0**, with a stated commercial **Paged Media Enterprise
License** (from And The Next GmbH) as the dual-license option. MPL's weak, per-file
copyleft keeps the engine freely embeddable (no AGPL chill) while requiring
modifications to the engine's own files to flow back — protecting the fidelity core
from being privately out-engineered. Consequence: there is **no open/closed line
inside the Rust build graph**, so there is **no cross-repo Cargo path-dependency
problem** and no `[patch]` gymnastics. The entire buildable workspace lives in one
public repo. (Full license rationale in Pass 4 §5.)

**The editor is closed.** It is the one proprietary code repo — the commercial
frontend, where revenue is. It consumes the published `paged` SDK package across a
package boundary, never a Cargo path dependency, so it has no build edge into the
public code.

**The corpus is private — by third-party licensing obligation, not by moat.**
It contains IDML/PDF assets purchased via Envato. Envato's standard license does
not grant redistribution, so these assets **cannot** go in a public repo. This is
a contractual constraint, independent of the open-pipeline decision.

**Consequence of open pipeline + closed corpus:** external contributors can't run
the fidelity tests (ΔE2000/SSIM against reference PDFs they can't access). Plan a
**two-tier corpus**: a small set of freely-licensed / self-authored golden files
committed to the **public** `core` repo for contributor CI, and the full
Envato-backed corpus in the **private** `corpus` repo for internal fidelity runs.
Not a blocker today (corpus is empty); design it in when populating.

**docs vs thoughts are two different things, not alternatives.** `docs` (public)
= future user-facing documentation, written fresh — it starts **empty**.
`thoughts` (private) = your concepts, the `idea.md` spec, roadmap, risk register,
**and the entire current `docs/` tree** (it's all internal thinking, not
user-facing). So nothing in the current tree maps to the public `docs` repo;
`docs` is greenfield.

---

## 2. Target topology (LOCKED — matches the live `paged-media` org)

| Repo | Visibility | Source in `drietsch/idml` | Contents | Notes |
|------|-----------|---------------------------|----------|-------|
| **paged-media/core** | **Public** | `crates/` + `spikes/` + `idml-wasm` + root workspace files (`Cargo.toml`, `rust-toolchain.toml`, `CLAUDE.md`) | The whole Rust workspace incl. the SDK crate; spikes; CI | SDK folded in here — no standalone sdk repo. Publishes the `paged` package. Add a small public golden-file set for contributor CI. |
| **paged-media/corpus** | **Private** | `corpus/` | Full reference assets (IDML + reference PDFs) | **Envato-licensed — must stay private.** Git LFS. |
| **paged-media/docs** | **Public** | — (greenfield) | Future user-facing documentation, written fresh | Starts **empty**; no source in the current tree. |
| **paged-media/thoughts** | **Private** | `idea.md` + **all of** `docs/` | Concepts, spec, roadmap, risk register, all current docs | Receives `idea.md` and the **entire** current `docs/` tree. |
| **paged-media/editor** | **Private** ✅ (corrected) | `web/` + `apps/devtools/` | Commercial frontend | The single closed code repo. Consumes published `paged` SDK package. |
| **paged-media/website** | **Private** | — (greenfield) | `paged.media` marketing site | Outside migration scope; no source in the current tree. |

Distribution of the current tree:
```
drietsch/idml/
├── crates/            ─┐
├── spikes/             ├─► paged-media/core   (+ idml-wasm renamed → paged)
├── idml-wasm (crate)  ─┘
├── corpus/            ───► paged-media/corpus  (private, LFS)
├── docs/              ───► paged-media/thoughts (entire tree)
│                          (paged-media/docs starts empty — greenfield)
├── idea.md            ───► paged-media/thoughts
├── web/               ─┬─► paged-media/editor   (private)
├── apps/devtools/     ─┘
├── tools/indesign-export ─► paged-media/core (feeds the fidelity harness)
├── Cargo.toml         ─┐
├── rust-toolchain.toml ├─► paged-media/core (root)
└── CLAUDE.md          ─┘
```

**`tools/indesign-export` goes to core.** It generates the InDesign reference
output that the fidelity harness (Spike B) consumes, and the harness lives in
core — keep the tool with the code that uses its output. This also keeps
**corpus** purely assets (no tooling, no build step), the right shape for an LFS
data repo. Note: the tool is Python/TS, not Rust, so **core is polyglot** — its
CI must not assume everything is Cargo. The tool is outside the Cargo workspace,
so it does not touch the build graph.

---

## 3. Order of operations (do NOT reorder)

```
Pass 1  verso sweep            ─ on drietsch/idml, one commit
Pass 2  idml → paged rename    ─ on drietsch/idml, while still ONE workspace
        └─ cargo build/test green here = the rename is proven once, centrally
Pass 3  repo split             ─ filter-repo carries correct names into new repos
Pass 4  wiring & naming        ─ remotes, LFS, branch hygiene, SDK publish
```

Renaming **before** the split means doing it once; renaming after means doing it
four times and syncing cross-repo version pins mid-rename. Don't.

---

## PASS 1 — `verso` sweep (run FIRST, on `drietsch/idml`)

`verso` is a dead temporary project name. Unlike `idml`, it has **no legitimate
second meaning** here — every occurrence is wrong and becomes `paged`. The **one**
exception: "verso"/"recto" are real print-typography terms (left/right page). If
any layout code legitimately uses page-side terminology, that survives. The grep
surfaces hits; you confirm none are typographic before replacing.

### Step 1 — discover (read-only)
```bash
grep -rniI 'verso' . \
  --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=node_modules --exclude-dir=dist \
  > /tmp/verso-hits.txt
wc -l /tmp/verso-hits.txt && cat /tmp/verso-hits.txt
```
Check the low-visibility places a crate-rename sweep misses:
```bash
grep -rniI 'verso' .github/
grep -rniI 'verso' $(find . -name Cargo.toml -not -path '*/target/*')
grep -rniI 'verso' idea.md docs/ 2>/dev/null
grep -rniI 'verso' $(find . -name package.json -not -path '*/node_modules/*') 2>/dev/null
grep -rnI  'verso\|Verso\|VERSO' . --include='*.rs' --include='*.ts' --include='*.tsx'
```

### Step 2 — triage the false-positive
For each hit: dead project name (replace) or print term (keep)? If "verso" sits
next to "recto"/page geometry/spread logic, it's typographic — LEAVE IT.

### Step 3 — rename dirs/files first (preserve history)
```bash
# e.g.  git mv crates/verso-foo crates/paged-foo   (adjust to findings)
```

### Step 4 — content replace (after Step 2 clears)
```bash
grep -rlI 'verso\|Verso\|VERSO' . \
  --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=node_modules --exclude-dir=dist \
| while read -r f; do
    sed -i -e 's/verso/paged/g' -e 's/Verso/Paged/g' -e 's/VERSO/PAGED/g' "$f"
  done
```

### Step 5 — verify
```bash
grep -rniI 'verso' . --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=node_modules --exclude-dir=dist     # expect empty (or confirmed typographic)
cargo build --workspace                              # must compile if verso touched any crate
```

`verso` stays in old commit messages/history — that's fine, you're renaming the
working tree, not scrubbing authored history of a dead internal name (it never
leaked anywhere published).

---

## PASS 2 — `idml → paged` rename (AFTER verso, BEFORE split, ONE workspace)

### THE CRITICAL DISTINCTION
`idml` plays two roles. A blind `sed s/idml/paged/g` wrecks one of them.

| Role | Example | Action |
|------|---------|--------|
| **Project prefix** | `idml-parse` (crate), `idml_parse` (import), `idml-inspect` (bin) | RENAME → `paged` |
| **The Adobe format** | `.idml`, `idml_bytes`, "parses IDML", `designmap.xml`, spec refs | **KEEP** |

If `idml` names *your thing* → rename. If it names *the format you ingest* → keep.
`Document::open(&idml_bytes)` stays `idml_bytes`; the crate doing the opening
becomes `paged-parse`. This is a **reviewed, per-pattern** change, never tree-wide
`sed`.

### Crate mapping (from README's 10 crates — VERIFY against live tree; there may be more)

| # | Old dir / package | Old ident | New dir / package | New ident | Notes |
|---|---|---|---|---|---|
| 1 | `crates/idml-parse` | `idml_parse` | `crates/paged-parse` | `paged_parse` | parses IDML; crate is paged, format refs stay |
| 2 | `crates/idml-scene` | `idml_scene` | `crates/paged-scene` | `paged_scene` | |
| 3 | `crates/idml-text` | `idml_text` | `crates/paged-text` | `paged_text` | |
| 4 | `crates/idml-color` | `idml_color` | `crates/paged-color` | `paged_color` | |
| 5 | `crates/idml-compose` | `idml_compose` | `crates/paged-compose` | `paged_compose` | |
| 6 | `crates/idml-gpu` | `idml_gpu` | `crates/paged-gpu` | `paged_gpu` | |
| 7 | `crates/idml-renderer` | `idml_renderer` | `crates/paged-renderer` | `paged_renderer` | top-level lib |
| 8 | `crates/idml-fidelity` | `idml_fidelity` | `crates/paged-fidelity` | `paged_fidelity` | |
| 9 | `crates/idml-wasm` | `idml_wasm` | `crates/paged-sdk` | `paged_sdk` | **SDK surface.** Rust crate `paged-sdk`; npm package published as **`@paged-media/sdk`** |
| 10 | bin in `idml-renderer` | — | bin `paged-inspect` | — | CLI rename |

> Row 9 is the front door (`render_to_png`, `parse_summary`). The Rust crate is
> `paged-sdk`; the published **npm** package is `@paged-media/sdk`. (Crate name and
> npm package name are independent — a bare `sdk` crate name would be a poor
> crates.io citizen, so the crate keeps the `paged-sdk` prefix.) Internal crates
> stay descriptive; the published artifact is the SDK.

### CLI binaries
| Old | New | Lives in |
|---|---|---|
| `idml-inspect` | `paged-inspect` | `paged-renderer` |
| `idml-diff` | `paged-diff` | `paged-fidelity` |

### Public API
`use idml_renderer::{...}` → `use paged_renderer::{...}`. Type names
(`Document`, `PipelineOptions`, `DisplayCommand`, `FillPath`, `StrokePath`,
`Color`) are product API, not prefixed — **no change**.

### Five layers per crate (move together or you get a half-state)
1. `[package] name` in its own `Cargo.toml`
2. directory `crates/idml-X` → `crates/paged-X` (`git mv`)
3. dependency keys in **every other** `Cargo.toml` depending on it
4. `use`/path identifiers in code: `idml_X` → `paged_X`
5. feature flags/cfg if prefixed (`cpu`, `vello-backend` look format-neutral — verify)

### Non-Cargo surface (easy to miss)
- wasm JS/TS package `"name"` (if `wasm-pack` emits one) → `@paged-media/sdk`
- `CLAUDE.md`, `README.md`, `idea.md`: project mentions → paged; format mentions → IDML
- `.github/workflows/*.yml`: job/artifact/cache names referencing the project
- `spikes/*/measure.sh`, harness names
- `idml-inspect`/`idml-diff` references in CI and docs

### Default source header — MPL-2.0 + PMEL (add during this pass; every file is touched anyway)
The license is **dual MPL-2.0 + Paged Media Enterprise License (PMEL)** (see Pass 4
§5). Add this **canonical default header** to the top of every source file in
**core** (and the public `tools/indesign-export` files). Written once, stable from
day one — no second sweep when PMEL text is finalized.

C-style block form (`.rs`, `.ts`, `.js`, `.wgsl`):
```rust
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file is part of paged (https://paged.media) and is additionally
 * available under the Paged Media Enterprise License (PMEL). Full
 * copyright and license information is available in LICENSE.md which is
 * distributed with this source code.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    MPL-2.0 OR Paged Media Enterprise License (PMEL)
 */
```

Rules:
- The **first paragraph is verbatim MPL-2.0 Exhibit A — do NOT reword it.** That
  exact text is what makes the MPL notice operative.
- Paragraph two + the `@copyright`/`@license` lines are the project-specific part
  (modeled on the POCL-style header pattern, pointed at paged's dual-license).
- Apply to **core** only. Do **NOT** add it to `editor`/`thoughts`/`corpus`/
  `website` (private, proprietary, All-Rights-Reserved, And The Next GmbH).
- LICENSE.md in core must state that PMEL terms are available from And The Next
  GmbH (forthcoming until drafted) — so the header's PMEL reference is honest.
- For `#`-comment files (shell, some configs) use the same text with `#` prefixes;
  for `.toml` use `#`. Keep the MPL Exhibit A wording identical regardless of
  comment syntax.

### Per-crate procedure (reviewed, not tree-wide)
```bash
git mv crates/idml-parse crates/paged-parse
#  Cargo.toml: name = "idml-parse" -> "paged-parse"
#  all manifests: idml-parse = { path = "../idml-parse" } -> paged-parse = { path = "../paged-parse" }
#  grep -rn 'idml_parse' --include='*.rs' .   # review, then replace idml_parse -> paged_parse
cargo build --workspace   # confirm green after EACH crate
```

### Final verification
```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo check --target wasm32-unknown-unknown -p paged-sdk
grep -rnI 'idml_[a-z]' --include='*.rs' .                                   # expect empty
grep -rnI 'idml-[a-z]' $(find . -name Cargo.toml -not -path '*/target/*')   # expect empty
```
Surviving `IDML` / `.idml` / `idml_bytes` = the **format** = correct.

---

## PASS 3 — repo split (history-preserving)

Pre-created repos are **completely empty** → the extracted history is the only
history. No `--force`, no unrelated-histories merge. Use `git-filter-repo`
(install: `pip install git-filter-repo`). Work from **fresh clones** per slice
because `filter-repo` is destructive to the clone it runs in.

Run all of Pass 1 + Pass 2 first, commit, and push the renamed tree back to
`drietsch/idml` (or a migration branch) so the slices below carry correct names.

### 3a. core  (the whole workspace — keep paths, drop the other slices)
```bash
git clone https://github.com/drietsch/idml.git core-export
cd core-export
git filter-repo \
  --path corpus/ --path docs/ --path web/ --path apps/ --path idea.md \
  --invert-paths
git remote add origin https://github.com/paged-media/core.git
git push -u origin main
cd ..
```
`tools/indesign-export` is **not** in the invert-paths list, so it stays in core
as intended.

### 3b. corpus  (private, LFS)
```bash
git clone https://github.com/drietsch/idml.git corpus-export
cd corpus-export
git filter-repo --path corpus/ --path-rename corpus/:        # lift to repo root
# enable LFS BEFORE first push, track binaries:
git lfs install
git lfs track "*.idml" "*.pdf" "*.indd"
git add .gitattributes && git commit -m "Configure LFS for reference assets"
git remote add origin https://github.com/paged-media/corpus.git
git push -u origin main
cd ..
```
> Confirm `paged-media/corpus` is Private (it is). Envato assets must not be public.

### 3c. thoughts  (private — idea.md + the entire docs/ tree)
```bash
git clone https://github.com/drietsch/idml.git thoughts-export
cd thoughts-export
git filter-repo --path idea.md --path docs/
git remote add origin https://github.com/paged-media/thoughts.git
git push -u origin main
cd ..
```
> All of `docs/` is internal thinking, so it moves wholesale here. The public
> `paged-media/docs` repo is **greenfield** — nothing migrates into it; write
> user-facing documentation there fresh. No content-division judgment needed.

### 3d. editor  (private)
```bash
git clone https://github.com/drietsch/idml.git editor-export
cd editor-export
git filter-repo --path web/ --path apps/devtools/
git remote add origin https://github.com/paged-media/editor.git
git push -u origin main
cd ..
```
> Confirm `paged-media/editor` is Private (corrected). This is the closed repo.

---

## PASS 4 — wiring & naming

1. **Default branch hygiene.** The current working branch is
   `claude/read-idea-file-vHroZ`; trunk is `main`. After split, ensure each new
   repo's default is a clean `main` and the session branch isn't carried unless
   wanted.
2. **SDK publishing.** Once the wasm/SDK surface is stable, publish from
   **core**: the npm package as **`@paged-media/sdk`** (and the Rust crate as
   `paged-sdk` on crates.io if desired). The private **editor** then depends on
   the published, versioned `@paged-media/sdk` package — never a git path across
   the public/private boundary.
3. **Local dev convenience (optional).** If you want a single working tree, make
   the monorepo *be* core and fan out `docs`/`corpus` via `git subtree push`.
   Editor stays out of that tree (different visibility). With the pipeline open,
   this is now safe — but separate clones are simpler and recommended until a
   cross-cutting-commit pain actually appears.
4. **CI on the public corpus tier.** Add the small freely-licensed golden set to
   core so external PRs can pass the fidelity gate without the private corpus.
5. **License files — DECIDED: dual-license, MPL-2.0 + Paged Media Enterprise License.**
   - **core** and **docs**: **MPL-2.0** as the live open license, **plus a stated
     (not-yet-written) commercial "Paged Media Enterprise License"** from And The
     Next GmbH. Dual-licensing model: open by default, commercial option available.
   - **What the Enterprise License sells (be deliberate — it's NOT the AGPL model).**
     Because MPL already permits embedding in closed products (that's why it was
     chosen over AGPL), the Enterprise License can't sell "permission to use
     commercially" — MPL already grants that. It sells what MPL **withholds**:
     warranty, indemnification, liability cover, support SLAs, the right to modify
     the engine files **without** publishing those changes back (escape from MPL's
     file-level reciprocity), and patent assurances. Confirm that's the intended
     product before drafting.
   - **How to state it now (stable-from-day-one — DECIDED).** Use the canonical
     dual header (Pass 2 "Default source header") on every core source file from
     the start: verbatim MPL-2.0 Exhibit A + a PMEL reference + `@license MPL-2.0
     OR Paged Media Enterprise License (PMEL)`. Written once, no second sweep when
     PMEL is finalized. This references PMEL before its text exists — acceptable
     because LICENSE.md/README state PMEL is available (forthcoming) from And The
     Next GmbH, so the header claims nothing the repo doesn't otherwise say. (The
     stricter MPL-only-interim alternative — touch every file twice — was
     considered and rejected to avoid churn.)
   - **Per-file headers required.** MPL's protected set is defined by the header
     on each file. The canonical header (Pass 2) is the single source of truth;
     apply during the rename pass.
   - **CLA supports this.** The dual-license is legally enabled by the CLA's
     relicensing/sublicense grant to And The Next GmbH (§6) — that grant is *why*
     the company can offer contributed code under the Enterprise License. The two
     decisions reinforce each other.
   - **CLA must cover BOTH licenses — and already does, via its `sublicense`
     grant. Do NOT add license names to the CLA.** Clause 1 grants the right to
     "...sublicense, and distribute Your contributions" with **no** tie to any
     outbound license. That outbound-neutrality is exactly what lets And The Next
     GmbH distribute contributions under MPL-2.0 *and* the Enterprise License (and
     any future license). Adding "may be licensed under MPL-2.0 and the Paged
     Media Enterprise License" to the CLA would be (a) redundant and (b) risky —
     a named list can be read as *exhaustive*, narrowing the grant. Keep the CLA
     silent on outbound licensing. The dual-license coverage belongs in the
     **contributor-facing explanation** (`CONTRIBUTING.md`), not the binding text:
     e.g. "By contributing you agree to the CLA, which allows And The Next GmbH to
     distribute your contribution under the project's open-source license
     (MPL-2.0) and under a commercial license (the Paged Media Enterprise
     License)."
   - **For Laura — two-grant-limbs check.** The §6 grant runs to "maintainers,
     contributors, users **and to** And The Next GmbH." The commercial path relies
     on the *And The Next GmbH* limb (company sublicenses under Enterprise terms) —
     fine — but confirm the simultaneous broad grant directly "to users" coexists
     cleanly with selling a commercial license on top. No visible flaw; just a
     wording subtlety worth a lawyer's eye.
   - **editor**, **thoughts**, **corpus**, **website**: proprietary /
     All-Rights-Reserved (And The Next GmbH, private).
   - **Why MPL over Apache/MIT:** keeps engine improvements flowing back. **Why
     MPL over GPL/AGPL:** copyleft is file-level, not work-level — the closed
     editor consuming the published `@paged-media/sdk` package inherits **no**
     MPL obligation, because no MPL file is combined into the editor's own files.
   - **Editor stays clean** precisely because of the file-level rule — record
     this so a future contributor doesn't fear copyleft reaching the editor.
   - **Trademark is separate.** MPL grants copyright permissions, not trademark.
     `paged` / `paged.media` / the logo stay protected independently — embedders
     may use the engine but may not ship something *called* paged.
   - **For Laura — Enterprise License drafting + dependency license audit.** The
     Enterprise License terms and their coexistence wording with MPL are her
     drafting. Separately, before publishing: the Rust graphics stack (`wgpu`,
     `rustybuzz`, `ttf-parser`, `tiny-skia`, Vello) is mostly MIT/Apache dual —
     fine to combine into MPL. Confirm `lcms2`/Little CMS binding and scan the
     transitive tree; run `cargo deny check licenses` for the inventory.
     *License mechanics confirmed in plan; legal sign-off is Laura's.*
6. **Contributor License Agreement (CLA) — public repos only (`core`, `docs`).**
   - **Why:** open-core with a closed editor needs inbound relicensing rights.
     Plain MPL inbound lets you *use* contributions but **not relicense** them —
     so without a CLA, contributed core code is MPL-locked forever and you lose
     the dual-licensing / promote-to-commercial lever that protects the business
     model. Solve it now, before there are many contributors to chase.
   - **Instrument: CLA, not CAA, not DCO-alone.**
     - *DCO* (`Signed-off-by`) — lightweight origin cert, **no relicensing
       rights** → insufficient for open-core flexibility.
     - *CLA* — contributor **licenses** the contribution to you under broad terms
       incl. relicensing, **retains copyright** → the right choice.
     - *CAA* — copyright **assignment** → more than needed, adoption-dampening.
   - **Template: FINALIZED — adapted Pimcore CLA, full text below.** Owning legal
     entity is **And The Next GmbH**; **paged.media** is the project umbrella.
     Two fixes applied vs. the original Pimcore text: (a) the stray "Pimcore" in
     the *Submitted* definition replaced with the entity; (b) entity name slotted
     into the grant clauses. **Confirm with Laura:** the grant runs to "the
     Projects' maintainers, contributors, users and to And The Next GmbH" — i.e.
     broad (Apache-ish) rather than entity-only; relicensing lever still works
     because And The Next GmbH is a named grantee with sublicense rights, but
     confirm the breadth is intended.

     ```
     Contributor License Agreement

     The following terms are used throughout this agreement:
     - You — the person or legal entity including its affiliates asked to accept
       this agreement. An affiliate is any entity that controls or is controlled
       by the legal entity, or is under common control with it.
     - Project — an umbrella term that refers to any and all paged.media projects.
     - Contribution — any type of work that is submitted to a Project, including
       any modifications or additions to existing work.
     - Submitted — conveyed to a Project via a pull request, commit, issue, or any
       form of electronic, written, or verbal communication with And The Next
       GmbH, contributors or maintainers.

     1. Grant of Copyright License.
     Subject to the terms and conditions of this agreement, You grant to the
     Projects' maintainers, contributors, users and to And The Next GmbH a
     perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
     copyright license to reproduce, prepare derivative works of, publicly
     display, publicly perform, sublicense, and distribute Your contributions and
     such derivative works. Except for this license, You reserve all rights,
     title, and interest in your contributions.

     2. Grant of Patent License.
     Subject to the terms and conditions of this agreement, You grant to the
     Projects' maintainers, contributors, users and to And The Next GmbH a
     perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
     (except as stated in this section) patent license to make, have made, use,
     offer to sell, sell, import, and otherwise transfer your contributions, where
     such license applies only to those patent claims licensable by you that are
     necessarily infringed by your contribution or by combination of your
     contribution with the project to which this contribution was submitted.
     If any entity institutes patent litigation — including cross-claim or
     counterclaim in a lawsuit — against You alleging that your contribution or any
     project it was submitted to constitutes or is responsible for direct or
     contributory patent infringement, then any patent licenses granted to that
     entity under this agreement shall terminate as of the date such litigation is
     filed.

     3. Source of Contribution.
     Your contribution is either your original creation, based upon previous work
     that, to the best of your knowledge, is covered under an appropriate open
     source license and you have the right under that license to submit that work
     with modifications, whether created in whole or in part by you, or you have
     clearly identified the source of the contribution and any license or other
     restriction (like related patents, trademarks, and license agreements) of
     which you are personally aware.
     ```
   - **Scope:** public repos only. `editor`/`thoughts`/`corpus`/`website` take no
     external contributions → no CLA there.
   - **Mechanics:** CLA bot gating PRs (CLA Assistant or a GitHub CLA action) on
     `core` and `docs`, plus a `CONTRIBUTING.md` that (a) explains the CLA and
     (b) states the dual-license coverage in plain language — that contributions
     may be distributed under both MPL-2.0 and the Paged Media Enterprise License.
     This is where the dual-license is disclosed to contributors; the CLA's
     binding text stays outbound-neutral (see §5).
   - **For Laura — binding text + jurisdiction.** Austrian/EU copyright has
     moral-rights and assignment wrinkles that make some US CLA boilerplate a poor
     fit. Structure is settled here; the exact wording (ICLA vs Harmony vs
     EU-tuned custom) is her call. *Not legal advice.*

---

## Open items to resolve before executing

1. Verify the **live crate set** against the README's 10 — there may be crates
   added after the README; the Pass-2 table is a template to confirm.