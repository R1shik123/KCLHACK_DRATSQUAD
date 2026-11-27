// Game rules, ported one-to-one from the app (mobile/Signblast/Games/*.swift) and docs/PRODUCT.md. No DOM here.
// Every model: sign(letter, side?) · tick(ms) · result() · flags { over } · emits flashes through this.say().
import { store } from "./store.js";

const BOX_WEIGHT = [0, 3, 2, 1.4, 1, 1];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Weighted pick by Leitner box (weak letters more often), never the same letter twice in a row. */
export function pickLetter(pool, avoid) {
  const list = pool.length > 1 ? pool.filter((l) => l !== avoid) : pool;
  const total = list.reduce((s, l) => s + BOX_WEIGHT[store.box(l)], 0);
  let r = Math.random() * total;
  for (const l of list) { r -= BOX_WEIGHT[store.box(l)]; if (r <= 0) return l; }
  return list[list.length - 1];
}

// ---- Today's five: FNV-1a + mulberry32, exactly as described in design/words.json ----
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function dailyWords(words, dateKey, count = 5) {
  const rng = mulberry32(fnv1a(dateKey));
  const a = words.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, count);
}

class Base {
  constructor(onSay) { this.onSay = onSay || (() => {}); this.over = false; this.startedAt = performance.now(); this.missed = {}; }
  say(text, good) { this.onSay(text, good); }
  addMiss(L) { this.missed[L] = (this.missed[L] || 0) + 1; }
  practise() { return Object.entries(this.missed).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([L]) => L); }
  tick() { return false; }
}

// ---------- Sign Sprint (SprintGame.swift) ----------
export class Sprint extends Base {
  constructor({ solid, all, allLetters, C, onSay }) {
    super(onSay);
    this.id = "sprint"; this.C = C;
    this.pool = allLetters ? all : solid;
    this.duration = 60000; this.perLetter = 8000; this.timeLeft = this.duration;
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.hits = 0; this.misses = 0; this.reactions = [];
    this.target = null; this.showHint = false;
    this.next();
  }
  get multiplier() { return Math.min(5, 1 + Math.floor(this.combo / 3)); }
  next() { this.target = pickLetter(this.pool, this.target); this.shownAt = performance.now(); this.showHint = false; }
  sign(L) {
    if (this.over) return;
    if (L !== this.target) { this.combo = 0; this.say(this.C.looksLike.replace("{letter}", L), false); return; }
    const ms = performance.now() - this.shownAt;
    this.reactions.push(ms); this.hits++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += 100 * this.multiplier;
    store.hit(L, ms);
    this.say(`${this.C.nice}. ${L}`, true);
    this.next();
    return "hit";
  }
  skip() { if (!this.over) this.miss(); }
  miss() {
    this.misses++; this.combo = 0; this.addMiss(this.target); store.miss(this.target);
    this.say(this.C.missed.replace("{letter}", this.target), false);
    this.next();
  }
  tick(ms) {
    if (this.over) return false;
    this.timeLeft = Math.max(0, this.timeLeft - ms);
    if (this.timeLeft === 0) { this.over = true; return true; }
    const age = performance.now() - this.shownAt;
    this.showHint = age > 3000 && store.box(this.target) <= 2; // scaffolding only for letters you don't know yet
    if (age > this.perLetter) this.miss();
    return false;
  }
  result() {
    const att = this.hits + this.misses;
    return { mode: this.id, score: this.score, letters: this.hits, accuracy: att ? this.hits / att : null,
      stats: [["hits", this.hits], ["bestCombo", this.bestCombo], ["avgMs", this.reactions.length ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length) : null]],
      practise: this.practise() };
  }
}

