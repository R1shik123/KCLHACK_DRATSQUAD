// Saved progress, in the shape defined in docs/PRODUCT.md ("Saved progress"). Same shape in the app.
const KEY = "signblast.v1";

const blank = () => ({
  version: 1,
  hand: "right",
  sound: false,
  input: null, // "camera" | "keyboard" | null (not chosen yet). Website-only convenience, not part of the shared shape.
  boxes: {},
  streak: { days: 0, lastPlayed: null },
  best: { sprint: 0 },
  daily: {},
  history: [],
});

let data = blank();
try { data = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { data = blank(); }

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
  mastered() { return Object.values(data.boxes).filter((b) => b >= 5).length; },
  streakDays() {
    const s = data.streak;
    if (!s.lastPlayed) return 0;
    const y = new Date(); y.setDate(y.getDate() - 1);
    return s.lastPlayed === todayKey() || s.lastPlayed === todayKey(y) ? s.days : 0;
  },
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
    if (r.mode === "sprint" && r.score > (data.best.sprint || 0)) { data.best.sprint = r.score; newBest = true; }
    if (r.mode === "daily") data.daily[today] = { score: r.score, timeMs: r.timeMs };
    data.history.push({ date: today, mode: r.mode, score: r.score, words: r.words, letters: r.letters, accuracy: r.accuracy, avgMs: r.avgMs });
    if (data.history.length > 400) data.history = data.history.slice(-400);
    save();
    return { newBest };
  },
  reset() {
    const keep = { hand: data.hand, sound: data.sound, input: data.input };
    data = Object.assign(blank(), keep);
    save();
  },
};
