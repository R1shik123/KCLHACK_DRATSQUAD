// Sign Max website: router + screens (docs/PRODUCT.md). Vanilla JS, no build step.
import { Recognizer, HoldTracker } from "./recognizer.js";
import { Sprint, Spell, Echo, Mystery, Duel, dailyWords } from "./games.js";
import { store, todayKey } from "./store.js";
import { icon } from "./icons.js";
import { EchoLevel, EchoRun, echoPools, echoStars, echoHighest, echoTotalStars } from "./echo.js";
import { Blast, BLAST_LEVELS } from "./blast.js";

const load = (p) => fetch(p, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
const [C, RCFG, HS, WL, TOK] = await Promise.all([
  load("../design/copy.json"), load("../design/recognizer.json"), load("../design/handshapes.json"),
  load("../design/words.json"), load("../design/tokens.json"),
]);

const ALPHA = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const SOLID = new Set(RCFG.solid);
const view = document.getElementById("view");
const root = document.documentElement;
const rec = new Recognizer(RCFG, () => store.data.calibration);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s, v = {}) => esc(s).replace(/\{(\w+)\}/g, (_, k) => esc(v[k] ?? "")); // for innerHTML
const tx = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));      // for textContent
const $ = (sel) => view.querySelector(sel);
const G = C.game;

// Game catalogue: ids match the app's GameKind and copy.json → games.
const GAMES = {
  sprint:   { icon: "zap",         best: true },
  spell:    { icon: "type",        best: true },
  echo:     { icon: "repeat",      best: true },
  mystery:  { icon: "circle-help", best: true },
  blast:    { icon: "rocket",      best: true },
  duel:     { icon: "swords",      best: false, camera: true },
  practice: { icon: "target",      best: false },
  daily:    { icon: "calendar",    best: false },
};

let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);
let pending = null;     // { id, opts } waiting to start
let lastResult = null;
let practiceLetters = new Set(ALPHA);
let sprintAll = false;
let blastLevel = 1;

document.getElementById("settings-btn").innerHTML = icon("settings");
{
  const f = document.querySelector(".site-foot");
  f.querySelector(".t-footnote.muted").textContent = C.footer.tagline;
  const links = f.querySelectorAll(".links a");
  [C.footer.alphabet, C.tabs.progress, C.settings.title, C.footer.github].forEach((t, i) => { if (links[i]) links[i].textContent = t; });
}

// ---------- Theme (Settings → Appearance, Accent colour) ----------
function applyTheme() {
  const { appearance, accent } = store.data;
  if (appearance === "light" || appearance === "dark") root.dataset.theme = appearance; else delete root.dataset.theme;
  root.dataset.accent = TOK.accents[accent] ? accent : TOK.accents.default;
}
applyTheme();

// ---------- Sound (off by default, DESIGN.md §6) ----------
let actx = null;
function beep(freqs, dur = 0.08) {
  if (!store.data.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.15);
    });
  } catch { /* audio unavailable */ }
}

