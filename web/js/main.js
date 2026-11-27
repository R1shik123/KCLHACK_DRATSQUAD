// Signblast website: router + screens S1–S9 and P1 (docs/PRODUCT.md). Vanilla JS, no build step.
import { Recognizer } from "./recognizer.js";
import { Game, dailyWords, HINT_AFTER_MS } from "./engine.js";
import { store, todayKey } from "./store.js";
import { icon } from "./icons.js";

const load = (p) => fetch(p, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
const [C, RCFG, HS, WL] = await Promise.all([
  load("../design/copy.json"), load("../design/recognizer.json"), load("../design/handshapes.json"), load("../design/words.json"),
]);

const ALPHA = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const SOLID = new Set(RCFG.solid);
const view = document.getElementById("view");
const rec = new Recognizer(RCFG);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s, v = {}) => esc(s).replace(/\{(\w+)\}/g, (_, k) => esc(v[k] ?? "")); // for innerHTML
const tx = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));      // for textContent
const $ = (sel) => view.querySelector(sel);

let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);
let pending = null;     // { mode, letters } waiting to start (S2 → S4)
let lastResult = null;  // S5 data
let practiceLetters = new Set(ALPHA);

document.getElementById("settings-btn").innerHTML = icon("settings");

// ---------- Sound (off by default on the website, see DESIGN.md §6) ----------
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
function setRing(root, p) { const f = root?.querySelector(".ring .fill"); if (f) f.style.strokeDashoffset = String(100 * (1 - Math.max(0, Math.min(1, p)))); }
const tileClass = (L) => `tile${SOLID.has(L) ? "" : " beta"}${store.box(L) >= 5 ? " mastered" : ""}`;
const stat = (n, l) => `<div class="stat"><span class="n">${n}</span><span class="l">${esc(l)}</span></div>`;
const modeTitle = (m) => C.modes[m].title;

function startMode(mode, letters) {
  if (mode === "daily" && store.data.daily[todayKey()]) { location.hash = "#play"; return; }
  pending = { mode, letters };
  location.hash = store.data.input ? "#game" : "#camera";
}

// ---------- S1 Home ----------
function Home() {
  const days = store.streakDays();
  const daily = store.data.daily[todayKey()];
  view.innerHTML = `<section class="screen">
    <div class="intro">
      <p class="eyebrow">${esc(C.home.eyebrow)}</p>
      <h1 class="t-large">${esc(C.home.title)}</h1>
      <p class="t-body muted">${esc(C.home.body)}</p>
    </div>
    <div><button class="btn primary" id="go-sprint">${esc(C.home.primary)}</button></div>
    <div class="stack">
      ${daily
        ? `<div class="mode" aria-disabled="true"><span class="copy"><span class="t-headline">${esc(C.modes.daily.title)}</span><span class="t-subhead muted">${fmt(C.home.dailyDone, { score: daily.score })}</span></span>${icon("check")}</div>`
        : `<button class="mode" id="go-daily"><span class="copy"><span class="t-headline">${esc(C.modes.daily.title)}</span><span class="t-subhead muted">${esc(C.modes.daily.body)}</span></span>${icon("chevron-right")}</button>`}
      <a class="mode" href="#practice"><span class="copy"><span class="t-headline">${esc(C.modes.practice.title)}</span><span class="t-subhead muted">${esc(C.modes.practice.body)}</span></span>${icon("chevron-right")}</a>
    </div>
    <p class="t-footnote muted row" style="gap:6px">${icon("flame")} ${days ? fmt(C.home.streak, { n: days }) : esc(C.home.streakNone)}</p>
  </section>`;
  $("#go-sprint").onclick = () => startMode("sprint");
  $("#go-daily")?.addEventListener("click", () => startMode("daily"));
}

