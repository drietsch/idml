import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Dev-time path mapping for the static fixtures the viewer reads:
//
//   /samples/manifest.json → merge of curated + generated manifests
//   /samples/<file>        → ../corpus/samples/<file> with fallback to
//                            ../corpus/generated/<file> (so a generated
//                            sample's IDML/PDF resolve transparently)
//   /diff/<sample>/<file>  → /tmp/paged-diff-<sample>/<file>
//                            (per-sample artifact dirs)
//
// Implemented as a tiny middleware so we don't need symlinks under
// `public/` (which would clutter git status) and so the same config
// works on a clean checkout. fs.allow opens the corpus + diff paths
// to Vite's internal file server.
import type { Plugin } from "vite";
import { createReadStream, readFileSync, statSync } from "node:fs";

const SAMPLES_DIR = resolve(__dirname, "..", "corpus", "samples");
const GENERATED_DIR = resolve(__dirname, "..", "corpus", "generated");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  json: "application/json",
  idml: "application/vnd.adobe.indesign-idml-package",
  pdf: "application/pdf",
  ttf: "font/ttf",
  otf: "font/otf",
};

function serveFile(res: import("http").ServerResponse, abs: string) {
  const ext = abs.split(".").pop()?.toLowerCase() ?? "";
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "no-cache");
  createReadStream(abs).pipe(res);
}

function fileExists(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Combined `/samples/*` route:
 *   - `/samples/manifest.json` returns the union of the curated and
 *     generated manifests (`corpus/samples/manifest.json` +
 *     `corpus/generated/manifest.json`). Generated samples win on a
 *     name collision.
 *   - `/samples/<file>` falls back: curated dir first, generated dir
 *     second — so the same `<sample>.idml` + `<sample>.pdf` paths the
 *     viewer constructs work regardless of which corpus the sample
 *     belongs to.
 */
function samplesRoute(): Plugin {
  return {
    name: "static-prefix:/samples/",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/samples/")) return next();
        const rel = decodeURIComponent(req.url.slice("/samples/".length).split("?")[0]);
        if (rel.includes("..")) {
          res.statusCode = 400;
          return res.end("bad path");
        }
        if (rel === "manifest.json") {
          const merged = mergeManifests();
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          return res.end(JSON.stringify(merged));
        }
        const candidates = [
          resolve(SAMPLES_DIR, rel.replace(/^\/+/, "")),
          resolve(GENERATED_DIR, rel.replace(/^\/+/, "")),
        ];
        for (const abs of candidates) {
          if (fileExists(abs)) return serveFile(res, abs);
        }
        return next();
      });
    },
  };
}

function mergeManifests(): { samples: unknown[] } {
  const read = (p: string): { samples: unknown[] } => {
    if (!fileExists(p)) return { samples: [] };
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as { samples: unknown[] };
    } catch {
      return { samples: [] };
    }
  };
  const a = read(resolve(SAMPLES_DIR, "manifest.json"));
  const b = read(resolve(GENERATED_DIR, "manifest.json"));
  // Dedup by name; generated wins on collision.
  type Entry = { name: string };
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const e of (b.samples as Entry[])) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      out.push(e);
    }
  }
  for (const e of (a.samples as Entry[])) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      out.push(e);
    }
  }
  out.sort((x, y) => (x as Entry).name.localeCompare((y as Entry).name));
  return { samples: out };
}

/**
 * `/diff/<sample>/<file>` → `/tmp/paged-diff-<sample>/<file>` per the
 * harness's per-sample artifact convention. Falls back to the legacy
 * single shared `/tmp/paged-diff/` when the URL has no sample segment
 * (kept so the original Sample-3 workflow still works without a
 * sample-specific override).
 */
function diffRoute(): Plugin {
  return {
    name: "static-prefix:/diff/",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/diff/")) return next();
        const rel = decodeURIComponent(req.url.slice("/diff/".length).split("?")[0]);
        if (rel.includes("..")) {
          res.statusCode = 400;
          return res.end("bad path");
        }
        const slash = rel.indexOf("/");
        let abs: string;
        if (slash > 0) {
          // Per-sample form: /diff/<sample>/<file>
          const sample = rel.slice(0, slash);
          const file = rel.slice(slash + 1);
          abs = `/tmp/paged-diff-${sample}/${file}`;
        } else {
          // Legacy form: /diff/<file>
          abs = `/tmp/paged-diff/${rel}`;
        }
        if (!fileExists(abs)) return next();
        return serveFile(res, abs);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), samplesRoute(), diffRoute()],
  server: {
    fs: {
      allow: [resolve(__dirname), SAMPLES_DIR, GENERATED_DIR, "/tmp"],
    },
  },
  optimizeDeps: {
    // The wasm-bindgen JS loader imports the .wasm via
    // `new URL('./*_bg.wasm', import.meta.url)`. Vite resolves that
    // natively so no extra plugin is needed here.
    exclude: ["paged_sdk"],
  },
  worker: {
    format: "es",
  },
});
