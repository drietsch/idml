import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Dev-time path mapping for the static fixtures the viewer reads:
//
//   /samples/*  → ../corpus/samples/*   (IDMLs, PDFs, manifest.json)
//   /diff/*     → /tmp/idml-diff/*      (cand-NNN.png, ref-NNN.png,
//                                        heat-NNN.png, report.json)
//
// Implemented as a tiny middleware so we don't need symlinks under
// `public/` (which would clutter git status) and so the same config
// works on a clean checkout. fs.allow opens the corpus + diff paths
// to Vite's internal file server.
import type { Plugin } from "vite";
import { createReadStream, statSync } from "node:fs";

const SAMPLES_DIR = resolve(__dirname, "..", "corpus", "samples");
const DIFF_DIR = "/tmp/idml-diff";

function staticPrefix(prefix: string, dir: string): Plugin {
  return {
    name: `static-prefix:${prefix}`,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(prefix)) {
          return next();
        }
        const rel = decodeURIComponent(req.url.slice(prefix.length).split("?")[0]);
        // Block path traversal.
        if (rel.includes("..")) {
          res.statusCode = 400;
          return res.end("bad path");
        }
        const abs = resolve(dir, rel.replace(/^\/+/, ""));
        try {
          const stat = statSync(abs);
          if (!stat.isFile()) {
            return next();
          }
        } catch {
          return next();
        }
        // Map common extensions to MIME types — the small set the
        // viewer needs is enough.
        const ext = abs.split(".").pop()?.toLowerCase() ?? "";
        const mime: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          json: "application/json",
          idml: "application/vnd.adobe.indesign-idml-package",
          pdf: "application/pdf",
          ttf: "font/ttf",
          otf: "font/otf",
        };
        res.setHeader("Content-Type", mime[ext] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    staticPrefix("/samples/", SAMPLES_DIR),
    staticPrefix("/diff/", DIFF_DIR),
  ],
  server: {
    fs: {
      allow: [resolve(__dirname), SAMPLES_DIR, DIFF_DIR],
    },
  },
  optimizeDeps: {
    // The wasm-bindgen JS loader imports the .wasm via
    // `new URL('./*_bg.wasm', import.meta.url)`. Vite resolves that
    // natively so no extra plugin is needed here.
    exclude: ["idml_wasm", "idml_edit_wasm"],
  },
  worker: {
    format: "es",
  },
});