// ---------- S2 Camera setup ----------
function CameraSetup() {
  if (!pending) { location.hash = "#play"; return; }
  view.innerHTML = `<section class="screen narrow setup">
    <div class="icon-circle">${icon("camera")}</div>
    <div class="intro">
      <h1 class="t-large">${esc(C.camera.title)}</h1>
      <p class="t-body muted">${esc(C.camera.body)}</p>
    </div>
    <div class="actions"><button class="btn primary" id="allow">${esc(C.camera.primary)}</button></div>
    <button class="btn text" id="kbd">${esc(C.camera.keyboard)}</button>
    <p class="t-footnote muted note" id="cam-msg" aria-live="polite"></p>
  </section>`;
  const msg = $("#cam-msg"), allow = $("#allow");
  allow.onclick = async () => {
    allow.disabled = true; msg.textContent = C.camera.loading;
    const s = await rec.start();
    if (s === "on") { store.set({ input: "camera" }); location.hash = "#game"; return; }
    allow.disabled = false;
    msg.textContent = s === "denied" ? C.camera.denied : C.camera.unavailable;
  };
  $("#kbd").onclick = () => { store.set({ input: "keyboard" }); location.hash = "#game"; };
}

// ---------- S3 Practice setup ----------
function PracticeSetup() {
  view.innerHTML = `<section class="screen">
    <a class="nav-back" href="#play">${icon("chevron-left")}${esc(C.tabs.play)}</a>
    <div class="intro">
      <p class="eyebrow">${esc(C.practice.eyebrow)}</p>
      <h1 class="t-large">${esc(C.practice.title)}</h1>
      <p class="t-body muted">${esc(C.practice.body)}</p>
    </div>
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
  $("#pick").onclick = (e) => {
    const b = e.target.closest(".tile"); if (!b) return;
    const L = b.dataset.l; practiceLetters.has(L) ? practiceLetters.delete(L) : practiceLetters.add(L); sync();
  };
  $("#all").onclick = () => { practiceLetters = new Set(ALPHA); sync(); };
  $("#none").onclick = () => { practiceLetters.clear(); sync(); };
  $("#go").onclick = () => startMode("practice", [...practiceLetters]);
  sync();
}

// ---------- S4 Play (+ P1 Pause sheet) ----------
function Play() {
  if (!pending) { location.hash = "#play"; return; }
  const { mode, letters } = pending;
  const game = new Game({
    mode, words: WL.words, solid: RCFG.solid, letters,
    daily: mode === "daily" ? dailyWords(WL.words, todayKey(), WL.daily.count) : null,
  });
  let keyboard = store.data.input !== "camera";
  let busy = false, paused = false, finished = false, run = 0, hintTimer = 0, raf = 0, last = performance.now();

  view.innerHTML = `<section class="screen narrow">
    <div class="play-bar">
      <span class="eyebrow">${esc(modeTitle(mode))}</span>
      <div class="right">${game.timeLeft !== null ? `<span class="timer" id="timer">1:00</span>` : ""}<button class="icon-btn" id="pause" aria-label="${esc(C.play.pause)}">${icon("pause")}</button></div>
    </div>
    <div class="word" id="word" aria-hidden="true"></div>
    <p class="focus-word" id="sr" aria-live="polite"></p>
    <div class="cam" id="cam"><div class="placeholder" id="ph"></div><span class="status" id="status" hidden></span></div>
    <div class="play-foot"><button class="btn text" id="hint">${esc(C.play.hint)}</button><button class="btn text" id="skip">${esc(C.play.skip)}</button></div>
    <div class="hint-card" id="hint-card" hidden></div>
    <div class="stats">${stat(`<span id="s-score">0</span>`, C.play.score)}${stat(`<span id="s-mult">×1</span>`, C.play.streak)}${stat(`<span id="s-words">0</span>`, C.play.words)}</div>
  </section>`;

  const wordEl = $("#word"), status = $("#status"), ph = $("#ph"), hintBtn = $("#hint"), hintCard = $("#hint-card");

  function setStatus(text, ok = false) { status.hidden = !text; status.textContent = text || ""; status.classList.toggle("ok", ok); }
  function renderWord(entering = false) {
    const w = game.word;
    wordEl.className = "word" + (entering ? " entering" : "");
    wordEl.innerHTML = [...w].map((ch, i) => i < game.idx ? `<span class="ch done">${ch}</span>`
      : i === game.idx ? `<span class="ch cur">${ch}${ringSvg()}</span>` : `<span class="ch next">${ch}</span>`).join("");
    $("#sr").textContent = `${w}. Sign ${game.letter}.`;
    run = 0; setRing(wordEl, 0);
    hintCard.hidden = true;
    clearTimeout(hintTimer); hintBtn.classList.remove("pulse");
    hintTimer = setTimeout(() => { hintBtn.classList.add("pulse"); }, HINT_AFTER_MS);
  }
  function renderStats() {
    $("#s-score").textContent = game.score; $("#s-mult").textContent = `×${game.mult}`; $("#s-words").textContent = game.words;
  }
  function showInput() {
    if (keyboard) {
      ph.innerHTML = `${icon("keyboard")}<span class="t-subhead">${esc(C.camera.keyboardOn)}</span>`;
      setStatus("");
    } else {
      ph.innerHTML = `${icon("camera")}<span class="t-subhead">${esc(C.camera.loading)}</span>`;
    }
  }

  function accept() {
    if (busy || finished || paused) return;
    busy = true;
    const cur = wordEl.querySelector(".cur .ring");
    cur?.classList.add("ok"); setRing(wordEl, 1);
    beep([880]);
    const r = game.accept();
    renderStats();
    setTimeout(() => {
      if (finished) return;
      if (!r.wordDone) { renderWord(); busy = false; return; }
      beep([660, 990], 0.1);
      $("#sr").textContent = C.play.wordDone;
      wordEl.classList.add("leaving");
      setTimeout(() => {
        if (finished) return;
        if (!game.nextWord()) { finish(); return; }
        renderWord(true); busy = false;
      }, 350);
    }, 300);
  }

  function finish(timeUp = false) {
    if (finished) return;
    finished = true; game.end();
    const r = game.result();
    const { newBest } = store.recordGame(r);
    lastResult = { ...r, newBest };
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

  hintBtn.onclick = () => {
    if (busy || finished) return;
    game.hint(); renderStats(); hintBtn.classList.remove("pulse");
    const L = game.letter, h = HS.letters[L];
    hintCard.innerHTML = `<span class="big">${L}</span><span class="stack" style="gap:2px"><span class="t-headline">${esc(h.short)}</span><span class="t-subhead muted">${esc(h.how)}</span></span>`;
    hintCard.hidden = false;
  };
  $("#skip").onclick = () => {
    if (busy || finished) return;
    const w = game.skip(); renderStats();
    if (!w) { finish(); return; }
    renderWord(true);
  };
  $("#pause").onclick = pause;

  const onKey = (e) => {
    if (e.key === "Escape") { pause(); return; }
    if (!keyboard || e.metaKey || e.ctrlKey || e.altKey || document.getElementById("sheet").hidden === false) return;
    const k = e.key.toUpperCase();
    if (k.length === 1 && k >= "A" && k <= "Z") {
      e.preventDefault();
      if (k === game.letter) accept();
    }
  };
  document.addEventListener("keydown", onKey);
  onLeave(() => document.removeEventListener("keydown", onKey));

  // Camera input
  const off = rec.onFrame((f) => {
    if (keyboard || busy || paused || finished) return;
    if (!f.hand) { run = 0; setRing(wordEl, 0); setStatus(C.camera.noHand); return; }
    if (f.letter === game.letter) {
      run++; setRing(wordEl, run / RCFG.stableFrames); setStatus(C.camera.holding);
      if (run >= RCFG.stableFrames) accept();
    } else {
      run = Math.max(0, run - 2); setRing(wordEl, run / RCFG.stableFrames); setStatus("");
    }
  });
  onLeave(off);
  onLeave(() => { rec.stop(); clearTimeout(hintTimer); cancelAnimationFrame(raf); });

  showInput();
  if (!keyboard) {
    rec.mount($("#cam"));
    rec.start().then((s) => {
      if (finished) return;
      if (s === "on") { ph.innerHTML = ""; setStatus(C.camera.noHand); }
      else { keyboard = true; showInput(); toast(s === "denied" ? C.camera.denied : C.camera.unavailable); }
    });
  }

  // Clock
  const timer = $("#timer");
  const loop = (now) => {
    const dt = now - last; last = now;
    if (!paused && !finished) {
      if (game.tick(dt)) { finish(true); return; }
      if (timer) {
        const s = Math.ceil(game.timeLeft / 1000);
        timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        timer.classList.toggle("low", s <= 10);
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  renderWord(true); renderStats();
}

// ---------- S5 Results ----------
function Results() {
  const r = lastResult;
  if (!r) { location.hash = "#play"; return; }
  const isDaily = r.mode === "daily";
  view.innerHTML = `<section class="screen narrow">
    <div class="intro">
      <p class="eyebrow">${esc(isDaily ? C.modes.daily.title : C.results.eyebrow)}</p>
      ${isDaily ? `<h1 class="t-title1">${esc(C.results.dailyTitle)}</h1>` : ""}
    </div>
    <div class="stack">
      <span class="score-big">${r.score}</span>
      <span class="t-footnote muted">${esc(C.results.score)}</span>
      ${r.newBest ? `<span class="badge">${esc(C.results.best)}</span>` : ""}
    </div>
    <div class="stats">${stat(r.words, C.results.words)}${stat(r.letters, C.results.letters)}${stat(Math.round(r.accuracy * 100) + "%", C.results.accuracy)}</div>
    <div class="section">
      <p class="eyebrow">${esc(C.results.hardest)}</p>
      ${r.hardest.length
        ? `<div class="mini-tiles">${r.hardest.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}">${L}</a>`).join("")}</div>`
        : `<p class="t-callout muted">${esc(C.results.hardestNone)}</p>`}
    </div>
    ${isDaily ? `<p class="t-callout muted">${esc(C.results.dailyBody)}</p>` : ""}
    <div class="actions">
      ${isDaily
        ? `<a class="btn primary" href="#play">${esc(C.results.home)}</a>`
        : `<button class="btn primary" id="again">${esc(C.results.again)}</button><a class="btn text" href="#play">${esc(C.results.home)}</a>`}
    </div>
  </section>`;
  $("#again")?.addEventListener("click", () => startMode(r.mode, r.mode === "practice" ? [...practiceLetters] : undefined));
}

