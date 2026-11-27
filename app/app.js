/* Signfall app shell: routing, storage, camera states, Learn, Play and Progress. */
import { Recognizer, ALL_LETTERS as LETTERS } from './recognizer.js';
import { Game, LEVEL_LETTERS, LEVELS, duelPlan } from './game.js';
import { Music } from './music.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HANDSHAPES = {
  F: 'Touch your index fingertip to your thumb tip in a circle. Hold the other three fingers up and apart.',
  U: 'Hold your index and middle fingers straight up and together. Fold the other fingers under your thumb.',
  W: 'Hold your index, middle and ring fingers up and spread. Touch your thumb to your little finger.',
  E: 'Curl all four fingertips down to rest on your thumb, tucked across your palm.',
  G: 'Point your index finger sideways with your thumb parallel above it, like a small pinch.',
  H: 'Point your index and middle fingers sideways, together, thumb tucked.',
  J: 'Make an I (little finger up) and draw a J in the air with it.',
  K: 'Index and middle fingers up in a V, with your thumb touching the middle finger between them.',
  M: 'Fold your thumb under your index, middle and ring fingers.',
  N: 'Fold your thumb under your index and middle fingers.',
  O: 'Curve all your fingertips to touch your thumb tip, making an O.',
  P: 'Make a K, then point it down.',
  Q: 'Make a G, then point it down.',
  R: 'Cross your middle finger over your index finger.',
  S: 'Make a fist with your thumb wrapped across the front of your fingers.',
  T: 'Make a fist with your thumb tucked between your index and middle fingers.',
  X: 'Raise your index finger and bend it into a hook.',
  Z: 'Point your index finger and draw a Z in the air.',
  A: 'Make a fist. Rest your thumb against the side of your index finger, pointing up.',
  B: 'Hold your four fingers straight up and together. Fold your thumb across your palm.',
  C: 'Curve your fingers and thumb into a C, as if holding a cup. Leave a gap between thumb and fingers.',
  D: 'Point your index finger straight up. Curl the other fingers down to touch your thumb tip, making a circle.',
  I: 'Make a fist and raise your little finger (pinky) straight up. Thumb rests across your fingers.',
  L: 'Point your index finger up and your thumb out to the side, making an L. Fold the other fingers.',
  V: 'Raise your index and middle fingers in a V, spread apart. Fold the other fingers under your thumb.',
  Y: 'Stretch your thumb and little finger out. Fold the three middle fingers down.',
};

