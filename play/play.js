/* Londonfax Game Mode — phone controller. Polls the server every second; the server owns all rules and times. */
(function () {
  'use strict';
  const API = '/api/game';
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const params = new URLSearchParams(location.search);
  let room = (params.get('room') || localStorage.getItem('lf.room') || '').toUpperCase();
  let player = room ? (params.get('player') || localStorage.getItem('lf.player.' + room) || '') : '';
  if (room && params.get('player')) { try { localStorage.setItem('lf.player.' + room, player); localStorage.setItem('lf.room', room); } catch (e) { /* private mode */ } }
  let state = null, lastSig = '', pollTimer = null, busy = false, endsAt = 0;

  const LINE = {
    'Bakerloo': '#b36305', 'Central': '#e32017', 'Circle': '#ffd300', 'District': '#00782a', 'Hammersmith & City': '#f3a9bb',
    'Jubilee': '#a0a5a9', 'Metropolitan': '#9b0056', 'Northern': '#000000', 'Piccadilly': '#003688', 'Victoria': '#0098d4',
    'Waterloo & City': '#95cdba', 'Elizabeth line': '#6950a1', 'DLR': '#00a4a7',
  };
  const MODE_COL = { bus: '#e1251b', 'elizabeth-line': '#6950a1', overground: '#ee7c0e', dlr: '#00a4a7', walking: '#8a8f98',
    drive: '#2f6fde', 'national-rail': '#1c3f94', tube: '#003688', tram: '#66cc00' };
  const ICON = { bus: '🚌', tube: '🚇', 'elizabeth-line': '🚆', overground: '🚆', dlr: '🚈', 'national-rail': '🚆', walking: '🚶', drive: '🚗', tram: '🚊' };
  const MODE_NAME = { bus: 'Bus', tube: 'Tube', 'elizabeth-line': 'Elizabeth line', overground: 'Overground', dlr: 'DLR', 'national-rail': 'Rail', walking: 'Walk', drive: 'Drive' };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lineColour = (part) => LINE[part.name] || MODE_COL[part.mode] || '#888';
  const legColours = (leg) => (leg.parts && leg.parts.length ? leg.parts.map(lineColour) : [MODE_COL[leg.mode] || '#888']);
  const stripe = (cols) => cols.length === 1 ? cols[0] : `linear-gradient(${cols.map((c, i) => `${c} ${i * 100 / cols.length}% ${(i + 1) * 100 / cols.length}%`).join(',')})`;
  const legIcon = (leg) => ICON[(leg.parts && leg.parts[0] && leg.parts[0].mode) || leg.mode] || ICON[leg.mode] || '•';
  const signed = (n) => (n > 0 ? '+' + n : String(n));
  const deltaClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  async function call(method, path, body) {
    const r = await fetch(API + path, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) throw new Error(data.detail || data.error || ('Error ' + r.status));
    return data;
  }

  function remember(code, pid) {
    room = code; player = pid;
    localStorage.setItem('lf.room', code);
    localStorage.setItem('lf.player.' + code, pid);
    history.replaceState(null, '', '?room=' + code);
  }
  function forget() {
    localStorage.removeItem('lf.room');
    if (room) localStorage.removeItem('lf.player.' + room);
    room = ''; player = ''; state = null; lastSig = '';
    history.replaceState(null, '', location.pathname);
    stopPoll(); renderJoin();
  }

  // ---------- polling ----------
  function startPoll() { stopPoll(); poll(); pollTimer = setInterval(poll, 1000); }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  async function poll() {
    if (!room || busy) return;
    try {
      const s = await call('GET', `/rooms/${room}/state?player=${encodeURIComponent(player)}`);
      if (s.notInRoom) { player = ''; }
      apply(s);
    } catch (e) {
      if (/No game/.test(e.message)) { toast('That game has ended.'); forget(); }
    }
  }
  function apply(s) {
    state = s;
    if (s.secondsLeft != null) endsAt = Date.now() + s.secondsLeft * 1000;
    const { secondsLeft, joinUrl, ...rest } = s;
    const sig = JSON.stringify(rest);
    updateTop();
    if (sig === lastSig) return;
    lastSig = sig;
    if (!$('sheet').hidden && !(s.phase === 'editing' && s.options)) closeSheet();
    if (!$('sheet').hidden) return; // don't yank the sheet away mid-choice
    render();
  }

  // ---------- top bar ----------
  function updateTop() {
    const s = state, top = $('top');
    const show = s && player && !s.notInRoom && ['editing', 'reveal'].includes(s.phase);
    top.hidden = !show;
    if (!show) return;
    $('top-round').textContent = `Round ${s.round}/${s.rounds}`;
    const left = s.you ? s.you.editsLeft : 0;
    $('top-edits').textContent = s.phase === 'editing' ? `${left} edit${left === 1 ? '' : 's'} left` : 'Results';
    const t = $('top-timer');
    if (s.phase === 'editing') {
      const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      t.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      t.classList.toggle('low', sec <= 15);
    } else t.textContent = '';
  }
  setInterval(updateTop, 250);

  // ---------- screens ----------
  function render() {
    const s = state;
    if (!s || !player || s.notInRoom) return renderJoin(s && s.code);
    if (s.phase === 'preparing' || s.phase === 'lobby') return renderLobby();
    if (s.phase === 'editing') return s.you.submitted ? renderWaiting() : renderJourney();
    if (s.phase === 'reveal') return renderReveal();
    if (s.phase === 'final') return renderFinal();
  }

  function renderJoin(code) {
    $('top').hidden = true;
    const prefill = (code || room || '').toUpperCase();
    app.innerHTML = `
      <section class="screen join">
        <div class="hero"><div class="logo">LONDONFAX</div><div class="logo-sub">GAME MODE · SLOW LANE</div></div>
        <p class="lead">Same London journey for both players. Make <b>2 secret edits</b> to make it <b>slower</b>. Times stay hidden until the reveal.</p>
        <label class="field"><span>Your name</span>
          <input id="name" maxlength="12" autocomplete="nickname" autocapitalize="words" placeholder="e.g. Sam" value="${esc(localStorage.getItem('lf.name') || '')}"></label>
        <label class="field"><span>Game code</span>
          <input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ABCD" value="${esc(prefill)}" class="code-input"></label>
        <button class="btn primary" id="join" type="button">Join game</button>
        <div class="or"><span>or</span></div>
        <button class="btn secondary" id="create" type="button">Create a new game</button>
      </section>`;
    const nameEl = $('name'), codeEl = $('code');
    codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    const getName = () => { const n = nameEl.value.trim(); if (n) localStorage.setItem('lf.name', n); return n; };
    $('join').onclick = async () => {
      const n = getName(), c = codeEl.value.trim().toUpperCase();
      if (!n) return toast('Enter your name first'), nameEl.focus();
      if (c.length !== 4) return toast('Game codes are 4 letters'), codeEl.focus();
      try {
        const r = await call('POST', `/rooms/${c}/join`, { name: n, player: localStorage.getItem('lf.player.' + c) || undefined });
        remember(r.code, r.playerId); lastSig = ''; startPoll();
      } catch (e) { toast(e.message); }
    };
    $('create').onclick = async () => {
      const n = getName();
      if (!n) return toast('Enter your name first'), nameEl.focus();
      try { const r = await call('POST', '/rooms', { name: n }); remember(r.code, r.playerId); lastSig = ''; startPoll(); } catch (e) { toast(e.message); }
    };
  }

  function playersList(showScore) {
    return `<ul class="players">${state.players.map((p) => `
      <li class="${p.you ? 'me' : ''}"><span class="dot"></span><span class="pname">${esc(p.name)}${p.you ? ' <em>(you)</em>' : ''}${p.host ? ' <small>host</small>' : ''}</span>
      ${showScore ? `<span class="pscore ${deltaClass(p.score)}">${signed(p.score)}</span>` : ''}</li>`).join('')}
      ${state.players.length < state.maxPlayers ? '<li class="empty"><span class="dot"></span><span class="pname">Waiting for player…</span></li>' : ''}</ul>`;
  }

  function renderLobby() {
    const s = state, host = s.you && s.you.host, full = s.players.length >= 2;
    let status = '';
    if (s.error) status = `<p class="warn">${esc(s.error)}</p>`;
    else if (!s.ready) status = '<p class="muted"><span class="spinner"></span> Fetching real journey times from the TfL Journey Planner…</p>';
    const canStart = host && full && s.ready;
    app.innerHTML = `
      <section class="screen lobby">
        <p class="eyebrow">Game code</p>
        <div class="bigcode">${esc(s.code)}</div>
        <p class="muted center">Friend joins at <b>${esc(location.host)}/play</b> with this code, or scans the QR on the TV.</p>
        ${playersList(false)}
        ${status}
        ${host ? `<button class="btn primary" id="start" type="button" ${canStart ? '' : 'disabled'}>${!full ? 'Waiting for a second player' : !s.ready ? 'Preparing journeys…' : 'Start game'}</button>`
               : '<p class="muted center">The host starts the game.</p>'}
        <details class="rules"><summary>How to play</summary>
          <ol><li>You both get the same real London journey.</li>
          <li>Make 2 edits: travel a leg another way, or change somewhere else.</li>
          <li>Times are hidden. Each minute slower = +1 point. Faster by accident = minus points.</li>
          <li>3 rounds, 90 seconds each. Times come from TfL's Journey Planner, plus ${s.changeMinutes} min per change.</li></ol></details>
        <button class="btn link" id="leave" type="button">Leave game</button>
      </section>`;
    if ($('start')) $('start').onclick = () => act('start');
    $('leave').onclick = forget;
  }

  function legCard(leg, i, edited, opts) {
    const can = opts && opts.legs[i] && opts.legs[i].length;
    return `<button class="leg ${edited ? 'edited' : ''}" data-leg="${i}" type="button" ${can ? '' : 'aria-disabled="true"'}>
      <span class="stripe" style="background:${stripe(legColours(leg))}"></span>
      <span class="icon" aria-hidden="true">${legIcon(leg)}</span>
      <span class="legtext"><span class="legline">${esc(leg.label)}</span>
        <span class="legft">${esc(leg.from)} → ${esc(leg.to)}</span></span>
      <span class="chev">${can ? (edited ? 'Edited ✎' : 'Change ›') : (edited ? 'Edited ✎' : '')}</span></button>`;
  }

  function renderJourney() {
    const s = state, r = s.route, opts = s.options, ed = r.edited || { legs: [], changes: [] };
    const parts = [];
    parts.push(`<div class="node end"><span class="pin"></span><span>${esc(r.legs[0].from)}</span><small>Start · fixed</small></div>`);
    r.legs.forEach((leg, i) => {
      parts.push(legCard(leg, i, ed.legs[i], opts));
      if (i < r.legs.length - 1) {
        const can = opts && opts.changes[i] && opts.changes[i].length;
        parts.push(`<button class="node change ${ed.changes[i] ? 'edited' : ''}" data-change="${i}" type="button" ${can ? '' : 'aria-disabled="true"'}>
          <span class="pin"></span><span>Change at <b>${esc(r.changes[i])}</b></span><small>${can ? (ed.changes[i] ? 'Edited ✎' : 'Move ›') : (ed.changes[i] ? 'Edited ✎' : '')}</small></button>`);
      }
    });
    parts.push(`<div class="node end"><span class="pin"></span><span>${esc(r.legs[r.legs.length - 1].to)}</span><small>Finish · fixed</small></div>`);
    const left = s.you.editsLeft;
    app.innerHTML = `
      <section class="screen journey">
        <h1 class="jtitle">${esc(s.journey.title)}</h1>
        <p class="muted">${left ? `Tap a leg or a change to edit it. <b>${left}</b> edit${left === 1 ? '' : 's'} left. Slower = more points.` : 'No edits left. Undo to change your mind, or submit.'}</p>
        <div class="timeline">${parts.join('')}</div>
        <div class="others">${s.players.filter((p) => !p.you).map((p) => `<span>${esc(p.name)}: ${p.submitted ? '✅ submitted' : '✏️ editing'}</span>`).join('')}</div>
      </section>
      <div class="actions">
        <button class="btn ghost" id="undo" type="button" ${s.you.canUndo ? '' : 'disabled'}>↶ Undo</button>
        <button class="btn primary" id="submit" type="button">Submit route</button>
      </div>`;
    app.querySelectorAll('[data-leg]').forEach((b) => (b.onclick = () => openLeg(+b.dataset.leg)));
    app.querySelectorAll('[data-change]').forEach((b) => (b.onclick = () => openChange(+b.dataset.change)));
    $('undo').onclick = () => act('undo');
    $('submit').onclick = (ev) => {
      const b = ev.currentTarget;
      if (s.you.editsLeft === s.editsPerRound && !b.dataset.sure) {
        b.dataset.sure = '1'; b.textContent = 'No edits: tap again to submit';
        return;
      }
      act('submit');
    };
  }

  function noEdits(what) {
    if (state.you.editsLeft <= 0) toast('No edits left — undo one first');
    else toast(`No other ways to do this ${what} right now`);
  }

  function openLeg(i) {
    const s = state, opts = s.options && s.options.legs[i];
    if (!opts || !opts.length) return noEdits('leg');
    const leg = s.route.legs[i];
    openSheet(`Leg ${i + 1}: ${leg.from} → ${leg.to}`, `Now: ${leg.label}. Pick another way (times hidden).`,
      opts.map((o) => ({ id: o.id, html: `<span class="stripe" style="background:${stripe(o.parts.length ? o.parts.map(lineColour) : [MODE_COL[o.mode]])}"></span>
        <span class="icon">${ICON[(o.parts[0] && o.parts[0].mode) || o.mode] || '•'}</span><span class="optext"><b>${esc(o.label)}</b><small>${esc(MODE_NAME[o.mode] || o.mode)}</small></span>` })),
      (id) => act('edit', { kind: 'leg', index: i, optionId: id }));
  }

  function openChange(i) {
    const s = state, opts = s.options && s.options.changes[i];
    if (!opts || !opts.length) return noEdits('change');
    openSheet(`Change somewhere else`, `Now: change at ${s.route.changes[i]}. Both legs touching it are re-planned.`,
      opts.map((o) => ({ id: o.id, html: `<span class="icon">🔁</span><span class="optext"><b>${esc(o.name)}</b><small>Change here instead</small></span>` })),
      (id) => act('edit', { kind: 'change', index: i, optionId: id }));
  }

  function openSheet(title, sub, items, onPick) {
    $('sheet-title').textContent = title;
    $('sheet-sub').textContent = sub;
    $('sheet-list').innerHTML = items.map((it) => `<button class="opt" type="button" data-id="${esc(it.id)}">${it.html}</button>`).join('');
    $('sheet-list').querySelectorAll('.opt').forEach((b) => (b.onclick = () => { closeSheet(); onPick(b.dataset.id); }));
    $('sheet').hidden = false; $('backdrop').hidden = false;
    requestAnimationFrame(() => $('sheet').classList.add('open'));
  }
  function closeSheet() {
    $('sheet').classList.remove('open'); $('sheet').hidden = true; $('backdrop').hidden = true;
    lastSig = ''; // re-render with the freshest state
  }
  $('sheet-cancel').onclick = () => { closeSheet(); render(); };
  $('backdrop').onclick = () => { closeSheet(); render(); };

  function renderWaiting() {
    app.innerHTML = `
      <section class="screen waiting">
        <div class="big-emoji" aria-hidden="true">🔒</div>
        <h1>Route locked in</h1>
        <p class="muted center">Waiting for the others. The reveal starts when everyone submits or the timer runs out.</p>
        ${playersList(false).replace(/<li class="(me|)"><span class="dot"><\/span>/g, '<li class="$1"><span class="dot"></span>')}
        <ul class="players status">${state.players.map((p) => `<li><span class="pname">${esc(p.name)}</span><span>${p.submitted ? '✅ Submitted' : '✏️ Editing…'}</span></li>`).join('')}</ul>
      </section>`;
  }

  function routeBlock(title, route, extra) {
    return `<div class="route">
      <div class="route-head"><b>${esc(title)}</b>${extra || ''}</div>
      ${route.legs.map((l) => `<div class="rleg"><span class="stripe" style="background:${stripe(legColours(l))}"></span>
        <span class="icon">${legIcon(l)}</span><span class="legtext"><span class="legline">${esc(l.label)}</span><span class="legft">${esc(l.from)} → ${esc(l.to)}</span></span>
        <span class="mins">${l.minutes} min</span></div>`).join('')}
      ${route.changeMinutes ? `<div class="rleg allowance"><span class="legtext">Change allowance (${route.legs.length - 1} × ${state.changeMinutes} min)</span><span class="mins">${route.changeMinutes} min</span></div>` : ''}
      <div class="rtotal"><span>Total</span><span>${route.total} min</span></div></div>`;
  }

  function renderReveal() {
    const s = state, rv = s.reveal, last = s.round >= s.rounds;
    const sorted = rv.players.slice().sort((a, b) => b.delta - a.delta);
    app.innerHTML = `
      <section class="screen reveal">
        <p class="eyebrow">Round ${rv.round} reveal</p>
        <h1 class="jtitle">${esc(rv.title)}</h1>
        <div class="scores">${sorted.map((p) => `<div class="scorecard ${p.id === undefined ? '' : ''}"><span class="sname">${esc(p.name)}</span>
          <span class="sdelta ${deltaClass(p.delta)}">${signed(p.delta)}</span><span class="swhy">${esc(p.why)}</span></div>`).join('')}</div>
        ${routeBlock('Original route', rv.base)}
        ${rv.players.map((p) => routeBlock(p.name + "'s route", p.route, `<span class="sdelta small ${deltaClass(p.delta)}">${signed(p.delta)} min</span>`)).join('')}
        <p class="source">Leg times: TfL Journey Planner${rv.base.legs.some((l) => l.mode === 'drive') || rv.players.some((p) => p.route.legs.some((l) => l.mode === 'drive')) ? '; driving: road model (estimate)' : ''}. +${s.changeMinutes} min per change on every route.</p>
        <h2>Scores so far</h2>
        ${playersList(true)}
      </section>
      <div class="actions"><button class="btn primary wide" id="next" type="button">${last ? 'See final results' : `Next round (${s.round + 1}/${s.rounds})`}</button></div>`;
    $('next').onclick = () => act('next', { round: s.round });
  }

  async function renderFinal() {
    const s = state, st = s.standings, win = st[0], tie = st.length > 1 && st[0].score === st[1].score;
    app.innerHTML = `
      <section class="screen final">
        <div class="big-emoji" aria-hidden="true">${tie ? '🤝' : '🏆'}</div>
        <h1 class="center">${tie ? "It's a draw!" : esc(win.name) + ' wins!'}</h1>
        <p class="muted center">Most minutes added to London journeys.</p>
        <ol class="standings">${st.map((p) => `<li class="${p.you ? 'me' : ''}"><span>${esc(p.name)}</span><span class="${deltaClass(p.score)}">${signed(p.score)}</span></li>`).join('')}</ol>
        <h2>Round by round</h2>
        <table class="rounds"><thead><tr><th>Journey</th>${st.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead>
          <tbody>${s.history.map((r) => `<tr><td>${esc(r.title)}<small>${r.base} min originally</small></td>${st.map((p) => {
            const x = r.players.find((y) => y.name === p.name) || {}; return `<td class="${deltaClass(x.delta)}">${signed(x.delta)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
        <h2>All-time top 5</h2>
        <div id="alltime" class="muted">Loading…</div>
        <button class="btn primary" id="again" type="button">Play again</button>
      </section>`;
    $('again').onclick = forget;
    try {
      const r = await fetch('/api/leaderboard', { cache: 'no-store' }).then((x) => x.json());
      const rows = (r.players || []).slice(0, 5);
      $('alltime').innerHTML = rows.length
        ? `<ol class="standings small">${rows.map((p) => `<li><span>${esc(p.player)}</span><span>${signed(Math.round(p.points))}</span></li>`).join('')}</ol><p class="source">Stored in Snowflake</p>`
        : '<p class="muted">All-time scores appear here when Snowflake is connected.</p>';
    } catch (e) { $('alltime').textContent = 'All-time leaderboard unavailable.'; }
  }

  async function act(what, extra) {
    if (busy) return;
    busy = true;
    try {
      const s = await call('POST', `/rooms/${room}/${what}`, Object.assign({ player }, extra || {}));
      busy = false; lastSig = ''; apply(s);
    } catch (e) { busy = false; toast(e.message); poll(); }
  }

  // ---------- boot ----------
  if (room && player) startPoll();
  else if (room) { renderJoin(room); }
  else renderJoin();
})();
