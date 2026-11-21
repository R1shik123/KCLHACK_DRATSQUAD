/* Signfall music: an original 8-bit arrangement of "In the Hall of the Mountain King"
 * (Edvard Grieg, 1875, public domain), written note by note for this WebAudio step sequencer.
 * Credit: "Music: In the Hall of the Mountain King, Edvard Grieg (public domain), 8-bit arrangement by Signblast".
 *
 * Channels (like a classic console): square-wave lead on the theme, triangle bass on the off-beats,
 * noise drums that build up over the loops. Tempo rises with the level, as the piece accelerates.
 *
 *   import { Music } from './music.js';
 *   Music.start(level); Music.setLevel(level); Music.pause(); Music.resume(); Music.stop();
 *   Music.setVolume(0..1); Music.setMuted(bool);   // both remembered in localStorage
 */

const PREF_KEY = 'signfall.music';
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Note names -> MIDI numbers (octave 4 = middle C).
const N = (name) => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 12 * (+m[3] + 1) + base;
};

// The theme in B minor, one step = one eighth note, '-' holds the previous note, null = rest.
// Bars: [B C# D E] [F# D F# -] [E# C# E# -] [E C E -] [B C# D E] [F# D F# B] [A F# D F#] [A - - -]
const LEAD = ['B3', 'C#4', 'D4', 'E4', 'F#4', 'D4', 'F#4', '-', 'F4', 'C#4', 'F4', '-', 'E4', 'C4', 'E4', '-',
  'B3', 'C#4', 'D4', 'E4', 'F#4', 'D4', 'F#4', 'B4', 'A4', 'F#4', 'D4', 'F#4', 'A4', '-', '-', '-'];
// Bass root per bar, played on the off-beats (steps 1 and 3 of each bar).
const BASS = ['B2', 'B2', 'C#3', 'C3', 'B2', 'B2', 'D3', 'A2'];
const STEPS = LEAD.length;
const TEMPO = (level) => Math.min(220, level <= 1 ? 120 : level === 2 ? 150 : 180 + (level - 3) * 10);

function loadPrefs() {
  try { return Object.assign({ volume: 0.5, muted: false }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); }
  catch { return { volume: 0.5, muted: false }; }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage blocked */ } }

class MusicEngine {
  constructor() {
    this.prefs = loadPrefs();
    this.ctx = null; this.master = null; this.noise = null;
    this.timer = null; this.playing = false; this.paused = false;
    this.level = 1; this.step = 0; this.loop = 0; this.nextTime = 0;
  }

  get volume() { return this.prefs.volume; }
  get muted() { return this.prefs.muted; }

  _ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this._applyGain();
    // One second of white noise for the drum channel.
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return true;
  }

  _applyGain() {
    if (!this.master) return;
    const v = this.prefs.muted ? 0 : 0.12 * this.prefs.volume; // low by default, under the sound effects
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Start from the top. Call from a user gesture (the Start button) so browsers allow audio. */
  start(level = 1) {
    if (!this._ensure()) return;
    this.ctx.resume?.();
    this.stop();
    this.level = level; this.step = 0; this.loop = 0;
    this.playing = true; this.paused = false;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  setLevel(level) { this.level = level; }

  stop() {
    clearInterval(this.timer); this.timer = null;
    this.playing = false; this.paused = false;
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    clearInterval(this.timer); this.timer = null;
    this.ctx?.suspend?.();
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    this.ctx.resume?.().then?.(() => { this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05); });
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    this.timer = setInterval(() => this._schedule(), 25);
  }

  setVolume(v) { this.prefs.volume = Math.max(0, Math.min(1, +v || 0)); savePrefs(this.prefs); this._applyGain(); }
  setMuted(b) { this.prefs.muted = !!b; savePrefs(this.prefs); this._applyGain(); }

  _schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      this._playStep(this.step, this.nextTime);
      const eighth = 30 / TEMPO(this.level); // seconds per eighth note
      this.nextTime += eighth;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.loop++;
    }
  }

  _playStep(i, t) {
    const eighth = 30 / TEMPO(this.level);
    // Odd loops restate the theme a fifth higher (in F# minor), as Grieg does.
    const shift = this.loop % 2 ? 7 : 0;
    // Lead: square wave; a note lasts until the next non-hold step.
    const n = LEAD[i];
    if (n && n !== '-') {
      let len = 1;
      while (LEAD[(i + len) % STEPS] === '-' && len < STEPS) len++;
      this._tone('square', midi(N(n) + shift), t, eighth * len * 0.9, 0.5);
    }
    // Bass: triangle on the off-beats.
    const bar = Math.floor(i / 4);
    if (i % 2 === 1) this._tone('triangle', midi(N(BASS[bar]) + shift), t, eighth * 0.8, 0.9);
    // Drums build: kick from the start, snare from loop 1 or level 2, hats from loop 2 or level 3.
    const intensity = Math.max(this.loop, this.level - 1);
    if (i % 4 === 0) this._drum(t, 'kick');
    if (intensity >= 1 && i % 4 === 2) this._drum(t, 'snare');
    if (intensity >= 2 && i % 2 === 1) this._drum(t, 'hat');
  }

  _tone(type, freq, t, dur, gain) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _drum(t, kind) {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    const cfg = { kick: ['lowpass', 180, 0.9, 0.12], snare: ['bandpass', 1800, 0.5, 0.1], hat: ['highpass', 7000, 0.25, 0.04] }[kind];
    f.type = cfg[0]; f.frequency.value = cfg[1];
    g.gain.setValueAtTime(cfg[2], t);
    g.gain.exponentialRampToValueAtTime(0.001, t + cfg[3]);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, cfg[3] + 0.02);
  }
}

export const Music = new MusicEngine();
