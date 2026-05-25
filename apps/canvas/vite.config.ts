import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createReadStream, statSync } from "node:fs";

const CORPUS_FONTS = resolve(__dirname, "..", "..", "corpus", "fonts");

// SharedArrayBuffer requires cross-origin isolation. Set the two
// COOP / COEP headers Vite's dev server needs so the worker can
// allocate a SAB for the camera transform. Production hosts must
// serve the same headers — without them, `new SharedArrayBuffer(...)`
// throws `SecurityError`.
const crossOriginIsolation = {
  name: "cross-origin-isolation-headers",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

/**
 * Serve `/fonts/<name>` from `<repo>/corpus/fonts/<name>`. Lets the
 * canvas auto-fetch a default font when the user drops an IDML so
 * the editor demo shows real glyphs in dev. Path traversal blocked
 * by a flat name check.
 */
function fontsRoute(): import("vite").Plugin {
  return {
    name: "static-prefix:/fonts/",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/fonts/")) return next();
        const rel = decodeURIComponent(req.url.slice("/fonts/".length).split("?")[0]);
        if (rel.includes("/") || rel.includes("..") || rel === "") {
          res.statusCode = 400;
          return res.end("bad path");
        }
        const abs = resolve(CORPUS_FONTS, rel);
        try {
          if (!statSync(abs).isFile()) {
            return next();
          }
        } catch {
          return next();
        }
        const ext = abs.split(".").pop()?.toLowerCase() ?? "";
        const mime = ext === "ttf" ? "font/ttf" : ext === "otf" ? "font/otf" : "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // apps/canvas/ lives one extra level deep than web/ — adjust the
  // workspace root so node_modules + the Cargo target dir resolve.
  root: resolve(__dirname),
  plugins: [react(), crossOriginIsolation, fontsRoute()],
  server: {
    fs: {
      allow: [
        resolve(__dirname),
        resolve(__dirname, "..", ".."),
        "/tmp",
        // System CMYK ICC profile dir — the fidelity suite fetches
        // CoatedFOGRA39.icc via /@fs/ to match `pdftoppm`'s output.
        "/Library/Application Support/Adobe/Color/Profiles",
      ],
    },
  },
  optimizeDeps: {
    exclude: ["idml_canvas_wasm"],
  },
  worker: {
    format: "es",
  },
});