// ---------- storage (localStorage, always wrapped) ----------
const KEY = 'signfall.v1';
const blank = () => ({ boxes: {}, letters: {}, days: {}, best: 0, reactions: [], games: 0, muted: false, history: [] });
let store = blank();
try { store = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { store = blank(); }
if (!Array.isArray(store.history)) store.history = [];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode etc. */ } };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const markToday = () => { const k = dayKey(); store.days[k] = (store.days[k] || 0) + 1; save(); };
const mastered = () => LETTERS.filter((L) => (store.boxes[L] || 0) >= 4).length;
function streak() {
  const d = new Date();
  if (!store.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (store.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- camera ----------
const rec = new Recognizer();
const camMessages = {
  off: () => `<strong>Camera off</strong><p>Turn it on to sign. Video stays on your device; nothing is uploaded.</p><button class="btn" type="button" data-cam-on>Turn on camera</button>`,
  loading: () => `<strong>Starting camera…</strong><p>Loading hand tracking. This takes a few seconds the first time.</p>`,
  denied: () => `<strong>Camera blocked</strong><p>Allow camera access in your browser's site settings, then try again. In Play you can still use keyboard practice.</p><button class="btn" type="button" data-cam-on>Try again</button>`,
  error: (e) => `<strong>Camera unavailable</strong><p>${esc(e || 'Something went wrong.')} In Play you can still use keyboard practice.</p><button class="btn" type="button" data-cam-on>Try again</button>`,
};
rec.onState((s, err) => {
  document.querySelectorAll('[data-cam-off]').forEach((el) => {
    el.hidden = s === 'on';
    if (s !== 'on') el.innerHTML = camMessages[s](err);
  });
  $('kbd-note').hidden = s === 'on' || s === 'loading';
  $('duel-kbd').hidden = s === 'on' || s === 'loading';
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-cam-on]')) rec.start(); });
const usePreview = (scope) => { rec.preview = scope?.querySelector('.cam-canvas') || null; };

// ---------- sound (8-bit blips) ----------
let actx = null;
function blip(kind) {
  if (store.muted) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const seq = { hit: [[880, .05], [1320, .07]], miss: [[220, .12], [140, .18]], level: [[523, .08], [659, .08], [784, .12]], over: [[392, .15], [330, .15], [262, .3]], nope: [[180, .06]], start: [[660, .06], [990, .08]] }[kind] || [];
    let t = actx.currentTime;
    for (const [f, d] of seq) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
      t += d;
    }
  } catch { /* audio unavailable */ }
}
function renderMute() {
  $('mute').textContent = store.muted ? '🔇' : '🔊';
  $('mute').setAttribute('aria-pressed', String(store.muted));
  $('mute').setAttribute('aria-label', store.muted ? 'Unmute sound' : 'Mute sound');
}
$('mute').addEventListener('click', () => { store.muted = !store.muted; save(); renderMute(); Music.setMuted(store.muted); });

// ---------- Home ----------
function renderHome() {
  $('home-mastered').textContent = mastered();
  const s = streak();
  $('home-streak').textContent = s;
  $('home-streak-unit').textContent = s === 1 ? 'day' : 'days';
  $('home-streak-note').textContent = store.days[dayKey()] ? 'You practised today. Nice.' : s ? 'Practise today to keep it going.' : 'Practise today to start a streak.';
}

// ---------- Learn ----------
let checkTarget = null;
function renderLearn() {
  $('letters').innerHTML = LETTERS.map((L) => {
    const box = store.boxes[L];
    return `<article class="card letter-card${learnFocus.includes(L) ? ' focus' : ''}">
      <span class="glyph" aria-hidden="true">${L}</span>
      <h2>Letter ${L}${box ? ` <span class="box">· box ${box} of 5</span>` : ''}</h2>
      <p>${HANDSHAPES[L]}</p>
      <button class="btn ghost" type="button" data-check="${L}">Check my sign</button>
    </article>`;
  }).join('');
}
$('letters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-check]');
  if (!b) return;
  openCheck(b.dataset.check);
});
function openCheck(L) {
  checkTarget = L;
  $('check').hidden = false;
  $('check-target').textContent = L;
  $('check-desc').textContent = HANDSHAPES[L];
  $('check-seen').textContent = '–'; $('check-tick').hidden = true; $('check-conf').textContent = 'No hand yet';
  usePreview($('check'));
  $('check').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  rec.start();
}
$('check-close').addEventListener('click', () => { $('check').hidden = true; checkTarget = null; usePreview(null); });
let checkPassed = false;
rec.onFrame((f) => {
  if (route === 'learn' && checkTarget) {
    $('check-seen').textContent = f.letter || (f.landmarks ? '?' : '–');
    $('check-conf').textContent = f.landmarks ? (f.letter ? `${Math.round(f.confidence * 100)}% confident` : 'Not sure yet, adjust your hand') : 'No hand in view';
    const ok = f.letter === checkTarget && f.hold >= 1;
    if (ok && $('check-tick').hidden) { $('check-tick').hidden = false; if (!checkPassed) { markToday(); checkPassed = true; } }
    if (f.letter !== checkTarget) { $('check-tick').hidden = true; checkPassed = false; }
  }
  if (route === 'duel' && f.split) {
    f.sides.forEach((x, i) => {
      $(`d${i}-seen`).textContent = x ? (x.letter || '?') : '–';
      $(`d${i}-hold`).style.width = `${Math.round((x?.letter ? x.hold : 0) * 100)}%`;
    });
  }
  if (route === 'play') {
    $('play-seen').textContent = f.letter || (f.landmarks ? '?' : '–');
    $('play-conf').textContent = f.landmarks ? (f.letter ? `${Math.round(f.confidence * 100)}% · hold ${Math.round(f.hold * 100)}%` : 'Not sure') : 'No hand in view';
    $('play-conf-bar').style.width = `${Math.round((f.letter ? f.confidence : 0) * 100)}%`;
  }
});

