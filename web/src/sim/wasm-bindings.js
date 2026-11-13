// Thin JavaScript binding over the WebAssembly simulation module.
//
// The module is a plain .wasm with five exports and its own linear memory
// (built by Emscripten in standalone mode, or by clang + wasm-ld). There is no
// generated glue code, so this file is the whole binding layer:
//   * one call per batch of work (ls_step), never one call per point
//   * all results are read through typed-array views located via a header
//   * views are rebuilt whenever linear memory grows or a buffer moves
//
// Works in a Worker, on the main thread, and in Node (for tests).

// Header slots. Must match sim/bindings/wasm_api.h.
export const H = Object.freeze({
  VERSION: 0, STATE: 1, PROGRESS: 2, NX: 3, NY: 4, NZ: 5, SEED: 6,
  NODE_COUNT: 7, POS_PTR: 8, PARENT_PTR: 9, STEP_PTR: 10, FIELD_PTR: 11,
  SUBTREE_PTR: 12, GDIST_PTR: 13, FLAGS_PTR: 14, MAIN_COUNT: 15, MAIN_PTR: 16,
  TOTAL_STEPS: 17, STALL_EVENTS: 18, FORCED_STEPS: 19, LONGEST_STALL: 20,
  SOLVE_SWEEPS: 21, CHARGE_COUNT: 22, CHARGE_PTR: 23, CLOUD_BASE: 24,
  GROUND_COUNT: 25, GROUND_POS_PTR: 26, GROUND_PARENT_PTR: 27,
  GROUND_STEP_PTR: 28, GROUND_GRID: 29, LIVE_BYTES: 30, COUNT: 31,
});
export const API_VERSION = 3;
export const State = Object.freeze({ IDLE: 0, SOLVING: 1, GROWING: 2, ATTACHED: 3, FAILED: -1 });
export const NodeFlag = Object.freeze({ MAIN: 1, FORCED: 2, GROUND: 4, ROOT: 8 });

// Instantiates the module from bytes (ArrayBuffer or typed array).
export async function instantiateSim(bytes) {
  const module = await WebAssembly.compile(bytes);
  // A standalone Emscripten build may import a few env/WASI functions
  // (for example emscripten_notify_memory_growth). None of them matter
  // here, so every function import gets a harmless stub.
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind !== 'function') throw new Error(`unsupported wasm import ${imp.module}.${imp.name} (${imp.kind})`);
    (imports[imp.module] ||= {})[imp.name] =
      imp.name === 'proc_exit' ? (code) => { throw new Error(`wasm called proc_exit(${code})`); } : () => 0;
  }
  const instance = await WebAssembly.instantiate(module, imports);
  if (typeof instance.exports._initialize === 'function') instance.exports._initialize();
  return new LightningSim(instance);
}

export class LightningSim {
  constructor(instance) {
    this.exports = instance.exports;
    this.memory = instance.exports.memory;
    this._buffer = null;
    this.memoryGrowths = 0;
    this._headerPtr = this.exports.ls_header() >>> 0;
    this._refresh();
    if (this._hdr[H.VERSION] !== API_VERSION) {
      throw new Error(`wasm API version ${this._hdr[H.VERSION]} does not match bindings ${API_VERSION}`);
    }
  }

  // memory.grow() detaches the old ArrayBuffer. Every access goes through
  // here, so stale views are never used.
  _refresh() {
    const buf = this.memory.buffer;
    if (buf !== this._buffer) {
      if (this._buffer) this.memoryGrowths++;
      this._buffer = buf;
      this._u32 = new Uint32Array(buf);
      this._hdr = new Uint32Array(buf, this._headerPtr, H.COUNT);
      this._hdrI = new Int32Array(buf, this._headerPtr, H.COUNT);
      this._hdrF = new Float32Array(buf, this._headerPtr, H.COUNT);
    }
  }

