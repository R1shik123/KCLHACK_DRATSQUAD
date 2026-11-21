/* Londonfax app: header clock, rolling page search, fastext, hold/reveal,
 * subpage carousel, live refresh, clickable rows, search, near me, live
 * camera video, shareable #page links, remote control and keyboard. */
(function () {
  const { render, Screen, COLS, ROWS } = window.TT;
  const P = window.LFPages, D = window.LFData;
  const canvas = document.getElementById('tt');
  const ctx = canvas.getContext('2d');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const st = {
    page: 100, target: 100, typed: '', rolling: true, roll: 100,
    subs: [new Screen()], sub: 0, fastext: [], refresh: 0, built: 0,
    hold: false, reveal: false, lastFlip: Date.now(), seq: 0, busy: false, data: {},
  };

  // ---------- drawing ----------
  function header(s) {
    const t = P.london(), pad = P.pad;
    for (let c = 0; c < COLS; c++) Object.assign(s.cells[0][c], { ch: ' ', mos: 0, bg: 'K', dh: false, flash: false });
    const req = st.typed ? ('P' + st.typed).padEnd(4) : `P${st.target}`;
    s.text(0, 1, req, { fg: 'W' });
    s.text(0, 7, 'LONDONFAX', { fg: 'C' });
    s.text(0, 17, String(st.rolling ? st.roll : st.page), { fg: st.rolling ? 'G' : 'W' });
    s.text(0, 21, `${t.wd} ${t.day} ${t.mon}`, { fg: 'W' });
    s.text(0, 32, `${pad(t.h)}:${pad(t.m)}/${pad(t.s)}`, { fg: 'Y' });
  }
  function fastextRow(s) {
    const cols = ['R', 'G', 'Y', 'C'];
    for (let c = 0; c < COLS; c++) Object.assign(s.cells[24][c], { ch: ' ', mos: 0, bg: 'K', dh: false, flash: false });
    st.fastext.slice(0, 4).forEach((f, i) => {
      const label = f.label.slice(0, 9);
      s.text(24, i * 10 + Math.floor((10 - label.length) / 2), label, { fg: cols[i] });
    });
  }
  function subIndicator(s) {
    const n = st.subs.length;
    if (!s._row23) s._row23 = s.cells[23].slice(31).map(c => ({ ...c }));
    s._row23.forEach((c, i) => { s.cells[23][31 + i] = { ...c }; });
    if (st.hold) s.text(23, 31, 'HOLD', { fg: 'R' });
    if (n > 1) s.right(23, `${st.sub + 1}/${n}`, { fg: 'W' });
  }
  const current = () => st.subs[st.sub] || st.subs[0];
  function frame() {
    const s = current();
    if (s.tick && !st.rolling) s.tick(s);
    header(s); fastextRow(s); subIndicator(s);
    render(ctx, s, { blinkOn: (Date.now() % 1000) < 680, hide: s.media && !st.reveal ? s.media : null });
  }

  // ---------- real footage over the grid ----------
  const video = document.getElementById('media-video');
  const still = document.getElementById('media-img');
  const mediaBox = document.getElementById('media');
  let mediaKey = '';
  function syncMedia() {
    const m = current().media;
    const show = m && !st.reveal;
    mediaBox.hidden = !show;
    if (!show) { if (!video.paused) video.pause(); return; }
    Object.assign(mediaBox.style, {
      top: `${(m.r / ROWS) * 100}%`, left: `${(m.c / COLS) * 100}%`,
      width: `${(m.w / COLS) * 100}%`, height: `${(m.h / ROWS) * 100}%`,
    });
    const key = `${m.video}|${m.image}|${Math.floor(st.built / 1000)}`;
    if (key !== mediaKey) {
      mediaKey = key;
      still.src = m.image || '';
      still.hidden = false;
      video.hidden = true;
      if (m.video) {
        video.src = `${m.video}?t=${Math.floor(Date.now() / 60000)}`; // new clip every few minutes
        video.load();
        video.play().catch(() => {});
      }
    } else if (video.paused && m.video && !video.hidden) video.play().catch(() => {});
  }
  video.addEventListener('playing', () => { video.hidden = false; still.hidden = true; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !mediaBox.hidden && video.src) video.play().catch(() => {}); });
  video.addEventListener('error', () => { video.hidden = true; still.hidden = false; });

  // ---------- navigation ----------
  async function goto(to, opts = {}) {
    const n = typeof to === 'object' ? to.page : to;
    if (typeof to === 'object' && to.data) st.data[n] = to.data;
    if (opts.data) st.data[n] = opts.data;
    const my = ++st.seq;
    st.target = n; st.typed = ''; st.reveal = false; st.rolling = true;
    syncButtons();
    const t0 = performance.now();
    let res = null;
    try { res = await P.build(n, st.data[n]); } catch (e) { console.error(e); }
    const wait = (opts.minRoll ?? (500 + Math.random() * 500)) - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    if (my !== st.seq) return;
    apply(n, res || P.notFound(n), 0);
    st.rolling = false; st.roll = n;
    writeHash(n);
    frame(); syncMedia();
  }
  function apply(n, res, sub) {
    st.page = n; st.subs = res.subs; st.sub = Math.min(sub, res.subs.length - 1);
    st.fastext = res.fastext || []; st.refresh = res.refresh || 0; st.built = Date.now(); st.lastFlip = Date.now();
  }
  async function rebuild(force) {
    if (st.rolling || st.busy) return;
    if (!force && (!st.refresh || Date.now() - st.built < st.refresh)) return;
    st.busy = true;
    const my = st.seq, n = st.page;
    try {
      const res = await P.build(n, st.data[n]);
      if (res && my === st.seq && n === st.page) { apply(n, res, st.sub); frame(); syncMedia(); }
    } catch (e) { console.error(e); }
    st.busy = false;
  }

  function digit(d) {
    if (!st.typed && (d === '0' || d === '9')) return; // pages run 100-899
    st.typed += d;
    if (st.typed.length === 3) goto(+st.typed);
    frame();
  }
  const fastext = (i) => { const f = st.fastext[i]; if (f) goto(f.page); };
  function subStep(k) { const n = st.subs.length; if (n > 1) { st.sub = (st.sub + k + n) % n; st.lastFlip = Date.now(); frame(); syncMedia(); } }
  function toggleHold() { st.hold = !st.hold; syncButtons(); frame(); }
  function toggleReveal() { st.reveal = !st.reveal; syncButtons(); frame(); syncMedia(); }

  function action(key) {
    if (/^[0-9]$/.test(key)) return digit(key);
    switch (key) {
      case 'red': return fastext(0);
      case 'green': return fastext(1);
      case 'yellow': return fastext(2);
      case 'cyan': return fastext(3);
      case 'index': return goto(100);
      case 'hold': return toggleHold();
      case 'reveal': return toggleReveal();
      case 'prev': return subStep(-1);
      case 'next': return subStep(1);
    }
  }

  // ---------- shareable links: #320, #150:490008932T, #330:940GZZLUBXN ----------
  function writeHash(n) {
    const d = st.data[n];
    const h = (n === 150 || n === 330) && d ? `#${n}:${d.id}:${encodeURIComponent(d.name || '')}` : `#${n}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function readHash() {
    const m = location.hash.match(/^#(\d{3})(?::([^:]+)(?::(.*))?)?$/);
    if (!m) return null;
    const n = +m[1];
    if (m[2]) st.data[n] = { id: m[2], name: decodeURIComponent(m[3] || m[2]), letter: '' };
    return n;
  }

  window.addEventListener('hashchange', () => { const n = readHash(); if (n) goto(n); });

  // ---------- clicking the screen ----------
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    return { c: Math.floor(((e.clientX - r.left) / r.width) * COLS), r: Math.floor(((e.clientY - r.top) / r.height) * ROWS) };
  }
  function targetAt({ r, c }) {
    if (r === 24) return st.fastext[Math.floor(c / 10)] ? { fast: Math.floor(c / 10) } : null;
    const s = current();
    const link = s.linkAt(r, c);
    if (link) return { to: link.to };
    // any visible 3-digit page number is clickable too
    const row = s.cells[r]?.map(x => (x.mos ? ' ' : x.ch)).join('') || '';
    const re = /\b([1-8]\d\d)\b/g; let m;
    while ((m = re.exec(row))) if (c >= m.index && c < m.index + 3) return { to: +m[1] };
    return null;
  }
  canvas.addEventListener('click', (e) => {
    const t = targetAt(cellAt(e));
    if (!t) return;
    if ('fast' in t) { flash(['red', 'green', 'yellow', 'cyan'][t.fast]); fastext(t.fast); } else goto(t.to);
  });
  mediaBox.addEventListener('click', () => toggleReveal());
  canvas.addEventListener('mousemove', (e) => { canvas.style.cursor = targetAt(cellAt(e)) ? 'pointer' : 'default'; });

  // ---------- remote + keyboard ----------
  const KEYMAP = { r: 'red', g: 'green', y: 'yellow', c: 'cyan', i: 'index', h: 'hold', v: 'reveal', '?': 'reveal', ArrowLeft: 'prev', ArrowRight: 'next', Home: 'index' };
  function flash(key) {
    const b = document.querySelector(`[data-key="${key}"]`);
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 180);
  }
  function press(key) { flash(key); action(key); }
  document.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => press(b.dataset.key)));
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === '/') { e.preventDefault(); q.focus(); return; }
    const key = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key] || KEYMAP[e.key.toLowerCase?.()];
    if (key) { e.preventDefault(); press(key); }
  });
  function syncButtons() {
    document.querySelector('[data-key="hold"]')?.classList.toggle('on', st.hold);
    document.querySelector('[data-key="reveal"]')?.classList.toggle('on', st.reveal);
  }

  // ---------- search + near me ----------
  const form = document.getElementById('finder');
  const q = document.getElementById('q');
  const list = document.getElementById('results');
  const note = document.getElementById('finder-note');
  const ICON = { station: 'TRAIN', bus: 'BUS', camera: 'CAM' };
  let found = [], searchSeq = 0, timer = 0;
  function say(text) { note.textContent = text || ''; }
  function showResults(items) {
    found = items;
    list.innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="kind ${it.kind}"></span><span class="name"></span><span class="detail"></span>`;
      b.querySelector('.kind').textContent = ICON[it.kind];
      b.querySelector('.name').textContent = it.name;
      b.querySelector('.detail').textContent = it.detail || '';
      b.addEventListener('click', () => open(i));
      li.appendChild(b); list.appendChild(li);
    });
    list.hidden = !items.length;
  }
  async function runSearch(text) {
    const my = ++searchSeq;
    if (text.trim().length < 2) { showResults([]); say(''); return []; }
    say('Searching…');
    try {
      const items = await D.search(text);
      if (my !== searchSeq) return [];
      showResults(items);
      say(items.length ? '' : (/^\d+$/.test(text.trim()) ? 'Bus stop codes have 5 digits (on the stop sign).' : 'No matches. Try a station, road or 5-digit bus stop code.'));
      return items;
    } catch { say('Search is unavailable right now.'); return []; }
  }
  function open(i) {
    const it = found[i];
    if (!it) return;
    showResults([]); q.blur(); say('');
    if (it.kind === 'station') goto(330, { data: { id: it.id, name: it.name } });
    if (it.kind === 'bus') goto(150, { data: { id: it.id, name: it.name, letter: '' } });
    if (it.kind === 'camera') { D.setPlace({ lat: it.lat, lon: it.lon, label: it.name.toUpperCase().slice(0, 16) }); goto(501); }
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => runSearch(q.value), 280); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    const items = found.length ? found : await runSearch(q.value);
    if (items.length) open(0);
  });
  document.getElementById('nearme').addEventListener('click', async () => {
    say('Finding you…');
    try { await D.locate(); say(''); goto(110); }
    catch { say('Location was blocked, so showing places near KCL Strand.'); D.setPlace(D.HOME); goto(110); }
  });
  D.onPlace(() => { if ([110, 150, 330, 450, 500].includes(st.page) || (st.page > 500 && st.page < 600)) rebuild(true); });

  // ---------- timers ----------
  setInterval(() => {
    if (st.rolling) st.roll = st.roll >= 899 ? 100 : st.roll + 1;
    frame();
  }, 45);
  setInterval(() => {
    if (!st.hold && !st.rolling && st.subs.length > 1 && Date.now() - st.lastFlip > 12_000) subStep(1);
    rebuild(false);
  }, 1000);

  // ---------- demo hooks (used to record the demo video) ----------
  const cap = document.getElementById('caption');
  window.Londonfax = {
    press, goto, search: runSearch, open,
    caption(text) { cap.textContent = text || ''; cap.hidden = !text; },
    state: () => ({ page: st.page, rolling: st.rolling, sub: st.sub, subs: st.subs.length }),
  };
  if (new URLSearchParams(location.search).has('demo')) document.body.classList.add('demo');

  // ---------- power on ----------
  requestAnimationFrame(() => document.querySelector('.screen').classList.add('on'));
  goto(readHash() || 100, { minRoll: 1200 });
  D.allCams().catch(() => {}); // warm the camera list so camera pages open fast
})();
