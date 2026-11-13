// Application wiring: simulation worker -> bolt model -> timeline, then a
// render loop that drives the renderer, camera, audio, and interface from
// one cinematic clock.
import { SimClient } from './sim/client.js';
import { buildBolt } from './bolt.js';
import { buildTimeline, TIMES } from './timeline.js';
import { Renderer } from './render/renderer.js';
import { CameraRig } from './camera/rig.js';
import { AudioEngine } from './audio/engine.js';
import { Controls } from './ui/controls.js';
import { QUALITY, makeTerrain } from './world.js';

const params = new URLSearchParams(location.search);
const app = {
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : 1787,
  quality: QUALITY[params.get('q')] ? params.get('q') : (Math.min(screen.width, screen.height) < 700 ? 'low' : 'medium'),
  t: 0,
  playing: false,
  started: false,   // Play has been pressed at least once (audio unlocked)
  ready: false,     // a bolt is prepared
  bolt: null,
  timeline: null,
  dirty: true,
  frames: 0,
  errors: [],
};

const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  document.getElementById('error').hidden = false;
  document.getElementById('error').textContent = 'WebGL 2 is not available in this browser, so the scene cannot be drawn.';
  document.getElementById('prep').hidden = true;
  throw err;
}
const rig = new CameraRig(renderer.camera);
const audio = new AudioEngine();
const sim = new SimClient({ useWorker: params.get('worker') !== '0' });
const stateAt = (t) => app.timeline.evaluate(t);

const ui = new Controls({
  start: () => play(app.t >= TIMES.total ? 0 : app.t),
  togglePlay: () => {
    if (!app.ready) return;
    if (app.playing) pause(); else play(app.t >= TIMES.total ? 0 : app.t);
  },
  restart: () => { if (app.ready) play(0); },
  setSeed: (seed) => { app.seed = seed; prepare(); },
  setQuality: (q) => { app.quality = q; renderer.setQuality(q); prepare(); },
  toggleMute: () => { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); },
});
ui.setSeed(app.seed);
ui.setQuality(app.quality);
renderer.setQuality(app.quality);

// ---- simulation: compute the whole bolt first, then play it back smoothly
async function prepare() {
  const wasPlaying = app.started;
  pause();
  app.ready = false;
  ui.setSeed(app.seed);
  ui.showPreparing(app.started);
  const [nx, ny, nz] = QUALITY[app.quality].grid;
  let snap;
  try {
    snap = await sim.prepare({ seed: app.seed, nx, ny, nz }, (m) => ui.setProgress(m.phase, m.progress));
  } catch (err) {
    if (err.superseded) return;   // a newer request took over
    app.errors.push(String(err.message || err));
    ui.showError(`The simulation could not run: ${err.message || err}`);
    return;
  }
  const bolt = buildBolt(snap);
  const heightAt = makeTerrain(bolt.strike[0], bolt.strike[2]);
  app.bolt = bolt;
  app.timeline = buildTimeline(bolt);
  renderer.setBolt(bolt, heightAt);
  rig.setBolt(bolt, app.timeline, heightAt);
  audio.reset();
  app.t = 0;
  app.ready = true;
  app.dirty = true;
  const s = snap.stats;
  ui.setStats(
    `C++ / WebAssembly simulation: ${s.nx}x${s.ny}x${s.nz} potential grid, ${s.nodes.toLocaleString()} channel cells in ${s.totalSteps.toLocaleString()} growth steps, ` +
    `${s.mainNodes} on the main channel, ${s.stallEvents} stall recoveries, ${s.groundNodes} ground discharge cells, ${Math.round(s.computeMs)} ms ` +
    (s.thread === 'worker' ? 'in a Web Worker' : 'on the main thread (no worker available)'));
  ui.setTime(0, TIMES.total, 'intro', TIMES.attach);
  if (wasPlaying) play(0); else ui.showReady('Play');
}

// ---- transport
function play(from) {
  if (!app.ready) return;
  app.started = true;
  if (from !== app.t || from === 0) { app.t = from; audio.reset(); }
  app.playing = true;
  app.lastNow = performance.now();
  audio.start().catch((err) => app.errors.push(`audio: ${err.message || err}`));
  ui.hideVeil();
  ui.setPlaying(true);
}
function pause() {
  app.playing = false;
  audio.suspend();
  ui.setPlaying(false);
  app.dirty = true;
}

// ---- frame loop: rendering time advances here and nowhere else
function frame(now) {
  requestAnimationFrame(frame);
  if (!app.ready) return;
  if (app.playing) {
    const dt = Math.min(0.1, Math.max(0, (now - app.lastNow) / 1000));
    app.lastNow = now;
    app.t += dt;
    if (app.t >= TIMES.total) {
      app.t = TIMES.total;
      pause();
      ui.showReady('Replay');
      document.getElementById('veil').classList.remove('gone');
    }
    app.dirty = true;
  }
  if (!app.dirty) return;
  app.dirty = false;
  const state = stateAt(app.t);
  rig.update(app.t, stateAt);
  renderer.render(app.t, state, rig);
  if (app.playing) audio.update(app.t, state, rig, app.timeline);
  ui.setTime(app.t, TIMES.total, state.phase, TIMES.attach);
  app.frames++;
}

window.addEventListener('resize', () => { renderer.resize(); app.dirty = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && app.playing) pause(); });
window.addEventListener('error', (e) => app.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => app.errors.push(String(e.reason && e.reason.message || e.reason)));

// Small handle for automated checks and for poking at the scene by hand.
window.__ride = {
  app, TIMES, renderer, rig, audio, sim,
  seek(t) { app.t = Math.max(0, Math.min(TIMES.total, t)); audio.reset(); app.dirty = true; },
  play, pause, prepare,
  state: () => (app.timeline ? stateAt(app.t) : null),
};

renderer.resize();
prepare();
requestAnimationFrame(frame);
