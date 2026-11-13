// Prairie terrain, instanced grass, and the scorch mark.
// The scorch pattern is the simulated ground discharge; how it glows, cools,
// and burns the grass is procedural.
import * as THREE from 'three';
import { COMMON_GLSL } from './shared.js';
import { makeRng, WORLD } from '../world.js';

// -------------------------------------------------------------- terrain
export function createTerrain(shared) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vWorld = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float dist = length(vWorld - cameraPosition);
        float patches = fbm(vWorld.xz * 0.0035);
        float mid = fbm(vWorld.xz * 0.045 + 3.7);
        float fine = vnoise(vWorld.xz * 1.9) * smoothstep(120.0, 10.0, dist);
        vec3 green = vec3(0.10, 0.115, 0.055);
        vec3 straw = vec3(0.30, 0.25, 0.13);
        vec3 soil = vec3(0.09, 0.07, 0.05);
        vec3 albedo = mix(green, straw, smoothstep(0.32, 0.68, patches));
        albedo = mix(albedo, soil, smoothstep(0.6, 0.82, mid) * 0.45);
        albedo *= 0.72 + 0.5 * mid + 0.25 * fine;
        vec3 col = albedo * sceneLight(vWorld, normalize(vNormal));
        gl_FragColor = vec4(withFog(col, dist), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;

  function rebuild(heightAt, cx, cz) {
    const size = 11000, seg = 220;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, heightAt(x, z), z);
    }
    g.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = g;
  }
  return { mesh, rebuild };
}

