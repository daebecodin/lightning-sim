// The bolt itself: one instanced, camera-facing ribbon per channel segment.
// All animation (stepped reveal, step flashes, upward connecting leader,
// return stroke wave) happens in the vertex shader from a handful of
// uniforms, so no geometry is touched after the bolt is built.
import * as THREE from 'three';
import { COMMON_GLSL } from './shared.js';

const VERT = /* glsl */ `
${COMMON_GLSL}
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aInfo;   // growth step, channel distance to ground (m), width class, field
attribute float aMain;
uniform float uReveal;      // growth steps revealed so far (simulation time)
uniform float uPrevReveal;  // value before the latest burst
uniform float uBurst;       // 1 at a burst, decays in real time
uniform float uUpDist;      // upward connecting leader reach along the channel (m)
uniform float uLeaderGain;
uniform float uRestrike;
uniform float uPixel;       // world size of one pixel at distance 1
uniform float uMaxWidth;    // widest a ribbon may get, per unit distance
uniform float uTipSpan;
varying vec3 vColor;
varying float vSide;

void main() {
  float stepI = aInfo.x, gdist = aInfo.y, wc = aInfo.z, field = aInfo.w;

  // ---- leader phase
  float shown = step(stepI, uReveal);
  float upward = aMain * step(gdist, uUpDist) * (1.0 - shown);
  float fresh = step(uPrevReveal + 0.5, stepI) * shown * uBurst;
  float nearTip = exp(-max(uReveal - stepI, 0.0) / uTipSpan);
  float shimmer = 0.8 + 0.2 * sin(uTime * 31.0 + stepI * 1.7);
  float leader = (0.15 + 0.5 * nearTip + 2.2 * fresh) * mix(0.3, 1.0, wc) * (0.7 + 0.6 * field) * shimmer * shown;
  leader += upward * 2.2;
  leader *= uLeaderGain;

  // ---- return stroke: a wave that leaves the ground at uStrokeT = 0
  float ts = uStrokeT - gdist / 9000.0;
  float on = step(0.0, ts);
  float tsp = max(ts, 0.0);
  float mainEnv = 11.0 * exp(-tsp / 0.12) + 3.0 * exp(-tsp / 0.5) + 0.5 * exp(-tsp / 0.9);
  float branchEnv = (6.0 * exp(-tsp / 0.08) + 0.9 * exp(-tsp / 0.32)) * mix(0.12, 1.0, wc);
  float stroke = on * mix(branchEnv, mainEnv, aMain) + aMain * uRestrike * 5.0;

  float intensity = leader + stroke;
  vec3 cool = vec3(0.46, 0.54, 1.0);
  vec3 hot = vec3(1.0, 0.94, 0.98);
  vec3 col = mix(cool, hot, clamp(stroke * 0.3 + fresh * 0.7 + upward, 0.0, 1.0));

  // ---- camera-facing ribbon in view space
  vec3 a = (modelViewMatrix * vec4(aA, 1.0)).xyz;
  vec3 b = (modelViewMatrix * vec4(aB, 1.0)).xyz;
  vec3 p = mix(a, b, position.x);
  vec3 t = normalize(b - a + vec3(1e-5));
  vec3 side = normalize(cross(t, normalize(p)));
  float dist = length(p);
  float w = mix(0.16, 0.7, wc) * (1.0 + 0.5 * fresh) + on * aMain * 1.3 * exp(-tsp / 0.45) + on * (1.0 - aMain) * 0.5 * wc * exp(-tsp / 0.2);
  float minW = 0.75 * dist * uPixel;
  // Keep distant channels at least a pixel and a half wide, dimming them
  // instead of letting them alias away.
  intensity *= clamp(w / minW, 0.35, 1.0);
  w = min(max(w, minW), dist * uMaxWidth);
  p += side * w * position.y + t * w * 0.2 * (position.x * 2.0 - 1.0);

  intensity *= exp(-uFogDensity * dist * 0.85);
  vColor = col * intensity;
  vSide = position.y;
  gl_Position = intensity < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSide;
void main() {
  float s2 = vSide * vSide;
  float edge = (1.0 - s2) * (1.0 - s2);   // fade to exactly zero at the ribbon edge
  float core = exp(-s2 * 9.0);
  float halo = exp(-s2 * 2.2) * 0.3;
  gl_FragColor = vec4(vColor * (core + halo) * edge, 1.0);
}`;

export class LightningMesh {
  constructor(shared) {
    this.uniforms = {
      ...shared,
      uReveal: { value: -1 }, uPrevReveal: { value: -1 }, uBurst: { value: 0 }, uUpDist: { value: -1 },
      uLeaderGain: { value: 1 }, uRestrike: { value: 0 }, uPixel: { value: 0.001 }, uMaxWidth: { value: 0.02 }, uTipSpan: { value: 40 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  setBolt(bolt) {
    this.mesh.geometry.dispose();
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(bolt.aA, 3));
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(bolt.aB, 3));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(bolt.aInfo, 4));
    g.setAttribute('aMain', new THREE.InstancedBufferAttribute(bolt.aMain, 1));
    g.instanceCount = bolt.segCount;
    this.mesh.geometry = g;
    // Recent growth glows for roughly the last 4 percent of the run.
    this.uniforms.uTipSpan.value = Math.max(12, bolt.totalSteps * 0.04);
  }
}