// ---------- Toast + sheet ----------
function toast(text) {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = text;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 2500);
}
function sheet({ title, body = "", actions }) {
  return new Promise((resolve) => {
    const host = document.getElementById("sheet");
    host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
      <div class="stack"><h2 class="t-title2" id="sheet-t">${esc(title)}</h2>${body ? `<p class="t-callout muted">${esc(body)}</p>` : ""}</div>
      <div class="actions">${actions.map((a, i) => `<button type="button" class="btn ${a.kind}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div></div>`;
    host.hidden = false;
    const close = (v) => { host.hidden = true; host.innerHTML = ""; document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(actions.find((a) => a.cancel)?.value); };
    document.addEventListener("keydown", onKey);
    host.onclick = (e) => {
      const b = e.target.closest("button[data-i]");
      if (b) close(actions[+b.dataset.i].value);
      else if (e.target === host) close(actions.find((a) => a.cancel)?.value);
    };
    host.querySelector("button")?.focus();
  });
}

// ---------- Shared bits ----------
const ringSvg = () => `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46" pathLength="100"/><circle class="fill" cx="50" cy="50" r="46" pathLength="100"/></svg>`;
function setRing(el, p, ok = false) {
  const f = el?.querySelector(".ring .fill"); if (!f) return;
  f.style.strokeDashoffset = String(100 * (1 - Math.max(0, Math.min(1, p))));
  el.querySelector(".ring").classList.toggle("ok", ok);
}
const tileClass = (L) => `tile${SOLID.has(L) ? "" : " beta"}${store.box(L) >= 5 ? " mastered" : ""}`;
const stat = (n, l) => `<div class="stat"><span class="n">${n}</span><span class="l">${esc(l)}</span></div>`;
const chip = (id, v, k, cls = "") => `<div class="chip ${cls}"><span class="v" id="${id}">${v}</span><span class="k">${esc(k)}</span></div>`;
const gameTitle = (id) => C.games[id].title;
const HAND = (L) => `../design/assets/handshapes/${L}.svg`;
const handImg = (L, cls = "") => `<img class="hand ${cls}" src="${HAND(L)}" alt="${esc(tx(C.learn.handAlt, { letter: L }))}" decoding="async">`;
const gameAttr = (id) => `data-game="${id}" style="--ga:var(--game-${id}-a);--gb:var(--game-${id}-b)"`;
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function startGame(id, opts = {}) {
  if (id === "daily" && store.data.daily[todayKey()]) { location.hash = "#play"; return; }
  pending = { id, opts };
  if (GAMES[id].camera && store.data.input === "keyboard") { location.hash = `#run-${id}`; return; } // duel has its own keyboard mode
  location.hash = store.data.input ? `#run-${id}` : "#camera";
}

// ---------- S1 Home (game hub) ----------
function Home() {
  const days = store.streakDays();
  const daily = store.data.daily[todayKey()];
  const order = ["sprint", "spell", "echo", "mystery", "blast", "duel", "practice"];
  const demoWord = C.home.demoWord;
  view.innerHTML = `<section class="screen wide">
    <div class="hero-wrap"><div class="hero">
      <div class="lead">
        <span class="chip-note"><span class="dot">${icon("camera")}</span>${esc(C.home.note)}</span>
        <h1 class="t-hero"><span class="rise"><span>${esc(C.home.title)}</span></span><span class="rise"><span class="soft grad-text">${esc(C.home.titleSoft)}</span></span></h1>
        <p class="t-body muted">${esc(C.home.body)}</p>
        <div class="cta"><a class="btn primary" href="#game-sprint">${icon("zap")}${esc(C.home.primary)}</a><a class="btn secondary" href="#learn">${esc(C.home.ctaLearn)}</a></div>
      </div>
      <div class="demo" aria-hidden="true" ${gameAttr("spell")}>
        <div class="top"><span class="row" style="gap:10px"><span class="badge-icon grad" style="width:32px;height:32px;border-radius:10px">${icon("type")}</span><span class="t-headline">${esc(C.games.spell.title)}</span></span><span class="timer">1:24</span></div>
        <div class="word" id="demo-word"></div>
        <div class="cam" id="demo-cam">${handSkeleton()}<span class="status" id="demo-status"></span></div>
        <div class="bars"><span><i></i></span><span><i></i></span><span><i></i></span></div>
      </div>
    </div></div>
    <div class="facts">
      <div class="fact spot" data-reveal><span class="v grad-text">26</span><span class="k">${esc(C.home.factLetters)}</span></div>
      <div class="fact spot" data-reveal><span class="v grad-text">${Object.keys(GAMES).length}</span><span class="k">${esc(C.home.factGames)}</span></div>
      <div class="fact spot" data-reveal><span class="v grad-text">0 MB</span><span class="k">${esc(C.home.factUploads)}</span></div>
    </div>
    <div class="marquee" aria-hidden="true"><div class="track">${[...ALPHA, ...ALPHA].map((L) => `<span class="mtile">${L}</span>`).join("")}</div></div>
    ${daily
      ? `<div class="featured" aria-disabled="true"><span class="ico">${icon("calendar")}</span><span class="copy"><span class="eyebrow">${esc(C.home.featured)}</span><span class="t-title2">${esc(C.games.daily.title)}</span><span class="t-subhead muted">${fmt(C.home.dailyDone, { score: daily.score })}</span></span><span class="chev">${icon("check")}</span></div>`
      : `<button class="featured" id="go-daily"><span class="ico">${icon("calendar")}</span><span class="copy"><span class="eyebrow">${esc(C.home.featured)}</span><span class="t-title2">${esc(C.games.daily.title)}</span><span class="t-subhead">${esc(C.games.daily.body)}</span></span><span class="chev">${icon("chevron-right")}</span></button>`}
    <div class="section">
      <div class="section-head"><h2 class="t-title1">${esc(C.home.gamesTitle)}</h2><span class="t-footnote muted row" style="gap:6px">${icon("flame")} ${days ? fmt(C.home.streak, { n: days }) : esc(C.home.streakNone)}</span></div>
      <div class="games">${order.map((id, i) => `<a class="game-tile spot tilt" data-reveal href="#game-${id}" ${gameAttr(id).replace('style="', 'style="--d:' + i * 70 + 'ms;')}>
        <span class="badge-icon grad">${icon(GAMES[id].icon)}</span>
        <span class="copy"><span class="t-headline">${esc(C.games[id].title)}</span><span class="t-subhead muted">${esc(C.games[id].body)}</span></span>
        <span class="foot"><span>${GAMES[id].best && store.best(id) ? fmt(C.home.best, { score: store.best(id) }) : ""}</span><span class="go">${icon("chevron-right")}</span></span></a>`).join("")}</div>
    </div>
  </section>`;
  $("#go-daily")?.addEventListener("click", () => startGame("daily"));

  // Live demo: spells the demo word letter by letter, ring filling on each, like a real round.
  const wordEl = $("#demo-word"), st = $("#demo-status"), bars = [...view.querySelectorAll(".demo .bars i")];
  let idx = 0, p = 0, words = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = () => {
    wordEl.innerHTML = [...demoWord].map((ch, i) => i < idx ? `<span class="ch done">${ch}</span>` : i === idx ? `<span class="ch cur">${ch}${ringSvg()}</span>` : `<span class="ch next">${ch}</span>`).join("");
    st.innerHTML = idx < demoWord.length ? `<span class="sig">${demoWord[idx]}${ringSvg()}</span>${esc(C.camera.holding)}` : esc(C.play.wordDone);
  };
  draw();
  if (reduce) { setRing(wordEl.querySelector(".cur"), 0.6); return; }
  const t = setInterval(() => {
    p += 0.1;
    const cur = wordEl.querySelector(".cur");
    if (p < 1) { setRing(cur, p); setRing(st.querySelector(".sig"), p); return; }
    if (cur) setRing(cur, 1, true);
    if (p < 1.4) return;
    p = 0; idx++;
    if (idx > demoWord.length) { idx = 0; words = (words + 1) % 4; bars.forEach((b, i) => { b.style.width = i < words ? "100%" : "0%"; }); }
    draw();
  }, 70);
  onLeave(() => clearInterval(t));
}

// A static hand-landmark sketch for the demo camera (21 points joined like MediaPipe draws them).
function handSkeleton() {
  const pts = [[50, 86], [41, 78], [35, 68], [32, 58], [30, 50], [44, 52], [43, 38], [43, 29], [43, 21], [52, 50], [53, 35], [53, 25], [53, 16], [60, 52], [62, 40], [62, 32], [62, 25], [67, 56], [70, 47], [71, 41], [72, 35]];
  const bones = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
  const path = bones.map((b) => "M" + b.map((i) => pts[i].join(" ")).join(" L")).join(" ");
  return `<svg class="hand-skel" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><path d="${path}"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join("")}</svg>`;
}

// ---------- Game intro (ready card) ----------
function GameIntro(id) {
  if (!GAMES[id] || id === "daily") { location.hash = "#play"; return; }
  if (id === "practice") { PracticeSetup(); return; }
  if (id === "echo") { EchoPath(); return; }
  const g = C.games[id];
  view.innerHTML = `<section class="screen narrow">
    <a class="nav-back" href="#play">${icon("chevron-left")}${esc(C.tabs.play)}</a>
    <div class="banner" ${gameAttr(id)}>
      <div class="floaters" aria-hidden="true"><span>${ALPHA[(id.length * 7) % 26]}</span><span>${ALPHA[(id.length * 11) % 26]}</span><span>${ALPHA[(id.length * 3) % 26]}</span></div>
      <span class="big-icon">${icon(GAMES[id].icon)}</span>
      <h1 class="t-large">${esc(g.title)}</h1>
      <p class="t-body">${esc(g.body)}</p>
      ${GAMES[id].best && store.best(id) ? `<span class="best-pill">${esc(G.best)} ${store.best(id)}</span>` : ""}
    </div>
    <div class="section"><p class="eyebrow">${esc(G.rules)}</p>
      <ol class="rules">${g.rules.map((r, i) => `<li><span class="n">${i + 1}</span><span>${esc(r)}</span></li>`).join("")}</ol></div>
    ${id === "sprint" ? `<div class="opt-row"><span class="t-headline">${esc(G.allLetters)}</span><span class="seg" id="pool"><button type="button" data-v="0" aria-pressed="${!sprintAll}">${esc(C.settings.off)}</button><button type="button" data-v="1" aria-pressed="${sprintAll}">${esc(C.settings.on)}</button></span></div>` : ""}
    ${id === "blast" ? `<div class="opt-row"><span class="t-headline">${esc(C.blast.startLevel)}</span><span class="seg" id="lvl">${BLAST_LEVELS.map((_, i) => `<button type="button" data-v="${i + 1}" aria-pressed="${blastLevel === i + 1}" title="${esc(C.blast.levels[i])}">${i + 1}</button>`).join("")}</span></div>` : ""}
    ${id === "duel" ? `<p class="t-footnote muted">${esc(G.duelNeedCamera)} ${esc(G.duelKeys)}</p>` : ""}
    <div ${gameAttr(id)}><button class="btn primary" id="go">${icon("play")}${esc(G.start)}</button></div>
  </section>`;
  $("#pool")?.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    sprintAll = b.dataset.v === "1";
    $("#pool").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("#lvl")?.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    blastLevel = +b.dataset.v;
    $("#lvl").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("#go").onclick = () => startGame(id, id === "sprint" ? { allLetters: sprintAll } : id === "blast" ? { level: blastLevel } : {});
}

// ---------- S2 Camera setup ----------
function CameraSetup() {
  if (!pending) { location.hash = "#play"; return; }
  view.innerHTML = `<section class="screen narrow setup">
    <div class="icon-circle">${icon("camera")}</div>
    <div class="intro"><h1 class="t-large">${esc(C.camera.title)}</h1><p class="t-body muted">${esc(C.camera.body)}</p></div>
    <div class="actions"><button class="btn primary" id="allow">${esc(C.camera.primary)}</button></div>
    <button class="btn text" id="kbd">${esc(C.camera.keyboard)}</button>
    <p class="t-footnote muted note" id="cam-msg" aria-live="polite"></p>
  </section>`;
  const msg = $("#cam-msg"), allow = $("#allow");
  allow.onclick = async () => {
    allow.disabled = true; msg.textContent = C.camera.loading;
    const s = await rec.start();
    if (s === "on") { store.set({ input: "camera" }); location.hash = pending.next || `#run-${pending.id}`; return; }
    allow.disabled = false;
    msg.textContent = s === "denied" ? C.camera.denied : C.camera.unavailable;
  };
  $("#kbd").onclick = () => { store.set({ input: "keyboard" }); location.hash = pending.next || `#run-${pending.id}`; };
}

// ---------- S3 Practice setup ----------
function PracticeSetup() {
  view.innerHTML = `<section class="screen">
    <a class="nav-back" href="#play">${icon("chevron-left")}${esc(C.tabs.play)}</a>
    <div class="intro"><p class="eyebrow">${esc(C.practice.eyebrow)}</p><h1 class="t-large">${esc(C.practice.title)}</h1><p class="t-body muted">${esc(C.practice.body)}</p></div>
    <div class="stack-md">
      <div class="row"><button class="btn text" id="all">${esc(C.practice.all)}</button><button class="btn text" id="none">${esc(C.practice.none)}</button></div>
      <div class="tiles" id="pick">${ALPHA.map((L) => `<button type="button" class="${tileClass(L)}" data-l="${L}" aria-pressed="${practiceLetters.has(L)}">${L}</button>`).join("")}</div>
    </div>
    <div class="stack"><div><button class="btn primary" id="go">${esc(C.practice.primary)}</button></div><p class="t-footnote muted" id="need" aria-live="polite"></p></div>
  </section>`;
  const sync = () => {
    view.querySelectorAll("#pick .tile").forEach((b) => b.setAttribute("aria-pressed", String(practiceLetters.has(b.dataset.l))));
    $("#go").disabled = practiceLetters.size === 0;
    $("#need").textContent = practiceLetters.size ? "" : C.practice.needMore;
  };
  $("#pick").onclick = (e) => { const b = e.target.closest(".tile"); if (!b) return; const L = b.dataset.l; practiceLetters.has(L) ? practiceLetters.delete(L) : practiceLetters.add(L); sync(); };
  $("#all").onclick = () => { practiceLetters = new Set(ALPHA); sync(); };
  $("#none").onclick = () => { practiceLetters.clear(); sync(); };
  $("#go").onclick = () => startGame("practice", { letters: [...practiceLetters] });
  sync();
}

// ---------- S4 Run a game (+ P1 Pause sheet) ----------
function Run(id) {
  if (!pending || pending.id !== id) { location.hash = GAMES[id] ? `#game-${id}` : "#play"; return; }
  if (id === "blast") { BlastPlay(pending.opts); return; }
  const { opts } = pending;
  let keyboard = store.data.input !== "camera";
  let paused = false, finished = false, raf = 0, last = performance.now(), flashT = 0;
  const say = (text, good) => {
    const f = $("#flash"); if (!f) return;
    f.textContent = text; f.className = "flash in" + (good ? " good" : "");
    clearTimeout(flashT); flashT = setTimeout(() => { if (f.isConnected) f.textContent = ""; }, 1600);
  };
  const game = id === "sprint" ? new Sprint({ solid: RCFG.solid, all: ALPHA, allLetters: opts.allLetters, C: G, onSay: say })
    : id === "spell" ? new Spell({ variant: "spell", words: WL.spell, first: WL.spellFirst, C: G, onSay: say })
    : id === "daily" ? new Spell({ variant: "daily", daily: dailyWords(WL.words, todayKey(), WL.daily.count), C: G, onSay: say })
    : id === "practice" ? new Spell({ variant: "practice", words: [...WL.words, ...WL.spell], letters: opts.letters, C: G, onSay: say })
    : id === "echo" ? new Echo({ solid: RCFG.solid, C: G, onSay: say, onShow: (k) => { if (k === "tick") beep([660]); queueMicrotask(() => render()); } })
    : id === "mystery" ? new Mystery({ bank: WL.mystery, C: G, onSay: say })
    : new Duel({ solid: RCFG.solid, C: G, onSay: say });
  if (game.onAfter === undefined) game.onAfter = () => render();
  const spellLike = game instanceof Spell;
  const timed = game.timeLeft !== null && game.timeLeft !== undefined;

  view.innerHTML = `<section class="screen narrow" ${gameAttr(id)}>
    <div class="play-bar">
      <span class="title"><span class="badge-icon grad">${icon(GAMES[id].icon)}</span><span class="t-headline">${esc(gameTitle(id))}</span></span>
      <div class="right">${timed ? `<span class="timer" id="timer">${mmss(game.timeLeft)}</span>` : ""}<button class="icon-btn" id="pause" aria-label="${esc(C.play.pause)}">${icon("pause")}</button></div>
    </div>
    <div class="stage" ${gameAttr(id)}>
    <div id="body" class="stack-md"></div>
    <p class="flash" id="flash" aria-live="polite"></p>
    <div class="cam" id="cam"><div class="placeholder" id="ph"></div><img class="ghost" id="ghost" alt="" aria-hidden="true">${id === "duel" ? `<span class="divider"></span><span class="side-tag l">${esc(G.duelP1)}</span><span class="side-tag r">${esc(G.duelP2)}</span>` : ""}<span class="status" id="status" hidden></span></div>
    <div class="play-foot" id="foot"></div>
    </div>
    <div class="hint-card" id="hint-card" hidden></div>
  </section>`;
  const body = $("#body"), foot = $("#foot"), status = $("#status"), ph = $("#ph"), hintCard = $("#hint-card");

  // ----- per-game rendering -----
  const expected = () => game instanceof Sprint ? game.target : spellLike ? game.current : game instanceof Echo && game.phase === "input" ? game.sequence[game.entered] : null;
  // Picture hints: the handshape drawing in the hint card plus a faint ghost of it over the camera to line your hand up with.
  const ghost = $("#ghost");
  function setGhost(L) {
    if (!ghost) return;
    if (L) { if (ghost.dataset.l !== L) { ghost.src = HAND(L); ghost.dataset.l = L; } ghost.classList.add("on"); }
    else ghost.classList.remove("on");
  }
  function showHint(L) {
    if (!HS.letters[L]) { hintCard.hidden = true; setGhost(null); return; }
    hintCard.innerHTML = `${handImg(L, "hint-img")}<span class="big">${L}</span>`;
    hintCard.hidden = false; setGhost(L);
  }
  const hideHint = () => { hintCard.hidden = true; setGhost(id === "practice" && spellLike ? game.current : null); };
  function render(anim) {
    if (finished) return;
    if (game instanceof Sprint) {
      body.innerHTML = `<div class="chips">${chip("c1", game.score, G.score, "accent")}${chip("c2", "×" + game.multiplier, G.multiplier)}${chip("c3", game.combo, G.combo)}</div>
        <div class="target ${anim ? "pop" : ""}" id="tgt">${game.target}${ringSvg()}</div>`;
      foot.innerHTML = `<span></span><button class="btn text" id="skip">${esc(C.play.skip)}</button>`;
      game.showHint ? showHint(game.target) : hideHint();
    } else if (spellLike) {
      const w = game.word || "";
      body.innerHTML = `<div class="chips">${chip("c1", game.score, G.score, "accent")}${chip("c2", game.wordsDone, C.play.words)}${chip("c3", game.lettersDone, C.results.letters)}</div>
        <div class="word ${anim ? "entering" : ""}" id="tgt">${[...w].map((ch, i) => i < game.pos ? `<span class="ch done">${ch}</span>` : i === game.pos ? `<span class="ch cur">${ch}${ringSvg()}</span>` : `<span class="ch next">${ch}</span>`).join("")}</div>`;
      foot.innerHTML = `<button class="btn text" id="hint">${esc(C.play.hint)}</button><button class="btn text" id="skip">${esc(C.play.skip)}</button>`;
      game.hintShown ? showHint(game.current) : hideHint();
    } else if (game instanceof Echo) {
      const input = game.phase === "input";
      body.innerHTML = `<div class="chips">${chip("c1", game.sequence.length, G.echoLength, "accent")}${chip("c2", game.best, G.best)}${chip("c3", game.peeks, G.echoPeek)}</div>
        ${input
          ? `<div class="slots" id="tgt">${game.sequence.map((L, i) => `<span class="slot ${i < game.entered ? "done" : i === game.entered ? "cur" : ""}">${i < game.entered ? L : "?"}</span>`).join("")}</div>
             <p class="t-callout muted" style="text-align:center">${fmt(G.echoYourTurn, { n: game.entered + 1, total: game.sequence.length })}</p>`
          : `<div class="target ${game.shown ? "lit pop" : "dim"}">${game.shown || "•"}</div><p class="t-callout muted" style="text-align:center">${esc(G.echoWatch)}</p>`}`;
      foot.innerHTML = input ? `<span></span><button class="btn text" id="peek" ${game.peeks ? "" : "disabled"}>${esc(G.echoPeek)} · ${game.peeks}</button>` : "";
    } else if (game instanceof Mystery) {
      body.innerHTML = `<div class="chips">${chip("c1", game.score, G.score, "accent")}${chip("c2", game.solved, G.mysteryCount)}<div class="chip"><span class="v lives">${Array.from({ length: game.lives }, (_, i) => `<span class="${i < game.lives - game.wrong ? "full" : "lost"}">${icon("heart")}</span>`).join("")}</span><span class="k">${esc(G.mysteryLives)}</span></div></div>
        <span class="clue">${esc(G.mysteryClue)}: ${esc(game.clue)}</span>
        <div class="masked" id="tgt">${game.masked.map((c) => `<span class="m ${c ? "got" : ""}">${c || ""}</span>`).join("")}</div>
        <div class="tried">${game.wrongLetters.map((l) => `<span>${l}</span>`).join("")}</div>`;
      foot.innerHTML = "";
    } else {
      body.innerHTML = `<div class="duel-score"><div class="p ${game.lastPoint === "left" ? "scored" : ""}"><span class="t-footnote muted">${esc(G.duelP1)}</span><span class="v">${game.points.left}</span></div>
        <div class="p right ${game.lastPoint === "right" ? "scored" : ""}"><span class="t-footnote muted">${esc(G.duelP2)}</span><span class="v">${game.points.right}</span></div></div>
        <div class="target ${anim ? "pop" : ""}" id="tgt">${game.target}</div>`;
      foot.innerHTML = "";
    }
    $("#skip")?.addEventListener("click", () => { if (paused) return; game.skip(); if (game.over) finish(); else render(true); });
    $("#hint")?.addEventListener("click", () => { game.hint(); render(); });
    $("#peek")?.addEventListener("click", () => game.peek());
  }

  function handle(L, side) {
    if (paused || finished) return;
    const r = game.sign(L, side);
    if (r === "hit" || r === "point") beep([880]);
    if (r === "hit" || r === "point" || r === "word" || r === "win") queueMicrotask(() => burst($("#tgt"), r === "word" || r === "win" ? 22 : 12)); // after the re-render below
    if (r === "word" || r === "win") beep([660, 990], 0.1);
    if (r === "point") say(tx(G.duelPoint, { player: side === "left" ? G.duelP1 : G.duelP2 }), true);
    if (game.over) { finish(); return; }
    if (spellLike && r === "word") {
      render(); const t = $("#tgt"); t?.classList.add("leaving");
      setTimeout(() => { if (finished) return; if (!game.nextWord()) { finish(); return; } render(true); }, 900);
      return;
    }
    render(r === "hit" || r === "point" || r === "word");
  }

  function finish(timeUp = false) {
    if (finished) return;
    finished = true; game.over = true; game.clear?.();
    const r = game.result();
    const { newBest } = store.recordGame(r);
    lastResult = { ...r, newBest, id };
    if (timeUp) toast(C.play.timeUp);
    location.hash = "#results";
  }

  async function pause() {
    if (finished || paused) return;
    paused = true;
    const v = await sheet({ title: C.play.paused, actions: [
      { label: C.play.resume, kind: "primary", value: "resume", cancel: true },
      { label: C.play.end, kind: "text", value: "end" },
    ] });
    paused = false; last = performance.now();
    if (v === "end") finish();
  }
  $("#pause").onclick = pause;

  // ----- input: keyboard -----
  const onKey = (e) => {
    if (e.key === "Escape") { pause(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || !document.getElementById("sheet").hidden) return;
    const k = e.key.toUpperCase();
    if (k.length !== 1 || k < "A" || k > "Z") return;
    if (!keyboard && id !== "duel") return;
    e.preventDefault();
    handle(k, id === "duel" ? (e.shiftKey ? "right" : "left") : undefined);
  };
  document.addEventListener("keydown", onKey);
  onLeave(() => document.removeEventListener("keydown", onKey));

  // ----- input: camera -----
  const stable = RCFG.stableFrames, rearm = RCFG.rearmFrames;
  const main = new HoldTracker(stable, rearm), sides = { left: new HoldTracker(stable, rearm), right: new HoldTracker(stable, rearm) };
  const setStatus = (html) => { status.hidden = !html; status.innerHTML = html || ""; };
  const off = rec.onFrame((f) => {
    if (keyboard || paused || finished) return;
    if (id === "duel") {
      for (const s of ["left", "right"]) { const r = sides[s].push(f.sides[s]); if (r.fired) handle(r.fired, s); }
      setStatus(f.hand ? "" : esc(C.camera.noHand));
      return;
    }
    const r = main.push(f.letter);
    const want = expected();
    const tgt = $("#tgt .cur") || $("#tgt.target") || $("#tgt .slot.cur");
    if (tgt && tgt.querySelector(".ring")) setRing(tgt, r.letter && r.letter === want ? r.progress : 0);
    if (!f.hand) setStatus(esc(C.camera.noHand));
    else if (r.letter) setStatus(`<span class="sig">${r.letter}${ringSvg()}</span>${esc(r.letter === want ? C.camera.holding : "")}`);
    else setStatus("");
    const sig = status.querySelector(".sig"); if (sig) setRing(sig, r.progress);
    if (r.fired) handle(r.fired);
  });
  onLeave(off);
  onLeave(() => { rec.stop(); cancelAnimationFrame(raf); clearTimeout(flashT); game.clear?.(); });

  function showInput() {
    ph.innerHTML = keyboard
      ? `${icon("keyboard")}<span class="t-subhead">${esc(id === "duel" ? G.duelKeys : C.camera.keyboardOn)}</span>`
      : `${icon("camera")}<span class="t-subhead">${esc(C.camera.loading)}</span>`;
  }
  showInput();
  if (!keyboard || id === "duel") {
    rec.mount($("#cam"));
    rec.start().then((s) => {
      if (finished) return;
      if (s === "on") { keyboard = false; ph.innerHTML = ""; setStatus(esc(C.camera.noHand)); }
      else { keyboard = true; showInput(); if (store.data.input === "camera") toast(s === "denied" ? C.camera.denied : C.camera.unavailable); }
    });
  }

  // ----- clock -----
  const timer = $("#timer");
  const loop = (now) => {
    const dt = now - last; last = now;
    if (!paused && !finished) {
      const before = game instanceof Sprint ? game.target + game.misses + "|" + game.showHint : null;
      if (game.tick(dt)) { finish(true); return; }
      if (before !== null && before !== game.target + game.misses + "|" + game.showHint) render(true); // sprint miss / hint
      if (timer) { timer.textContent = mmss(game.timeLeft); timer.classList.toggle("low", game.timeLeft <= 10000); }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  render(true);
}

// ---------- S5 Results ----------
function Results() {
  const r = lastResult;
  if (!r) { location.hash = "#play"; return; }
  const id = r.id;
  const LABEL = { hits: C.results.letters, bestCombo: G.combo, avgMs: C.progress.avgTime, words: C.results.words, letters: C.results.letters,
    accuracy: C.results.accuracy, length: G.echoLength, peeks: G.echoPeek, solved: G.mysteryCount, score: G.score, lives: G.mysteryLives, p1: G.duelP1, p2: G.duelP2, level: C.blast.level, escapes: C.blast.escaped };
  const val = (k, v) => v === null || v === undefined ? "–" : k === "avgMs" ? (v / 1000).toFixed(1) + "s" : v;
  const isDaily = id === "daily";
  const title = id === "duel" ? (r.winner ? tx(G.duelWins, { player: r.winner === "left" ? G.duelP1 : G.duelP2 }) : G.duelDraw) : isDaily ? C.results.dailyTitle : null;
  view.innerHTML = `<section class="screen narrow" ${gameAttr(id)}>
    <div class="intro"><p class="eyebrow">${esc(gameTitle(id))}</p>${title ? `<h1 class="t-title1">${esc(title)}</h1>` : ""}</div>
    ${id === "duel" ? "" : `<div class="score-card"><span class="eyebrow">${esc(id === "echo" ? G.echoLength : C.results.score)}</span><span class="score-big grad-text" data-count="${r.score}">0</span>${r.newBest ? `<span class="badge">${icon("trophy")}${esc(C.results.best)}</span>` : ""}</div>`}
    <div class="stats">${r.stats.map(([k, v]) => stat(val(k, v), LABEL[k] || k)).join("")}</div>
    ${(r.lines || []).length ? `<div class="card">${r.lines.map((l) => `<p class="t-callout">${esc(l)}</p>`).join("")}</div>` : ""}
    ${id === "duel" || id === "mystery" ? "" : `<div class="section"><p class="eyebrow">${esc(C.results.hardest)}</p>
      ${r.practise.length ? `<div class="mini-tiles">${r.practise.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}">${L}</a>`).join("")}</div>` : `<p class="t-callout muted">${esc(C.results.hardestNone)}</p>`}</div>`}
    ${isDaily ? `<p class="t-callout muted">${esc(C.results.dailyBody)}</p>` : ""}
    <div class="actions">${isDaily ? `<a class="btn primary" href="#play">${esc(C.results.home)}</a>`
      : `<button class="btn primary" id="again">${esc(C.results.again)}</button><a class="btn text" href="#play">${esc(C.results.home)}</a>`}</div>
  </section>`;
  $("#again")?.addEventListener("click", () => startGame(id, pending?.opts || {}));
  countUp($(".score-big"));
  if (r.newBest) setTimeout(() => burst($(".score-card"), 28), 400);
}

// ---------- S6 Learn ----------
function Learn() {
  view.innerHTML = `<section class="screen">
    <div class="intro"><p class="eyebrow">${esc(C.learn.eyebrow)}</p><h1 class="t-large">${esc(C.learn.title)}</h1><p class="t-body muted">${esc(C.learn.body)}</p></div>
    <div class="tiles">${ALPHA.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}${SOLID.has(L) ? "" : ", " + esc(C.learn.beta)}">${L}</a>`).join("")}</div>
  </section>`;
}

// ---------- S7 Letter detail (+ personal model) ----------
function LetterDetail(L) {
  L = (L || "").toUpperCase();
  if (!HS.letters[L]) { location.hash = "#learn"; return; }
  const h = HS.letters[L], i = ALPHA.indexOf(L), cal = RCFG.calibration;
  const personal = () => store.samples(L).length >= cal.k;
  view.innerHTML = `<section class="screen narrow">
    <div class="spread">
      <a class="nav-back" href="#learn">${icon("chevron-left")}${esc(C.tabs.learn)}</a>
      <span class="row" style="gap:0"><a class="icon-btn" href="#letter-${ALPHA[(i + 25) % 26]}" aria-label="Previous letter">${icon("chevron-left")}</a><a class="icon-btn" href="#letter-${ALPHA[(i + 1) % 26]}" aria-label="Next letter">${icon("chevron-right")}</a></span>
    </div>
    <div class="letter-hero">
      <div class="letter-big pic" id="big">${handImg(L)}<span class="tl">${L}</span>${ringSvg()}</div>
      <div class="stack">
        <div class="row" style="gap:6px" id="badges">${store.box(L) >= 5 ? `<span class="badge">${esc(C.learn.mastered)}</span>` : ""}${personal() ? `<span class="badge">${esc(C.learn.personal)}</span>` : ""}</div>
        <h1 class="t-title2">${esc(h.short)}</h1>
        ${SOLID.has(L) ? "" : `<p class="t-footnote muted">${esc(C.learn.beta)}</p>`}
      </div>
    </div>
    <div class="section"><p class="eyebrow">${esc(C.learn.how)}</p><p class="t-body">${esc(h.how)}</p></div>
    <div class="cam" id="cam"><div class="placeholder" id="ph">${icon("camera")}</div><img class="ghost on" src="${HAND(L)}" alt="" aria-hidden="true"><span class="status" id="status" hidden></span></div>
    <div class="actions"><button class="btn primary" id="check">${esc(C.learn.check)}</button><button class="btn text" id="practise">${esc(C.learn.practise)}</button></div>
    <div class="card" id="teach">
      <div class="spread"><span class="t-headline">${esc(C.learn.teach)}</span>${personal() ? `<button class="btn text" id="forget">${esc(C.learn.forget)}</button>` : ""}</div>
      <p class="t-callout muted">${fmt(C.learn.teachBody, { n: cal.samplesPerLetter })}</p>
      <div class="meter" hidden id="meter"><i></i></div>
      <div><button class="btn secondary" id="record">${icon("circle-dot")}${esc(C.learn.teach)}</button></div>
    </div>
  </section>`;
  const status = $("#status"), big = $("#big");
  const setStatus = (t, ok = false) => { status.hidden = !t; status.textContent = t || ""; status.classList.toggle("ok", ok); };
  const hold = new HoldTracker(RCFG.stableFrames, RCFG.rearmFrames);
  let matched = false, recording = null;
  const off = rec.onFrame((f) => {
    if (recording) {
      if (f.hand && f.vec) {
        recording.push(f.vec.slice());
        const n = recording.length, need = cal.samplesPerLetter;
        $("#meter i").style.width = `${Math.round((n / need) * 100)}%`;
        setStatus(tx(C.learn.teaching, { done: n, n: need }));
        if (n >= need) {
          store.addSamples(L, recording, cal.maxSamples); recording = null;
          setStatus(tx(C.learn.taught, { letter: L }), true); toast(tx(C.learn.taught, { letter: L }));
          $("#record").disabled = false; $("#badges").innerHTML += personal() && !$("#badges").textContent.includes(C.learn.personal) ? `<span class="badge">${esc(C.learn.personal)}</span>` : "";
        }
      } else setStatus(C.camera.noHand);
      return;
    }
    const r = hold.push(f.letter === L ? L : f.letter);
    if (!f.hand) { setRing(big, 0); setStatus(C.camera.noHand); matched = false; return; }
    if (r.letter === L) {
      setRing(big, r.progress, r.progress >= 1);
      if (r.progress >= 1) { setStatus(tx(C.learn.match, { letter: L }), true); if (!matched) { matched = true; beep([880, 1320], 0.08); } }
      else setStatus(C.camera.holding);
    } else { setRing(big, 0); matched = false; setStatus(C.learn.notYet); }
  });
  onLeave(off); onLeave(() => rec.stop());
  async function camOn() {
    rec.mount($("#cam")); $("#ph").innerHTML = `<span class="t-subhead">${esc(C.camera.loading)}</span>`;
    const s = await rec.start();
    if (s === "on") { $("#ph").innerHTML = ""; $("#check").hidden = true; return true; }
    $("#ph").innerHTML = icon("camera"); toast(s === "denied" ? C.camera.denied : C.camera.unavailable); return false;
  }
  $("#check").onclick = async () => { const b = $("#check"); b.disabled = true; if (await camOn()) setStatus(C.learn.checking); else b.disabled = false; };
  $("#record").onclick = async () => {
    const b = $("#record"); b.disabled = true;
    if (rec.state !== "on" && !(await camOn())) { b.disabled = false; return; }
    recording = []; $("#meter").hidden = false; $("#meter i").style.width = "0%";
  };
  $("#forget")?.addEventListener("click", () => { store.forget(L); LetterDetail(L); });
  $("#practise").onclick = () => { practiceLetters = new Set([L]); startGame("practice", { letters: [L] }); };
}

// ---------- S8 Progress ----------
function Progress() {
  const d = store.data;
  const days = [];
  for (let k = 6; k >= 0; k--) { const dt = new Date(); dt.setDate(dt.getDate() - k); days.push(dt); }
  const totals = days.map((dt) => d.history.filter((x) => x.date === todayKey(dt)).reduce((s, x) => s + (x.letters || 0), 0));
  const max = Math.max(10, ...totals);
  const label = (dt) => dt.toLocaleDateString(undefined, { weekday: "narrow" });
  view.innerHTML = `<section class="screen">
    <div class="intro"><p class="eyebrow">${esc(C.progress.eyebrow)}</p><h1 class="t-large">${esc(C.progress.title)}</h1></div>
    <div class="stats">${stat(store.streakDays(), C.progress.streak)}${stat(`${store.mastered()}<span class="muted">/26</span>`, C.progress.mastered)}${stat(store.best("sprint"), C.progress.bestSprint)}</div>
    <div class="week-card">
      <p class="eyebrow">${esc(C.progress.week)}</p>
      ${d.history.length ? "" : `<p class="t-callout muted">${esc(C.progress.empty)}</p>`}
      <div class="week">${days.map((dt, i) => `<div class="day${i === 6 ? " today" : ""}" title="${totals[i]}"><div class="bar-wrap"><div class="bar${totals[i] ? " has" : ""}" style="height:${Math.max(4, Math.round((totals[i] / max) * 100))}%"></div></div><span class="lbl">${esc(label(dt))}</span></div>`).join("")}</div>
    </div>
    <div class="section">
      <p class="eyebrow">${esc(C.home.gamesTitle)}</p>
      <div class="list">${["sprint", "spell", "echo", "mystery"].map((g) => `<a class="li" href="#game-${g}" style="text-decoration:none;color:inherit"><span class="row" style="gap:12px"><span class="badge-icon" style="width:32px;height:32px">${icon(GAMES[g].icon)}</span><span class="t-headline">${esc(C.games[g].title)}</span></span><span class="t-subhead muted num">${esc(G.best)} ${store.best(g)}</span></a>`).join("")}</div>
    </div>
    <div class="section">
      <p class="eyebrow">${esc(C.progress.letters)}</p>
      <div class="tiles">${ALPHA.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}, box ${store.box(L)} of 5">${L}</a>`).join("")}</div>
    </div>
  </section>`;
}

// ---------- S9 Settings ----------
function Settings() {
  const d = store.data;
  const seg = (sid, opts, cur) => `<span class="seg" role="group" id="${sid}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join("")}</span>`;
  const accents = Object.entries(TOK.accents).filter(([k]) => !k.startsWith("$") && k !== "default");
  const dark = root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  view.innerHTML = `<section class="screen narrow">
    <div class="intro"><h1 class="t-large">${esc(C.settings.title)}</h1></div>
    <div class="list">
      <div class="li"><span class="t-headline">${esc(C.settings.appearance)}</span>${seg("appearance", [["system", C.settings.system], ["light", C.settings.light], ["dark", C.settings.dark]], d.appearance)}</div>
      <div class="li col"><span class="t-headline">${esc(C.settings.accent)}</span>
        <div class="swatches" id="accent" role="group">${accents.map(([k, a]) => `<button type="button" class="swatch" data-v="${k}" style="--sw:${dark ? a.dark : a.light}" aria-label="${esc(a.name)}" aria-pressed="${k === d.accent}" title="${esc(a.name)}"></button>`).join("")}</div></div>
    </div>
    <div class="list">
      <div class="li"><span class="t-headline">${esc(C.settings.hand)}</span>${seg("hand", [["left", C.settings.handLeft], ["right", C.settings.handRight]], d.hand)}</div>
      <div class="li"><span class="t-headline">${esc(C.settings.input)}</span>${seg("input", [["camera", C.settings.inputCamera], ["keyboard", C.settings.inputKeyboard]], d.input || "camera")}</div>
      <div class="li"><span class="t-headline">${esc(C.settings.sound)}</span>${seg("sound", [["on", C.settings.on], ["off", C.settings.off]], d.sound ? "on" : "off")}</div>
    </div>
    <div class="list"><button class="li" id="reset"><span class="t-headline danger">${esc(C.settings.reset)}</span></button></div>
    <p class="t-footnote muted">${esc(C.settings.privacy)}</p>
  </section>`;
  const bind = (sid, apply) => $(`#${sid}`).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $(`#${sid}`).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply(b.dataset.v);
  });
  bind("appearance", (v) => { store.set({ appearance: v }); applyTheme(); Settings(); });
  bind("accent", (v) => { store.set({ accent: v }); applyTheme(); });
  bind("hand", (v) => store.set({ hand: v }));
  bind("input", (v) => store.set({ input: v }));
  bind("sound", (v) => { store.set({ sound: v === "on" }); if (v === "on") beep([880]); });
  $("#reset").onclick = async () => {
    const v = await sheet({ title: C.settings.reset, body: C.settings.resetConfirm, actions: [
      { label: C.settings.reset, kind: "destructive", value: true },
      { label: C.common.cancel, kind: "text", value: false, cancel: true },
    ] });
    if (v) { store.reset(); toast(C.settings.resetDone); }
  };
}

// ---------- E1 Echo level path ----------
function EchoPath() {
  const E = C.echo, hi = echoHighest(), next = hi + 1, last = Math.max(10, hi + 6);
  let html = "", prevStage = null;
  for (let n = 1; n <= last; n++) {
    const L = new EchoLevel(n), st = n <= hi ? "cleared" : n === next ? "next" : "locked";
    if (L.stage !== prevStage) { html += `<p class="eyebrow path-stage">${esc(E.stages[L.stage])}</p>`; prevStage = L.stage; }
    const stars = echoStars(n);
    const x = Math.round(Math.sin(n * 0.9) * 34);
    html += `<a class="node ${st}${L.isBoss ? " boss" : ""}" style="--x:${x}%" ${st === "locked" ? `aria-disabled="true" title="${esc(E.locked)}"` : `href="#echo-${n}"`} aria-label="${fmt(E.level, { level: n })}${L.isBoss ? ", " + esc(E.boss) : ""}">
      <span class="disc">${st === "locked" ? icon("lock") : L.isBoss ? `${icon("crown")}<b>${n}</b>` : n}</span>
      ${st === "cleared" ? `<span class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? "on" : ""}">${icon("star")}</span>`).join("")}</span>` : ""}
    </a>`;
  }
  view.innerHTML = `<section class="screen narrow" ${gameAttr("echo")}>
    <a class="nav-back" href="#play">${icon("chevron-left")}${esc(C.tabs.play)}</a>
    <div class="banner" ${gameAttr("echo")}>
      <div class="floaters" aria-hidden="true"><span>E</span><span>C</span><span>O</span></div>
      <span class="big-icon">${icon("repeat")}</span>
      <h1 class="t-large">${esc(E.mapTitle)}</h1>
      <p class="t-body">${esc(E.mapBody)}</p>
    </div>
    <div class="stats"><div class="stat"><span class="n">${echoTotalStars()}</span><span class="l">${esc(E.starsTotal)}</span></div><div class="stat"><span class="n">${hi}</span><span class="l">${esc(E.bestLevel)}</span></div><div class="stat"><span class="n">${next}</span><span class="l">${esc(fmt(E.level, { level: "" }).trim())}</span></div></div>
    <div ${gameAttr("echo")}><a class="btn primary" href="#echo-${next}">${icon("play")}${fmt(E.continue, { level: next })}</a></div>
    <div class="path">${html}</div>
  </section>`;
  setTimeout(() => view.querySelector(".node.next")?.scrollIntoView({ block: "center", behavior: "smooth" }), 400);
}

// ---------- E2 Echo play + E3 result ----------
function EchoPlay(arg) {
  const n = Math.max(1, parseInt(arg, 10) || 1);
  if (n > echoHighest() + 1) { location.hash = "#game-echo"; return; }
  if (!store.data.input) { pending = { id: "echo", next: `#echo-${n}` }; location.hash = "#camera"; return; }
  const E = C.echo, level = new EchoLevel(n);
  let keyboard = store.data.input !== "camera", finished = false;
  const what = level.usesWords ? (level.items === 1 ? E.itemsWord : fmt(E.itemsWords, { count: level.items })) : fmt(E.itemsLetters, { count: level.items });
  view.innerHTML = `<section class="screen narrow" ${gameAttr("echo")}>
    <div class="play-bar">
      <span class="title"><span class="badge-icon grad">${icon(level.isBoss ? "crown" : "repeat")}</span><span class="stack" style="gap:0"><span class="t-headline">${fmt(E.level, { level: n })}</span><span class="t-footnote muted">${esc(level.isBoss ? E.boss : E.stages[level.stage])}</span></span></span>
      <div class="right"><span class="hearts" id="hearts"></span><a class="icon-btn" href="#game-echo" aria-label="${esc(E.map)}">${icon("x")}</a></div>
    </div>
    <div class="stage" ${gameAttr("echo")} id="stage">
      <div class="spread"><span class="t-footnote muted" id="round"></span><button class="btn text" id="again">${esc(E.showAgain)}</button></div>
      <div class="meter"><i id="prog"></i></div>
      <div id="area" class="stack-md"></div>
      <p class="flash" id="flash" aria-live="polite"></p>
      <div class="cam" id="cam"><div class="placeholder" id="ph"></div><span class="status" id="status" hidden></span></div>
      <p class="t-footnote muted" style="text-align:center">${esc(fmt(E.intro, { rounds: level.rounds, items: what }).replace(/&#39;/g, "'"))}</p>
    </div>
  </section>`;
  const area = $("#area"), status = $("#status"), ph = $("#ph"), flash = $("#flash");
  const run = new EchoRun({ level: n, solid: RCFG.solid, pools: echoPools(WL.words, RCFG.solid), C: E, onChange: (ev) => {
    if (ev === "tick") beep([660]);
    if (ev === "hit") { beep([880]); queueMicrotask(() => burst($("#area .slot.just"), 8)); }
    if (ev === "round") { beep([660, 990], 0.1); queueMicrotask(() => burst($("#area"), 18)); }
    queueMicrotask(draw);
  } });
  function draw() {
    if (finished) return;
    if (run.phase === "cleared" || run.phase === "failed") { result(); return; }
    $("#hearts").innerHTML = [0, 1, 2].map((i) => `<span class="${i < run.hearts ? "full" : "lost"}">${icon("heart")}</span>`).join("");
    $("#round").textContent = tx(E.round, { n: run.round, total: level.rounds });
    $("#prog").style.width = `${((run.round - 1) / level.rounds) * 100}%`;
    const again = $("#again"); again.disabled = run.showAgainUsed || run.phase !== "input";
    flash.textContent = run.note || ""; flash.className = "flash";
    if (run.phase === "watch") {
      const item = run.shownIndex !== null ? run.items[run.shownIndex] : null;
      area.innerHTML = (item && level.usesWords
        ? `<div class="word echo-word lit">${[...item].map((ch) => `<span class="ch">${ch}</span>`).join("")}</div>`
        : `<div class="target ${item ? "lit pop" : "dim"}" id="tgt">${item || "•"}</div>`)
        + `<p class="t-callout muted" style="text-align:center">${esc(E.watch)}</p>`;
    } else {
      let k = 0;
      area.innerHTML = `<div class="slots" id="tgt">${run.items.map((it) => `<span class="slot-group">${[...it].map(() => { const i = k++; return `<span class="slot ${i < run.entered ? "done" : i === run.entered ? "cur" : ""}${i === run.entered - 1 ? " just" : ""}">${i < run.entered ? run.targets[i] : ""}</span>`; }).join("")}</span>`).join("")}</div>
        <p class="t-callout muted" style="text-align:center">${esc(E.yourTurn)} · ${fmt(E.signLetter, { n: Math.min(run.entered + 1, run.targets.length), total: run.targets.length })}</p>`;
    }
  }
  function result() {
    finished = true; run.clear(); rec.stop();
    const ok = run.phase === "cleared";
    if (ok) store.recordGame({ mode: "echo", score: 0, letters: run.targets.length * level.rounds, accuracy: null });
    view.innerHTML = `<section class="screen narrow" ${gameAttr("echo")}>
      <div class="score-card">
        <span class="eyebrow">${esc(ok ? E.cleared : E.failed)}</span>
        <span class="t-title1">${fmt(E.level, { level: n })}</span>
        <span class="big-stars">${[0, 1, 2].map((i) => `<span class="${ok && i < run.stars ? "on" : ""}" style="--i:${i}">${icon("star")}</span>`).join("")}</span>
        ${ok ? "" : `<p class="t-callout muted">${fmt(E.failedBody, { sequence: run.items.join(" ") })}</p>`}
      </div>
      <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><span class="n">${Math.max(0, run.hearts)}</span><span class="l">${esc(E.heartsLeft)}</span></div><div class="stat"><span class="n">${esc(run.showAgainUsed ? E.yes : E.no)}</span><span class="l">${esc(E.shownAgain)}</span></div></div>
      <div class="actions">
        ${ok ? `<a class="btn primary" href="#echo-${n + 1}">${esc(E.next)}</a><button class="btn text" id="replay">${esc(E.replay)}</button>` : `<button class="btn primary" id="replay">${esc(E.retry)}</button>`}
        <a class="btn text" href="#game-echo">${esc(E.map)}</a>
      </div>
    </section>`;
    $("#replay").onclick = () => route();
    if (ok) setTimeout(() => burst($(".score-card"), run.stars === 3 ? 30 : 16), 300);
  }
  $("#again").onclick = () => run.showAgain();

  // input (same 8-frame hold as every game)
  const hold = new HoldTracker(RCFG.stableFrames, RCFG.rearmFrames);
  const setStatus = (html) => { status.hidden = !html; status.innerHTML = html || ""; };
  const off = rec.onFrame((f) => {
    if (keyboard || finished || run.phase !== "input") { hold.reset(); return; }
    const r = hold.push(f.letter);
    if (!f.hand) setStatus(esc(C.camera.noHand));
    else if (r.letter) { setStatus(`<span class="sig">${r.letter}${ringSvg()}</span>`); setRing(status.querySelector(".sig"), r.progress); }
    else setStatus("");
    if (r.fired) run.sign(r.fired);
  });
  const onKey = (e) => {
    if (!keyboard || finished || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (k.length === 1 && k >= "A" && k <= "Z") { e.preventDefault(); run.sign(k); }
  };
  document.addEventListener("keydown", onKey);
  onLeave(() => { off(); document.removeEventListener("keydown", onKey); run.clear(); rec.stop(); finished = true; });
  ph.innerHTML = keyboard ? `${icon("keyboard")}<span class="t-subhead">${esc(C.camera.keyboardOn)}</span>` : `${icon("camera")}<span class="t-subhead">${esc(C.camera.loading)}</span>`;
  if (!keyboard) {
    rec.mount($("#cam"));
    rec.start().then((s) => {
      if (finished) return;
      if (s === "on") { ph.innerHTML = ""; setStatus(esc(C.camera.noHand)); }
      else { keyboard = true; ph.innerHTML = `${icon("keyboard")}<span class="t-subhead">${esc(C.camera.keyboardOn)}</span>`; toast(s === "denied" ? C.camera.denied : C.camera.unavailable); }
    });
  }
  draw();
}

// ---------- Signblast (the original falling-letters shooter, web/js/blast.js) ----------
function BlastPlay(opts = {}) {
  const B = C.blast;
  let keyboard = store.data.input !== "camera", finished = false, paused = false;
  view.innerHTML = `<section class="screen blast-screen" ${gameAttr("blast")}>
    <div class="play-bar">
      <span class="title"><span class="badge-icon grad">${icon("rocket")}</span><span class="t-headline">${esc(gameTitle("blast"))}</span></span>
      <div class="right"><span class="hearts" id="lives"></span><button class="icon-btn" id="pause" aria-label="${esc(C.play.pause)}">${icon("pause")}</button></div>
    </div>
    <div class="blast-grid">
      <div class="blast-board"><canvas id="board" aria-label="${esc(B.boardLabel)}"></canvas></div>
      <div class="blast-side">
        <div class="blast-hud">${chip("b-score", 0, G.score, "accent")}${chip("b-level", opts.level || 1, B.level)}${chip("b-mult", "×1", G.multiplier)}</div>
        <div class="cam" id="cam"><div class="placeholder" id="ph"></div><span class="status" id="status" hidden></span></div>
        <p class="t-footnote muted">${esc(keyboard ? B.tipKeys : B.tipCamera)}</p>
      </div>
    </div>
  </section>`;
  const status = $("#status"), ph = $("#ph");
  const game = new Blast($("#board"), {
    box: (L) => store.box(L), setBox: (L, n) => store.setBox(L, n),
    hint: (L) => (HS.letters[L]?.short || "").toUpperCase(), T: B,
    sound: (k) => beep({ hit: [880], nope: [220], miss: [196, 147], level: [660, 880, 1100], over: [440, 330, 220] }[k] || [440]),
    onHud: (h) => {
      if (finished) return;
      $("#b-score").textContent = h.score; $("#b-level").textContent = h.level; $("#b-mult").textContent = `×${h.mult}`;
      $("#lives").innerHTML = [0, 1, 2].map((i) => `<span class="${i < h.lives ? "full" : "lost"}">${icon("heart")}</span>`).join("");
    },
    onEnd: (r) => {
      finished = true; rec.stop();
      const acc = r.accuracy === null ? null : Math.round(r.accuracy * 100) + "%";
      const { newBest } = store.recordGame({ mode: "blast", score: r.score, letters: r.hits, accuracy: r.accuracy });
      lastResult = { id: "blast", score: r.score, newBest, practise: r.toPractise, lines: [],
        stats: [["level", r.level], ["hits", r.hits], ["bestCombo", r.bestCombo], ["accuracy", acc], ["avgMs", r.avgMs]] };
      setTimeout(() => { if (location.hash === "#run-blast") location.hash = "#results"; }, 900);
    },
  });

  async function pause() {
    if (finished || paused || !game.pause()) return;
    paused = true;
    const v = await sheet({ title: C.play.paused, actions: [
      { label: C.play.resume, kind: "primary", value: "resume", cancel: true },
      { label: C.play.end, kind: "text", value: "end" },
    ] });
    paused = false;
    if (v === "end") game.end(); else game.resume();
  }
  $("#pause").onclick = pause;
  const onVis = () => { if (document.hidden) pause(); };
  document.addEventListener("visibilitychange", onVis);

  // input: keyboard (A–Z) or the camera's 8-frame hold, same as every game
  const onKey = (e) => {
    if (e.key === "Escape" || e.key === " ") { e.preventDefault(); pause(); return; }
    if (!keyboard || finished || paused || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (k.length === 1 && k >= "A" && k <= "Z") { e.preventDefault(); game.sign(k); }
  };
  document.addEventListener("keydown", onKey);
  const hold = new HoldTracker(RCFG.stableFrames, RCFG.rearmFrames);
  const setStatus = (html) => { status.hidden = !html; status.innerHTML = html || ""; };
  const off = rec.onFrame((f) => {
    if (keyboard || finished || paused) { hold.reset(); return; }
    const r = hold.push(f.letter);
    if (!f.hand) setStatus(esc(C.camera.noHand));
    else if (r.letter) { setStatus(`<span class="sig">${r.letter}${ringSvg()}</span>`); setRing(status.querySelector(".sig"), r.progress); }
    else setStatus("");
    if (r.fired) game.sign(r.fired);
  });
  onLeave(() => { finished = true; game.stop(); off(); document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); rec.stop(); });

  ph.innerHTML = keyboard ? `${icon("keyboard")}<span class="t-subhead">${esc(C.camera.keyboardOn)}</span>` : `${icon("camera")}<span class="t-subhead">${esc(C.camera.loading)}</span>`;
  if (!keyboard) {
    rec.mount($("#cam"));
    rec.start().then((s) => {
      if (finished) return;
      if (s === "on") { ph.innerHTML = ""; setStatus(esc(C.camera.noHand)); }
      else { keyboard = true; ph.innerHTML = `${icon("keyboard")}<span class="t-subhead">${esc(C.camera.keyboardOn)}</span>`; toast(s === "denied" ? C.camera.denied : C.camera.unavailable); }
    });
  }
  // The pixel font must be ready before the canvas draws letters; don't wait more than a second for it.
  Promise.race([document.fonts?.load('12px "Press Start 2P"'), new Promise((r) => setTimeout(r, 1000))]).catch(() => {})
    .then(() => { if (!finished) game.start(Math.min(BLAST_LEVELS.length, Math.max(1, opts.level || 1))); });
}

// ---------- Motion layer: bursts, count-up, spotlight, tilt, scroll reveal ----------
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function burst(el, n = 12) {
  if (!el || reduceMotion()) return;
  const b = document.createElement("span"); b.className = "burst";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 60 + Math.random() * 60;
    const p = document.createElement("i");
    p.style.setProperty("--dx", `${Math.cos(a) * d}px`); p.style.setProperty("--dy", `${Math.sin(a) * d}px`);
    p.style.width = p.style.height = `${5 + Math.random() * 6}px`;
    b.appendChild(p);
  }
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.appendChild(b); setTimeout(() => b.remove(), 800);
}
function countUp(el) {
  if (!el) return;
  const end = +el.dataset.count || 0;
  if (reduceMotion() || end === 0) { el.textContent = end; return; }
  const t0 = performance.now(), dur = 900;
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { el.textContent = end; }, dur + 150); // never leave the real score unshown
}
document.addEventListener("pointermove", (e) => {
  const s = e.target.closest?.(".spot, .tilt");
  if (!s) return;
  const r = s.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  s.style.setProperty("--mx", `${x}px`); s.style.setProperty("--my", `${y}px`);
  if (s.classList.contains("tilt") && !reduceMotion() && e.pointerType === "mouse") {
    s.style.setProperty("--ry", `${((x / r.width) - 0.5) * 8}deg`); s.style.setProperty("--rx", `${(0.5 - (y / r.height)) * 8}deg`);
  }
}, { passive: true });
document.addEventListener("pointerout", (e) => {
  const s = e.target.closest?.(".tilt");
  if (s && !s.contains(e.relatedTarget)) { s.style.setProperty("--rx", "0deg"); s.style.setProperty("--ry", "0deg"); }
});
let revealIO = null;
function setupReveal() {
  revealIO?.disconnect();
  if (reduceMotion() || !("IntersectionObserver" in window)) return;
  revealIO = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add("reveal-in"); en.target.classList.remove("reveal-pre"); revealIO.unobserve(en.target);
  }), { rootMargin: "0px 0px -8% 0px" });
  view.querySelectorAll("[data-reveal]").forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // already on screen: leave it fully visible
    el.classList.add("reveal-pre"); revealIO.observe(el);
  });
}