// ---------------------------------------------------------------- scorch
// Canvas channels: R = char, G = arrival time of the discharge (0 centre,
// 1 outermost tips), B = ember cores.
function drawScorch(ground) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const scale = size / ground.size, c = size / 2;
  const X = (i) => c + ground.pos[2 * i] * scale, Y = (i) => c + ground.pos[2 * i + 1] * scale;
  g.lineCap = 'round';
  g.globalCompositeOperation = 'lighten';
  const norm = Math.log2(Math.max(4, ground.count));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < ground.count; i++) {
      const p = ground.parents[i];
      const arrival = Math.round(255 * Math.min(1, ground.steps[i] / ground.maxStep));
      const w = Math.log2(ground.subtree[i] + 1) / norm;  // trunks are thicker
      if (pass === 0) {
        g.strokeStyle = `rgb(${Math.round(150 + 105 * w)},${arrival},0)`;
        g.shadowColor = `rgb(${Math.round(120 + 100 * w)},${arrival},0)`;
        g.shadowBlur = 5 + 9 * w;
        g.lineWidth = 3 + 9 * w;
      } else {
        g.strokeStyle = `rgb(255,${arrival},${Math.round(120 + 135 * w)})`;
        g.shadowBlur = 0;
        g.lineWidth = 1.2 + 3.5 * w;
      }
      g.beginPath();
      g.moveTo(X(p), Y(p));
      g.lineTo(X(i), Y(i));
      g.stroke();
    }
  }
  // Blast mark at the attachment point.
  g.shadowBlur = 0;
  const grad = g.createRadialGradient(c, c, 0, c, c, size * 0.06);
  grad.addColorStop(0, 'rgb(255,0,255)');
  grad.addColorStop(0.6, 'rgb(230,0,120)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, size * 0.06, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

const SCORCH_GLSL = /* glsl */ `
uniform sampler2D uScorch;
uniform float uScorchSize;
// Returns vec3(char, ember heat, reveal) at a world position.
vec3 scorchAt(vec2 xz) {
  vec2 uv = (xz - uStrikePos.xz) / uScorchSize + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || uStrokeT < 0.0) return vec3(0.0);
  vec4 s = texture2D(uScorch, uv);
  // The discharge spreads outward over about half a second.
  float reveal = smoothstep(s.g - 0.06, s.g + 0.04, uStrokeT / 0.5);
  float local = max(uStrokeT - s.g * 0.5, 0.0);
  float heat = s.b * reveal * (1.6 * exp(-local / 0.5) + 0.8 * exp(-local / 8.0));
  return vec3(s.r * reveal, heat, reveal);
}
vec3 emberColor(float heat) {
  // black body-ish ramp: deep red -> orange -> pale yellow
  return vec3(1.0, 0.33, 0.07) * heat * 2.4 + vec3(0.9, 0.75, 0.45) * max(heat - 0.8, 0.0) * 3.0;
}`;

export function createScorch(shared) {
  const texture = new THREE.CanvasTexture(document.createElement('canvas'));
  texture.colorSpace = THREE.NoColorSpace;
  const scorchUniforms = { uScorch: { value: texture }, uScorchSize: { value: 28.8 } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...scorchUniforms },
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      ${SCORCH_GLSL}
      varying vec3 vWorld;
      void main() {
        vec3 s = scorchAt(vWorld.xz);
        float flicker = 0.8 + 0.2 * vnoise(vWorld.xz * 6.0 + uTime * 2.5);
        float alpha = clamp(s.x * 0.92, 0.0, 1.0);
        vec3 glow = emberColor(s.y * flicker);
        float dist = length(vWorld - cameraPosition);
        gl_FragColor = vec4(glow * exp(-uFogDensity * dist), alpha);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;

  function setBolt(bolt) {
    texture.image = drawScorch(bolt.ground);
    texture.needsUpdate = true;
    scorchUniforms.uScorchSize.value = bolt.ground.size;
    mesh.scale.set(bolt.ground.size, 1, bolt.ground.size);
    mesh.position.set(bolt.strike[0], 0.04, bolt.strike[2]);
  }
  return { mesh, uniforms: scorchUniforms, setBolt };
}

// ----------------------------------------------------------------- grass
const GRASS_VERT = /* glsl */ `
${COMMON_GLSL}
${SCORCH_GLSL}
attribute vec3 aBase;
attribute vec4 aBlade;   // height, width, yaw, tint
varying vec3 vColor;
void main() {
  float t = position.y;
  float h = aBlade.x;
  vec3 s = scorchAt(aBase.xz);
  float burn = s.x;
  h *= 1.0 - 0.82 * burn;

  // wind
  float phase = dot(aBase.xz, vec2(0.13, 0.08)) + uTime * 1.9 + aBlade.z;
  float gust = 0.55 + 0.45 * sin(dot(aBase.xz, vec2(0.021, 0.017)) - uTime * 0.6);
  float sway = (sin(phase) * 0.6 + sin(phase * 2.7 + 1.3) * 0.25) * gust;
  vec2 bend = vec2(0.85, 0.5) * (0.28 + 0.3 * sway);

  // pressure wave from the return stroke flattens the grass as it passes
  vec2 away = aBase.xz - uStrikePos.xz;
  float r = length(away);
  away /= max(r, 0.01);
  float ts = max(uStrokeT, 0.0);
  float front = (r - ts * 75.0) / 8.0;
  bend += away * 1.5 * exp(-front * front) * step(0.0, uStrokeT) * exp(-ts * 1.1) / (1.0 + r * 0.02);

  float c = cos(aBlade.z), sn = sin(aBlade.z);
  vec3 p = aBase + vec3(c, 0.0, sn) * position.x * aBlade.y;
  float curve = t * t;
  p.xz += bend * h * curve;
  p.y += h * t * (1.0 - 0.25 * min(dot(bend, bend), 1.0) * curve);

  vec3 n = normalize(vec3(-sn * 0.35 + bend.x * 0.4, 1.0, c * 0.35 + bend.y * 0.4));
  vec3 root = vec3(0.05, 0.06, 0.028);
  vec3 tip = mix(vec3(0.21, 0.22, 0.09), vec3(0.42, 0.36, 0.18), aBlade.w);
  vec3 albedo = mix(root, tip, t);
  albedo = mix(albedo, vec3(0.012, 0.01, 0.009), min(burn * 1.3, 1.0));
  vec3 col = albedo * sceneLight(p, n) * (0.55 + 0.45 * t);
  // charred stems smoulder near the base
  col += emberColor(s.y) * (1.0 - t) * 0.6;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vColor = withFog(col, length(mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;

export function createGrass(shared, scorchUniforms, count) {
  // one blade: a tapered strip of 7 vertices
  const profile = [[0, 1], [0.4, 0.82], [0.75, 0.5]];
  const verts = [], idx = [];
  for (const [y, w] of profile) verts.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
  verts.push(0, 1, 0);
  idx.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geometry.setIndex(idx);
  const base = new Float32Array(count * 3), blade = new Float32Array(count * 4);
  geometry.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geometry.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blade, 4));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...scorchUniforms },
    vertexShader: GRASS_VERT,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  // Scatter around the strike point, denser toward the middle where the
  // camera ends up.
  function setBolt(bolt, heightAt) {
    const rng = makeRng(bolt.seed ^ 0x6A55);
    const R = WORLD.flatRadius - 6;
    for (let i = 0; i < count; i++) {
      const r = R * Math.pow(rng(), 0.72), a = rng() * Math.PI * 2;
      const x = bolt.strike[0] + Math.cos(a) * r, z = bolt.strike[2] + Math.sin(a) * r;
      const clump = 0.6 + 0.8 * rng();
      base[3 * i] = x; base[3 * i + 1] = heightAt(x, z); base[3 * i + 2] = z;
      blade[4 * i] = (0.38 + 0.5 * rng()) * clump * (1 - 0.6 * Math.pow(r / R, 6));
      blade[4 * i + 1] = 0.05 + 0.06 * rng() + 0.05 * (r / R);
      blade[4 * i + 2] = rng() * Math.PI * 2;
      blade[4 * i + 3] = rng();
    }
    geometry.attributes.aBase.needsUpdate = true;
    geometry.attributes.aBlade.needsUpdate = true;
  }
  return { mesh, setBolt };
}
