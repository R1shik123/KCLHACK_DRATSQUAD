/* Signfall game: a fixed-shooter arcade loop driven by ASL signs.
 * Learning loop: chunked letter introduction, Leitner-box weighted spawning, adaptive speed,
 * fading handshape hints, combo multiplier, 3 lives. */

export const LEVEL_LETTERS = [['A', 'B', 'L'], ['A', 'B', 'L', 'V', 'Y'], ['A', 'B', 'L', 'V', 'Y', 'I', 'C', 'D']];
export const HINTS = {
  A: 'FIST, THUMB AT SIDE', B: 'FLAT HAND, THUMB IN', C: 'CURVE INTO A C', D: 'INDEX UP, O BELOW',
  I: 'FIST, PINKY UP', L: 'THUMB + INDEX = L', V: 'TWO FINGERS, SPREAD', Y: 'THUMB + PINKY OUT',
};
const BOX_WEIGHT = [0, 3, 2, 1.4, 1, 1];      // Leitner box 1..5
const HINT_ALPHA = [0, 1, 0.75, 0.45, 0.2, 0];  // hint strength by box (scaffolding fades)
const W = 240, H = 300;                       // logical pixel resolution, scaled up crisp
const HITS_PER_LEVEL = 8;
const PAL = { bg: '#0b0a1f', grid: '#1b1940', block: ['#ff5ca8', '#5cc8ff', '#ffd23f', '#7cf3a0', '#c3a6ff'], cannon: '#7cf3a0', laser: '#ff5ca8', text: '#ffffff' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(canvas, { boxes, onEnd, onHud, sound }) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.boxes = boxes;          // shared {letter: box 1..5}, persisted by app.js
    this.onEnd = onEnd; this.onHud = onHud; this.sound = sound;
    this.c.width = W; this.c.height = H;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.state = 'idle';
    this._tick = this._tick.bind(this);
    this.drawIdle();
  }

  start() {
    Object.assign(this, {
      state: 'play', score: 0, level: 1, lives: 3, combo: 0, best: 0, levelHits: 0,
      speed: 14, enemies: [], shots: [], particles: [], flash: null, spawnIn: 0.6,
      recent: [], stats: {}, reactions: [], hits: 0, escapes: 0, last: performance.now(), cannonX: W / 2, cannonTo: W / 2,
      message: { text: 'LEVEL 1', t: 1.6 },
    });
    this.hud();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() { cancelAnimationFrame(this.raf); this.state = 'idle'; }

  pause() {
    if (this.state !== 'play') return false;
    this.state = 'paused'; this.pausedAt = performance.now();
    cancelAnimationFrame(this.raf);
    return true;
  }

  resume() {
    if (this.state !== 'paused') return;
    const gap = performance.now() - this.pausedAt;
    for (const e of this.enemies) e.born += gap; // reaction times exclude paused time
    this.state = 'play'; this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  get letters() { return LEVEL_LETTERS[this.level - 1]; }
  box(L) { return this.boxes[L] || 1; }
  stat(L) { return (this.stats[L] ||= { hits: 0, misses: 0, times: [] }); }

  pickLetter() {
    const onScreen = new Set(this.enemies.map((e) => e.letter));
    const pool = this.letters.filter((L) => !onScreen.has(L));
    const list = pool.length ? pool : this.letters;
    const total = list.reduce((s, L) => s + BOX_WEIGHT[this.box(L)], 0);
    let r = Math.random() * total;
    for (const L of list) { r -= BOX_WEIGHT[this.box(L)]; if (r <= 0) return L; }
    return list[list.length - 1];
  }

  spawn() {
    const L = this.pickLetter();
    const lanes = 5, lw = (W - 20) / lanes;
    const used = new Set(this.enemies.filter((e) => e.y < 60).map((e) => e.lane));
    const free = [...Array(lanes).keys()].filter((i) => !used.has(i));
    const lane = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * lanes);
    this.enemies.push({ letter: L, lane, x: 10 + lw * lane + lw / 2, y: -20, born: performance.now(), wob: Math.random() * 6, color: PAL.block[Math.floor(Math.random() * PAL.block.length)] });
  }

  /** A sign was held. Shoot the lowest matching letter, if any. */
  sign(letter) {
    if (this.state !== 'play') return;
    const targets = this.enemies.filter((e) => e.letter === letter && !e.dead).sort((a, b) => b.y - a.y);
    const t = targets[0];
    if (!t) { this.message = { text: `NO ${letter} ON SCREEN`, t: 0.9 }; this.sound?.('nope'); return; }
    t.dead = true;
    this.cannonTo = t.x;
    this.shots.push({ x: t.x, y: t.y, t: 0.18 });
    const reaction = performance.now() - t.born;
    this.reactions.push(reaction);
    this.combo++; this.best = Math.max(this.best, this.combo);
    const mult = Math.min(5, 1 + Math.floor(this.combo / 3));
    this.score += 100 * mult;
    this.hits++; this.levelHits++;
    this.stat(letter).hits++;
    this.stat(letter).times.push(reaction);
    this.boxes[letter] = Math.min(5, this.box(letter) + 1);
    this.outcome(true);
    this.burst(t.x, t.y, t.color);
    this.sound?.('hit');
    if (this.levelHits >= HITS_PER_LEVEL && this.level < 3) {
      this.level++; this.levelHits = 0;
      const added = LEVEL_LETTERS[this.level - 1].filter((L) => !LEVEL_LETTERS[this.level - 2].includes(L));
      this.message = { text: `LEVEL ${this.level}  NEW: ${added.join(' ')}`, t: 2.2 };
      this.sound?.('level');
    }
    this.hud();
  }

  outcome(hit) {
    this.recent.push(hit);
    if (this.recent.length > 10) this.recent.shift();
    if (this.recent.length >= 5 && this.recent.length % 5 === 0 || this.recent.length === 10) {
      const acc = this.recent.filter(Boolean).length / this.recent.length;
      if (acc > 0.8) this.speed = clamp(this.speed * 1.1, 8, 45);
      else if (acc < 0.6) this.speed = clamp(this.speed * 0.9, 8, 45);
      if (this.recent.length === 10) this.recent.splice(0, 5);
    }
  }

  burst(x, y, color) {
    if (this.reduced) return;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.5, color });
    }
  }

  escape(e) {
    e.dead = true;
    this.escapes++;
    this.stat(e.letter).misses++;
    this.boxes[e.letter] = 1;
    this.combo = 0;
    this.lives--;
    this.outcome(false);
    this.flash = 0.25;
    this.sound?.('miss');
    this.message = { text: `MISSED ${e.letter}`, t: 1 };
    if (this.lives <= 0) this.end();
    this.hud();
  }

  end(early = false) {
    if (this.state !== 'play' && this.state !== 'paused') return;
    this.state = 'over';
    cancelAnimationFrame(this.raf);
    this.draw();
    const attempts = this.hits + this.escapes;
    const toPractise = Object.entries(this.stats).filter(([, s]) => s.misses > 0)
      .sort((a, b) => b[1].misses - a[1].misses).map(([L]) => L);
    this.sound?.('over');
    this.onEnd?.({
      score: this.score, level: this.level, hits: this.hits, escapes: this.escapes,
      accuracy: attempts ? this.hits / attempts : null,
      avgReaction: this.reactions.length ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length : null,
      reactions: this.reactions.slice(), stats: this.stats, bestCombo: this.best, toPractise, early,
    });
  }

  hud() {
    this.onHud?.({ score: this.score, level: this.level, lives: this.lives, combo: this.combo,
      mult: Math.min(5, 1 + Math.floor(this.combo / 3)), letters: this.letters, speed: this.speed });
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state !== 'play') return;
    const maxOnScreen = 2 + this.level;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.enemies.length < maxOnScreen) {
      this.spawn();
      this.spawnIn = clamp(110 / this.speed, 1.4, 6);
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.y += this.speed * dt;
      if (e.y > H - 46) this.escape(e);
      if (this.state !== 'play') return;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.cannonX += (this.cannonTo - this.cannonX) * Math.min(1, dt * 14);
    for (const s of this.shots) s.t -= dt;
    this.shots = this.shots.filter((s) => s.t > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; p.t -= dt; }
    this.particles = this.particles.filter((p) => p.t > 0);
    if (this.message) { this.message.t -= dt; if (this.message.t <= 0) this.message = null; }
    if (this.flash) { this.flash -= dt; if (this.flash <= 0) this.flash = null; }
    this.draw();
    this.raf = requestAnimationFrame(this._tick);
  }

  // ---------- drawing ----------
  text(str, x, y, size, color, align = 'center', alpha = 1) {
    const g = this.g;
    g.globalAlpha = alpha;
    g.font = `${size}px "Press Start 2P", monospace`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(str, Math.round(x), Math.round(y));
    g.globalAlpha = 1;
  }

  background() {
    const g = this.g;
    g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.grid;
    for (let y = 0; y < H; y += 20) g.fillRect(0, y, W, 1);
    // ground
    g.fillStyle = '#2a2660'; g.fillRect(0, H - 22, W, 2);
    g.fillStyle = '#ff5ca8'; g.globalAlpha = 0.25; g.fillRect(0, H - 46, W, 1); g.globalAlpha = 1;
  }

  block(e) {
    const g = this.g, s = 22, x = Math.round(e.x - s / 2), y = Math.round(e.y - s / 2);
    g.fillStyle = e.color; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, s, 3); g.fillRect(x, y, 3, s);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, y + s - 3, s, 3); g.fillRect(x + s - 3, y, 3, s);
    // little legs so it reads as an arcade invader-style block (original design)
    const leg = Math.floor(performance.now() / 300 + e.wob) % 2;
    g.fillStyle = e.color;
    g.fillRect(x + 3 + leg * 2, y + s, 3, 3); g.fillRect(x + s - 6 - leg * 2, y + s, 3, 3);
    this.text(e.letter, e.x + 1, e.y + 1, 12, PAL.bg);
    // Scaffolding: hint once the letter is past 60% of the way down, fading as its Leitner box rises.
    const alpha = HINT_ALPHA[this.box(e.letter)];
    if (alpha > 0 && e.y > (H - 46) * 0.6) {
      const hx = clamp(e.x, 46, W - 46);
      g.globalAlpha = alpha * 0.85; g.fillStyle = '#000'; g.fillRect(hx - 46, y - 14, 92, 10); g.globalAlpha = 1;
      this.text(HINTS[e.letter], hx, y - 9, 5, '#ffd23f', 'center', alpha);
    }
  }

  cannon() {
    const g = this.g, x = Math.round(this.cannonX), y = H - 34;
    g.fillStyle = PAL.cannon;
    g.fillRect(x - 12, y + 6, 24, 6);
    g.fillRect(x - 8, y + 2, 16, 4);
    g.fillRect(x - 2, y - 4, 4, 6);
  }

  draw() {
    const g = this.g;
    this.background();
    for (const s of this.shots) {
      g.fillStyle = PAL.laser; g.globalAlpha = Math.min(1, s.t * 8);
      g.fillRect(Math.round(s.x) - 1, s.y, 3, H - 40 - s.y);
      g.fillStyle = '#fff'; g.fillRect(Math.round(s.x), s.y, 1, H - 40 - s.y);
      g.globalAlpha = 1;
    }
    for (const e of this.enemies) this.block(e);
    for (const p of this.particles) { g.fillStyle = p.color; g.globalAlpha = p.t * 2; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    g.globalAlpha = 1;
    this.cannon();
    if (this.message) this.text(this.message.text, W / 2, H / 2 - 20, 7, '#ffd23f', 'center', Math.min(1, this.message.t * 2));
    if (this.flash) { g.fillStyle = 'rgba(255,60,90,.25)'; g.fillRect(0, 0, W, H); }
  }

  drawIdle() {
    this.background(); // title text lives in the HTML overlay above the canvas
    this.cannonX = W / 2; this.cannon();
  }
}