// ---------- Play ----------
const game = new Game($('game'), {
  boxes: store.boxes,
  sound: blip,
  onHud: (h) => {
    $('hud-score').textContent = h.score;
    $('hud-level').textContent = h.level;
    $('hud-lives').textContent = '♥'.repeat(Math.max(0, h.lives)) || '–';
    $('hud-combo').textContent = `x${h.mult}`;
    $('hud-letters').textContent = h.letters.join(' ');
    if (game?.state === 'play') Music.setLevel(h.level);
  },
  onEnd: (r) => {
    Music.stop();
    setLevelPickEnabled(true);
    // Log the round to Snowflake (server-side, key-pair auth); the app works the same offline.
    fetch('/api/rounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      score: r.score, level: r.level, practice: pickLevel || null, accuracy: r.accuracy, avg_ms: r.avgReaction, early: !!r.early,
      letters: lettersPayload(r.stats),
    }) }).catch(() => {});
    for (const [L, s] of Object.entries(r.stats)) {
      const t = (store.letters[L] ||= { hits: 0, misses: 0 });
      t.hits += s.hits; t.misses += s.misses;
    }
    store.best = Math.max(store.best || 0, r.score);
    store.reactions = store.reactions.concat(r.reactions).slice(-300);
    store.games++;
    markToday();
    showGameOver(r);
  },
});
const lettersPayload = (stats) => Object.fromEntries(Object.entries(stats).map(([L, s]) => [L, { hits: s.hits, misses: s.misses, times: s.times.map(Math.round) }]));
document.fonts?.load('16px "Press Start 2P"').then(() => {
  for (const g of [game, ...duelists]) if (g.state === 'idle') g.drawIdle();
}).catch(() => {});

