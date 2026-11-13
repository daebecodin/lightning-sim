#!/usr/bin/env bash
# Build and run the native simulation tests.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cmake -S "$ROOT/sim" -B "$ROOT/build/native" -DCMAKE_BUILD_TYPE=Release
cmake --build "$ROOT/build/native" --parallel
"$ROOT/build/native/sim_test"
