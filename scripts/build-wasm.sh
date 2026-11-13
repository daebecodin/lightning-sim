#!/usr/bin/env bash
# Build the simulation to WebAssembly with Emscripten (the primary toolchain).
# Requires an activated emsdk (emcmake and emcc on PATH).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v emcmake >/dev/null || { echo "emcmake not found. Activate emsdk first: source /path/to/emsdk/emsdk_env.sh" >&2; exit 1; }
emcmake cmake -S "$ROOT/sim" -B "$ROOT/build/wasm" -DCMAKE_BUILD_TYPE=Release
cmake --build "$ROOT/build/wasm" --parallel
mkdir -p "$ROOT/web/public/wasm"
cp "$ROOT/build/wasm/lightning_sim.wasm" "$ROOT/web/public/wasm/lightning_sim.wasm"
ls -l "$ROOT/web/public/wasm/lightning_sim.wasm"
