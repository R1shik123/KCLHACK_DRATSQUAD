// Echo levels, ported one-to-one from mobile/Signblast/Games/EchoGame.swift (EchoLevel + EchoModel) and docs/PRODUCT.md
// "Echo levels". No DOM here.
import { store } from "./store.js";
import { pickLetter } from "./games.js";

export const STAGES = ["letters", "moreLetters", "words", "longWords", "pairs", "expert"];

export class EchoLevel {
  constructor(n) { this.number = n; }
  get isBoss() { return this.number % 5 === 0; }
  get rounds() { return this.isBoss ? 4 : 3; }
  get stage() {
    const n = this.number;
    return n <= 5 ? "letters" : n <= 10 ? "moreLetters" : n <= 15 ? "words" : n <= 20 ? "longWords" : n <= 25 ? "pairs" : "expert";
  }
  get usesWords() { return this.stage !== "letters" && this.stage !== "moreLetters"; }
  /** Letters per round (letter stages) or words per round (word stages). Boss levels add one. */
  get items() {
    const boss = this.isBoss ? 1 : 0, n = this.number;
    switch (this.stage) {
      case "letters": return [2, 2, 3, 3, 3][Math.max(0, Math.min(4, n - 1))] + boss;
      case "moreLetters": return 4 + Math.floor((n - 6) / 2) + boss;
      case "words": case "longWords": return 1 + boss;
      default: return 2 + boss;
    }
  }
  /** Seconds each letter shows (a word shows for this × its length, at least 1.2 s). */
  get secondsPerLetter() {
    const n = this.number;
    switch (this.stage) {
      case "letters": return 1.0;
      case "moreLetters": return 0.9 - 0.035 * (n - 6);
      case "words": return 0.5;
      case "longWords": case "pairs": return 0.45;
      default: return Math.max(0.3, 0.4 - 0.005 * (n - 26));
    }
  }
}

/** Word pools, same filter as the app's WordBank: reliable letters only and no doubled letters, until Expert. */
export function echoPools(words, solid) {
  const S = new Set(solid);
  const friendly = (w) => [...w].every((c) => S.has(c)) && [...w].every((c, i) => i === 0 || c !== w[i - 1]);
  return {
    echo3: words.filter((w) => w.length === 3 && friendly(w)),
    echo45: words.filter((w) => w.length >= 4 && w.length <= 6 && friendly(w)),
    expert: words.filter((w) => w.length >= 3 && w.length <= 5),
  };
}

export class EchoRun {
  /** onChange(event) is called on every state change: "show", "input", "hit", "miss", "round", "cleared", "failed". */
  constructor({ level, solid, pools, C, onChange }) {
    this.level = new EchoLevel(level); this.solid = solid; this.pools = pools; this.C = C;
    this.onChange = onChange || (() => {});
    this.timers = []; this.usedWords = new Set();
    this.round = 1; this.hearts = 3; this.heartsLost = 0; this.showAgainUsed = false; this.stars = 0;
    this.phase = "watch"; this.items = []; this.targets = []; this.entered = 0; this.shownIndex = null; this.note = null;
    this.newRound();
  }
  get pool() {
    const s = this.level.stage;
    return s === "words" || s === "pairs" ? this.pools.echo3 : s === "longWords" ? this.pools.echo45 : this.pools.expert;
  }
  clear() { this.timers.forEach(clearTimeout); this.timers = []; }
  after(sec, fn) { this.timers.push(setTimeout(fn, sec * 1000)); }
  newRound() { this.items = this.makeItems(); this.targets = this.items.join("").split(""); this.play(); }
  makeItems() {
    const L = this.level;
    if (L.usesWords) {
      let pool = this.pool.filter((w) => !this.usedWords.has(w));
      if (pool.length < L.items) { this.usedWords.clear(); pool = this.pool.slice(); }
      const out = [];
      for (let i = 0; i < L.items && pool.length; i++) {
        const w = pool[Math.floor(Math.random() * pool.length)];
        pool = pool.filter((x) => x !== w); this.usedWords.add(w); out.push(w);
      }
      return out;
    }
    const out = [];
    for (let i = 0; i < L.items; i++) out.push(pickLetter(this.solid, out.at(-1)));
    return out;
  }
  /** Watch: show each item, then hand over to the player. */
  play() {
    this.clear();
    this.phase = "watch"; this.entered = 0; this.shownIndex = null; this.onChange("show");
    let t = 0.7;
    this.items.forEach((item, i) => {
      const dur = this.level.usesWords ? Math.max(1.2, item.length * this.level.secondsPerLetter) : this.level.secondsPerLetter;
      this.after(t, () => { this.shownIndex = i; this.onChange("tick"); });
      this.after(t + dur, () => { this.shownIndex = null; this.onChange("show"); });
      t += dur + 0.3;
    });
    this.after(t, () => { this.note = null; this.phase = "input"; this.promptAt = performance.now(); this.onChange("input"); });
  }
  showAgain() {
    if (this.phase !== "input" || this.showAgainUsed) return;
    this.showAgainUsed = true; this.play();
  }
  sign(L) {
    if (this.phase !== "input" || this.entered >= this.targets.length) return null;
    const want = this.targets[this.entered];
    if (L === want) {
      store.hit(L, performance.now() - this.promptAt);
      this.promptAt = performance.now(); this.entered++;
      if (this.entered === this.targets.length) { this.roundDone(); return "round"; }
      this.onChange("hit"); return "hit";
    }
    // Wrong letter: neutral feedback, lose a heart, watch the round again.
    store.miss(want); this.hearts--; this.heartsLost++;
    if (this.hearts <= 0) { this.clear(); this.phase = "failed"; this.onChange("failed"); return "failed"; }
    this.note = this.C.missed; this.clear(); this.phase = "watch"; this.shownIndex = null; this.onChange("miss");
    this.after(1.2, () => this.play());
    return "miss";
  }
  roundDone() {
    if (this.round >= this.level.rounds) { this.complete(); return; }
    this.round++; this.note = this.C.roundDone; this.clear(); this.phase = "watch"; this.onChange("round");
    this.after(1.0, () => this.newRound());
  }
  complete() {
    this.clear();
    const penalty = this.heartsLost + (this.showAgainUsed ? 1 : 0);
    this.stars = penalty === 0 ? 3 : penalty === 1 ? 2 : 1;
    this.unlocked = recordEcho(this.level.number, this.stars);
    this.phase = "cleared"; this.onChange("cleared");
  }
}

// ---- saved progress: { echo: { stars: { "1": 3 } } } (docs/PRODUCT.md) ----
export const echoStars = (n) => store.data.echo?.stars?.[String(n)] || 0;
export const echoHighest = () => Math.max(0, ...Object.keys(store.data.echo?.stars || {}).map(Number));
export const echoTotalStars = () => Object.values(store.data.echo?.stars || {}).reduce((a, b) => a + b, 0);
export function recordEcho(n, stars) {
  const before = echoHighest();
  const map = { ...(store.data.echo?.stars || {}) };
  map[String(n)] = Math.max(map[String(n)] || 0, stars);
  store.set({ echo: { stars: map } });
  if (n > store.best("echo")) store.set({ best: { ...store.data.best, echo: n } });
  return n > before; // unlocked the next level
}
