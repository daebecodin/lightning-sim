// Sparks, embers, smoke, and glow sprites. All procedural visual effects.
// Every particle position is a closed-form function of the time since the
// strike, evaluated in the vertex shader, so the effects can be paused and
// seeked like everything else.
import * as THREE from 'three';
import { COMMON_GLSL, makeBlobTexture } from './shared.js';
import { makeRng } from '../world.js';

const PARTICLE_VERT = /* glsl */ `
${COMMON_GLSL}
attribute vec3 aVel;
attribute vec4 aParam;   // delay, life, size, seed
uniform vec3 uGravity;
uniform float uDrag;
uniform float uWobble;
uniform float uScale;
varying vec3 vColor;
void main() {
  float t = uStrokeT - aParam.x;
  float life = aParam.y;
  float alive = step(0.0, t) * step(t, life);
  float e = 1.0 - exp(-uDrag * t);
  // ballistic flight with linear drag
  vec3 p = position + (aVel - uGravity / uDrag) * e / uDrag + uGravity * t / uDrag;
  p.xz += uWobble * vec2(sin(t * 2.3 + aParam.w * 50.0), cos(t * 1.9 + aParam.w * 31.0)) * t;
  float landed = step(p.y, 0.06);
  p.y = max(p.y, 0.06);
  float k = clamp(t / life, 0.0, 1.0);
  float heat = (1.0 - k) * (1.0 - 0.6 * landed);
  vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.6), heat * heat) * (0.3 + 3.2 * heat * heat);
  col *= 0.75 + 0.25 * sin(t * 40.0 + aParam.w * 90.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = length(mv.xyz);
  vColor = col * alive * exp(-uFogDensity * dist);
  gl_PointSize = clamp(uScale * aParam.z / dist, 1.0, 14.0);
  gl_Position = alive > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const PARTICLE_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d), 1.0);
}`;

function makePoints(shared, count, extra) {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), param = new Float32Array(count * 4);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geometry.setAttribute('aParam', new THREE.BufferAttribute(param, 4));
  const uniforms = { ...shared, uGravity: { value: new THREE.Vector3(0, -9.8, 0) }, uDrag: { value: 1.2 }, uWobble: { value: 0 }, uScale: { value: 600 }, ...extra };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 18;
  return { mesh, uniforms, pos, vel, param, geometry, count };
}

// Sparks thrown out of the attachment point by the return stroke.
export function createSparks(shared, count) {
  const sys = makePoints(shared, count, {});
  sys.setBolt = (bolt) => {
    const rng = makeRng(bolt.seed ^ 0x51A7);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, up = 0.25 + rng() * 0.75;
      const speed = 6 + 38 * Math.pow(rng(), 2.2);
      const h = Math.sqrt(Math.max(0, 1 - up * up));
      sys.pos.set([bolt.strike[0] + (rng() - 0.5) * 0.8, 0.2, bolt.strike[2] + (rng() - 0.5) * 0.8], 3 * i);
      sys.vel.set([Math.cos(a) * h * speed, up * speed * 0.9, Math.sin(a) * h * speed], 3 * i);
      sys.param.set([rng() * 0.12 + (rng() < 0.15 ? rng() * 0.7 : 0), 0.5 + 2.6 * Math.pow(rng(), 1.6), 0.07 + 0.1 * rng(), rng()], 4 * i);
    }
    for (const k of ['position', 'aVel', 'aParam']) sys.geometry.attributes[k].needsUpdate = true;
  };
  return sys;
}

// Slow embers lifting off the scorch figure during the aftermath. They are
// seeded on the simulated ground-discharge nodes.
export function createEmbers(shared, count) {
  const sys = makePoints(shared, count, {});
  sys.uniforms.uGravity.value.set(0.5, 1.1, 0.2);   // buoyant, drifting downwind
  sys.uniforms.uDrag.value = 0.9;
  sys.uniforms.uWobble.value = 0.18;
  sys.setBolt = (bolt) => {
    const rng = makeRng(bolt.seed ^ 0xE3B);
    const g = bolt.ground;
    for (let i = 0; i < count; i++) {
      const node = Math.floor(rng() * g.count);
      sys.pos.set([bolt.strike[0] + g.pos[2 * node] + (rng() - 0.5) * 0.3, 0.1, bolt.strike[2] + g.pos[2 * node + 1] + (rng() - 0.5) * 0.3], 3 * i);
      sys.vel.set([(rng() - 0.5) * 0.8, 0.5 + rng() * 1.6, (rng() - 0.5) * 0.8], 3 * i);
      sys.param.set([0.3 + rng() * 5.2, 1.6 + rng() * 2.8, 0.035 + 0.04 * rng(), rng()], 4 * i);
    }
    for (const k of ['position', 'aVel', 'aParam']) sys.geometry.attributes[k].needsUpdate = true;
  };
  return sys;
}

// Glow sprites and smoke puffs.
export function createGlows(scene) {
  const rng = makeRng(0x610);
  const soft = makeBlobTexture(128, 0, rng);
  const lumpy = makeBlobTexture(128, 14, rng);
  const sprite = (tex, blending, order) => {
    const m = new THREE.SpriteMaterial({ map: tex, blending, depthWrite: false, transparent: true, color: 0x000000 });
    const s = new THREE.Sprite(m);
    s.renderOrder = order;
    s.visible = false;
    scene.add(s);
    return s;
  };
  const glows = {
    corona: sprite(soft, THREE.AdditiveBlending, 21),   // at the leader tip
    halo: sprite(soft, THREE.AdditiveBlending, 19),     // scattering in cloud around the tip
    flare: sprite(soft, THREE.AdditiveBlending, 22),    // at the attachment point
    smoke: [],
  };
  glows.flare.material.depthTest = false;
  for (let i = 0; i < 16; i++) {
    const s = sprite(lumpy, THREE.NormalBlending, 17);
    s.userData = { delay: 0.15 + i * 0.28 + rng() * 0.2, ox: (rng() - 0.5) * 3, oz: (rng() - 0.5) * 3, rise: 1.4 + rng() * 1.2, rot: rng() * 6.28, grow: 1.2 + rng() };
    s.material.rotation = s.userData.rot;
    glows.smoke.push(s);
  }
  return glows;
}