// ---------- S6 Learn ----------
function Learn() {
  view.innerHTML = `<section class="screen">
    <div class="intro">
      <p class="eyebrow">${esc(C.learn.eyebrow)}</p>
      <h1 class="t-large">${esc(C.learn.title)}</h1>
      <p class="t-body muted">${esc(C.learn.body)}</p>
    </div>
    <div class="tiles">${ALPHA.map((L) => `<a class="${tileClass(L)}" href="#letter-${L}" aria-label="${L}${SOLID.has(L) ? "" : ", " + esc(C.learn.beta)}">${L}</a>`).join("")}</div>
  </section>`;
}

// ---------- S7 Letter detail ----------
function LetterDetail(L) {
  L = (L || "").toUpperCase();
  if (!HS.letters[L]) { location.hash = "#learn"; return; }
  const h = HS.letters[L];
  const i = ALPHA.indexOf(L);
  view.innerHTML = `<section class="screen narrow">
    <div class="spread">
      <a class="nav-back" href="#learn">${icon("chevron-left")}${esc(C.tabs.learn)}</a>
      <span class="row" style="gap:0">
        <a class="icon-btn" href="#letter-${ALPHA[(i + 25) % 26]}" aria-label="Previous letter">${icon("chevron-left")}</a>
        <a class="icon-btn" href="#letter-${ALPHA[(i + 1) % 26]}" aria-label="Next letter">${icon("chevron-right")}</a>
      </span>
    </div>
    <div class="letter-hero">
      <div class="letter-big" id="big">${L}${ringSvg()}</div>
      <div class="stack">
        ${store.box(L) >= 5 ? `<span class="badge">${esc(C.learn.mastered)}</span>` : ""}
        <h1 class="t-title2">${esc(h.short)}</h1>
        ${SOLID.has(L) ? "" : `<p class="t-footnote muted">${esc(C.learn.beta)}</p>`}
      </div>
    </div>
    <div class="section">
      <p class="eyebrow">${esc(C.learn.how)}</p>
      <p class="t-body">${esc(h.how)}</p>
    </div>
    <div class="cam" id="cam"><div class="placeholder" id="ph">${icon("camera")}</div><span class="status" id="status" hidden></span></div>
    <div class="actions">
      <button class="btn primary" id="check">${esc(C.learn.check)}</button>
      <button class="btn text" id="practise">${esc(C.learn.practise)}</button>
    </div>
  </section>`;
  const status = $("#status"), big = $("#big");
  const setStatus = (t, ok = false) => { status.hidden = !t; status.textContent = t || ""; status.classList.toggle("ok", ok); };
  let run = 0, matched = false;
  const off = rec.onFrame((f) => {
    if (!f.hand) { run = 0; setRing(big, 0); big.querySelector(".ring").classList.remove("ok"); setStatus(C.camera.noHand); matched = false; return; }
    if (f.letter === L) {
      run = Math.min(RCFG.stableFrames, run + 1); setRing(big, run / RCFG.stableFrames);
      if (run >= RCFG.stableFrames) {
        big.querySelector(".ring").classList.add("ok"); setStatus(tx(C.learn.match, { letter: L }), true);
        if (!matched) { matched = true; beep([880, 1320], 0.08); }
      } else setStatus(C.camera.holding);
    } else {
      run = Math.max(0, run - 2); setRing(big, run / RCFG.stableFrames); big.querySelector(".ring").classList.remove("ok");
      matched = false; setStatus(C.learn.notYet);
    }
  });
  onLeave(off); onLeave(() => rec.stop());
  $("#check").onclick = async () => {
    const b = $("#check"); b.disabled = true;
    rec.mount($("#cam")); $("#ph").innerHTML = `<span class="t-subhead">${esc(C.camera.loading)}</span>`;
    const s = await rec.start();
    if (s === "on") { $("#ph").innerHTML = ""; setStatus(C.learn.checking); b.hidden = true; }
    else { b.disabled = false; $("#ph").innerHTML = icon("camera"); toast(s === "denied" ? C.camera.denied : C.camera.unavailable); }
  };
  $("#practise").onclick = () => { practiceLetters = new Set([L]); startMode("practice", [L]); };
}

