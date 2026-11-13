// World scale, quality presets, and small deterministic helpers shared by
// the renderer, camera, and audio.

export const WORLD = Object.freeze({
  height: 1600,      // metres represented by the simulation grid, ground to top
  flatRadius: 90,    // terrain is flat within this distance of the strike
  groundCell: 0.3,   // metres per ground-discharge cell
});

// Simulation grid and render detail per quality level.
export const QUALITY = Object.freeze({
  low: { label: 'Low', grid: [48, 96, 48], pixelRatio: 0.75, clouds: 240, rain: 5000, ice: 1500, grass: 40000, sparks: 500, bloomRes: 0.5 },
  medium: { label: 'Medium', grid: [64, 128, 64], pixelRatio: 1.0, clouds: 460, rain: 10000, ice: 3000, grass: 110000, sparks: 1100, bloomRes: 0.5 },
  high: { label: 'High', grid: [96, 192, 96], pixelRatio: 1.75, clouds: 760, rain: 18000, ice: 5000, grass: 220000, sparks: 2000, bloomRes: 0.75 },
});

// Integer hash to [0, 1). Used for procedural (non-simulated) detail only.
export function hash1(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function hash2(a, b) {
  return hash1((Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)) | 0);
}

// Small seeded generator (mulberry32) for procedural placement.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// Gently rolling prairie. Height is zero and flat around the strike point so
// grass, scorch decal, and camera all agree on where the ground is.
export function makeTerrain(strikeX, strikeZ) {
  const raw = (x, z) =>
    (valueNoise(x / 950 + 11.3, z / 950 - 4.1) - 0.5) * 46 +
    (valueNoise(x / 310 - 7.7, z / 310 + 2.9) - 0.5) * 14 +
    (valueNoise(x / 120 + 3.1, z / 120 + 9.4) - 0.5) * 4;
  const base = raw(strikeX, strikeZ);
  return (x, z) => {
    const r = Math.hypot(x - strikeX, z - strikeZ);
    let k = (r - WORLD.flatRadius) / 420;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    k = k * k * (3 - 2 * k);
    return (raw(x, z) - base) * k;
  };
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
