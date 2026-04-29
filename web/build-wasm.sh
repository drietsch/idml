#!/usr/bin/env bash
# web/build-wasm.sh — build the wasm crates for browser use.
#
# Outputs (per crate):
#   web/src/wasm/idml_wasm.js        viewer loader (ES module, --target web)
#   web/src/wasm/idml_wasm_bg.wasm   viewer binary
#   web/src/wasm/idml_wasm.d.ts      viewer types
#
#   web/src/wasm/idml_edit_wasm.js        editor loader
#   web/src/wasm/idml_edit_wasm_bg.wasm   editor binary
#   web/src/wasm/idml_edit_wasm.d.ts      editor types
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

mkdir -p "$OUT_DIR"

# Build a single wasm crate, run wasm-bindgen, optionally wasm-opt.
# $1 = cargo package name (e.g. idml-wasm)
# $2 = artifact stem (e.g. idml_wasm)
build_crate() {
    local pkg="$1"
    local stem="$2"
    echo "==> cargo build --release --target wasm32-unknown-unknown -p $pkg"
    RUSTFLAGS="-C opt-level=z -C codegen-units=1" \
        cargo build --release --target wasm32-unknown-unknown -p "$pkg"

    echo "==> wasm-bindgen --target web ($stem)"
    wasm-bindgen "$TARGET_DIR/$stem.wasm" --target web --out-dir "$OUT_DIR"

    if command -v wasm-opt >/dev/null; then
        echo "==> wasm-opt -Oz ($stem)"
        wasm-opt -Oz "$OUT_DIR/${stem}_bg.wasm" -o "$OUT_DIR/${stem}_bg.wasm.opt"
        mv "$OUT_DIR/${stem}_bg.wasm.opt" "$OUT_DIR/${stem}_bg.wasm"
    fi
}

# Build the read-only viewer surface.
build_crate idml-wasm idml_wasm

# Build the editor surface (Project, command bus, wgpu Surface presenter).
build_crate idml-edit-wasm idml_edit_wasm

if ! command -v wasm-opt >/dev/null; then
    echo "note: wasm-opt not found; skipping size pass (install binaryen for ~30% smaller bundles)"
fi

ls -la "$OUT_DIR/"
echo "==> done. Build the React app with: cd web && npm install && npm run dev"
