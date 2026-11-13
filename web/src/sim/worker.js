// Simulation worker. All expensive work (Poisson solve, leader growth, ground
// discharge) happens here so the page stays responsive. The lightning path is
// computed completely before playback starts; the main thread only receives
// progress messages and, at the end, the finished geometry buffers.
import { createRunner } from './runner.js';

const runner = createRunner((msg, transfer) => self.postMessage(msg, transfer || []), 'worker');
self.onmessage = (e) => runner.handle(e.data);
