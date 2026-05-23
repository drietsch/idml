import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

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

export default defineConfig({
  // apps/canvas/ lives one extra level deep than web/ — adjust the
  // workspace root so node_modules + the Cargo target dir resolve.
  root: resolve(__dirname),
  plugins: [react(), crossOriginIsolation],
  server: {
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, "..", ".."), "/tmp"],
    },
  },
  optimizeDeps: {
    exclude: ["idml_canvas_wasm"],
  },
  worker: {
    format: "es",
  },
});
