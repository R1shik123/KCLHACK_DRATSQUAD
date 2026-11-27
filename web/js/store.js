// Saved progress, in the shape defined in docs/PRODUCT.md ("Saved progress"). Same shape in the app.
const KEY = "signblast.v1";

const blank = () => ({
  version: 1,
  hand: "right",
  sound: false,
  input: null,          // "camera" | "keyboard" | null (not chosen yet)
  appearance: "system", // "system" | "light" | "dark"
  accent: "blue",       // key of tokens.json → accents
  boxes: {},
  streak: { days: 0, lastPlayed: null },
  best: {},             // per game id: sprint, spell, echo, mystery
  daily: {},
  calibration: {},      // letter → array of 6-number feature vectors (personal model)
  history: [],
});

let data = blank();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  data = Object.assign(blank(), saved);
  data.best = Object.assign({}, saved.best || {});
} catch { data = blank(); }

function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: keep in memory */ } }

export const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const store = {
  get data() { return data; },
  set(patch) { Object.assign(data, patch); save(); },
  box(L) { return data.boxes[L] || 1; },
  setBox(L, n) { data.boxes[L] = Math.max(1, Math.min(5, n)); save(); },
  hit(L, ms) { if (ms < 3000) this.setBox(L, this.box(L) + 1); },
  miss(L) { this.setBox(L, 1); },
  mastered() { return Object.values(data.boxes).filter((b) => b >= 5).length; },
  best(game) { return data.best[game] || 0; },
  streakDays() {
    const s = data.streak;
    if (!s.lastPlayed) return 0;
    const y = new Date(); y.setDate(y.getDate() - 1);
    return s.lastPlayed === todayKey() || s.lastPlayed === todayKey(y) ? s.days : 0;
  },
  samples(L) { return data.calibration[L] || []; },
  addSamples(L, vecs, max) { data.calibration[L] = [...this.samples(L), ...vecs].slice(-max); save(); },
  forget(L) { delete data.calibration[L]; save(); },
  /** Called once when a game ends. Returns { newBest } */
  recordGame(r) {
    const today = todayKey();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const s = data.streak;
    if (s.lastPlayed !== today) {
      s.days = s.lastPlayed === todayKey(y) ? s.days + 1 : 1;
      s.lastPlayed = today;
    }
    let newBest = false;
    if (["sprint", "spell", "echo", "mystery"].includes(r.mode) && r.score > this.best(r.mode)) { data.best[r.mode] = r.score; newBest = r.score > 0; }
    if (r.mode === "daily") data.daily[today] = { score: r.score, timeMs: r.timeMs };
    data.history.push({ date: today, mode: r.mode, score: r.score, letters: r.letters || 0, accuracy: r.accuracy ?? null });
    if (data.history.length > 400) data.history = data.history.slice(-400);
    save();
    return { newBest };
  },
  reset() {
    const keep = { hand: data.hand, sound: data.sound, input: data.input, appearance: data.appearance, accent: data.accent };
    data = Object.assign(blank(), keep);
    save();
  },
};
