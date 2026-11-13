// Scene assembly and per-frame uniform updates. The renderer is stateless
// with respect to time: render(t, state, rig) draws the frame for cinematic
// time t, whatever was drawn before.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSharedUniforms } from './shared.js';
import { LightningMesh } from './lightning.js';
import { createSky, createClouds, createRain, createIce } from './atmosphere.js';
import { createTerrain, createScorch, createGrass } from './ground.js';
import { createSparks, createEmbers, createGlows } from './particles.js';
import { TIMES } from '../timeline.js';
import { QUALITY, clamp, lerp, smoothstep, hash1 } from '../world.js';

const BASE_EXPOSURE = 1.25;
const INTRO_FLASHES = [0.7, 2.9, 1.9, 3.8];   // seconds, one per in-cloud glow

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = BASE_EXPOSURE;
    this.gl.setClearColor(0x000000, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 14000);
    this.shared = createSharedUniforms();

    // quality-independent objects
    this.sky = createSky(this.shared);
    this.terrain = createTerrain(this.shared);
    this.scorch = createScorch(this.shared);
    this.lightning = new LightningMesh(this.shared);
    this.glows = createGlows(this.scene);
    this.scene.add(this.sky, this.terrain.mesh, this.scorch.mesh, this.lightning.mesh);

    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.7, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.detail = null;
    this.bolt = null;
    this.qualityKey = null;
  }

  // Rebuilds the objects whose instance counts depend on the quality level.
  setQuality(key) {
    if (key === this.qualityKey) return;
    this.qualityKey = key;
    const q = (this.quality = QUALITY[key]);
    if (this.detail) {
      for (const o of Object.values(this.detail)) {
        this.scene.remove(o.mesh);
        o.mesh.geometry.dispose();
        o.mesh.material.dispose();
      }
    }
    this.detail = {
      clouds: createClouds(this.shared, q.clouds),
      rain: createRain(this.shared, q.rain),
      ice: createIce(this.shared, q.ice),
      grass: createGrass(this.shared, this.scorch.uniforms, q.grass),
      sparks: createSparks(this.shared, q.sparks),
      embers: createEmbers(this.shared, Math.round(q.sparks * 0.35)),
    };
    for (const o of Object.values(this.detail)) this.scene.add(o.mesh);
    if (this.bolt) this._applyBolt();
    this.resize();
  }

  setBolt(bolt, heightAt) {
    this.bolt = bolt;
    this.heightAt = heightAt;
    this.lightning.setBolt(bolt);
    this.terrain.rebuild(heightAt, bolt.strike[0], bolt.strike[2]);
    this.scorch.setBolt(bolt);
    this.shared.uStrikePos.value.set(bolt.strike[0], 0, bolt.strike[2]);
    if (this.detail) this._applyBolt();
  }

  _applyBolt() {
    const d = this.detail, b = this.bolt;
    d.clouds.layout(b);
    d.grass.setBolt(b, this.heightAt);
    d.sparks.setBolt(b);
    d.embers.setBolt(b);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const q = this.quality || QUALITY.medium;
    const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * ratio * q.bloomRes, h * ratio * q.bloomRes);
    this.camera.aspect = w / h;
    // Keep the horizontal field of view reasonable on portrait screens.
    this.camera.fov = w / h < 1 ? 78 : 62;
    this.camera.updateProjectionMatrix();
    this.pixelHeight = h * ratio;
  }

  // Draws the frame for cinematic time t.
  render(t, state, rig) {
    const b = this.bolt;
    if (!b || !this.detail) return;
    const sh = this.shared, d = this.detail, L = this.lightning.uniforms;
    const ts = state.strokeT;
    const struck = ts >= 0;
    const inCloud = rig.inCloud;
    const burst = Math.exp(-state.sinceBurst / 0.075);

    sh.uTime.value = t;
    sh.uStrokeT.value = ts;

    // ---- lightning
    L.uReveal.value = state.reveal;
    L.uPrevReveal.value = state.prevReveal;
    L.uBurst.value = burst;
    L.uUpDist.value = state.upDist;
    L.uLeaderGain.value = struck ? Math.exp(-ts / 0.35) : 1;
    const rs = ts - TIMES.restrike;
    const restrike = rs > 0 ? Math.exp(-rs / 0.17) * (1 - Math.exp(-rs / 0.025)) : 0;
    L.uRestrike.value = restrike;
    const viewH = 2 * Math.tan((this.camera.fov * Math.PI) / 360);
    L.uPixel.value = viewH / this.pixelHeight;
    L.uMaxWidth.value = viewH * 0.008;   // a channel never fills more than about 1.6 percent of the frame height

    // ---- the two lights
    const k = Math.min(state.tipIndex, b.mainCount - 1);
    const tip = sh.uTipPos.value.set(b.mainPos[3 * k], b.mainPos[3 * k + 1], b.mainPos[3 * k + 2]);
    let tipI;
    if (state.phase === 'intro') {
      // Faint corona attempts at the initiation point before breakdown.
      const build = smoothstep(TIMES.leaderStart - 2.6, TIMES.leaderStart, t);
      const flick = Math.pow(Math.max(0, Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.0) * Math.sin(t * 2.2 + 0.4)), 2);
      tipI = build * (0.15 + 2.2 * flick);
      sh.uTipRange.value = 110;
      sh.uTipLight.value.setRGB(0.32 * tipI, 0.42 * tipI, 1.0 * tipI);
    } else if (!struck) {
      tipI = 1.1 + 4.0 * burst + (state.upDist > 0 ? 2.5 : 0);
      sh.uTipRange.value = 110;
      sh.uTipLight.value.setRGB(0.32 * tipI, 0.42 * tipI, 1.0 * tipI);
    } else {
      // After the strike the same light slot becomes the ember glow.
      tip.set(b.strike[0], 1.6, b.strike[2]);
      sh.uTipRange.value = 15;
      tipI = (1.6 * Math.exp(-ts / 3.5) + 0.5) * (0.85 + 0.15 * Math.sin(t * 11.0) * Math.sin(t * 7.3)) * smoothstep(0.15, 0.8, ts);
      sh.uTipLight.value.setRGB(1.0 * tipI, 0.36 * tipI, 0.08 * tipI);
    }
    const flash = struck ? 4.2 * Math.exp(-ts / 0.14) + 1.5 * Math.exp(-ts / 0.55) + 0.1 * Math.exp(-ts / 2.0) + restrike * 2.0 : 0;
    sh.uFlash.value.setRGB(0.78 * flash, 0.84 * flash, 1.0 * flash);

    // ---- atmosphere
    sh.uFogDensity.value = lerp(0.00030, 0.0052, inCloud);
    const fog = sh.uFogColor.value.setRGB(lerp(0.013, 0.0085, inCloud), lerp(0.017, 0.0105, inCloud), lerp(0.026, 0.016, inCloud));
    const scatter = inCloud * (struck ? 0 : 0.0035 * tipI) + flash * lerp(0.004, 0.02, inCloud);
    fog.r += 0.6 * scatter; fog.g += 0.7 * scatter; fog.b += 1.0 * scatter;
    d.rain.uniforms.uAmount.value = lerp(1.0, 0.3, inCloud);
    d.rain.uniforms.uCamVel.value.copy(rig.velocity);
    d.ice.uniforms.uAmount.value = inCloud;
    d.ice.uniforms.uScale.value = this.pixelHeight * 0.7;
    d.sparks.uniforms.uScale.value = d.embers.uniforms.uScale.value = this.pixelHeight * 0.9;

    // In-cloud glows sit on the simulated charge centres. Their flicker
    // pattern is procedural.
    const glow = d.clouds.uniforms.uGlow.value;
    for (let i = 0; i < 4; i++) {
      const c = b.charges[i % b.charges.length];
      const f = Math.sin(t * (1.3 + i * 0.37) + i * 2.1) * Math.sin(t * (0.53 + i * 0.21) + i);
      let pulse = Math.pow(Math.max(0, f), 4) * 0.6 * (0.7 + 0.3 * Math.sin(t * 23 + i * 5)) * (struck ? Math.exp(-ts / 2) : 1);
      // Scripted intra-cloud flickers during the intro: a double pulse each.
      const dt = t - INTRO_FLASHES[i];
      if (dt > 0 && dt < 1.5) pulse += 9.0 * (Math.exp(-dt / 0.16) + 0.6 * Math.exp(-Math.abs(dt - 0.3) / 0.1));
      glow[i].set(c.x, c.y - 70, c.z, pulse + (struck ? 7.0 * Math.exp(-ts / 0.28) + restrike * 3 : 0));
    }

    // ---- sprites
    const g = this.glows;
    const leaderOn = state.phase === 'leader' || (state.phase === 'intro' && tipI > 0.02);
    g.corona.visible = g.halo.visible = leaderOn;
    if (leaderOn) {
      const tp = sh.uTipPos.value;
      const c = 0.5 * tipI;
      g.corona.position.copy(tp);
      g.corona.scale.setScalar(9 + 9 * burst + 2 * hash1((t * 60) | 0));
      g.corona.material.color.setRGB(0.5 * c, 0.6 * c, 1.0 * c);
      const hI = 0.012 * tipI * (0.3 + inCloud);
      g.halo.position.copy(tp);
      g.halo.scale.setScalar(lerp(60, 140, inCloud));
      g.halo.material.color.setRGB(0.45 * hI, 0.55 * hI, 1.0 * hI);
    }
    g.flare.visible = struck && ts < 2.5;
    if (g.flare.visible) {
      const f = 2.4 * Math.exp(-ts / 0.16) + 0.5 * Math.exp(-ts / 0.7) + restrike * 1.0;
      g.flare.position.set(b.strike[0], 2.5, b.strike[2]);
      g.flare.scale.setScalar(40 + 60 * Math.exp(-ts / 0.2));
      g.flare.material.color.setRGB(0.85 * f, 0.9 * f, 1.0 * f);
    }
    for (const s of g.smoke) {
      const u = s.userData, age = ts - u.delay;
      s.visible = struck && age > 0 && age < 7;
      if (!s.visible) continue;
      s.position.set(b.strike[0] + u.ox * (1 + age) + age * 1.3, 0.6 + u.rise * Math.pow(age, 0.8), b.strike[2] + u.oz * (1 + age) + age * 0.5);
      s.scale.setScalar(2.2 + 1.5 * u.grow * age);
      s.material.rotation = u.rot + age * 0.12;
      s.material.opacity = 0.17 * smoothstep(0, 0.6, age) * (1 - smoothstep(3.0, 7, age));
      // smoke is lit from below by the embers and from above by the flash
      const lit = 0.045 + 0.05 * tipI / (1 + age * 1.5) + flash * 0.05;
      s.material.color.setRGB(lit * 1.0, lit * 0.82, lit * 0.7);
    }

    // ---- controlled exposure: stop down hard for the stroke, recover slowly
    this.gl.toneMappingExposure = BASE_EXPOSURE * (struck ? 1 - 0.7 * Math.exp(-ts / 1.2) : 1) * (state.phase === 'aftermath' ? lerp(1, 1.9, smoothstep(2, 5, ts)) : 1);
    this.bloom.strength = 0.55;

    this.composer.render();
  }
}
