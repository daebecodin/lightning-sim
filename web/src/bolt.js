// Turns the raw simulation buffers into a world-space description of the
// bolt that the renderer, camera, and audio share.
//
// SIMULATED (from C++): node cells, tree topology, growth order, local field,
// main channel, channel length to ground, cloud charge centres, and the
// ground discharge pattern.
// PROCEDURAL (added here, for looks only): sub-cell jitter of node positions
// and the small kinks inserted when each cell-to-cell link is subdivided.
import { WORLD, hash1 } from './world.js';
import { NodeFlag } from './sim/wasm-bindings.js';

const SUBDIV = 3;

export function buildBolt(snap) {
  const { nx, ny, nz, seed } = snap.stats;
  const cell = WORLD.height / ny;
  const n = snap.parents.length;
  const { positions, parents, steps, fields, flags, subtrees, groundDist, mainPath } = snap;

  // ---- node positions in metres, with procedural jitter
  const wpos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const pinned = flags[i] & (NodeFlag.ROOT | NodeFlag.GROUND);
    const j = pinned ? 0 : 0.3 * cell;
    const h = (seed * 7919 + i * 3) | 0;
    wpos[3 * i] = (positions[3 * i] - nx / 2 + 0.5) * cell + (hash1(h) - 0.5) * 2 * j;
    wpos[3 * i + 1] = positions[3 * i + 1] * cell + (hash1(h + 1) - 0.5) * 1.2 * j;
    wpos[3 * i + 2] = (positions[3 * i + 2] - nz / 2 + 0.5) * cell + (hash1(h + 2) - 0.5) * 2 * j;
  }
  const strikeNode = n - 1;
  // The node just above the strike keeps its jitter but must stay above ground.
  for (let i = 0; i < n; i++) if (i !== strikeNode && wpos[3 * i + 1] < 0.4 * cell) wpos[3 * i + 1] = 0.4 * cell;

  // ---- per-node width class from downstream size (simulated quantity)
  const width = new Float32Array(n);
  const norm = Math.log2(Math.max(8, n * 0.35));
  let fieldMax = 1e-9;
  for (let i = 0; i < n; i++) fieldMax = Math.max(fieldMax, fields[i]);
  for (let i = 0; i < n; i++) {
    width[i] = flags[i] & NodeFlag.MAIN ? 1 : Math.min(0.85, Math.log2(subtrees[i]) / norm);
  }

  // ---- render segments: each parent -> child link, subdivided with kinks
  const segCount = (n - 1) * SUBDIV;
  const aA = new Float32Array(segCount * 3), aB = new Float32Array(segCount * 3);
  const aInfo = new Float32Array(segCount * 4), aMain = new Float32Array(segCount);
  const p = [0, 0, 0], q = [0, 0, 0];
  let s = 0;
  for (let i = 1; i < n; i++) {
    const a = parents[i];
    const ax = wpos[3 * a], ay = wpos[3 * a + 1], az = wpos[3 * a + 2];
    const bx = wpos[3 * i], by = wpos[3 * i + 1], bz = wpos[3 * i + 2];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const gdA = groundDist[a] * cell, gdB = groundDist[i] * cell;
    const isMain = flags[i] & NodeFlag.MAIN ? 1 : 0;
    p[0] = ax; p[1] = ay; p[2] = az;
    for (let k = 1; k <= SUBDIV; k++) {
      const t = k / SUBDIV;
      q[0] = ax + (bx - ax) * t; q[1] = ay + (by - ay) * t; q[2] = az + (bz - az) * t;
      if (k < SUBDIV) {
        const h = (seed * 31337 + i * 16 + k * 3) | 0;
        const kink = 0.17 * len;
        q[0] += (hash1(h) - 0.5) * 2 * kink;
        q[1] += (hash1(h + 1) - 0.5) * 2 * kink;
        q[2] += (hash1(h + 2) - 0.5) * 2 * kink;
        if (q[1] < 0.05) q[1] = 0.05;
      }
      aA.set(p, 3 * s);
      aB.set(q, 3 * s);
      aInfo[4 * s] = steps[i];
      aInfo[4 * s + 1] = gdA + (gdB - gdA) * (t - 0.5 / SUBDIV);
      aInfo[4 * s + 2] = width[i];
      aInfo[4 * s + 3] = Math.min(1, fields[i] / fieldMax);
      aMain[s] = isMain;
      s++;
      p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
    }
  }

  // ---- main channel
  const m = mainPath.length;
  const mainPos = new Float32Array(m * 3), mainStep = new Uint32Array(m), mainGDist = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const i = mainPath[k];
    mainPos[3 * k] = wpos[3 * i]; mainPos[3 * k + 1] = wpos[3 * i + 1]; mainPos[3 * k + 2] = wpos[3 * i + 2];
    mainStep[k] = steps[i];
    mainGDist[k] = groundDist[i] * cell;
  }

  // ---- cloud charge centres (simulated)
  const charges = [];
  for (let c = 0; c < snap.charges.length / 6; c++) {
    charges.push({
      x: (snap.charges[6 * c] - nx / 2 + 0.5) * cell,
      y: snap.charges[6 * c + 1] * cell,
      z: (snap.charges[6 * c + 2] - nz / 2 + 0.5) * cell,
      radius: snap.charges[6 * c + 3] * cell,
      q: snap.charges[6 * c + 5],
    });
  }

  // ---- ground discharge (simulated), metres relative to the strike
  const g = snap.groundParents.length;
  const groundPos = new Float32Array(g * 2);
  for (let i = 0; i < g * 2; i++) groundPos[i] = snap.groundPositions[i] * WORLD.groundCell;
  const groundSub = new Uint32Array(g).fill(1);
  for (let i = g - 1; i > 0; i--) groundSub[snap.groundParents[i]] += groundSub[i];
  let groundMaxStep = 1;
  for (let i = 0; i < g; i++) groundMaxStep = Math.max(groundMaxStep, snap.groundSteps[i]);

  let stepsMax = 0;
  for (let i = 0; i < n; i++) stepsMax = Math.max(stepsMax, steps[i]);

  return {
    seed, cell, nodeCount: n, stats: snap.stats,
    wpos, steps, parents, flags,
    segCount, aA, aB, aInfo, aMain,
    mainCount: m, mainPos, mainStep, mainGDist, mainLength: mainGDist[0],
    totalSteps: stepsMax,
    root: [wpos[0], wpos[1], wpos[2]],
    strike: [wpos[3 * strikeNode], 0, wpos[3 * strikeNode + 2]],
    cloudBaseY: snap.stats.cloudBase * cell,
    worldWidth: nx * cell,
    charges,
    ground: {
      count: g, pos: groundPos, parents: snap.groundParents, steps: snap.groundSteps,
      subtree: groundSub, maxStep: groundMaxStep, size: snap.stats.groundGrid * WORLD.groundCell,
    },
  };
}