  init(nx, ny, nz, seed, eta = 0) {
    const s = this.exports.ls_init(nx, ny, nz, seed >>> 0, eta);
    this._refresh();
    return s;
  }
  reset(seed) {
    const s = this.exports.ls_reset(seed >>> 0);
    this._refresh();
    return s;
  }
  step(budget) {
    const s = this.exports.ls_step(budget | 0);
    this._refresh();
    return s;
  }
  destroy() {
    this.exports.ls_destroy();
    this._refresh();
  }

  get state() { this._refresh(); return this._hdrI[H.STATE]; }
  get progress() { this._refresh(); return this._hdrF[H.PROGRESS]; }
  get nodeCount() { this._refresh(); return this._hdr[H.NODE_COUNT]; }
  get memoryBytes() { return this.memory.buffer.byteLength; }
  header(slot) { this._refresh(); return this._hdr[slot]; }

  // Zero-copy views straight into wasm memory. Valid only until the next
  // ls_* call (a call may move buffers or grow memory).
  views() {
    this._refresh();
    const h = this._hdr, buf = this._buffer;
    const n = h[H.NODE_COUNT], m = h[H.MAIN_COUNT], g = h[H.GROUND_COUNT], c = h[H.CHARGE_COUNT];
    const attached = this._hdrI[H.STATE] === State.ATTACHED;
    const view = (Type, ptr, len) => new Type(buf, ptr, len);
    return {
      nodeCount: n,
      positions: view(Float32Array, h[H.POS_PTR], n * 3),
      parents: view(Int32Array, h[H.PARENT_PTR], n),
      steps: view(Uint32Array, h[H.STEP_PTR], n),
      fields: view(Float32Array, h[H.FIELD_PTR], n),
      flags: view(Uint8Array, h[H.FLAGS_PTR], n),
      subtrees: view(Uint32Array, h[H.SUBTREE_PTR], attached ? n : 0),
      groundDist: view(Float32Array, h[H.GDIST_PTR], attached ? n : 0),
      mainPath: view(Uint32Array, h[H.MAIN_PTR], m),
      charges: view(Float32Array, h[H.CHARGE_PTR], c * 6),
      groundCount: g,
      groundPositions: view(Float32Array, h[H.GROUND_POS_PTR], g * 2),
      groundParents: view(Int32Array, h[H.GROUND_PARENT_PTR], g),
      groundSteps: view(Uint32Array, h[H.GROUND_STEP_PTR], g),
    };
  }

  stats() {
    this._refresh();
    const h = this._hdr;
    return {
      nx: h[H.NX], ny: h[H.NY], nz: h[H.NZ], seed: h[H.SEED],
      nodes: h[H.NODE_COUNT], mainNodes: h[H.MAIN_COUNT], groundNodes: h[H.GROUND_COUNT],
      totalSteps: h[H.TOTAL_STEPS], stallEvents: h[H.STALL_EVENTS], forcedSteps: h[H.FORCED_STEPS],
      longestStall: h[H.LONGEST_STALL], solveSweeps: h[H.SOLVE_SWEEPS],
      cloudBase: this._hdrF[H.CLOUD_BASE], groundGrid: h[H.GROUND_GRID],
      liveBytes: h[H.LIVE_BYTES], memoryBytes: this.memoryBytes, memoryGrowths: this.memoryGrowths,
    };
  }

  // One bulk copy per buffer into standalone arrays, so the result can be
  // transferred out of the worker and outlive the next reset.
  snapshot() {
    const v = this.views();
    const out = { stats: this.stats() };
    for (const key of ['positions', 'parents', 'steps', 'fields', 'flags', 'subtrees', 'groundDist', 'mainPath',
      'charges', 'groundPositions', 'groundParents', 'groundSteps']) {
      out[key] = v[key].slice();
    }
    return out;
  }
}

export function snapshotTransferList(snap) {
  return Object.values(snap).filter((a) => ArrayBuffer.isView(a)).map((a) => a.buffer);
}
