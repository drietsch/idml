#!/usr/bin/env bash
# web/build-wasm.sh — build the idml-wasm crate for browser use.
#
# Output:
#   web/src/wasm/idml_wasm.js        loader (ES module, --target web)
#   web/src/wasm/idml_wasm_bg.wasm   binary
#   web/src/wasm/idml_wasm.d.ts      TypeScript types
#
# Requirements:
#   * rustup target add wasm32-unknown-unknown   (one-time)
#   * cargo install wasm-bindgen-cli --version <pinned>
#     The version MUST match the `wasm-bindgen` crate version in
#     Cargo.lock; mismatches cause "expected schema X, got Y" load
#     errors. The script auto-detects the lock version and tells you
#     what to install.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT/target/wasm32-unknown-unknown/release"
OUT_DIR="$ROOT/web/src/wasm"
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

echo "==> cargo build --release --target wasm32-unknown-unknown -p idml-wasm"
RUSTFLAGS="-C opt-level=z -C codegen-units=1" \
    cargo build --release --target wasm32-unknown-unknown -p idml-wasm

echo "==> wasm-bindgen --target web --out-dir $OUT_DIR"
mkdir -p "$OUT_DIR"
wasm-bindgen "$TARGET_DIR/idml_wasm.wasm" --target web --out-dir "$OUT_DIR"

if command -v wasm-opt >/dev/null; then
    echo "==> wasm-opt -Oz (binaryen)"
    wasm-opt -Oz "$OUT_DIR/idml_wasm_bg.wasm" -o "$OUT_DIR/idml_wasm_bg.wasm.opt"
    mv "$OUT_DIR/idml_wasm_bg.wasm.opt" "$OUT_DIR/idml_wasm_bg.wasm"
else
    echo "note: wasm-opt not found; skipping size pass (install binaryen for ~30% smaller bundles)"
fi

ls -la "$OUT_DIR/"
echo "==> done. Build the React app with: cd web && npm install && npm run dev"
