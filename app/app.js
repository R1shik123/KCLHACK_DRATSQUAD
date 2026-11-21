/* Signfall app shell: routing, storage, camera states, Learn, Play and Progress. */
import { Recognizer, LETTERS } from './recognizer.js';
import { Game, LEVEL_LETTERS } from './game.js';
import { Music } from './music.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HANDSHAPES = {
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
document.fonts?.load('16px "Press Start 2P"').then(() => { if (game.state === 'idle') game.drawIdle(); }).catch(() => {});

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
function startGame() {
  $('overlay').hidden = true;
  blip('start');
  if (rec.state === 'off') rec.start();
  game.start();
  Music.setMuted(!!store.muted);
  Music.start(1);
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
  if (act === 'start' || act === 'restart') { if (act === 'restart') { game.stop(); Music.stop(); } startGame(); }
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
  if (route === 'play' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P') && (game.state === 'play' || game.state === 'paused')) {
    e.preventDefault(); game.state === 'paused' ? resumeGame() : pauseGame(); return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || route !== 'play' || game.state !== 'play') return;
  if (rec.state === 'on' || rec.state === 'loading') return; // keyboard only when there is no camera
  const L = e.key.toUpperCase();
  if (LETTERS.includes(L)) { e.preventDefault(); rec.emitSign(L, 'keyboard'); }
});

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
  $('st-mastered').innerHTML = `${mastered()}<span class="of">/8</span>`;
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
const SCREENS = ['home', 'learn', 'play', 'results', 'progress'];
function go() {
  const r = location.hash.slice(1);
  route = SCREENS.includes(r) ? r : 'home';
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== route; });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (route !== 'play' && game.state === 'play') pauseGame();
  document.querySelectorAll('[data-nav]').forEach((a) => { if (route === 'results' && a.dataset.nav === 'play') a.setAttribute('aria-current', 'page'); });
  if (route === 'home') renderHome();
  if (route === 'learn') { renderLearn(); usePreview(checkTarget ? $('check') : null); if (learnFocus.length) { setTimeout(() => document.querySelector('.letter-card.focus')?.scrollIntoView({ block: 'center' }), 50); } }
  if (route === 'play') usePreview($('screen-play'));
  if (route === 'progress') renderProgress();
  if (route === 'home' || route === 'progress' || route === 'results') rec.stop();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', go);
window.addEventListener('pagehide', save);
renderMute();
go();