// ---------- Spell It (SpellGame.swift) + Today's five + Practice ----------
export class Spell extends Base {
  /** variant: "spell" (90 s, starts with CAB) | "daily" (5 fixed words, no clock) | "practice" (chosen letters, no clock) */
  constructor({ variant = "spell", words, first, daily, letters, C, onSay }) {
    super(onSay);
    this.id = variant; this.C = C;
    this.timeLeft = variant === "spell" ? 90000 : null;
    this.score = 0; this.wordsDone = 0; this.lettersDone = 0; this.skipped = 0;
    if (variant === "daily") this.queue = daily.slice();
    else if (variant === "practice") {
      const allowed = new Set(letters);
      let pool = words.filter((w) => [...w].every((c) => allowed.has(c)));
      if (pool.length < 3) pool = [...allowed];
      this.pool = pool; this.queue = shuffle(pool);
    } else { this.pool = words; this.queue = [first, ...shuffle(words)]; }
    this.celebrating = false;
    this.nextWord();
  }
  get current() { return this.word?.[this.pos]; }
  nextWord() {
    if (!this.queue.length) {
      if (this.id === "daily") { this.over = true; return false; }
      this.queue = shuffle(this.pool);
    }
    this.word = this.queue.shift(); this.pos = 0; this.hintShown = false; this.celebrating = false; this.letterAt = performance.now();
    return true;
  }
  sign(L) {
    if (this.over || this.celebrating) return;
    if (L !== this.current) { this.say(this.C.looksLike.replace("{letter}", L), false); return; }
    store.hit(L, performance.now() - this.letterAt);
    this.score += this.hintShown ? 25 : 50;
    this.lettersDone++; this.pos++; this.hintShown = false; this.letterAt = performance.now();
    if (this.pos === this.word.length) {
      this.wordsDone++; this.score += 200; this.celebrating = true;
      this.say(this.word, true);
      return "word";
    }
    return "hit";
  }
  hint() { if (!this.hintShown) { this.hintShown = true; this.addMiss(this.current); } }
  skip() {
    if (this.over || this.celebrating) return;
    store.miss(this.current); this.addMiss(this.current); this.skipped++;
    this.nextWord();
  }
  tick(ms) {
    if (this.over || this.timeLeft === null) return false;
    this.timeLeft = Math.max(0, this.timeLeft - ms);
    if (this.timeLeft === 0) { this.over = true; return true; }
    return false;
  }
  result() {
    const att = this.lettersDone + this.skipped;
    return { mode: this.id, score: this.score, letters: this.lettersDone, accuracy: att ? this.lettersDone / att : null,
      timeMs: Math.round(performance.now() - this.startedAt),
      stats: [["words", this.wordsDone], ["letters", this.lettersDone], ["accuracy", att ? Math.round((this.lettersDone / att) * 100) + "%" : "–"]],
      practise: this.practise() };
  }
}

// ---------- Echo (EchoGame.swift) ----------
export class Echo extends Base {
  constructor({ solid, C, onSay, onShow }) {
    super(onSay);
    this.id = "echo"; this.C = C; this.pool = solid; this.onShow = onShow || (() => {});
    this.sequence = []; this.best = 0; this.peeks = 1; this.entered = 0; this.hits = 0;
    this.phase = "showing"; this.shown = null; this.timers = [];
    this.grow();
  }
  clear() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
  grow() {
    this.sequence.push(pickLetter(this.pool, this.sequence.at(-1)));
    if (this.sequence.length === 1) this.sequence.push(pickLetter(this.pool, this.sequence.at(-1))); // start at 2
    this.play();
  }
  play() {
    this.clear();
    this.phase = "showing"; this.entered = 0; this.shown = null; this.onShow();
    const on = 900, gap = 300, lead = 500;
    this.sequence.forEach((L, i) => {
      const t = lead + i * (on + gap);
      this.later(t, () => { this.shown = L; this.onShow("tick"); });
      this.later(t + on, () => { this.shown = null; this.onShow(); });
    });
    this.later(lead + this.sequence.length * (on + gap), () => { this.phase = "input"; this.promptAt = performance.now(); this.onShow(); });
  }
  peek() { if (this.phase === "input" && this.peeks > 0) { this.peeks--; this.play(); } }
  sign(L) {
    if (this.phase !== "input" || this.over) return;
    const want = this.sequence[this.entered];
    if (L === want) {
      store.hit(L, performance.now() - this.promptAt);
      this.hits++; this.promptAt = performance.now(); this.entered++;
      if (this.entered === this.sequence.length) {
        this.best = this.sequence.length;
        this.say(this.C.echoPerfect.replace("{n}", this.best), true);
        this.phase = "showing"; this.onShow();
        this.clear(); this.later(1000, () => this.grow());
        return "word";
      }
      this.onShow();
      return "hit";
    }
    store.miss(want); this.addMiss(want);
    this.failedOn = want; this.lastWrong = L;
    this.clear(); this.over = true; this.phase = "done";
    return "fail";
  }
  result() {
    return { mode: this.id, score: this.best, letters: this.hits, accuracy: this.hits / (this.hits + 1),
      stats: [["length", this.best], ["letters", this.hits], ["peeks", this.peeks]],
      lines: [this.C.echoWas.replace("{seq}", this.sequence.join(" ")),
        this.failedOn ? this.C.echoEnded.replace("{got}", this.lastWrong).replace("{want}", this.failedOn) : ""].filter(Boolean),
      practise: this.failedOn ? [this.failedOn] : [] };
  }
}