// ---------- Router ----------
const ROUTES = { play: Home, echo: EchoPlay, game: GameIntro, camera: CameraSetup, practice: PracticeSetup, run: Run, results: Results, learn: Learn, letter: LetterDetail, progress: Progress, settings: Settings };
const TAB_OF = { play: "play", echo: "play", game: "play", camera: "play", practice: "play", run: "play", results: "play", learn: "learn", letter: "learn", progress: "progress" };
const FOCUS = new Set(["camera", "run", "results", "echo"]);
const TITLES = { learn: C.tabs.learn, letter: C.tabs.learn, progress: C.tabs.progress, settings: C.settings.title, practice: C.games.practice.title, results: C.results.eyebrow, camera: C.camera.title };

function route() {
  cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); cleanups = [];
  document.getElementById("sheet").hidden = true;
  const h = location.hash.slice(1) || "play";
  const [name, arg] = h.split("-");
  const key = ROUTES[name] ? name : "play";
  document.querySelectorAll(".tabs a").forEach((a) => { if (a.dataset.tab === TAB_OF[key]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.body.classList.toggle("focus-mode", FOCUS.has(key));
  const t = TITLES[key] || (key === "game" || key === "run" ? C.games[arg]?.title : "");
  document.title = t ? `${t} · ${C.app.name}` : C.app.name;
  const render = () => { ROUTES[key](arg); window.scrollTo(0, 0); view.focus({ preventScroll: true }); setupReveal(); };
  // View transition when available, but never let it hold the screen hostage: if the browser defers the callback
  // (background tab, busy frame), render anyway after 200 ms. `once` makes sure it renders exactly one time.
  let done = false;
  const once = () => { if (!done) { done = true; render(); } };
  if (document.startViewTransition && !reduceMotion() && route.ready && document.visibilityState === "visible") {
    try { const vt = document.startViewTransition(once); [vt.ready, vt.finished, vt.updateCallbackDone].forEach((pr) => pr?.catch(() => {})); } catch { once(); }
    setTimeout(once, 200);
  } else once();
  route.ready = true;
}
window.addEventListener("hashchange", route);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (location.hash === "#settings") Settings(); });
route();
