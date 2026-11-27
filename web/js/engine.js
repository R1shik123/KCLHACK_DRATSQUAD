// Game rules from docs/PRODUCT.md ("Game rules"). No DOM in here, so it's easy to port to the app.
import { store } from "./store.js";

export const SPRINT_SECONDS = 60;
export const HINT_AFTER_MS = 4000;
const LETTER_POINTS = 10, FAST_BONUS = 5, FAST_MS = 1500, WORD_BONUS = 20, MAX_MULT = 3;
const BOX_WEIGHT = [0, 3, 2, 1.4, 1, 1]; // Leitner box 1..5: weak letters come back more often
const BETA_WEIGHT = 0.4;                 // letters the recogniser isn't reliable on yet appear less

// ---- Daily words: FNV-1a + mulberry32, exactly as described in design/words.json ----
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function dailyWords(words, dateKey, count = 5) {
  const rng = mulberry32(fnv1a(dateKey));
  const a = words.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, count);
}

export class Game {
  /** mode: "sprint" | "daily" | "practice". letters: allowed letters for practice. */
  constructor({ mode, words, solid, letters, daily }) {
    this.mode = mode;
    this.solid = new Set(solid);
    this.allowed = letters ? new Set(letters) : null;
    this.pool = this.allowed ? words.filter((w) => [...w].every((c) => this.allowed.has(c))) : words.slice();
    if (this.allowed && this.pool.length < 3) this.pool = [...this.allowed]; // practise single letters
    this.queue = daily ? daily.slice() : null;
    this.recent = [];
    this.score = 0; this.mult = 1; this.clean = 0;
    this.words = 0; this.letters = 0; this.skipped = 0;
    this.misses = {}; this.signTimes = [];
    this.timeLeft = mode === "sprint" ? SPRINT_SECONDS * 1000 : null;
    this.startedAt = performance.now();
    this.over = false;
    this.nextWord();
  }

  get letter() { return this.word[this.idx]; }
  get done() { return this.over; }

  _pick() {
    if (this.queue) return this.queue.shift() || null;
    const candidates = this.pool.filter((w) => !this.recent.includes(w));
    const list = candidates.length ? candidates : this.pool;
    const weight = (w) => Math.max(...[...w].map((L) => BOX_WEIGHT[store.box(L)] * (this.solid.has(L) ? 1 : BETA_WEIGHT)));
    const total = list.reduce((s, w) => s + weight(w), 0);
    let r = Math.random() * total;
    for (const w of list) { r -= weight(w); if (r <= 0) return w; }
    return list[list.length - 1];
  }

  nextWord() {
    const w = this._pick();
    if (!w) { this.over = true; return null; }
    this.word = w; this.idx = 0; this.wordClean = true; this.hinted = false;
    this.letterStart = performance.now();
    this.recent.push(w); if (this.recent.length > 6) this.recent.shift();
    return w;
  }

  /** The current letter was signed. Returns { wordDone, points }. */
  accept() {
    if (this.over) return { wordDone: false, points: 0 };
    const L = this.letter, ms = performance.now() - this.letterStart;
    let pts = LETTER_POINTS + (!this.hinted && ms < FAST_MS ? FAST_BONUS : 0);
    this.letters++; this.signTimes.push(ms);
    if (this.hinted) store.setBox(L, 1);
    else if (ms < 3000) store.setBox(L, store.box(L) + 1);
    this.idx++; this.hinted = false; this.letterStart = performance.now();
    let wordDone = false;
    if (this.idx >= this.word.length) {
      wordDone = true; this.words++; pts += WORD_BONUS;
      if (this.wordClean) { this.clean++; this.mult = Math.min(MAX_MULT, 1 + Math.floor(this.clean / 3)); }
    }
    this.score += pts * this.mult;
    return { wordDone, points: pts * this.mult };
  }

  hint() {
    if (this.hinted) return;
    this.hinted = true; this.wordClean = false; this.clean = 0; this.mult = 1;
    this.misses[this.letter] = (this.misses[this.letter] || 0) + 1;
  }

  /** Skip the rest of the word. Remaining letters count as misses. */
  skip() {
    for (const L of this.word.slice(this.idx)) { this.misses[L] = (this.misses[L] || 0) + 1; this.skipped++; store.setBox(L, 1); }
    this.clean = 0; this.mult = 1;
    return this.nextWord();
  }

  /** Advance the clock. Returns true when the game has just ended. */
  tick(ms) {
    if (this.over || this.timeLeft === null) return false;
    this.timeLeft = Math.max(0, this.timeLeft - ms);
    if (this.timeLeft === 0) { this.over = true; return true; }
    return false;
  }

  end() { this.over = true; }

  result() {
    const attempts = this.letters + this.skipped;
    const hardest = Object.entries(this.misses).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([L]) => L);
    return {
      mode: this.mode, score: this.score, words: this.words, letters: this.letters,
      accuracy: attempts ? this.letters / attempts : 1,
      avgMs: this.signTimes.length ? Math.round(this.signTimes.reduce((a, b) => a + b, 0) / this.signTimes.length) : null,
      timeMs: Math.round(performance.now() - this.startedAt),
      hardest,
    };
  }
}