const fmtS = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
let lastNext = [];
function showGameOver(r) {
  const rows = Object.entries(r.stats).map(([L, s]) => ({ L, hits: s.hits, misses: s.misses, avg: avg(s.times || []), slow: (s.times || []).length ? Math.max(...s.times) : null }))
    .sort((a, b) => a.L.localeCompare(b.L));
  const attempts = r.hits + r.escapes;
  store.history.push({ at: Date.now(), score: r.score, accuracy: r.accuracy, attempted: rows.length, early: !!r.early,
    letters: Object.fromEntries(rows.map((x) => [x.L, { hits: x.hits, misses: x.misses, avg: x.avg }])) });
  store.history = store.history.slice(-50);
  save();
  $('res-kicker').textContent = r.early ? 'Round ended early' : 'Game over';
  $('res-score').textContent = r.score.toLocaleString('en-GB');
  $('res-acc').textContent = attempts ? `${Math.round(100 * r.hits / attempts)}%` : '–';
  $('res-attempted').textContent = rows.length;
  const slow = rows.filter((x) => x.avg != null).sort((a, b) => b.avg - a.avg).slice(0, 5);
  const max = Math.max(1, ...slow.map((x) => x.avg));
  $('res-slow').innerHTML = slow.length ? slow.map((x) => `<div class="bar"><span>${x.L}</span><span class="track" role="img" aria-label="${x.L}: ${fmtS(x.avg)} average"><i style="width:${Math.round(100 * x.avg / max)}%"></i></span><small>${fmtS(x.avg)}</small></div>`).join('')
    : '<p class="muted small">No letters signed this round.</p>';
  $('res-table').innerHTML = rows.length ? `<tr><th>Letter</th><th>Signed</th><th>Missed</th><th>Avg time</th><th>Slowest</th></tr>` +
    rows.map((x) => `<tr><td>${x.L}</td><td>${x.hits}</td><td>${x.misses}</td><td>${fmtS(x.avg)}</td><td>${fmtS(x.slow)}</td></tr>`).join('')
    : '<tr><td class="muted">No letters reached this round.</td></tr>';
  // Practise next: most misses first, then slowest average.
  lastNext = rows.slice().sort((a, b) => b.misses - a.misses || (b.avg ?? 0) - (a.avg ?? 0)).filter((x) => x.misses || x.avg != null).slice(0, 3).map((x) => x.L);
  $('res-next').innerHTML = lastNext.length ? lastNext.map((L) => `<span class="chip">${L}</span>`).join('') : '<p class="muted small">Play a longer round to get suggestions.</p>';
  $('res-learn').hidden = !lastNext.length;
  setPlayButtons(false);
  $('overlay').innerHTML = `<p class="px big">SIGNBLAST</p><p class="px">Hold the sign to fire</p><button class="btn arcade-btn" id="start" type="button">PRESS START</button>`;
  $('overlay').hidden = false;
  location.hash = '#results';
}
function setPlayButtons(on) { $('pause').disabled = !on; $('end').disabled = !on; }
let pickLevel = 0;  // 0 = full run from level 1; 1..5 = practise that level only
$('level-pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lv]');
  if (!b || game.state === 'play' || game.state === 'paused') return;
  pickLevel = +b.dataset.lv;
  for (const x of $('level-pick').children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
  $('hud-letters').textContent = (pickLevel ? (LEVELS[pickLevel - 1].words || LEVELS[pickLevel - 1].letters) : LEVEL_LETTERS[0]).join(' ');
});
function setLevelPickEnabled(on) { for (const x of $('level-pick').children) x.disabled = !on; }
function startGame() {
  setLevelPickEnabled(false);
  $('overlay').hidden = true;
  blip('start');
  if (rec.state === 'off') rec.start();
  game.start(pickLevel || 1, pickLevel > 0);
  Music.setMuted(!!store.muted);
  Music.start(pickLevel || 1);
  setPlayButtons(true);
  $('pause').focus();
}
function pauseGame() {
  if (!game.pause()) return;
  Music.pause();
  $('overlay').innerHTML = `<p class="px big">PAUSED</p><div class="btn-row">
    <button class="btn arcade-btn" type="button" data-act="resume">RESUME</button>
    <button class="btn ghost-dark" type="button" data-act="restart">RESTART</button>
    <button class="btn ghost-dark" type="button" data-act="end">END GAME</button></div>`;
  $('overlay').hidden = false;
  $('overlay').querySelector('[data-act="resume"]').focus();
}
function resumeGame() { $('overlay').hidden = true; game.resume(); Music.resume(); }
function endEarly() {
  const wasPlaying = game.state === 'play';
  if (wasPlaying) game.pause();
  if (confirm('End this game and see your results?')) game.end(true);
  else if (wasPlaying) game.resume();
}
$('overlay').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.id === 'start' ? 'start' : b.dataset.act;
  if (act === 'start' || act === 'restart') { if (act === 'restart') { game.stop(); Music.stop(); setLevelPickEnabled(true); } startGame(); }
  if (act === 'resume') resumeGame();
  if (act === 'end') endEarly();
});
$('pause').addEventListener('click', () => (game.state === 'paused' ? resumeGame() : pauseGame()));
$('end').addEventListener('click', endEarly);
$('res-again').addEventListener('click', () => { location.hash = '#play'; startGame(); });
let learnFocus = [];
$('res-learn').addEventListener('click', () => { learnFocus = lastNext.slice(); location.hash = '#learn'; });
rec.onSign((L, source) => {
  if (route === 'play' && game.state === 'play') game.sign(L);
});
window.addEventListener('keydown', (e) => {
  if (route === 'duel') {
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && (duelists[0].state === 'play' || duelists[0].state === 'paused')) {
      e.preventDefault(); duelists[0].state === 'paused' ? resumeDuel() : pauseDuel(); return;
    }
    // No camera: letter keys play for Player 1, Shift + letter for Player 2.
    if (e.metaKey || e.ctrlKey || e.altKey || rec.state === 'on' || rec.state === 'loading') return;
    const L = e.key.toUpperCase();
    if (LETTERS.includes(L)) { e.preventDefault(); rec.emitSideSign(e.shiftKey ? 1 : 0, L); }
    return;
  }
  if (route === 'play' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P') && (game.state === 'play' || game.state === 'paused')) {
    e.preventDefault(); game.state === 'paused' ? resumeGame() : pauseGame(); return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || route !== 'play' || game.state !== 'play') return;
  if (rec.state === 'on' || rec.state === 'loading') return; // keyboard only when there is no camera
  const L = e.key.toUpperCase();
  if (LETTERS.includes(L)) { e.preventDefault(); rec.emitSign(L, 'keyboard'); }
});

