#!/usr/bin/env bash
# Fallback: build the same C++ to WebAssembly with a stock clang and wasm-ld,
# no Emscripten and no C library. Produces a module with the identical
# exports, so the website does not care which toolchain built it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cmake -S "$ROOT/sim" -B "$ROOT/build/wasm-clang" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="$ROOT/sim/cmake/wasm32-freestanding.cmake" -DLS_FREESTANDING=ON
cmake --build "$ROOT/build/wasm-clang"
mkdir -p "$ROOT/web/public/wasm"
cp "$ROOT/build/wasm-clang/lightning_sim.wasm" "$ROOT/web/public/wasm/lightning_sim.wasm"
ls -l "$ROOT/web/public/wasm/lightning_sim.wasm"
