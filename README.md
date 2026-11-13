# Stepped Leader

Ride a simulated lightning leader from the inside of a thundercloud down to a prairie: a 28 second cinematic in one continuous camera shot.

- **Simulation:** C++17, a dielectric breakdown model driven by an electric potential field, compiled to WebAssembly.
- **Rendering:** three.js (r170, vendored).
- **Sound:** procedural, Web Audio API.
- No runtime dependencies beyond the files in this repository. No network access is needed to build the frontend.

## Quick start (no build needed)

`dist/` is a ready-to-serve production build. It is plain static files, so any web server works:

```bash
node web/serve.mjs dist 8080        # then open http://localhost:8080
# or
python3 -m http.server 8080 --directory dist
```

Open it over `http://`, not `file://` (browsers refuse to load WebAssembly and module workers from `file://`).

Controls: Play / Pause (Space), Restart (R), sound on or off (M), a seed field, "New bolt" for a random seed, and a quality selector. `?seed=42&q=high` in the URL sets the starting seed and quality.

## Important: which toolchain built the shipped `.wasm`

The project is set up for **Emscripten** (`sim/CMakeLists.txt`, `scripts/build-wasm.sh`). The sandbox this was built in had no Emscripten and could not install or run one, so:

- The `lightning_sim.wasm` shipped in `dist/` and `web/public/wasm/` was compiled from the same C++ sources with stock **clang 18 `--target=wasm32` and `wasm-ld`** (`scripts/build-wasm-clang.sh`).
- The Emscripten build path was **written but never executed**. The setting names were checked against the Emscripten 3.1.52 source, nothing more. Treat it as untested until you run it.

Both paths produce a standalone `.wasm` with the same five exports and no JavaScript glue, and the website loads either one with the same binding file, so swapping in an Emscripten-built module needs no frontend changes.

## Requirements

| To do this | You need |
| --- | --- |
| Serve the prebuilt site | Any static file server (Node 18+ or Python 3 is enough) |
| Rebuild the frontend | Node 18+ and npm |
| Compile C++ to WebAssembly (primary) | Emscripten SDK, CMake 3.16+ |
| Compile C++ to WebAssembly (fallback) | clang with the wasm32 target and `wasm-ld` (clang 18 was used), CMake, Ninja |
| Native simulation tests | Any C++17 compiler, CMake |
| Browser tests | Python 3, Playwright for Python, Chrome |

## Build from source

All commands run from the repository root.

### 1. Install dependencies

```bash
# Frontend build tool (esbuild is the only npm dependency; three.js is vendored)
cd web && npm install && cd ..

# Emscripten (once)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh && cd ..
```

### 2. Compile the C++ simulation to WebAssembly

```bash
./scripts/build-wasm.sh
```

That runs:

```bash
emcmake cmake -S sim -B build/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build/wasm --parallel
cp build/wasm/lightning_sim.wasm web/public/wasm/lightning_sim.wasm
```

Fallback without Emscripten (this is what produced the shipped binary):

```bash
./scripts/build-wasm-clang.sh
```

### 3. Run locally

```bash
cd web && npm run dev        # serves web/ at http://localhost:5173, unbundled ES modules
```

The dev server needs no bundling step: the browser loads the modules directly and resolves `three` through the import map in `web/index.html`.

### 4. Build for deployment

```bash
cd web && npm run build      # writes ../dist
npm run preview              # serves ../dist at http://localhost:5173
```

`npm run build:cdn` writes `dist-cdn/` instead: the same site with three.js left out of the bundle and loaded from jsDelivr through an import map (about 60 kB of JavaScript instead of 550 kB, but it needs network access at run time).

Deploy by copying `dist/` to any static host. The server must send `application/wasm` or any other type for `.wasm` (the loader fetches bytes and compiles them itself, so the MIME type does not matter) and must serve `.js` as JavaScript.

## Tests

```bash
./scripts/test-native.sh                                   # C++ core and C API, native
NATIVE_HASH=<hash printed by the native test> node tests/wasm_test.mjs   # the compiled .wasm in Node
python3 tests/browser_test.py http://localhost:5173        # end to end in headless Chrome (start a server first)
```

`tests/shots.py` is a development helper that screenshots chosen moments of the timeline.

## Project layout