// ---------- 1v1 (two players, one camera) ----------
const duelHud = (i) => (h) => {
  $(`d${i}-score`).textContent = h.score;
  $(`d${i}-lives`).textContent = '♥'.repeat(Math.max(0, h.lives)) || '–';
  $(`d${i}-combo`).textContent = `x${h.mult}`;
  if (h.timeLeft != null) $('duel-clock').textContent = Math.ceil(h.timeLeft);
};
const duelists = [0, 1].map((i) => {
  const g = new Game($(`duel-game-${i}`), { boxes: {}, sound: blip, onHud: duelHud(i), onEnd: (r) => duelEnded(i, r) });
  g.label = `PLAYER ${i + 1}`;
  return g;
});
let duelLevel = 1, duelNow = null, duelResults = [null, null], countdown = null;
const duelLive = () => duelists.some((g) => g.state === 'play' || g.state === 'paused') || countdown != null;
const duelIntro = () => `<p class="px big">1V1</p><p class="px">P1 LEFT · P2 RIGHT</p><button class="btn arcade-btn" type="button" data-dact="start">PRESS START</button>`;
function setDuelControls(playing) {
  $('duel-pause').disabled = !playing; $('duel-stop').disabled = !playing;
  for (const x of $('duel-pick').children) x.disabled = playing;
}
$('duel-pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lv]');
  if (!b || duelLive()) return;
  duelLevel = +b.dataset.lv;
  for (const x of $('duel-pick').children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
});
function startDuel() {
  if (duelLive()) return;
  duelResults = [null, null];
  if (rec.state === 'off') rec.start();
  rec.setSplit(true);
  duelNow = duelPlan(duelLevel);
  duelists.forEach((g, i) => { g.stop(); g.boxes = {}; g.drawIdle(); duelHud(i)({ score: 0, lives: 3, mult: 1, timeLeft: duelNow.duration }); });
  setDuelControls(true);
  $('duel-layout').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  let n = 3;
  const step = () => {
    if (route !== 'duel') return;
    if (n > 0) {
      $('duel-overlay').innerHTML = `<p class="px huge">${n}</p><p class="px">P1 LEFT · P2 RIGHT</p>`;
      blip('nope'); n--; countdown = setTimeout(step, 800); return;
    }
    countdown = null;
    $('duel-overlay').hidden = true;
    blip('start');
    duelists.forEach((g) => g.start(duelLevel, true, duelNow));  // same tick, same plan: identical boards
    Music.setMuted(!!store.muted); Music.start(duelLevel);
    $('duel-pause').focus();
  };
  $('duel-overlay').hidden = false;
  step();
}
function pauseDuel() {
  if (!duelists.map((g) => g.pause()).some(Boolean)) return;
  Music.pause();
  $('duel-overlay').innerHTML = `<p class="px big">PAUSED</p><div class="btn-row">
    <button class="btn arcade-btn" type="button" data-dact="resume">RESUME</button>
    <button class="btn ghost-dark" type="button" data-dact="stop">STOP</button></div>`;
  $('duel-overlay').hidden = false;
  $('duel-overlay').querySelector('[data-dact="resume"]').focus();
}
function resumeDuel() { $('duel-overlay').hidden = true; duelists.forEach((g) => g.resume()); Music.resume(); }
/** Stop without a result (leaving the screen, or the Stop button). */
function abortDuel() {
  clearTimeout(countdown); countdown = null;
  const was = duelists.some((g) => g.state !== 'idle' && g.state !== 'over');
  duelists.forEach((g) => { if (g.state !== 'over') { g.stop(); g.drawIdle(); } });
  if (was) Music.stop();
  setDuelControls(false);
  $('duel-overlay').innerHTML = duelIntro(); $('duel-overlay').hidden = false;
}
// Last one standing wins: a knockout ends the duel for both. If the clock runs out, the higher score wins.
function duelEnded(i, r) {
  duelResults[i] = r;
  const other = duelists[1 - i];
  if (other.state === 'play' || other.state === 'paused') { other.end(true); return; }
  if (!duelResults[0] || !duelResults[1]) return;
  const ko = duelists.map((g) => g.lives <= 0);
  const [a, b] = duelResults;
  let winner = -1, why = 'same score';
  if (ko[0] !== ko[1]) { winner = ko[0] ? 1 : 0; why = 'last one standing'; }
  else if (a.score !== b.score) { winner = a.score > b.score ? 0 : 1; why = ko[0] ? 'double knockout: higher score' : 'time up: higher score'; }
  Music.stop();
  markToday();
  setDuelControls(false);
  fetch('/api/duels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    level: duelNow.level, seed: duelNow.seed, winner: winner + 1, reason: why,
    players: duelResults.map((x, k) => ({ score: x.score, accuracy: x.accuracy, avg_ms: x.avgReaction, ko: ko[k], letters: lettersPayload(x.stats) })),
  }) }).catch(() => {});
  const card = (k) => {
    const x = duelResults[k], att = x.hits + x.escapes;
    return `<div class="duel-res p${k + 1}${winner === k ? ' win' : ''}"><p class="px">P${k + 1}${winner === k ? ' WINS' : ''}</p><p class="px big">${x.score}</p>
      <p class="small">${att ? Math.round(100 * x.hits / att) : 0}% · ${x.hits} hit</p>
      <p class="small">Practise: ${esc(x.toPractise.slice(0, 3).join(' ') || 'nothing missed')}</p></div>`;
  };
  $('duel-overlay').innerHTML = `<p class="px big">${winner < 0 ? 'DRAW' : `PLAYER ${winner + 1} WINS`}</p><p class="px">${why.toUpperCase()}</p>
    <div class="duel-res-row">${card(0)}${card(1)}</div>
    <button class="btn arcade-btn" type="button" data-dact="start">REMATCH</button>`;
  $('duel-overlay').hidden = false;
}
$('duel-overlay').addEventListener('click', (e) => {
  const act = e.target.closest('[data-dact]')?.dataset.dact;
  if (act === 'start') startDuel();
  if (act === 'resume') resumeDuel();
  if (act === 'stop') abortDuel();
});
$('duel-pause').addEventListener('click', () => (duelists[0].state === 'paused' ? resumeDuel() : pauseDuel()));
$('duel-stop').addEventListener('click', abortDuel);
rec.onSideSign((side, L) => { if (route === 'duel' && duelists[side].state === 'play') duelists[side].sign(L); });

