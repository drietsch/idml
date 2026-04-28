# Sample-3.idml linked assets

The IDML references five external assets via Windows-absolute
`LinkResourceURI`s that don't exist on a Mac/Linux dev box. The
renderer's `--links-dir` flag (already wired in `diff.sh`) probes
this directory by basename, so dropping the files here makes the
diff reproduce all images.

Pixabay blocks automated fetches behind a Cloudflare challenge, so
these need to come down via a browser session.

## Files

| Filename | Source | License |
|---|---|---|
| `architecture-2178743_960_720.jpg` | https://pixabay.com/photos/architecture-2178743/ — pick the **640×480** preview (filename matches) | Pixabay Content License (CC0-equivalent) |
| `umbrella-965431_1920.jpg` | https://pixabay.com/photos/umbrella-965431/ — pick the **1920×1280** size | Pixabay Content License |
| `8718696490884.png` | Philips/Signify product PNG — not redistributable; supply yours or stub with a 1×1 transparent PNG. Used as a hero product render on page 3. | proprietary |
| `8718696573976.jpg` | Same — Philips product photography. Used in the page-2 product table. | proprietary |
| `Pagination.com - Logo grey 20K.pdf` | The Pagination.com brand logo. Same proprietary status. | proprietary |

## After dropping the files

```bash
bash corpus/samples/diff.sh Sample-3
```

Page 3's meanΔE should drop from ~18 toward the cyan-only single-digit
range once the Pixabay photos resolve. Page 5's footer logo will fill
in once the Pagination PDF lands.
