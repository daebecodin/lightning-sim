// Drives one simulation job: load the module, step it in short slices, post
// progress, and hand back a snapshot. Used by the Web Worker (the normal
// path) and, if workers are unavailable, directly on the main thread.
import { instantiateSim, snapshotTransferList, State } from './wasm-bindings.js';

export function createRunner(post, threadName) {
  let simPromise = null;
  let activeJob = 0;
  let grid = null;

  function loadSim(wasmUrl) {
    if (!simPromise) {
      simPromise = fetch(wasmUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`failed to fetch ${wasmUrl}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then(instantiateSim);
      simPromise.catch(() => { simPromise = null; });
    }
    return simPromise;
  }

  const yieldToMessages = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function prepare(job) {
    const { id, wasmUrl, seed, nx, ny, nz, eta } = job;
    activeJob = id;
    const t0 = performance.now();
    const sim = await loadSim(wasmUrl);
    if (activeJob !== id) return;

    // Same grid: cheap reset that reuses every buffer. New grid: re-init.
    let state;
    if (grid && grid.nx === nx && grid.ny === ny && grid.nz === nz && grid.eta === eta) {
      state = sim.reset(seed);
    } else {
      state = sim.init(nx, ny, nz, seed, eta);
      grid = { nx, ny, nz, eta };
    }

    // Step in slices of roughly 16 ms, yielding between slices so a newer
    // request can cancel this one (and, on the main thread, so the page can
    // paint).
    let budget = 32;
    let slices = 0;
    while (state === State.SOLVING || state === State.GROWING) {
      const s0 = performance.now();
      state = sim.step(budget);
      const dt = performance.now() - s0;
      if (dt < 8) budget = Math.min(budget * 2, 4096);
      else if (dt > 24) budget = Math.max(budget >> 1, 1);
      slices++;
      post({ type: 'progress', id, phase: state === State.SOLVING ? 'field' : 'leader', progress: sim.progress, nodes: sim.nodeCount });
      await yieldToMessages();
      if (activeJob !== id) return;  // superseded
    }
    if (state !== State.ATTACHED) {
      post({ type: 'error', id, message: `simulation ended in state ${state}` });
      return;
    }
    const snap = sim.snapshot();
    snap.stats.computeMs = performance.now() - t0;
    snap.stats.slices = slices;
    snap.stats.thread = threadName;
    post({ type: 'result', id, snap }, snapshotTransferList(snap));
  }

  return {
    handle(msg) {
      if (msg.type === 'prepare') {
        prepare(msg).catch((err) => post({ type: 'error', id: msg.id, message: String((err && err.message) || err) }));
      } else if (msg.type === 'cancel') {
        activeJob = 0;
      }
    },
  };
}
