/* Signblast: the original falling-letters arcade shooter, ported from app/game.js (docs/PRODUCT.md → "Signblast").
 * Letters fall in lanes; hold the sign to shoot the lowest matching one. Chunked letter levels, then words (CAB first),
 * Leitner-weighted spawning, adaptive speed, hints that fade as a letter's box rises, combo multiplier, 3 lives.
 * The canvas keeps the original pixel-arcade look on purpose (the human asked for the original game back). */

export const BLAST_LEVELS = [
  { letters: [..."ABCDILVY"] },
  { letters: [..."FUWKRXO"] },
  { letters: [..."ESTMNGHPQJZ"] },
  { letters: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"], speed: 8 },
  { words: ["CAB", "HI", "NO", "YES", "BYE", "CAT", "DOG", "SUN", "FUN", "WOW", "LOVE", "HELP", "COOL", "NAME", "KIND", "PLAY", "SIGN"] },
];
export const BLAST_FIRST_WORD = "CAB"; // first word of the Words level, always (three reliable letters)
const POOLS = BLAST_LEVELS.map((l, i) => l.words || [...new Set(BLAST_LEVELS.slice(0, i + 1).flatMap((x) => x.letters))]);
const BOX_WEIGHT = [0, 3, 2, 1.4, 1, 1];        // Leitner box 1..5 → spawn weight
const HINT_ALPHA = [0, 1, 0.75, 0.45, 0.2, 0];  // hint strength by box (scaffolding fades)
const W = 240, H = 300;                          // logical pixels, scaled up crisp
const HITS_PER_LEVEL = 8;
const FONT = '"Press Start 2P", monospace';
const PAL = { bg: "#0b0a1f", grid: "#1b1940", block: ["#ff5ca8", "#5cc8ff", "#ffd23f", "#7cf3a0", "#c3a6ff"], cannon: "#7cf3a0", laser: "#ff5ca8" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export class Blast {
  /** box(L)/setBox(L,n): the shared Leitner boxes. hint(L): short handshape text. T: copy.json → blast. */
  constructor(canvas, { box, setBox, hint, T, onHud, onEnd, sound }) {
    Object.assign(this, { c: canvas, g: canvas.getContext("2d"), box, setBox, hint, T, onHud, onEnd, sound });
    canvas.width = W; canvas.height = H;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.state = "idle";
    this._tick = this._tick.bind(this);
    this.background(); this.cannonX = W / 2; this.cannon();
  }

  start(level = 1) {
    Object.assign(this, {
      state: "play", score: 0, level, lives: 3, combo: 0, best: 0, levelHits: 0, firstWordDone: false,
      speed: 14 + (level - 1) * 3 + (BLAST_LEVELS[level - 1].speed || 0), enemies: [], shots: [], particles: [], flash: null, spawnIn: 0.6,
      recent: [], stats: {}, reactions: [], hits: 0, escapes: 0, last: performance.now(), cannonX: W / 2, cannonTo: W / 2,
      message: { text: this.levelText(level), t: 2 },
    });
    this.hud();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() { cancelAnimationFrame(this.raf); this.state = "idle"; }
  pause() {
    if (this.state !== "play") return false;
    this.state = "paused"; this.pausedAt = performance.now();
    cancelAnimationFrame(this.raf);
    return true;
  }
  resume() {
    if (this.state !== "paused") return;
    const gap = performance.now() - this.pausedAt;
    for (const e of this.enemies) e.born += gap; // reaction times exclude paused time
    this.state = "play"; this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  levelText(n) { return fill(this.T.levelUp, { level: n, name: this.T.levels[n - 1] }).toUpperCase(); }
  get letters() { return POOLS[this.level - 1]; }
  get wordLevel() { return !!BLAST_LEVELS[this.level - 1].words; }
  stat(L) { return (this.stats[L] ||= { hits: 0, misses: 0 }); }

  pickLetter() {
    if (this.wordLevel && !this.firstWordDone) { this.firstWordDone = true; return BLAST_FIRST_WORD; }
    const onScreen = new Set(this.enemies.map((e) => e.word || e.letter));
    const pool = this.letters.filter((L) => !onScreen.has(L));
    const list = pool.length ? pool : this.letters;
    const wt = (w) => Math.max(...[...w].map((L) => BOX_WEIGHT[this.box(L)])); // a word weighs as its weakest letter
    let r = Math.random() * list.reduce((s, L) => s + wt(L), 0);
    for (const L of list) { r -= wt(L); if (r <= 0) return L; }
    return list[list.length - 1];
  }

  spawn() {
    const L = this.pickLetter(), lanes = 5, lw = (W - 20) / lanes;
    const used = new Set(this.enemies.filter((e) => e.y < 60).map((e) => e.lane));
    const free = [...Array(lanes).keys()].filter((i) => !used.has(i));
    const lane = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * lanes);
    this.enemies.push({ word: L.length > 1 ? L : null, idx: 0, letter: L[0], lane, x: 10 + lw * lane + lw / 2, y: -20,
      born: performance.now(), wob: Math.random() * 6, color: PAL.block[Math.floor(Math.random() * PAL.block.length)] });
  }

  /** A sign was held (or a key typed). Shoot the lowest matching letter, if any. */
  sign(letter) {
    if (this.state !== "play") return;
    const t = this.enemies.filter((e) => e.letter === letter && !e.dead).sort((a, b) => b.y - a.y)[0];
    if (!t) { this.message = { text: fill(this.T.notOnScreen, { letter }).toUpperCase(), t: 0.9 }; this.sound?.("nope"); return; }
    const reaction = performance.now() - t.born;
    this.reactions.push(reaction);
    this.stat(letter).hits++;
    this.setBox(letter, this.box(letter) + 1);
    this.cannonTo = t.x;
    if (t.word && t.idx < t.word.length - 1) { // fingerspelling a word: move on to its next letter
      t.idx++; t.letter = t.word[t.idx]; t.born = performance.now();
      this.score += 25; this.shots.push({ x: t.x, y: t.y, t: 0.1 });
      this.sound?.("hit"); this.hud();
      return;
    }
    t.dead = true;
    this.shots.push({ x: t.x, y: t.y, t: 0.18 });
    this.combo++; this.best = Math.max(this.best, this.combo);
    this.score += 100 * this.mult;
    this.hits++; this.levelHits++;
    this.outcome(true);
    this.burst(t.x, t.y, t.color);
    this.sound?.("hit");
    if (this.levelHits >= HITS_PER_LEVEL && this.level < BLAST_LEVELS.length) {
      this.level++; this.levelHits = 0;
      this.speed += 3 + (BLAST_LEVELS[this.level - 1].speed || 0);
      this.message = { text: this.levelText(this.level), t: 2.2 };
      this.sound?.("level");
    }
    this.hud();
  }

  get mult() { return Math.min(5, 1 + Math.floor(this.combo / 3)); }

  /** Adaptive speed: every 5 outcomes, >80% hits speeds up 10%, <60% slows down 10% (clamped 8–45). */
  outcome(hit) {
    this.recent.push(hit);
    if (this.recent.length > 10) this.recent.shift();
    if (this.recent.length % 5 === 0) {
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
    this.setBox(e.letter, 1);
    this.combo = 0; this.lives--;
    this.outcome(false);
    this.flash = 0.25;
    this.sound?.("miss");
    this.message = { text: fill(this.T.missed, { letter: e.letter }).toUpperCase(), t: 1 };
    if (this.lives <= 0) this.end();
    this.hud();
  }

  end() {
    if (this.state !== "play" && this.state !== "paused") return;
    this.state = "over";
    cancelAnimationFrame(this.raf);
    this.draw();
    const attempts = this.hits + this.escapes;
    const toPractise = Object.entries(this.stats).filter(([, s]) => s.misses > 0).sort((a, b) => b[1].misses - a[1].misses).map(([L]) => L);
    this.sound?.("over");
    this.onEnd?.({
      score: this.score, level: this.level, hits: this.hits, escapes: this.escapes, bestCombo: this.best, toPractise,
      accuracy: attempts ? this.hits / attempts : null,
      avgMs: this.reactions.length ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length : null,
    });
  }

  hud() { this.onHud?.({ score: this.score, level: this.level, lives: this.lives, combo: this.combo, mult: this.mult }); }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state !== "play") return;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.enemies.length < 2 + this.level) {
      this.spawn();
      this.spawnIn = clamp(110 / this.speed, 1.4, 6) * (this.wordLevel ? 1.6 : 1);
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.y += this.speed * (e.word ? 0.75 : 1) * dt;
      if (e.y > H - 46) this.escape(e);
      if (this.state !== "play") return;
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

  // ---------- drawing (original pixel look) ----------
  text(str, x, y, size, color, align = "center", alpha = 1) {
    const g = this.g;
    g.globalAlpha = alpha;
    g.font = `${size}px ${FONT}`;
    g.textAlign = align; g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(str, Math.round(x), Math.round(y));
    g.globalAlpha = 1;
  }

  background() {
    const g = this.g;
    g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.grid;
    for (let y = 0; y < H; y += 20) g.fillRect(0, y, W, 1);
    g.fillStyle = "#2a2660"; g.fillRect(0, H - 22, W, 2);
    g.fillStyle = "#ff5ca8"; g.globalAlpha = 0.25; g.fillRect(0, H - 46, W, 1); g.globalAlpha = 1;
  }

  block(e) {
    const g = this.g, s = 22, y = Math.round(e.y - s / 2);
    const bw = e.word ? 10 * e.word.length + 8 : s, x = Math.round(e.x - bw / 2);
    if (e.word) {
      g.fillStyle = e.color; g.fillRect(x, y, bw, s);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x, y, bw, 3);
      [...e.word].forEach((ch, i) => this.text(ch, x + 9 + i * 10, e.y + 1, 9, PAL.bg, "center", i < e.idx ? 0.3 : 1));
      g.fillStyle = PAL.bg; g.fillRect(x + 5 + e.idx * 10, y + s - 4, 8, 2);
    } else {
      g.fillStyle = e.color; g.fillRect(x, y, s, s);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x, y, s, 3); g.fillRect(x, y, 3, s);
      g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x, y + s - 3, s, 3); g.fillRect(x + s - 3, y, 3, s);
      const leg = Math.floor(performance.now() / 300 + e.wob) % 2; // little walking legs (original design)
      g.fillStyle = e.color;
      g.fillRect(x + 3 + leg * 2, y + s, 3, 3); g.fillRect(x + s - 6 - leg * 2, y + s, 3, 3);
      this.text(e.letter, e.x + 1, e.y + 1, 12, PAL.bg);
    }
    // Scaffolding: a hint once the letter is past 60% of the way down, fading as its Leitner box rises.
    const alpha = HINT_ALPHA[this.box(e.letter)];
    const hint = this.hint(e.letter);
    if (alpha > 0 && hint && e.y > (H - 46) * 0.6) {
      g.font = `5px ${FONT}`;
      const hw = Math.min(W - 4, g.measureText(hint).width + 8), hx = clamp(e.x, hw / 2 + 2, W - hw / 2 - 2);
      g.globalAlpha = alpha * 0.85; g.fillStyle = "#000"; g.fillRect(hx - hw / 2, y - 14, hw, 10); g.globalAlpha = 1;
      this.text(hint, hx, y - 9, 5, "#ffd23f", "center", alpha);
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
      g.fillStyle = "#fff"; g.fillRect(Math.round(s.x), s.y, 1, H - 40 - s.y);
      g.globalAlpha = 1;
    }
    for (const e of this.enemies) this.block(e);
    for (const p of this.particles) { g.fillStyle = p.color; g.globalAlpha = p.t * 2; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    g.globalAlpha = 1;
    this.cannon();
    if (this.message) this.text(this.message.text, W / 2, H / 2 - 20, 7, "#ffd23f", "center", Math.min(1, this.message.t * 2));
    if (this.flash) { g.fillStyle = "rgba(255,60,90,.25)"; g.fillRect(0, 0, W, H); }
  }
}
