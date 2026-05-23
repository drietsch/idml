#!/usr/bin/env bash
# apps/canvas/build-wasm.sh — build idml-canvas-wasm for browser use.
#
# Outputs:
#   apps/canvas/src/wasm/idml_canvas_wasm.js        ES-module loader
#   apps/canvas/src/wasm/idml_canvas_wasm_bg.wasm   binary
#   apps/canvas/src/wasm/idml_canvas_wasm.d.ts      type definitions
#
# Requirements (one-time):
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version <pinned>   (matches Cargo.lock)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET_DIR="$ROOT/target/wasm32-unknown-unknown/release"
OUT_DIR="$ROOT/apps/canvas/src/wasm"
WB_VER=$(awk '/^name = "wasm-bindgen"$/{getline; gsub(/version = "|"/,""); print; exit}' "$ROOT/Cargo.lock")

if ! command -v wasm-bindgen >/dev/null; then
  echo "error: wasm-bindgen-cli not on PATH"
  echo "  install with: cargo install wasm-bindgen-cli --version $WB_VER"
  exit 1
fi
WB_INSTALLED=$(wasm-bindgen --version | awk '{print $2}')
if [ "$WB_INSTALLED" != "$WB_VER" ]; then
  echo "warning: wasm-bindgen-cli is $WB_INSTALLED, Cargo.lock pins $WB_VER"
  echo "  if loading fails: cargo install wasm-bindgen-cli --version $WB_VER --force"
fi

mkdir -p "$OUT_DIR"

echo "==> cargo build --release --target wasm32-unknown-unknown -p idml-canvas-wasm --features gpu"
RUSTFLAGS="-C opt-level=z -C codegen-units=1" \
  cargo build --release --target wasm32-unknown-unknown -p idml-canvas-wasm --features gpu

echo "==> wasm-bindgen --target web (idml_canvas_wasm)"
wasm-bindgen "$TARGET_DIR/idml_canvas_wasm.wasm" --target web --out-dir "$OUT_DIR"

if command -v wasm-opt >/dev/null; then
  echo "==> wasm-opt -Oz (idml_canvas_wasm)"
  wasm-opt -Oz "$OUT_DIR/idml_canvas_wasm_bg.wasm" -o "$OUT_DIR/idml_canvas_wasm_bg.wasm.opt"
  mv "$OUT_DIR/idml_canvas_wasm_bg.wasm.opt" "$OUT_DIR/idml_canvas_wasm_bg.wasm"
else
  echo "note: wasm-opt not found; skipping size pass (install binaryen for ~30% smaller bundles)"
fi

ls -la "$OUT_DIR/"
echo "==> done. Run the canvas app with: cd apps/canvas && npm install && npm run dev"
