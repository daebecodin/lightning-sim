// The interface: start overlay, playback bar, seed and quality controls.
// It only talks to the app through the callbacks passed in.
const $ = (id) => document.getElementById(id);

const PHASE_LABEL = { intro: 'inside the cloud', leader: 'leader descending', stroke: 'return stroke', aftermath: 'aftermath' };

export class Controls {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      veil: $('veil'), prep: $('prep'), prepFill: $('prep-fill'), prepLabel: $('prep-label'),
      start: $('start'), startLabel: $('start-label'), error: $('error'),
      hud: $('hud'), play: $('play'), iconPlay: $('icon-play'), iconPause: $('icon-pause'),
      restart: $('restart'), clock: $('clock'), phase: $('phase'), seed: $('seed'), reseed: $('reseed'),
      quality: $('quality'), mute: $('mute'), iconSound: $('icon-sound'), iconMuted: $('icon-muted'),
      scrubFill: $('scrub-fill'), scrubMark: $('scrub-mark'), stats: $('simstats'),
    };
    const e = this.el;
    e.start.addEventListener('click', () => this.h.start());
    e.play.addEventListener('click', () => this.h.togglePlay());
    e.restart.addEventListener('click', () => this.h.restart());
    e.reseed.addEventListener('click', () => this.h.setSeed((Math.random() * 4294967296) >>> 0));
    e.seed.addEventListener('change', () => {
      const v = Number(e.seed.value);
      if (Number.isFinite(v)) this.h.setSeed(Math.min(4294967295, Math.max(0, Math.floor(v))) >>> 0);
    });
    e.seed.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') e.seed.blur(); ev.stopPropagation(); });
    e.quality.addEventListener('change', () => this.h.setQuality(e.quality.value));
    e.mute.addEventListener('click', () => this.h.toggleMute());
    window.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      if (ev.code === 'Space') { ev.preventDefault(); this.h.togglePlay(); }
      else if (ev.key === 'r' || ev.key === 'R') this.h.restart();
      else if (ev.key === 'm' || ev.key === 'M') this.h.toggleMute();
    });

    // The bar fades away during playback and returns on any pointer activity.
    this.idleTimer = 0;
    this.playing = false;
    const wake = () => this._wake();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
  }

  _wake() {
    this.el.hud.classList.remove('idle');
    clearTimeout(this.idleTimer);
    if (this.playing) this.idleTimer = setTimeout(() => this.el.hud.classList.add('idle'), 2600);
  }

  setSeed(seed) { this.el.seed.value = String(seed); }
  setQuality(q) { this.el.quality.value = q; }
  setMuted(m) {
    this.el.iconSound.hidden = m;
    this.el.iconMuted.hidden = !m;
    this.el.mute.setAttribute('aria-pressed', String(m));
    this.el.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  }

  showPreparing(started) {
    const e = this.el;
    e.error.hidden = true;
    e.prep.hidden = false;
    e.start.hidden = true;
    e.prepFill.style.width = '0%';
    e.prepLabel.textContent = 'Starting the simulation';
    // After the first Play the overlay stays out of the way; progress shows
    // in the bar label instead.
    if (!started) e.veil.classList.remove('gone');
    e.phase.textContent = 'preparing';
  }
  setProgress(phase, p) {
    const e = this.el;
    e.prepFill.style.width = `${Math.round(p * 100)}%`;
    const label = phase === 'field' ? 'Solving the electric potential field' : 'Growing the leader toward the ground';
    e.prepLabel.textContent = `${label}  ${Math.round(p * 100)}%`;
    e.phase.textContent = `preparing ${Math.round(p * 100)}%`;
  }
  showReady(label = 'Play') {
    const e = this.el;
    e.prep.hidden = true;
    e.start.hidden = false;
    e.startLabel.textContent = label;
    e.phase.textContent = 'ready';
  }
  hideVeil() { this.el.veil.classList.add('gone'); }
  showError(message) {
    const e = this.el;
    e.veil.classList.remove('gone');
    e.prep.hidden = true;
    e.error.hidden = false;
    e.error.textContent = message;
  }

  setPlaying(playing) {
    this.playing = playing;
    this.el.iconPlay.hidden = playing;
    this.el.iconPause.hidden = !playing;
    this.el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this._wake();
  }
  setTime(t, total, phase, attach) {
    const e = this.el;
    e.clock.textContent = `${t.toFixed(1)} / ${total.toFixed(1)}`;
    e.phase.textContent = t >= total ? 'end' : PHASE_LABEL[phase] || '';
    e.scrubFill.style.width = `${(100 * t) / total}%`;
    e.scrubMark.style.left = `${(100 * attach) / total}%`;
  }
  setStats(text) { this.el.stats.textContent = text; }
}
