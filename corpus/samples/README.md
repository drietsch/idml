# External IDML samples

This directory stores third-party IDML sample files used for exploratory
parser testing. Contents are **not** checked into git — see
`.gitignore`'s `corpus/samples/*.idml` rule — because redistribution
rights for these samples have not been confirmed.

## Customer's Canvas gallery

Aleyant/Customer's Canvas publish a small gallery of IDML samples
illustrating their Design Editor feature set. Fetch them with:

```bash
./corpus/samples/fetch.sh
```

The script downloads the public URLs listed in `fetch.sh` into
`corpus/samples/customerscanvas/`. Use the files for local development
only — do not commit them, and do not ship them as part of any
distributable artefact without confirming redistribution terms with the
publisher.

Source page:
<https://customerscanvas.com/help/designers-manual/adobe/indesign/gallery.html>

## Why not commit the samples?

Two reasons:

1. **Licensing.** The samples almost certainly contain fonts, photos,
   and layouts with their own terms. Until we have explicit permission
   from the publisher, treat them as reference-only.
2. **Reproducibility.** Fidelity corpus entries must be paired with
   InDesign-exported reference PDFs at a pinned version. External
   samples without such a pairing are useful for parser fuzzing, not
   for the fidelity gate.

Self-authored corpus entries live in `corpus/seeds/` (see the README
there) and are the only IDMLs that pass through CI.
