// Envato pack discovery + manifest reading.
//
// The Playwright suite iterates one test per (pack, page); this
// module is the single source of truth for "which packs exist and
// what's their staging".

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
export const ENVATO_DIR = resolve(REPO_ROOT, "corpus", "envato");
export const PACKS_DIR = resolve(ENVATO_DIR, "packs");
export const OVERRIDES_DIR = resolve(ENVATO_DIR, "overrides");
export const MANIFEST_PATH = resolve(ENVATO_DIR, "manifest.json");

// Default DPI mirrors corpus/envato/test.sh's IDML_ENVATO_DPI=144.
// Override via the FIDELITY_DPI env var.
export const FIDELITY_DPI = Number(process.env.FIDELITY_DPI ?? 144);
export const FIDELITY_OUT_ROOT = resolve(
  process.env.FIDELITY_OUT ?? "/tmp/paged-canvas-fidelity",
);

export type PackStage = "smoke" | "gated" | "skip";

export interface PackFixture {
  name: string;
  stage: PackStage;
  skipReason: string | null;
  declaredFonts: string[];
  idmlPath: string;
  referencePdfPath: string;
  hasReferencePdf: boolean;
}

interface ManifestEntry {
  name: string;
  stage?: PackStage;
  skip_reason?: string;
  declared_fonts?: string[];
}

interface Manifest {
  packs: ManifestEntry[];
}

let cached: PackFixture[] | null = null;

export function listPacks(): PackFixture[] {
  if (cached) return cached;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const fixtures: PackFixture[] = [];
  for (const entry of manifest.packs) {
    const dir = resolve(PACKS_DIR, entry.name);
    const idmlPath = resolve(dir, "template.idml");
    const referencePdfPath = resolve(dir, "reference.pdf");
    let hasIdml = false;
    let hasPdf = false;
    try {
      hasIdml = statSync(idmlPath).isFile();
    } catch {
      hasIdml = false;
    }
    try {
      hasPdf = statSync(referencePdfPath).isFile();
    } catch {
      hasPdf = false;
    }
    if (!hasIdml) continue;
    fixtures.push({
      name: entry.name,
      stage: entry.stage ?? "smoke",
      skipReason: entry.skip_reason ?? null,
      declaredFonts: entry.declared_fonts ?? [],
      idmlPath,
      referencePdfPath,
      hasReferencePdf: hasPdf,
    });
  }
  cached = fixtures;
  return fixtures;
}

/**
 * Subset of packs to run. Honours FIDELITY_PACKS env var (comma- or
 * space-separated names) for targeted runs, otherwise returns every
 * non-skip pack from the manifest.
 */
export function selectPacks(): PackFixture[] {
  const all = listPacks();
  const filter = process.env.FIDELITY_PACKS?.trim();
  if (!filter) {
    return all.filter((p) => p.stage !== "skip");
  }
  const wanted = new Set(filter.split(/[\s,]+/).filter(Boolean));
  const picked = all.filter((p) => wanted.has(p.name));
  if (picked.length === 0) {
    throw new Error(
      `FIDELITY_PACKS=${filter} matched no packs; available: ${all
        .slice(0, 5)
        .map((p) => p.name)
        .join(", ")}…`,
    );
  }
  return picked;
}

export function packOutDir(name: string): string {
  return resolve(FIDELITY_OUT_ROOT, name);
}

export function packPagePath(
  name: string,
  kind: "cand" | "ref" | "heat",
  pageNumber: number,
): string {
  const n = String(pageNumber).padStart(3, "0");
  return resolve(packOutDir(name), `${kind}-${n}.png`);
}

/**
 * Cache key for `pdftoppm` outputs — invalidates when the source PDF
 * or DPI changes. Mirrors the per-pack output naming so a downstream
 * diff just reads files from disk.
 */
export function pdfRasterizeCacheKey(name: string): string {
  const fixtures = listPacks();
  const pack = fixtures.find((p) => p.name === name);
  if (!pack) throw new Error(`unknown pack: ${name}`);
  const mtime = statSync(pack.referencePdfPath).mtimeMs;
  return `${name}@${mtime}@${FIDELITY_DPI}`;
}

/**
 * Resolve the renderer-side default font path used by the existing
 * native harness. Returns absolute paths to TTFs that exist in
 * corpus/fonts/. Phase B replaces this with a real resolver.
 */
export function corpusFontsDir(): string {
  return resolve(REPO_ROOT, "corpus", "fonts");
}

export function listCorpusFonts(): string[] {
  return readdirSync(corpusFontsDir())
    .filter((n) => /\.(ttf|otf)$/i.test(n))
    .map((n) => resolve(corpusFontsDir(), n));
}
