// The cinematic clock. Simulation time (growth step index) and rendering time
// (seconds) are separate; this module is the only place that maps one onto
// the other. Everything downstream is a pure function of `t`, which is what
// makes pause, restart, and seeking trivial.
import { makeRng, clamp } from './world.js';

export const TIMES = Object.freeze({
  total: 28.0,
  leaderStart: 4.4,   // initiation inside the cloud
  attach: 21.6,       // ground attachment and return stroke
  connect: 0.34,      // duration of the upward connecting leader before attach
  restrike: 0.62,     // one softer re-illumination after the main stroke
});

const FINAL_JUMP_NODES = 5;

export function buildTimeline(bolt) {
  const m = bolt.mainCount;
  // The last few main-channel nodes are bridged by the final jump: the
  // downward tip stops short and an upward connecting leader rises to meet it.
  const capIndex = Math.max(1, m - 1 - Math.min(FINAL_JUMP_NODES, m - 2));
  const capStep = bolt.mainStep[capIndex];

  // Retiming. Playing back uniformly in simulation steps would freeze the tip
  // whenever the model spends a while on side branches. tau blends "uniform
  // in steps" with "uniform along the main channel", which keeps the order of
  // growth exactly as simulated but evens out the pacing.
  const mainAt = new Uint32Array(capStep + 2);  // main nodes with step <= s
  for (let k = 0; k <= capIndex; k++) mainAt[Math.min(bolt.mainStep[k], capStep) + 1]++;
  for (let s2 = 1; s2 < mainAt.length; s2++) mainAt[s2] += mainAt[s2 - 1];
  const tau = new Float32Array(capStep + 1);
  for (let s2 = 0; s2 <= capStep; s2++) {
    tau[s2] = 0.5 * (s2 / Math.max(1, capStep)) + 0.5 * ((mainAt[s2 + 1] - 1) / capIndex);
  }

  // Stepped playback: growth is revealed in bursts separated by irregular
  // pauses, like the luminous steps of a real stepped leader.
  const rng = makeRng(Math.imul(bolt.seed, 2654435761) + 17);
  const t0 = TIMES.leaderStart, t1 = TIMES.attach - TIMES.connect;
  const events = [];
  let t = t0, lastReveal = -1;
  while (t < t1) {
    const u = clamp((t - t0) / (t1 - t0 - 0.05), 0, 1);
    let lo = 0, hi = capStep;  // largest step with tau <= u
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tau[mid] <= u) lo = mid; else hi = mid - 1;
    }
    if (lo > lastReveal) {
      const tipIndex = Math.max(0, mainAt[lo + 1] - 1);
      const prevTip = events.length ? events[events.length - 1].tipIndex : 0;
      events.push({ t, reveal: lo, prev: lastReveal, tipIndex, advance: tipIndex - prevTip, grew: lo - lastReveal });
      lastReveal = lo;
    }
    const r = rng();
    t += r < 0.12 ? 0.26 + rng() * 0.16 : 0.07 + rng() * 0.12;
  }
  if (!events.length || events[events.length - 1].reveal < capStep) {
    const prevTip = events.length ? events[events.length - 1].tipIndex : 0;
    events.push({ t: t1, reveal: capStep, prev: lastReveal, tipIndex: capIndex, advance: capIndex - prevTip, grew: capStep - lastReveal });
  }

  const tipAtCloudBase = (() => {
    for (let k = 0; k < m; k++) if (bolt.mainPos[3 * k + 1] < bolt.cloudBaseY) return k;
    return 0;
  })();

  // Evaluates the leader state at cinematic time t.
  function evaluate(time) {
    const out = {
      t: time, phase: 'intro', reveal: -1, prevReveal: -1, sinceBurst: 99, eventIndex: -1,
      tipIndex: 0, upDist: -1, strokeT: time - TIMES.attach, leaderProgress: 0,
    };
    if (time < t0) return out;
    if (time >= TIMES.attach) {
      out.phase = time < TIMES.attach + 1.9 ? 'stroke' : 'aftermath';
      out.reveal = 1e9; out.prevReveal = 1e9; out.tipIndex = m - 1; out.eventIndex = events.length - 1;
      out.upDist = 1e9; out.leaderProgress = 1;
      return out;
    }
    let lo = 0, hi = events.length - 1;
    if (events[0].t > time) { out.phase = 'leader'; return out; }
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (events[mid].t <= time) lo = mid; else hi = mid - 1;
    }
    const e = events[lo];
    out.phase = 'leader';
    out.eventIndex = lo;
    out.reveal = e.reveal; out.prevReveal = e.prev; out.sinceBurst = time - e.t; out.tipIndex = e.tipIndex;
    out.leaderProgress = clamp((time - t0) / (TIMES.attach - t0), 0, 1);
    if (time > t1) {
      const up = (time - t1) / TIMES.connect;
      out.upDist = up * up * bolt.mainGDist[capIndex];
    }
    return out;
  }

  return { events, evaluate, capIndex, capStep, tipAtCloudBase };
}