```
sim/                         C++ simulation. No browser or Emscripten APIs in the core.
  include/lightning/sim.h      model description, public classes
  include/lightning/*.h        buffer, deterministic math, PCG32 RNG, platform layer
  src/leader.cpp               potential solver and leader growth (the DBM)
  src/ground.cpp               2D surface discharge at the strike point
  src/platform_libc.cpp        memory layer for Emscripten and native builds
  src/platform_freestanding.cpp memory layer for the bare clang build (allocator on memory.grow)
  bindings/wasm_api.{h,cpp}    the WebAssembly surface: five functions and one header block
  tests/sim_test.cpp           native tests, profiling, and a projection dump tool
  CMakeLists.txt, cmake/       Emscripten, bare wasm32, and native targets
web/
  index.html
  src/sim/wasm-bindings.js     typed-array views over wasm memory (the only binding code)
  src/sim/runner.js            time-sliced stepping with progress and cancellation
  src/sim/worker.js            Web Worker entry
  src/sim/client.js            main-thread handle, with a main-thread fallback
  src/bolt.js                  simulation buffers -> world-space bolt model
  src/timeline.js              the cinematic clock: maps simulation steps to seconds
  src/render/                  three.js: lightning, atmosphere, ground, particles, renderer
  src/camera/rig.js            the single continuous camera move
  src/audio/engine.js          Web Audio synthesis
  src/ui/                      controls and styles
  vendor/three/                three.js r170 (MIT), only the files used
  build.mjs, serve.mjs         production build and static server
scripts/                     build and test scripts
tests/                       wasm (Node) and browser (Playwright) tests
dist/                        production build, ready to serve
dist-cdn/                    same, with three.js loaded from a CDN
```

## The simulation

A dielectric breakdown model (Niemeyer, Pietronero and Wiesmann, 1984) on a regular 3D grid.

1. **Potential field.** Poisson's equation, laplacian(phi) = -rho, with:
   - cloud-side charge as the source term: several overlapping lumps for the main negative charge region and one or two small lower positive pockets near the cloud base, all placed by the seed;
   - a grounded lower boundary (phi = 0 on the bottom cell layer);
   - zero-gradient side and top walls.
   It is solved with red-black successive over-relaxation, starting from the exact solution of the horizontally averaged 1D problem.
2. **Initiation.** The leader starts at the cell with the strongest field in the lower cloud. The field is then normalised so the channel potential is 1.
3. **Growth.** The channel is a conductor at potential 1. Each step, one cell next to the channel (26-neighbourhood) joins it, chosen with probability proportional to (potential drop / gap length)^eta, eta = 4.2. Branching emerges from this rule; nothing places branches by hand.
4. **Deterministic randomness.** PCG32 seeded from the user's seed. The core uses its own `pow`, `exp` and `log` so results do not depend on a C library: the WebAssembly build and the native build produce bit-identical geometry for the same seed (checked by hash in `tests/wasm_test.mjs`).
5. **Stall detection.** Progress is the lowest altitude reached. If the channel does not descend for a while, growth is biased toward low candidates in two stages, then forced straight down. Node-count caps catch runaway trees. Forced descent always has a candidate below the lowest cell, so every run terminates on the ground. With default settings recovery is rare (0 events in 24 medium-grid seeds, 2 in 40 low-grid seeds); the tests also run eta = 1, a setting that stalls constantly, to prove recovery works.
6. **Attachment.** When a channel cell sits directly above the grounded layer the leader attaches. Post-processing marks the main channel (strike point back to the initiation point), counts each node's downstream size, and measures channel length from every node to the strike.
7. **Ground discharge.** A second, 2D DBM spreads over the ground from the attachment cell toward a grounded ring (eta = 1.35, with per-cell soil conductivity noise), biased along the leader's horizontal approach direction. It produces the branching scorch figure.

### Documented approximations

- The potential is not re-solved to convergence after every growth step. A 13-cell box around the new cell is relaxed each step and the whole grid gets one sweep every 8 steps, so far-field corrections lag by a few steps.
- No charge transport, channel resistance, or chemistry. The channel is a perfect conductor.
- Simulation time is the growth step index, not seconds. Real stepped leaders take tens of milliseconds; the cinematic stretches that to about 17 seconds.
- Only the lower cloud is inside the domain (1600 m tall, 800 m wide). The upper positive charge region of a real storm is left out.
- The working variable is psi = -phi, so negative cloud charge appears as a positive source. The model is sign symmetric.

### Simulated physics versus procedural visuals

| Simulated in C++ | Procedural, for looks only |
| --- | --- |
| Potential field, cloud charge layout, initiation point | Cloud puffs, fog, sky, rain, ice particles |
| Every channel cell, the branching tree, growth order | Sub-cell jitter and kinks added when drawing each link |
| Local field strength at each growth event (drives brightness) | Flash, shimmer and glow curves, bloom, exposure |
| Main channel and channel length to ground (drives the return stroke wave and its timing along each branch) | Return stroke speed and decay envelopes, the single re-strike |
| Strike point | Sparks, embers, smoke, grass motion and the pressure wave in the grass |
| Ground discharge pattern (the scorch figure, where grass burns, where embers rise) | Ember colours and cooling curve |
| Charge centres (where the in-cloud glows sit) | Flicker pattern of the in-cloud glows |
| Order of growth during playback | Burst timing: growth is revealed in irregular bursts, and pacing is evened out between "uniform in steps" and "uniform along the main channel" |
| | The final jump: the last 5 main-channel cells are revealed from the ground up as an upward connecting leader |
| | All sound |

