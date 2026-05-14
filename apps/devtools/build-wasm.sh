#!/usr/bin/env bash
# apps/devtools/build-wasm.sh — build idml-introspect-wasm for the
# inspector UI.
#
# Outputs to apps/devtools/src/wasm/.
#
# Requires:
#   * rustup target add wasm32-unknown-unknown   (one-time)
#   * cargo install wasm-bindgen-cli --version <pinned>
#     The pinned version must match `wasm-bindgen` in Cargo.lock;
#     the script auto-detects + warns on mismatch.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET_DIR="$ROOT/target/wasm32-unknown-unknown/release"
OUT_DIR="$ROOT/apps/devtools/src/wasm"
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

echo "==> cargo build --release --target wasm32-unknown-unknown -p idml-introspect-wasm"
RUSTFLAGS="-C opt-level=z -C codegen-units=1" \
    cargo build --release --target wasm32-unknown-unknown -p idml-introspect-wasm

echo "==> wasm-bindgen --target web (idml_introspect_wasm)"
wasm-bindgen "$TARGET_DIR/idml_introspect_wasm.wasm" --target web --out-dir "$OUT_DIR"

if command -v wasm-opt >/dev/null; then
    echo "==> wasm-opt -Oz (idml_introspect_wasm)"
    wasm-opt -Oz "$OUT_DIR/idml_introspect_wasm_bg.wasm" \
        -o "$OUT_DIR/idml_introspect_wasm_bg.wasm.opt"
    mv "$OUT_DIR/idml_introspect_wasm_bg.wasm.opt" "$OUT_DIR/idml_introspect_wasm_bg.wasm"
else
    echo "note: wasm-opt not found; skipping size pass (brew install binaryen)"
fi

ls -la "$OUT_DIR/"
echo "==> done. Run the app: cd apps/devtools && npm install && npm run dev"
