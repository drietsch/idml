# Hyphenation parity: TeX patterns vs Proximity dictionaries

InDesign's Paragraph Composer uses the **Proximity** linguistic
libraries — a commercial, dictionary-based hyphenator with curated
exception lists, frequency-tuned break preferences, and per-locale
quality tweaks. We can't ship Proximity (no license, ~50 MB of data
per language). The text engine uses **TeX patterns** instead, via
the `hypher` crate's compact Liang-pattern tries. The same algorithm
Knuth designed for TeX, the same patterns the TeX community has
maintained for forty years; deterministic, fast, free.

This document describes the known divergences so the corpus team can
flag false ΔE regressions and the renderer team can scope when to
escalate (e.g. licensing Proximity or adding a curated exceptions
list).

## What's the same

- **Algorithm class**: pattern-based hyphenation — both engines find
  break opportunities by scanning a word against a precompiled
  language-specific table.
- **Output shape**: a list of byte offsets where a hyphen *may* be
  inserted. Whether to take a break is a separate decision (made
  by `paragraph_breaker` against the configured tolerance and the
  flagged-penalty cost).
- **Coverage of common words**: for the everyday vocabulary
  (`computer`, `elephant`, `optimisation`), TeX patterns and
  Proximity agree on the syllable boundaries that matter for line
  breaking.

## What differs

1. **Exception list density.** Proximity ships per-language
   exception dictionaries listing words whose machine-derived
   patterns produce undesirable breaks. TeX patterns include some
   exceptions but the list is shorter — proper nouns, technical
   terms, and recent loanwords most commonly diverge.
2. **Word-fragment hyphenation.** Proximity refuses breaks that
   leave a 1- or 2-letter fragment on either line ("through" never
   splits "th-rough"). TeX patterns include a 2/3-letter minimum
   per language but the floor is sometimes lower than InDesign's
   default.
3. **Per-language tuning.** German hyphenation in particular has
   compound-word rules Proximity handles natively
   (`Kraftfahrzeug → Kraft-fahr-zeug`); TeX `dehypht-x` patterns
   handle this but the list of accepted compounds drifts.
4. **Discretionary hyphens (soft hyphens).** Both engines respect
   U+00AD as a *forced* break opportunity, but a paragraph
   containing soft hyphens may still see different break choices
   when the surrounding pattern weights differ.
5. **No statistical preference.** Proximity ranks possible breaks
   by frequency-of-use ("com-pu-ter" prefers `com-puter` over
   `compu-ter` because it reads more naturally). TeX patterns emit
   every legal break with equal weight; `paragraph_breaker` then
   chooses based purely on geometric fit, not linguistic
   preference.

## Practical impact

For the manual-sample corpus, the divergences above produce
identical break positions for ~95% of paragraphs. The remaining 5%
typically affect a single word per page; the visual delta is at
most a one-syllable shift, which contributes <0.05 ΔE on a page-
average scale.

When the corpus diff flags a paragraph as drifting, check whether
the diff sits on a hyphenated line; if so, this document is the
culprit and the regression is *expected* until we license Proximity.

## Telemetry

`compose::compose_paragraph` emits a single `tracing::debug!`
record on the first call per process when a hyphenator is
configured, advising of the divergence. The log target is
`paged_text::compose`. We don't log per-paragraph (too noisy) or
per-word (orders of magnitude too noisy).

## Future work

- Ship a curated exception list for the languages we exercise
  (English, German), populated from the InDesign User Dictionary
  format. ~1k words per language closes most of the gap without
  needing Proximity.
- Add per-paragraph `<HyphenationPreference>` parsing
  (`Hyphenation`, `HyphenateLastWord`,
  `HyphenateAcrossColumns`, `MinimumWordLength`,
  `MinimumPrefixLength`, `MinimumSuffixLength`,
  `HyphenateWordsAllCaps`) and thread the bools through the
  composer. Currently `compose_paragraph` honours hyphenation iff a
  `Hyphenator` is plumbed in via `ComposeOptions::hyphenator`;
  fine-grained per-paragraph toggles aren't wired yet.
- Investigate whether `hypher` exposes the Liang per-pattern
  weights — if so, we can emit penalty-graded break opportunities
  (preferred breaks get a lower flagged-penalty cost) and approach
  Proximity's preference ranking.