## WebAssembly integration

- The API is five functions (`ls_header`, `ls_init`, `ls_reset`, `ls_step`, `ls_destroy`) declared in `sim/bindings/wasm_api.h`.
- `ls_step(budget)` does a bounded amount of work, so the caller controls slice length. One call advances many growth steps; there are no per-point calls.
- All results live in contiguous structure-of-arrays buffers. A 31-slot header block lists their addresses and lengths; JavaScript reads them through typed-array views created directly on wasm memory (`web/src/sim/wasm-bindings.js`).
- Buffers can move and linear memory can grow during any call. The binding re-reads the header and rebuilds its views after every call, comparing `memory.buffer` identity to detect growth. The Node test exercises several growths.
- The finished geometry is copied once (one bulk `slice` per buffer) into standalone arrays and transferred to the main thread, so it survives the next reset. Avoiding that copy would need `SharedArrayBuffer` and cross-origin isolation headers, which would make the site harder to host.
- The simulation runs in a Web Worker in slices of about 16 ms with progress messages. The whole bolt is computed before playback, and the page shows preparation progress. If a worker cannot start, the same code runs on the main thread in the same slices and the status line says so.
- Simulation time and rendering time are separate. `web/src/timeline.js` is the only place that maps growth steps to seconds, and every visual is a pure function of the cinematic time, which is why pause, restart and seeking are exact.

## Timeline

| Seconds | What happens |
| --- | --- |
| 0.0 to 4.4 | Inside the cloud: rain, ice, distant intra-cloud flickers, corona attempts at the initiation point |
| 4.4 | Breakdown: the leader starts |
| 4.4 to 21.3 | Stepped descent, camera slightly above and beside the tip |
| 21.3 to 21.6 | Upward connecting leader rises from the prairie |
| 21.6 | Attachment and return stroke; exposure stops down, sparks fly, the ground discharge spreads |
| 22.2 | One softer re-illumination |
| 22.5 to 28.0 | Camera settles on the glowing scorch figure and holds |

Flash safety: the return stroke is a single bright flash with one dimmer re-illumination 0.6 s later. In-cloud flickers are local and soft, not full-screen.

## Performance

Simulation time for one bolt, measured in this build environment (2 shared CPU cores):

| Quality | Grid | Channel cells | Native | WebAssembly (Node) |
| --- | --- | --- | --- | --- |
| Low | 48 x 96 x 48 | 400 to 800 | 0.12 s | 0.23 s |
| Medium | 64 x 128 x 64 | 630 to 1300 | 0.40 s | 0.64 s |
| High | 96 x 192 x 96 | 1900 to 2100 | 2.1 s | 2.8 s |

Profiling note: the first version used lexicographic Gauss-Seidel, whose loop-carried dependency made each cell update cost about 9 ns. Switching to red-black ordering removed the dependency and made the whole simulation about 5 times faster, which is what made the High grid practical.

The quality selector changes the simulation grid and the render detail together (cloud puffs, rain streaks, grass blades, sparks, pixel ratio).

## What was verified, and what was not

Verified in the build environment:

- Native tests: every seed tried reaches the ground on all three grids (70 runs), tree and main-channel invariants hold, same seed gives identical output, resets do not leak, hostile settings still attach.
- The compiled `.wasm` in Node: reaches the ground on all grids, bit-identical to the native build, memory growth handled, 200 resets with stable memory.
- The website in headless Chrome 1) from the unbundled dev server and 2) from the production build: bolt reaches the ground, Play, Pause, Space, Restart and Replay work, seed and quality changes work, 25 rapid reseeds and repeated restarts are safe, the main thread's longest frame gap during preparation was 50 to 100 ms, audio starts only after Play and suspends on Pause, and there were no console errors, failed requests or uncaught exceptions.
- Frames at many points of the timeline were rendered and inspected at Low, Medium and High.

Not verified:

- **The Emscripten build.** See the note near the top.
- **Real GPU frame rate.** Headless Chrome here renders in software at about 2 frames per second, so smoothness on real hardware was not measured. If it is slow on your machine, try Low.
- **How it sounds.** The audio graph runs without errors, but nobody has listened to it. Levels and timbre may need tuning.
- **Motion.** Individual frames were inspected, continuous playback was not watched.
- Browsers other than Chrome, and phones.

## Licenses

- This project's own code: yours to use as you wish.
- three.js r170, MIT license, vendored unmodified in `web/vendor/three/` (see `web/vendor/three/LICENSE`, also copied to `dist/THREE-LICENSE.txt`).
- No other external assets. Every texture and sound is generated at run time.
