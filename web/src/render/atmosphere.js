// Sky dome, cloud deck, rain, and in-cloud ice. All procedural visuals; the
// only simulated inputs are the cloud base height and the charge centres
// (used to place the cloud mass and its internal glows).
import * as THREE from 'three';
import { COMMON_GLSL, makeBlobTexture } from './shared.js';
import { makeRng } from '../world.js';

// ------------------------------------------------------------------ sky
export function createSky(shared) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4((modelViewMatrix * vec4(position, 0.0)).xyz, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Overcast: a faint brighter band just above the horizon where the
        // far edge of the storm lets some light through.
        vec3 overhead = vec3(0.010, 0.013, 0.020);
        vec3 band = vec3(0.060, 0.075, 0.095);
        float k = exp(-abs(h - 0.02) * 9.0);
        vec3 col = mix(overhead, band, k);
        float under = fbm(d.xz / max(h + 0.15, 0.05) * 1.3);
        col *= 0.75 + 0.5 * under;
        // The underside of the cloud deck catches the return stroke.
        col += uFlash * (0.012 + 0.03 * under) * smoothstep(-0.05, 0.35, h);
        col = mix(col, uFogColor, smoothstep(0.05, -0.12, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// --------------------------------------------------------------- clouds
const CLOUD_VERT = /* glsl */ `
${COMMON_GLSL}
attribute vec4 aPuff;   // centre xyz, size
attribute vec2 aSeed;   // rotation, shade
uniform vec4 uGlow[4];  // xyz + intensity of in-cloud flickers
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 centre = aPuff.xyz;
  float size = aPuff.w;
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  float c = cos(aSeed.x), s = sin(aSeed.x);
  vec2 corner = mat2(c, -s, s, c) * position.xy;
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 0.5 + 0.5;
  float dist = length(mv.xyz);
  // The leader tip is a weak source; the return stroke lights the whole deck.
  vec3 dTip = uTipPos - centre;
  vec3 dStrike = uStrikePos + vec3(0.0, 300.0, 0.0) - centre;
  vec3 lit = uAmbient * 1.1 + uTipLight * 0.07 / (1.0 + dot(dTip, dTip) / (140.0 * 140.0))
           + uFlash * 0.9 / (1.0 + dot(dStrike, dStrike) / (900.0 * 900.0));
  for (int i = 0; i < 4; i++) {
    vec3 d = uGlow[i].xyz - centre;
    lit += vec3(0.55, 0.62, 1.0) * uGlow[i].w / (1.0 + dot(d, d) / (230.0 * 230.0));
  }
  vColor = withFog(vec3(0.35 + 1.0 * aSeed.y * aSeed.y) * lit, dist);
  // Puffs fade out as the camera flies through them.
  vAlpha = smoothstep(size * 0.12, size * 0.8, dist) * (0.45 + 0.3 * aSeed.y);
}`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, vUv).a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export function createClouds(shared, count) {
  const rng = makeRng(0xC10D);
  const uniforms = {
    ...shared,
    uMap: { value: makeBlobTexture(256, 48, rng) },
    uGlow: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const puff = new Float32Array(count * 4), seed = new Float32Array(count * 2);
  geometry.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puff, 4));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  geometry.instanceCount = count;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  // Lays the deck out above the simulated cloud base, densest around the
  // charge region.
  function layout(bolt) {
    const r2 = makeRng(bolt.seed ^ 0x5EED);
    const base = bolt.cloudBaseY, top = 1900;
    const cx = bolt.root[0], cz = bolt.root[2];
    for (let i = 0; i < count; i++) {
      const near = i < count * 0.45;
      const radius = near ? 900 * Math.sqrt(r2()) : 900 + 3600 * Math.pow(r2(), 0.8);
      const ang = r2() * Math.PI * 2;
      const size = near ? 150 + r2() * 190 : 320 + r2() * 520;
      const low = r2() < 0.55;
      puff[4 * i] = cx + Math.cos(ang) * radius;
      puff[4 * i + 1] = low ? base + size * (0.35 + r2() * 0.25) : base + size * 0.5 + r2() * (top - base);
      puff[4 * i + 2] = cz + Math.sin(ang) * radius;
      puff[4 * i + 3] = size;
      seed[2 * i] = r2() * 6.283;
      seed[2 * i + 1] = r2();
    }
    geometry.attributes.aPuff.needsUpdate = true;
    geometry.attributes.aSeed.needsUpdate = true;
  }
  return { mesh, uniforms, layout };
}

// ----------------------------------------------------------------- rain
// Streaks live in a box that wraps around the camera, so a few thousand
// lines cover the whole flight.
export function createRain(shared, count) {
  const rng = makeRng(0xA1B2);
  const offs = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2), speed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = rng(), y = rng(), z = rng(), s = 0.75 + rng() * 0.5;
    for (let k = 0; k < 2; k++) {
      offs.set([x, y, z], (2 * i + k) * 3);
      end[2 * i + k] = k;
      speed[2 * i + k] = s;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(offs, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  const uniforms = { ...shared, uAmount: { value: 1 }, uCamVel: { value: new THREE.Vector3() } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON_GLSL}
      attribute float aEnd;
      attribute float aSpeed;
      uniform float uAmount;
      uniform vec3 uCamVel;
      varying vec3 vColor;
      const vec3 BOX = vec3(110.0, 80.0, 110.0);
      void main() {
        vec3 fall = vec3(2.2, -9.5 * aSpeed, 0.9);
        vec3 p = position * BOX + fall * uTime;
        p = cameraPosition + (fract((p - cameraPosition) / BOX) - 0.5) * BOX;
        // Streak length follows the velocity relative to the camera, like a
        // real exposure would.
        vec3 rel = fall - uCamVel;
        p -= rel * 0.014 * aEnd;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = length(mv.xyz);
        float fade = smoothstep(55.0, 20.0, dist) * smoothstep(0.6, 2.5, dist);
        vec3 lit = uAmbient * 2.0 + min(sceneGlow(p), vec3(1.2)) * 0.4;
        vColor = lit * fade * uAmount * (1.0 - 0.6 * aEnd) * 0.45;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  return { mesh, uniforms };
}

// ------------------------------------------------------------------ ice
export function createIce(shared, count) {
  const rng = makeRng(0x1CE);
  const offs = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    offs.set([rng(), rng(), rng()], i * 3);
    seed[i] = rng();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(offs, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { ...shared, uAmount: { value: 1 }, uScale: { value: 600 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON_GLSL}
      attribute float aSeed;
      uniform float uAmount;
      uniform float uScale;
      varying vec3 vColor;
      const vec3 BOX = vec3(70.0, 70.0, 70.0);
      void main() {
        // Graupel and ice crystals: slow fall, turbulent drift.
        vec3 drift = vec3(sin(uTime * 0.7 + aSeed * 40.0), 0.0, cos(uTime * 0.5 + aSeed * 23.0)) * 1.6;
        vec3 p = position * BOX + vec3(1.5, -2.4 - aSeed * 1.5, 0.6) * uTime + drift;
        p = cameraPosition + (fract((p - cameraPosition) / BOX) - 0.5) * BOX;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = length(mv.xyz);
        float fade = smoothstep(35.0, 8.0, dist) * smoothstep(0.4, 1.5, dist);
        float glint = 0.6 + 0.4 * sin(uTime * (5.0 + aSeed * 9.0) + aSeed * 100.0);
        vColor = (uAmbient * 5.0 + sceneGlow(p) * 0.9) * fade * glint * uAmount;
        gl_PointSize = clamp(uScale * (0.05 + 0.07 * aSeed) / dist, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.1, length(c));
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 13;
  return { mesh, uniforms };
}
