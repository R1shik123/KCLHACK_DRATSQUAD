// Signblast website: router + screens (docs/PRODUCT.md). Vanilla JS, no build step.
import { Recognizer, HoldTracker } from "./recognizer.js";
import { Sprint, Spell, Echo, Mystery, Duel, dailyWords } from "./games.js";
import { store, todayKey } from "./store.js";
import { icon } from "./icons.js";

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

document.getElementById("settings-btn").innerHTML = icon("settings");

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
  const order = ["sprint", "spell", "echo", "mystery", "duel", "practice"];
  view.innerHTML = `<section class="screen">
    <div class="hero">
      <div class="intro">
        <p class="eyebrow">${esc(C.home.eyebrow)}</p>
        <h1 class="t-large">${esc(C.home.title)}</h1>
        <p class="t-body muted">${esc(C.home.body)}</p>
      </div>
      <div class="hero-tile" aria-hidden="true"><span class="glyph" id="glyph">A</span>${ringSvg()}</div>
    </div>
    ${daily
      ? `<div class="featured" aria-disabled="true"><span class="copy"><span class="eyebrow">${esc(C.home.featured)}</span><span class="t-title2">${esc(C.games.daily.title)}</span><span class="t-subhead muted">${fmt(C.home.dailyDone, { score: daily.score })}</span></span><span class="chev">${icon("check")}</span></div>`
      : `<button class="featured" id="go-daily"><span class="copy"><span class="eyebrow">${esc(C.home.featured)}</span><span class="t-title2">${esc(C.games.daily.title)}</span><span class="t-subhead">${esc(C.games.daily.body)}</span></span><span class="chev">${icon("chevron-right")}</span></button>`}
    <div class="stack-md">
      <div class="section-head"><h2 class="t-title2">${esc(C.home.gamesTitle)}</h2><span class="t-footnote muted row" style="gap:6px">${icon("flame")} ${days ? fmt(C.home.streak, { n: days }) : esc(C.home.streakNone)}</span></div>
      <div class="games">${order.map((id) => `<a class="game-tile" href="#game-${id}">
        <span class="badge-icon">${icon(GAMES[id].icon)}</span>
        ${GAMES[id].best && store.best(id) ? `<span class="best">${fmt(C.home.best, { score: store.best(id) })}</span>` : ""}
        <span class="copy"><span class="t-headline">${esc(C.games[id].title)}</span><span class="t-subhead muted">${esc(C.games[id].body)}</span></span></a>`).join("")}</div>
    </div>
  </section>`;
  $("#go-daily")?.addEventListener("click", () => startGame("daily"));
  // Hero tile: cycle through the alphabet with the hold ring filling, like a sign being read.
  const tile = $(".hero-tile"), glyph = $("#glyph");
  let i = 0, p = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = setInterval(() => {
    if (reduce) return;
    p += 0.125;
    if (p <= 1) { setRing(tile, p, p >= 1); return; }
    glyph.classList.add("swap");
    setTimeout(() => { i = (i + 1) % 26; glyph.textContent = ALPHA[i]; glyph.classList.remove("swap"); p = 0; setRing(tile, 0); }, 250);
    p = -1;
  }, 160);
  onLeave(() => clearInterval(t));
}

