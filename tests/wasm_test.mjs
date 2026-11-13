// Node test for the compiled WebAssembly module, driven through the same
// binding file the website uses.
//   node tests/wasm_test.mjs [path/to/lightning_sim.wasm]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instantiateSim, State, NodeFlag } from '../web/src/sim/wasm-bindings.js';

const wasmPath = process.argv[2] || fileURLToPath(new URL('../web/public/wasm/lightning_sim.wasm', import.meta.url));
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL', msg); } };

function fnv(view, h = 1469598103934665603n) {
  const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  for (let i = 0; i < b.length; i++) h = ((h ^ BigInt(b[i])) * 1099511628211n) & 0xFFFFFFFFFFFFFFFFn;
  return h;
}
function run(sim) {
  let s, guard = 0;
  while (((s = sim.step(64)) === State.SOLVING || s === State.GROWING) && ++guard < 1e6);
  return s;
}

const sim = await instantiateSim(readFileSync(wasmPath));
console.log(`module: ${wasmPath}`);
console.log(`initial memory ${(sim.memoryBytes / 1048576).toFixed(1)} MB`);

console.log('== reaches the ground, all grids ==');
for (const [name, nx, ny, nz, seeds] of [['low', 48, 96, 48, 12], ['medium', 64, 128, 64, 8], ['high', 96, 192, 96, 2]]) {
  let total = 0, worst = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    if (seed === 1) sim.init(nx, ny, nz, seed); else sim.reset(seed);
    const s = run(sim);
    const ms = performance.now() - t0;
    total += ms; worst = Math.max(worst, ms);
    check(s === State.ATTACHED, `${name} seed ${seed} state ${s}`);
    const v = sim.views();
    const n = v.nodeCount;
    check(v.flags[n - 1] & NodeFlag.GROUND, `${name} seed ${seed}: last node not ground`);
    check(v.positions[3 * (n - 1) + 1] === 0, `${name} seed ${seed}: strike not at y=0`);
    check(v.mainPath[0] === 0 && v.mainPath[v.mainPath.length - 1] === n - 1, 'main path endpoints');
    check(v.groundCount > 50, 'ground discharge present');
  }
  const st = sim.stats();
  console.log(`  ${name.padEnd(6)} ${nx}x${ny}x${nz}  ${seeds} seeds  avg ${(total / seeds).toFixed(0)} ms  worst ${worst.toFixed(0)} ms  ` +
    `memory ${(st.memoryBytes / 1048576).toFixed(1)} MB  growths so far ${st.memoryGrowths}`);
}
check(sim.memoryGrowths > 0, 'memory growth was never exercised');

console.log('== determinism and parity with the native build ==');
sim.init(64, 128, 64, 7);
run(sim);
let v = sim.views();
let h = fnv(v.positions); h = fnv(v.steps, h); h = fnv(v.parents, h);
const hex = h.toString(16).padStart(16, '0');
console.log(`  seed 7 hash ${hex}`);
if (process.env.NATIVE_HASH) check(hex === process.env.NATIVE_HASH, `wasm hash differs from native ${process.env.NATIVE_HASH}`);
sim.reset(7); run(sim);
v = sim.views();
let h2 = fnv(v.positions); h2 = fnv(v.steps, h2); h2 = fnv(v.parents, h2);
check(h2 === h, 'reset to same seed not reproducible');

console.log('== repeated resets ==');
sim.init(48, 96, 48, 1);
let plateau = 0;
for (let i = 0; i < 200; i++) {
  sim.reset(1 + (i % 7));
  if (i % 3 === 1) { sim.step(40); sim.step(40); continue; }  // abandon mid-run
  check(run(sim) === State.ATTACHED, `reset ${i} failed`);
  if (i === 30) plateau = sim.memoryBytes;
  if (i > 30) check(sim.memoryBytes === plateau, `memory grew after warm-up: ${sim.memoryBytes} vs ${plateau}`);
}
console.log(`  200 resets, memory stable at ${(plateau / 1048576).toFixed(1)} MB`);
sim.reset(3); run(sim);
const snap = sim.snapshot();
sim.destroy();
check(sim.header(30) === 0, `live bytes after destroy: ${sim.header(30)}`);
check(snap.positions.length > 0 && snap.positions.buffer !== sim.memory.buffer, 'snapshot must own its data');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
