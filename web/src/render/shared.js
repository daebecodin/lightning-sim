// Uniforms and GLSL shared by every material, so the whole scene reacts to
// the same fog and the same two lightning lights.
import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0.012, 0.016, 0.024) },
    uFogDensity: { value: 0.0004 },
    uAmbient: { value: new THREE.Color(0.02, 0.026, 0.038) },
    uTipPos: { value: new THREE.Vector3() },      // leader tip: weak blue point light
    uTipLight: { value: new THREE.Color(0, 0, 0) },
    uTipRange: { value: 110 },
    uStrikePos: { value: new THREE.Vector3() },   // return stroke: strong tall light
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uStrokeT: { value: -100 },                    // seconds since ground attachment
  };
}

export const COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uAmbient;
uniform vec3 uTipPos;
uniform vec3 uTipLight;
uniform float uTipRange;
uniform vec3 uStrikePos;
uniform vec3 uFlash;
uniform float uStrokeT;

vec3 sceneLight(vec3 P, vec3 N) {
  vec3 L = uAmbient * (0.65 + 0.35 * N.y);
  vec3 d = uTipPos - P;
  float r2 = dot(d, d);
  L += uTipLight * (0.25 + 0.75 * max(dot(N, d * inversesqrt(r2 + 1e-3)), 0.0)) / (1.0 + r2 / (uTipRange * uTipRange));
  vec3 f = uStrikePos + vec3(0.0, 160.0, 0.0) - P;
  float f2 = dot(f, f);
  L += uFlash * (0.3 + 0.7 * max(dot(N, f * inversesqrt(f2)), 0.0)) / (1.0 + f2 / (650.0 * 650.0));
  return L;
}

// Unshadowed, direction-free version for particles and cloud puffs.
vec3 sceneGlow(vec3 P) {
  vec3 d = uTipPos - P;
  vec3 f = uStrikePos + vec3(0.0, 300.0, 0.0) - P;
  return uTipLight / (1.0 + dot(d, d) / (uTipRange * uTipRange)) + uFlash / (1.0 + dot(f, f) / (900.0 * 900.0));
}

vec3 withFog(vec3 c, float dist) {
  return mix(uFogColor, c, exp(-uFogDensity * dist));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

// Soft round blob with lumpy edges, used for cloud puffs, smoke, and glows.
export function makeBlobTexture(size, lumps, seedFn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  if (lumps === 0) {
    // glow: bright pinpoint core with a long faint skirt
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.08, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.03)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  } else {
    for (let i = 0; i < lumps; i++) {
      const ang = seedFn() * Math.PI * 2, rad = Math.sqrt(seedFn()) * size * 0.3;
      const r = size * (0.07 + seedFn() * 0.12);
      blob(size / 2 + Math.cos(ang) * rad, size / 2 + Math.sin(ang) * rad, r, 0.22 + seedFn() * 0.3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