// ---------- Game intro (ready card) ----------
function GameIntro(id) {
  if (!GAMES[id] || id === "daily") { location.hash = "#play"; return; }
  if (id === "practice") { PracticeSetup(); return; }
  const g = C.games[id];
  view.innerHTML = `<section class="screen narrow">
    <a class="nav-back" href="#play">${icon("chevron-left")}${esc(C.tabs.play)}</a>
    <div class="ready-head"><span class="badge-icon">${icon(GAMES[id].icon)}</span>
      <div class="stack" style="gap:2px"><h1 class="t-large">${esc(g.title)}</h1>${GAMES[id].best ? `<span class="t-footnote muted">${esc(G.best)} ${store.best(id)}</span>` : ""}</div></div>
    <p class="t-body muted">${esc(g.body)}</p>
    <div class="section"><p class="eyebrow">${esc(G.rules)}</p>
      <ol class="rules">${g.rules.map((r, i) => `<li><span class="n">${i + 1}</span><span>${esc(r)}</span></li>`).join("")}</ol></div>
    ${id === "sprint" ? `<div class="opt-row"><span class="t-headline">${esc(G.allLetters)}</span><span class="seg" id="pool"><button type="button" data-v="0" aria-pressed="${!sprintAll}">${esc(C.settings.off)}</button><button type="button" data-v="1" aria-pressed="${sprintAll}">${esc(C.settings.on)}</button></span></div>` : ""}
    ${id === "duel" ? `<p class="t-footnote muted">${esc(G.duelNeedCamera)} ${esc(G.duelKeys)}</p>` : ""}
    <div><button class="btn primary" id="go">${esc(G.start)}</button></div>
  </section>`;
  $("#pool")?.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    sprintAll = b.dataset.v === "1";
    $("#pool").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("#go").onclick = () => startGame(id, id === "sprint" ? { allLetters: sprintAll } : {});
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
    if (s === "on") { store.set({ input: "camera" }); location.hash = `#run-${pending.id}`; return; }
    allow.disabled = false;
    msg.textContent = s === "denied" ? C.camera.denied : C.camera.unavailable;
  };
  $("#kbd").onclick = () => { store.set({ input: "keyboard" }); location.hash = `#run-${pending.id}`; };
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

  view.innerHTML = `<section class="screen narrow">
    <div class="play-bar">
      <span class="eyebrow">${esc(gameTitle(id))}</span>
      <div class="right">${timed ? `<span class="timer" id="timer">${mmss(game.timeLeft)}</span>` : ""}<button class="icon-btn" id="pause" aria-label="${esc(C.play.pause)}">${icon("pause")}</button></div>
    </div>
    <div id="body" class="stack-md"></div>
    <p class="flash" id="flash" aria-live="polite"></p>
    <div class="cam" id="cam"><div class="placeholder" id="ph"></div>${id === "duel" ? `<span class="divider"></span><span class="side-tag l">${esc(G.duelP1)}</span><span class="side-tag r">${esc(G.duelP2)}</span>` : ""}<span class="status" id="status" hidden></span></div>
    <div class="play-foot" id="foot"></div>
    <div class="hint-card" id="hint-card" hidden></div>
  </section>`;
  const body = $("#body"), foot = $("#foot"), status = $("#status"), ph = $("#ph"), hintCard = $("#hint-card");

  // ----- per-game rendering -----
  const expected = () => game instanceof Sprint ? game.target : spellLike ? game.current : game instanceof Echo && game.phase === "input" ? game.sequence[game.entered] : null;
  function showHint(L) {
    const h = HS.letters[L]; if (!h) { hintCard.hidden = true; return; }
    hintCard.innerHTML = `<span class="big">${L}</span><span class="stack" style="gap:2px"><span class="t-headline">${esc(h.short)}</span><span class="t-subhead muted">${esc(h.how)}</span></span>`;
    hintCard.hidden = false;
  }
  function render(anim) {
    if (finished) return;
    if (game instanceof Sprint) {
      body.innerHTML = `<div class="chips">${chip("c1", game.score, G.score, "accent")}${chip("c2", "×" + game.multiplier, G.multiplier)}${chip("c3", game.combo, G.combo)}</div>
        <div class="target ${anim ? "pop" : ""}" id="tgt">${game.target}${ringSvg()}</div>`;
      foot.innerHTML = `<span></span><button class="btn text" id="skip">${esc(C.play.skip)}</button>`;
      game.showHint ? showHint(game.target) : (hintCard.hidden = true);
    } else if (spellLike) {
      const w = game.word || "";
      body.innerHTML = `<div class="chips">${chip("c1", game.score, G.score, "accent")}${chip("c2", game.wordsDone, C.play.words)}${chip("c3", game.lettersDone, C.results.letters)}</div>
        <div class="word ${anim ? "entering" : ""}" id="tgt">${[...w].map((ch, i) => i < game.pos ? `<span class="ch done">${ch}</span>` : i === game.pos ? `<span class="ch cur">${ch}${ringSvg()}</span>` : `<span class="ch next">${ch}</span>`).join("")}</div>`;
      foot.innerHTML = `<button class="btn text" id="hint">${esc(C.play.hint)}</button><button class="btn text" id="skip">${esc(C.play.skip)}</button>`;
      game.hintShown ? showHint(game.current) : (hintCard.hidden = true);
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
    accuracy: C.results.accuracy, length: G.echoLength, peeks: G.echoPeek, solved: G.mysteryCount, score: G.score, lives: G.mysteryLives, p1: G.duelP1, p2: G.duelP2 };
  const val = (k, v) => v === null || v === undefined ? "–" : k === "avgMs" ? (v / 1000).toFixed(1) + "s" : v;
  const isDaily = id === "daily";
  const title = id === "duel" ? (r.winner ? tx(G.duelWins, { player: r.winner === "left" ? G.duelP1 : G.duelP2 }) : G.duelDraw) : isDaily ? C.results.dailyTitle : null;
  view.innerHTML = `<section class="screen narrow">
    <div class="intro"><p class="eyebrow">${esc(gameTitle(id))}</p>${title ? `<h1 class="t-title1">${esc(title)}</h1>` : ""}</div>
    ${id === "duel" ? "" : `<div class="stack"><span class="score-big">${r.score}</span><span class="t-footnote muted">${esc(id === "echo" ? G.echoLength : C.results.score)}</span>${r.newBest ? `<span class="badge">${icon("trophy")}${esc(C.results.best)}</span>` : ""}</div>`}
    <div class="stats">${r.stats.map(([k, v]) => stat(val(k, v), LABEL[k] || k)).join("")}</div>
    ${(r.lines || []).length ? `<div class="card">${r.lines.map((l) => `<p class="t-callout">${esc(l)}</p>`).join("")}</div>` : ""}
    ${id === "duel" || id === "mystery" ? "" : `<div class="section"><p class="eyebrow">${esc(C.results.hardest)}</p>
      ${r.practise.length ? `<div class="mini-tiles">${r.practise.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}">${L}</a>`).join("")}</div>` : `<p class="t-callout muted">${esc(C.results.hardestNone)}</p>`}</div>`}
    ${isDaily ? `<p class="t-callout muted">${esc(C.results.dailyBody)}</p>` : ""}
    <div class="actions">${isDaily ? `<a class="btn primary" href="#play">${esc(C.results.home)}</a>`
      : `<button class="btn primary" id="again">${esc(C.results.again)}</button><a class="btn text" href="#play">${esc(C.results.home)}</a>`}</div>
  </section>`;
  $("#again")?.addEventListener("click", () => startGame(id, pending?.opts || {}));
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
      <div class="letter-big" id="big">${L}${ringSvg()}</div>
      <div class="stack">
        <div class="row" style="gap:6px" id="badges">${store.box(L) >= 5 ? `<span class="badge">${esc(C.learn.mastered)}</span>` : ""}${personal() ? `<span class="badge">${esc(C.learn.personal)}</span>` : ""}</div>
        <h1 class="t-title2">${esc(h.short)}</h1>
        ${SOLID.has(L) ? "" : `<p class="t-footnote muted">${esc(C.learn.beta)}</p>`}
      </div>
    </div>
    <div class="section"><p class="eyebrow">${esc(C.learn.how)}</p><p class="t-body">${esc(h.how)}</p></div>
    <div class="cam" id="cam"><div class="placeholder" id="ph">${icon("camera")}</div><span class="status" id="status" hidden></span></div>
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
    <div class="section">
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

// ---------- Router ----------
const ROUTES = { play: Home, game: GameIntro, camera: CameraSetup, practice: PracticeSetup, run: Run, results: Results, learn: Learn, letter: LetterDetail, progress: Progress, settings: Settings };
const TAB_OF = { play: "play", game: "play", camera: "play", practice: "play", run: "play", results: "play", learn: "learn", letter: "learn", progress: "progress" };
const FOCUS = new Set(["camera", "run", "results"]);
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
  ROUTES[key](arg);
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (location.hash === "#settings") Settings(); });
route();