// ---------- Progress ----------
function renderProgress() {
  const cal = $('calendar');
  const today = new Date();
  const cells = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const on = !!store.days[dayKey(d)];
    cells.push(`<span class="${on ? 'on' : ''}${i === 0 ? ' today' : ''}" title="${d.toDateString()}${on ? ': practised' : ''}"></span>`);
  }
  cal.innerHTML = cells.join('');
  const days = Object.keys(store.days).length;
  cal.setAttribute('aria-label', `Practised on ${days} day${days === 1 ? '' : 's'}; current streak ${streak()}`);
  $('cal-streak').textContent = `Current streak: ${streak()} day${streak() === 1 ? '' : 's'}`;
  const tot = Object.values(store.letters).reduce((a, s) => [a[0] + s.hits, a[1] + s.misses], [0, 0]);
  $('st-acc').textContent = tot[0] + tot[1] ? `${Math.round(100 * tot[0] / (tot[0] + tot[1]))}%` : '–';
  $('st-best').textContent = store.games ? store.best : '–';
  $('st-mastered').innerHTML = `${mastered()}<span class="of">/26</span>`;
  $('st-react').textContent = store.reactions.length ? `${(store.reactions.reduce((a, b) => a + b, 0) / store.reactions.length / 1000).toFixed(1)}s` : '–';
  $('bars').innerHTML = LETTERS.map((L) => {
    const box = store.boxes[L] || 0, s = store.letters[L];
    const note = s && s.hits + s.misses ? `${Math.round(100 * s.hits / (s.hits + s.misses))}% hit` : 'not played';
    return `<div class="bar"><span>${L}</span><span class="track" role="img" aria-label="Letter ${L}: box ${box || 'none'} of 5"><i style="width:${box * 20}%"></i></span><small>${note}</small></div>`;
  }).join('');
  const recent = store.history.slice(-8);
  const maxS = Math.max(1, ...recent.map((h) => h.score));
  $('trend').innerHTML = recent.length ? recent.map((h) => `<div class="bar"><span title="${new Date(h.at).toLocaleString('en-GB')}">${new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><span class="track" role="img" aria-label="Score ${h.score}"><i style="width:${Math.round(100 * h.score / maxS)}%"></i></span><small>${h.score} · ${h.accuracy == null ? '–' : Math.round(h.accuracy * 100) + '%'}</small></div>`).join('')
    : '<p class="muted small">Finish a round to see your trend.</p>';
  const hard = LETTERS.map((L) => [L, store.letters[L]]).filter(([, s]) => s && s.hits + s.misses >= 3)
    .map(([L, s]) => [L, s.hits / (s.hits + s.misses)]).filter(([, a]) => a < 1).sort((a, b) => a[1] - b[1]).slice(0, 3);
  $('hardest').innerHTML = hard.length ? hard.map(([L, a]) => `<span class="chip warn">${L} · ${Math.round(a * 100)}%</span>`).join('')
    : '<p class="muted small">Play a few rounds to see which letters need work (needs 3+ attempts per letter).</p>';
}
$('reset-progress').addEventListener('click', () => {
  if (!confirm('Reset all Signblast progress on this device?')) return;
  const muted = store.muted;
  store = blank(); store.muted = muted; save();
  game.boxes = store.boxes;
  renderProgress();
});

