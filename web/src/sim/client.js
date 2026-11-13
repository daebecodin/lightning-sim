// Main-thread handle for the simulation. Normally the work runs in a Web
// Worker. If a worker cannot be started (some sandboxed hosts refuse them)
// the same runner is used on the main thread in short time slices instead.
import { createRunner } from './runner.js';

const WORKER_URL = typeof __LS_WORKER_URL__ !== 'undefined'
  ? new URL(__LS_WORKER_URL__, document.baseURI)
  : new URL('./worker.js', import.meta.url);
const WASM_URL = new URL(
  typeof __LS_WASM_URL__ !== 'undefined' ? __LS_WASM_URL__ : 'public/wasm/lightning_sim.wasm',
  document.baseURI,
).href;

export class SimClient {
  constructor({ useWorker = true } = {}) {
    this.nextId = 1;
    this.pending = null;
    this.worker = null;
    this.inline = null;
    this.workerAlive = false;   // set once the worker has answered
    if (useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(WORKER_URL, { type: 'module' });
        this.worker.onmessage = (e) => { this.workerAlive = true; this._onMessage(e.data); };
        this.worker.onerror = (e) => this._onWorkerError(e);
      } catch {
        this.worker = null;
      }
    }
    if (!this.worker) this._useInline();
  }

  get thread() { return this.inline ? 'main' : 'worker'; }

  _useInline() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.inline = createRunner((msg) => queueMicrotask(() => this._onMessage(msg)), 'main');
  }

  _onWorkerError(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!this.workerAlive) {
      // The worker never came up: fall back and re-issue the current job.
      this._useInline();
      if (this.pending) this.inline.handle(this.pending.job);
      return;
    }
    const p = this.pending;
    this.pending = null;
    if (p) p.reject(new Error((e && e.message) || 'simulation worker failed'));
  }

  // Runs one simulation. A newer call supersedes an older one, whose promise
  // then rejects with an error whose `superseded` flag is set.
  prepare({ seed, nx, ny, nz, eta = 0 }, onProgress) {
    if (this.pending) {
      const err = new Error('superseded');
      err.superseded = true;
      this.pending.reject(err);
    }
    const id = this.nextId++;
    const job = { type: 'prepare', id, wasmUrl: WASM_URL, seed, nx, ny, nz, eta };
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, onProgress, job };
      if (this.inline) this.inline.handle(job); else this.worker.postMessage(job);
    });
  }

  _onMessage(msg) {
    const p = this.pending;
    if (!p || msg.id !== p.id) return;  // stale job
    if (msg.type === 'progress') {
      if (p.onProgress) p.onProgress(msg);
    } else if (msg.type === 'result') {
      this.pending = null;
      p.resolve(msg.snap);
    } else if (msg.type === 'error') {
      this.pending = null;
      p.reject(new Error(msg.message));
    }
  }
}
