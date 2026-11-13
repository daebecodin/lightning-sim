// One continuous camera move from inside the cloud to the scorched prairie.
// The rig chases targets with critically damped smoothing: the lightning
// itself jumps in discrete steps, the camera eases after it, so orientation
// stays smooth without hiding the stepped growth.
import * as THREE from 'three';
import { TIMES } from '../timeline.js';
import { clamp, smoothstep, lerp, hash1 } from '../world.js';

const tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.posLag = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.lookLag = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.inCloud = 1;
    this.time = -1;
    this.bolt = null;
  }

  setBolt(bolt, timeline, heightAt) {
    this.bolt = bolt;
    this.timeline = timeline;
    this.heightAt = heightAt;
    // Side from which the camera watches: seeded, facing the domain centre so
    // most branches stay in frame.
    const a = hash1(bolt.seed * 13 + 5) * Math.PI * 2;
    this.baseAngle = a;
    this.time = -1;
  }

  // Desired camera position and look-at point at cinematic time t.
  _targets(t, state, outPos, outLook) {
    const b = this.bolt;
    const root = b.root, strike = b.strike;
    const k = Math.min(state.tipIndex, b.mainCount - 1);
    const tx = b.mainPos[3 * k], ty = b.mainPos[3 * k + 1], tz = b.mainPos[3 * k + 2];
    const angle = this.baseAngle + t * 0.045;
    const sx = Math.cos(angle), sz = Math.sin(angle);

    if (t < TIMES.leaderStart) {
      // Intro: drift toward the initiation point inside the cloud.
      const u = t / TIMES.leaderStart;
      const d = lerp(150, 62, u * u * (3 - 2 * u));
      outPos.set(root[0] + sx * d, root[1] + lerp(34, 16, u), root[2] + sz * d);
      outLook.set(root[0], root[1] - 6, root[2]);
    } else if (t < TIMES.attach) {
      // Leader: ride slightly behind (above) and beside the tip, looking past
      // it toward where it is heading.
      const altitude = ty;
      const near = smoothstep(260, 40, altitude);   // approaching the ground
      const side = lerp(40, 58, near), up = lerp(27, 13, near);
      outPos.set(tx + sx * side, ty + up, tz + sz * side);
      outLook.set(tx, ty - lerp(24, 6, near), tz);
    } else {
      const ts = t - TIMES.attach;
      // Return stroke: pull back and tilt up the channel, then settle low on
      // the scorch mark for the aftermath.
      const settle = smoothstep(0.9, 2.7, ts);
      const d = lerp(lerp(58, 82, smoothstep(0, 1.2, ts)), 15, settle);
      const h = lerp(lerp(13, 9, smoothstep(0, 1.2, ts)), 7.5, settle);
      const lookUp = lerp(lerp(8, 95, smoothstep(0.05, 0.9, ts)), 0.2, settle);
      outPos.set(strike[0] + sx * d, h, strike[2] + sz * d);
      outLook.set(strike[0], lookUp, strike[2]);
    }
    const floor = this.heightAt(outPos.x, outPos.z) + 2.6;
    if (outPos.y < floor) outPos.y = floor;
  }

  _snap(t, state) {
    this._targets(t, state, this.pos, this.look);
    this.posLag.copy(this.pos);
    this.lookLag.copy(this.look);
    this.velocity.set(0, 0, 0);
  }

  // Advances to time t. Large or backward jumps (restart, seek) re-settle the
  // springs by replaying the last few seconds in small steps.
  update(t, stateAt) {
    if (!this.bolt) return;
    const dt = t - this.time;
    if (this.time < 0 || dt < 0 || dt > 0.25) {
      const from = Math.max(0, t - 4);
      this._snap(from, stateAt(from));
      for (let s = from + 1 / 60; s < t; s += 1 / 60) this._advance(s, 1 / 60, stateAt(s));
      this._advance(t, 1 / 60, stateAt(t));
    } else if (dt > 0) {
      this._advance(t, dt, stateAt(t));
    }
    this.time = t;
    this._apply(t);
  }

  _advance(t, dt, state) {
    const p = tmp;
    const look = new THREE.Vector3();
    this._targets(t, state, p, look);
    // Slower, heavier camera during the aftermath hold.
    const ts = t - TIMES.attach;
    const tauPos = ts > 0 ? lerp(0.45, 1.1, smoothstep(0.5, 3, ts)) : (t < TIMES.leaderStart ? 0.9 : 0.42);
    const tauLook = ts > 0 ? lerp(0.3, 0.6, smoothstep(0.5, 3, ts)) : 0.3;
    const prevX = this.pos.x, prevY = this.pos.y, prevZ = this.pos.z;
    // two cascaded one-pole filters = smooth start and stop
    const a1 = 1 - Math.exp(-dt / (tauPos * 0.5)), a2 = 1 - Math.exp(-dt / (tauLook * 0.5));
    this.posLag.lerp(p, a1);
    this.pos.lerp(this.posLag, a1);
    this.lookLag.lerp(look, a2);
    this.look.lerp(this.lookLag, a2);
    if (dt > 0) this.velocity.set((this.pos.x - prevX) / dt, (this.pos.y - prevY) / dt, (this.pos.z - prevZ) / dt);
  }

  _apply(t) {
    const cam = this.camera;
    cam.position.copy(this.pos);
    // A little handheld drift, plus a short shake when the stroke lands.
    const ts = t - TIMES.attach;
    const shake = ts > 0 ? 0.9 * Math.exp(-ts / 0.35) : 0;
    const n = (f, o) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7) * 0.4;
    cam.position.x += n(0.7, 1.0) * 0.25 + n(31, 0.3) * shake;
    cam.position.y += n(0.9, 2.0) * 0.2 + n(37, 1.1) * shake;
    cam.position.z += n(0.6, 4.0) * 0.25 + n(29, 2.2) * shake;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.rotateZ(n(0.35, 5.0) * 0.012);
    this.inCloud = smoothstep(this.bolt.cloudBaseY - 70, this.bolt.cloudBaseY + 30, cam.position.y);
    cam.updateMatrixWorld();
  }
}