// ---------- routing ----------
let route = 'home';
const SCREENS = ['home', 'learn', 'play', 'results', 'progress', 'duel'];
function go() {
  const r = location.hash.slice(1);
  route = SCREENS.includes(r) ? r : 'home';
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== route; });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (route !== 'play' && game.state === 'play') pauseGame();
  if (route !== 'duel' && duelLive()) abortDuel();
  rec.setSplit(route === 'duel');
  rec.setWide(route === 'duel');
  rec.sidePreviews = route === 'duel' ? [$('duel-cam-0'), $('duel-cam-1')] : null;
  document.querySelectorAll('[data-nav]').forEach((a) => { if (route === 'results' && a.dataset.nav === 'play') a.setAttribute('aria-current', 'page'); });
  if (route === 'home') renderHome();
  if (route === 'learn') { renderLearn(); usePreview(checkTarget ? $('check') : null); if (learnFocus.length) { setTimeout(() => document.querySelector('.letter-card.focus')?.scrollIntoView({ block: 'center' }), 50); } }
  if (route === 'play') usePreview($('screen-play'));
  if (route === 'duel') usePreview(null);
  if (route === 'progress') renderProgress();
  if (route === 'home' || route === 'progress' || route === 'results') rec.stop();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', go);
window.addEventListener('pagehide', save);
renderMute();
go();
