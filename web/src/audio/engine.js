// Procedural sound with the Web Audio API. Nothing is sampled: wind, rain,
// hiss, hum, crack, and thunder are all shaped noise and oscillators.
// The context is created on the first Play press (browsers require a user
// gesture) and everything runs through a limiter so it cannot clip.
import { TIMES } from '../timeline.js';
import { clamp, smoothstep, lerp } from '../world.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.oneShots = new Set();
    this.lastT = -1;
    this.lastEvent = -1;
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  // Must be called from a user gesture.
  async start() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }
  async suspend() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  _noiseBuffer(seconds, brown) {
    const ctx = this.ctx, n = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    // short crossfade so the loop point is inaudible
    const f = Math.floor(0.05 * ctx.sampleRate);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i] * k + d[n - f + i] * (1 - k);
    }
    return buf;
  }

  _loop(buffer, chain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopEnd = buffer.duration - 0.05;
    let node = src;
    for (const next of chain) { node.connect(next); node = next; }
    node.connect(this.bus);
    src.start();
    return src;
  }

  _build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    // bus -> limiter -> master -> output
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.bus.connect(limiter).connect(this.master).connect(ctx.destination);

    this.white = this._noiseBuffer(3.7, false);
    this.brown = this._noiseBuffer(5.3, true);
    const biquad = (type, freq, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      return f;
    };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // wind: band-passed brown noise, plus a low rumble inside the cloud
    this.windFilter = biquad('bandpass', 420, 0.5);
    this.windGain = gain();
    this._loop(this.brown, [this.windFilter, this.windGain]);
    this.rumbleGain = gain();
    this._loop(this.brown, [biquad('lowpass', 110), this.rumbleGain]);
    // rain
    this.rainGain = gain();
    this._loop(this.white, [biquad('highpass', 2600), biquad('lowpass', 9500), this.rainGain]);
    // electrical hiss
    this.hissFilter = biquad('bandpass', 6200, 1.4);
    this.hissGain = gain();
    this._loop(this.white, [this.hissFilter, this.hissGain]);
    // rising hum: two detuned saws and a sine an octave up
    this.humGain = gain();
    const humFilter = biquad('lowpass', 420, 0.8);
    humFilter.connect(this.humGain).connect(this.bus);
    this.humOsc = [];
    for (const [type, mult, detune, level] of [['sawtooth', 1, -7, 0.5], ['sawtooth', 1, 8, 0.5], ['sine', 2, 0, 0.6]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = 50 * mult; o.detune.value = detune;
      const g = gain(level);
      o.connect(g).connect(humFilter);
      o.start();
      this.humOsc.push({ o, mult });
    }
  }

  // Stops everything transient. Called on restart and seek.
  reset() {
    this.lastT = -1;
    this.lastEvent = -1;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const s of this.oneShots) {
      try { s.gain.gain.cancelScheduledValues(now); s.gain.gain.setTargetAtTime(0, now, 0.02); s.src.stop(now + 0.15); } catch { /* already stopped */ }
    }
    this.oneShots.clear();
  }

  _oneShot(buffer, duration, filters, envelope, offset = Math.random() * 2) {
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    let node = src;
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(g).connect(this.bus);
    envelope(g.gain, now);
    src.start(now, offset % (buffer.duration - 0.1));
    src.stop(now + duration);
    const shot = { src, gain: g };
    this.oneShots.add(shot);
    src.onended = () => { this.oneShots.delete(shot); g.disconnect(); };
    return shot;
  }

  _filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  _stepTick(strength) {
    const peak = 0.05 + 0.2 * strength;
    this._oneShot(this.white, 0.12, [this._filter('bandpass', 3200 + Math.random() * 2600, 2.5)], (g, now) => {
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(peak, now + 0.003);
      g.exponentialRampToValueAtTime(0.0008, now + 0.09);
    });
  }

  _crackAndThunder() {
    const ctx = this.ctx;
    // sharp crack: bright noise with a 2 ms attack
    this._oneShot(this.white, 0.6, [this._filter('highpass', 1400)], (g, now) => {
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(0.95, now + 0.002);
      g.exponentialRampToValueAtTime(0.12, now + 0.07);
      g.exponentialRampToValueAtTime(0.001, now + 0.5);
    });
    // body of the crack
    this._oneShot(this.white, 1.2, [this._filter('bandpass', 260, 0.6)], (g, now) => {
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(0.9, now + 0.006);
      g.exponentialRampToValueAtTime(0.001, now + 1.0);
    });
    // sub thump
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(), og = ctx.createGain();
    osc.frequency.setValueAtTime(82, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    og.gain.setValueAtTime(0, now);
    og.gain.linearRampToValueAtTime(0.8, now + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(og).connect(this.bus);
    osc.start(now);
    osc.stop(now + 0.8);
    const thump = { src: osc, gain: og };
    this.oneShots.add(thump);
    osc.onended = () => { this.oneShots.delete(thump); og.disconnect(); };

    // rolling thunder: low-passed brown noise, a string of swells, and a
    // feedback delay so the swells overlap
    const lp = this._filter('lowpass', 950, 0.5);
    lp.frequency.setValueAtTime(950, now);
    lp.frequency.exponentialRampToValueAtTime(85, now + 6.0);
    const delay = ctx.createDelay(1.0), fb = ctx.createGain(), mix = ctx.createGain();
    delay.delayTime.value = 0.37;
    fb.gain.value = 0.38;
    lp.connect(mix);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(mix);
    const shot = this._oneShot(this.brown, 7.4, [lp], (g, t0) => {
      const pts = [[0.0, 0], [0.04, 1.0], [0.45, 0.45], [0.85, 0.8], [1.5, 0.35], [2.2, 0.6], [3.0, 0.28], [3.7, 0.4], [4.8, 0.18], [5.6, 0.22], [7.2, 0.0001]];
      g.setValueAtTime(0, t0);
      for (const [dt, v] of pts) g.linearRampToValueAtTime(v * 0.95, t0 + dt);
    });
    // reroute: lp -> (dry + delayed) -> envelope gain
    lp.disconnect(shot.gain);
    mix.connect(shot.gain);
  }

  // Called every frame while playing. Continuous layers follow the timeline
  // state; one-shots fire when their moment is crossed.
  update(t, state, rig, timeline) {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const set = (param, v, tau = 0.08) => param.setTargetAtTime(v, now, tau);
    const ts = state.strokeT;
    const struck = ts >= 0;
    const inCloud = rig.inCloud;
    const speed = Math.min(1, rig.velocity.length() / 70);
    const lp = state.leaderProgress;
    const fadeIn = smoothstep(0, 1.2, t), fadeOut = 1 - smoothstep(TIMES.total - 1.6, TIMES.total, t);
    const duck = struck ? 1 - 0.75 * Math.exp(-ts / 0.6) : 1;
    const env = fadeIn * fadeOut;

    set(this.windGain.gain, env * duck * lerp(0.22, 0.12, inCloud) * (0.6 + 0.9 * speed) * (0.85 + 0.15 * Math.sin(t * 0.7)), 0.15);
    set(this.windFilter.frequency, lerp(520, 260, inCloud) + 380 * speed, 0.2);
    set(this.rumbleGain.gain, env * duck * lerp(0.1, 0.5, inCloud), 0.3);
    set(this.rainGain.gain, env * duck * lerp(0.085, 0.02, inCloud) * (struck ? 1.25 : 1), 0.2);

    const leaderOn = state.phase === 'leader';
    const pre = state.phase === 'intro' ? smoothstep(TIMES.leaderStart - 2.5, TIMES.leaderStart, t) * 0.25 : 0;
    const burst = Math.exp(-state.sinceBurst / 0.06);
    set(this.hissGain.gain, env * (leaderOn ? 0.018 + 0.05 * lp + 0.05 * burst : pre * 0.03), 0.03);
    set(this.hissFilter.frequency, 5200 + 2600 * lp, 0.1);
    // hum rises in pitch and level as the tip nears the ground, then cuts
    const humLevel = leaderOn ? 0.05 + 0.22 * Math.pow(lp, 1.6) : pre * 0.1;
    set(this.humGain.gain, env * humLevel * (0.9 + 0.1 * Math.sin(t * 17)), struck ? 0.02 : 0.12);
    const f0 = 48 + 74 * Math.pow(lp, 1.4);
    for (const h of this.humOsc) set(h.o.frequency, f0 * h.mult, 0.15);

    // one-shots
    if (this.lastT >= 0 && t > this.lastT) {
      if (leaderOn && state.eventIndex > this.lastEvent && state.eventIndex >= 0) {
        const e = timeline.events[state.eventIndex];
        this._stepTick(clamp(0.25 + 0.25 * e.advance, 0, 1));
      }
      if (this.lastT < TIMES.attach && t >= TIMES.attach) this._crackAndThunder();
    }
    this.lastEvent = state.eventIndex;
    this.lastT = t;
  }
}
