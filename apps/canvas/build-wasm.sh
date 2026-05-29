#!/usr/bin/env bash
# apps/canvas/build-wasm.sh — build idml-canvas-wasm for browser use.
#
# Outputs (in `packages/client/src/wasm/` — the `@verso/client`
# package owns the wasm boundary, so the SDK consumer can be moved
# without dragging wasm-bindgen paths along):
#   idml_canvas_wasm.js        ES-module loader
#   idml_canvas_wasm_bg.wasm   binary
#   idml_canvas_wasm.d.ts      type definitions (tracked)
#
# Requirements (one-time):
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version <pinned>   (matches Cargo.lock)
#
# The scripting layer uses Boa (pure Rust), so no clang / wasi-libc /
# WASI sysroot is needed — vanilla cargo + wasm-bindgen suffices.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET_DIR="$ROOT/target/wasm32-unknown-unknown/release"
OUT_DIR="$ROOT/packages/client/src/wasm"
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

# BUILD_PROFILE switches between two competing goals:
#   size  (default) — opt-level=z + wasm-opt -Oz. ~30% smaller bundle,
#                     slower runtime. Used for the production canvas
#                     where first-load latency dominates.
#   fast            — opt-level=3 + wasm SIMD + wasm-opt -O3. Larger
#                     bundle (~1.5×) but ~5-10× faster on hot paths
#                     like the XML parse / Knuth-Plass loop. Used by
#                     the fidelity suite where runtime is the budget.
PROFILE="${BUILD_PROFILE:-size}"
case "$PROFILE" in
  size)
    RUSTFLAGS_VAL="-C opt-level=z -C codegen-units=1"
    WASM_OPT_LEVEL="-Oz"
    ;;
  fast)
    RUSTFLAGS_VAL="-C opt-level=3 -C codegen-units=1 -C target-feature=+simd128"
    WASM_OPT_LEVEL="-O3"
    ;;
  *)
    echo "error: BUILD_PROFILE must be 'size' or 'fast' (got '$PROFILE')"
    exit 1
    ;;
esac

echo "==> profile: $PROFILE  RUSTFLAGS=\"$RUSTFLAGS_VAL\""
echo "==> cargo build --release --target wasm32-unknown-unknown -p idml-canvas-wasm --features gpu"
RUSTFLAGS="$RUSTFLAGS_VAL" \
  cargo build --release --target wasm32-unknown-unknown -p idml-canvas-wasm --features gpu

echo "==> wasm-bindgen --target web (idml_canvas_wasm)"
wasm-bindgen "$TARGET_DIR/idml_canvas_wasm.wasm" --target web --out-dir "$OUT_DIR"

if command -v wasm-opt >/dev/null; then
  echo "==> wasm-opt $WASM_OPT_LEVEL (idml_canvas_wasm)"
  WASM_OPT_FLAGS=("$WASM_OPT_LEVEL")
  if [ "$PROFILE" = "fast" ]; then
    WASM_OPT_FLAGS+=("--enable-simd")
  fi
  wasm-opt "${WASM_OPT_FLAGS[@]}" "$OUT_DIR/idml_canvas_wasm_bg.wasm" -o "$OUT_DIR/idml_canvas_wasm_bg.wasm.opt"
  mv "$OUT_DIR/idml_canvas_wasm_bg.wasm.opt" "$OUT_DIR/idml_canvas_wasm_bg.wasm"
else
  echo "note: wasm-opt not found; skipping size/speed pass (install binaryen)"
fi

ls -la "$OUT_DIR/"
echo "==> done. Run the canvas app with: cd apps/canvas && npm install && npm run dev"