// ---------- S8 Progress ----------
function Progress() {
  const d = store.data;
  const days = [];
  for (let k = 6; k >= 0; k--) { const dt = new Date(); dt.setDate(dt.getDate() - k); days.push(dt); }
  const totals = days.map((dt) => d.history.filter((h) => h.date === todayKey(dt)).reduce((s, h) => s + (h.letters || 0), 0));
  const max = Math.max(10, ...totals);
  const label = (dt) => dt.toLocaleDateString(undefined, { weekday: "narrow" });
  view.innerHTML = `<section class="screen">
    <div class="intro">
      <p class="eyebrow">${esc(C.progress.eyebrow)}</p>
      <h1 class="t-large">${esc(C.progress.title)}</h1>
    </div>
    <div class="stats">${stat(store.streakDays(), C.progress.streak)}${stat(`${store.mastered()}<span class="muted">/26</span>`, C.progress.mastered)}${stat(d.best.sprint || 0, C.progress.bestSprint)}</div>
    <div class="section">
      <p class="eyebrow">${esc(C.progress.week)}</p>
      ${d.history.length ? "" : `<p class="t-callout muted">${esc(C.progress.empty)}</p>`}
      <div class="week">${days.map((dt, i) => `<div class="day${i === 6 ? " today" : ""}" title="${totals[i]}">
        <div class="bar-wrap"><div class="bar${totals[i] ? " has" : ""}" style="height:${Math.max(4, Math.round((totals[i] / max) * 100))}%"></div></div>
        <span class="lbl">${esc(label(dt))}</span></div>`).join("")}</div>
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
  const seg = (id, opts, cur) => `<span class="seg" role="group" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join("")}</span>`;
  view.innerHTML = `<section class="screen narrow">
    <div class="intro"><h1 class="t-large">${esc(C.settings.title)}</h1></div>
    <div class="list">
      <div class="li"><span class="t-headline">${esc(C.settings.hand)}</span>${seg("hand", [["left", C.settings.handLeft], ["right", C.settings.handRight]], d.hand)}</div>
      <div class="li"><span class="t-headline">${esc(C.settings.input)}</span>${seg("input", [["camera", C.settings.inputCamera], ["keyboard", C.settings.inputKeyboard]], d.input || "camera")}</div>
      <div class="li"><span class="t-headline">${esc(C.settings.sound)}</span>${seg("sound", [["on", C.settings.on], ["off", C.settings.off]], d.sound ? "on" : "off")}</div>
    </div>
    <div class="list"><button class="li" id="reset"><span class="t-headline danger">${esc(C.settings.reset)}</span></button></div>
    <p class="t-footnote muted">${esc(C.settings.privacy)}</p>
  </section>`;
  const bindSeg = (id, apply) => $(`#${id}`).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $(`#${id}`).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply(b.dataset.v);
  });
  bindSeg("hand", (v) => store.set({ hand: v }));
  bindSeg("input", (v) => store.set({ input: v }));
  bindSeg("sound", (v) => { store.set({ sound: v === "on" }); if (v === "on") beep([880]); });
  $("#reset").onclick = async () => {
    const v = await sheet({ title: C.settings.reset, body: C.settings.resetConfirm, actions: [
      { label: C.settings.reset, kind: "destructive", value: true },
      { label: C.common.cancel, kind: "text", value: false, cancel: true },
    ] });
    if (v) { store.reset(); toast(C.settings.resetDone); }
  };
}

// ---------- Router ----------
const ROUTES = { play: Home, camera: CameraSetup, practice: PracticeSetup, game: Play, results: Results, learn: Learn, letter: LetterDetail, progress: Progress, settings: Settings };
const TAB_OF = { play: "play", camera: "play", practice: "play", game: "play", results: "play", learn: "learn", letter: "learn", progress: "progress" };
const FOCUS = new Set(["camera", "game", "results"]);
const TITLES = { play: "", learn: C.tabs.learn, letter: C.tabs.learn, progress: C.tabs.progress, settings: C.settings.title, practice: C.modes.practice.title, game: C.play.eyebrow, results: C.results.eyebrow, camera: C.camera.title };

function route() {
  cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); cleanups = [];
  const h = location.hash.slice(1) || "play";
  const [name, arg] = h.split("-");
  const fn = ROUTES[name] || Home;
  const key = ROUTES[name] ? name : "play";
  document.querySelectorAll(".tabs a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.tab === TAB_OF[key]));
  document.querySelectorAll(".tabs a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  document.body.classList.toggle("focus-mode", FOCUS.has(key));
  document.title = TITLES[key] ? `${TITLES[key]} · ${C.app.name}` : C.app.name;
  fn(arg);
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
route();