// ---------- Mystery Word (MysteryGame.swift) ----------
export class Mystery extends Base {
  constructor({ bank, C, onSay }) {
    super(onSay);
    this.id = "mystery"; this.C = C; this.bank = bank; this.lives = 6;
    this.score = 0; this.solved = 0; this.queue = shuffle(bank); this.timers = [];
    this.nextWord();
  }
  nextWord() {
    if (!this.queue.length) this.queue = shuffle(this.bank);
    const n = this.queue.shift();
    this.word = n.word; this.clue = n.clue; this.guessed = []; this.wrong = 0; this.phase = "playing";
  }
  get masked() { return [...this.word].map((c) => (this.guessed.includes(c) ? c : null)); }
  get wrongLetters() { return this.guessed.filter((g) => !this.word.includes(g)); }
  get isSolved() { return [...this.word].every((c) => this.guessed.includes(c)); }
  sign(L) {
    if (this.phase !== "playing" || this.over) return;
    if (this.guessed.includes(L)) { this.say(this.C.mysteryAlready.replace("{letter}", L), false); return; }
    this.guessed.push(L);
    if (this.word.includes(L)) {
      store.hit(L, 1000);
      if (this.isSolved) {
        this.solved++; this.score += 100 + 20 * (this.lives - this.wrong); this.phase = "solved";
        this.say(this.C.mysterySolved.replace("{word}", this.word), true);
        this.timers.push(setTimeout(() => { if (this.phase === "solved" && !this.over) { this.nextWord(); this.onAfter?.(); } }, 1400));
        return "word";
      }
      this.say(this.C.mysteryYes.replace("{letter}", L), true);
      return "hit";
    }
    this.wrong++;
    if (this.wrong >= this.lives) { this.over = true; this.phase = "done"; return "fail"; }
    this.say(this.C.mysteryNo.replace("{letter}", L), false);
    return "miss";
  }
  clear() { this.timers.forEach(clearTimeout); }
  result() {
    return { mode: this.id, score: this.score, letters: this.guessed.length, accuracy: null,
      stats: [["solved", this.solved], ["letters", this.guessed.length], ["lives", Math.max(0, this.lives - this.wrong)]],
      lines: [this.C.mysteryWas.replace("{word}", this.word)],
      practise: [] };
  }
}

// ---------- Duel (two players, one camera) ----------
export class Duel extends Base {
  constructor({ solid, C, onSay }) {
    super(onSay);
    this.id = "duel"; this.C = C; this.pool = solid;
    this.timeLeft = 60000; this.target = null; this.points = { left: 0, right: 0 }; this.toWin = 10;
    this.next();
  }
  next() { this.target = pickLetter(this.pool, this.target); }
  /** side: "left" (Player 1) | "right" (Player 2) */
  sign(L, side) {
    if (this.over || L !== this.target) return;
    this.points[side]++;
    this.lastPoint = side;
    if (this.points[side] >= this.toWin) { this.over = true; return "win"; }
    this.next();
    return "point";
  }
  tick(ms) {
    if (this.over) return false;
    this.timeLeft = Math.max(0, this.timeLeft - ms);
    if (this.timeLeft === 0) { this.over = true; return true; }
    return false;
  }
  winner() { const { left, right } = this.points; return left === right ? null : left > right ? "left" : "right"; }
  result() {
    return { mode: this.id, score: Math.max(this.points.left, this.points.right), letters: this.points.left + this.points.right, accuracy: null,
      stats: [["p1", this.points.left], ["p2", this.points.right]], winner: this.winner(), practise: [] };
  }
}
