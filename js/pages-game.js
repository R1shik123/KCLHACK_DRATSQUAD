/* Game Mode teletext pages (600-603). Owned by Agent 3 — see docs/AGENT-3-GAME.md.
 * 600 follows the most recent room automatically: join screen + QR in the lobby, then the live
 * round, the reveal and the final leaderboard. 601-603 show those views directly. */
(function () {
  const { Screen } = window.TT;
  const FAST = [{ label: 'JOIN', page: 600 }, { label: 'ROUND', page: 601 }, { label: 'REVEAL', page: 602 }, { label: 'SCORES', page: 603 }];
  const up = (s) => String(s == null ? '' : s).toUpperCase();
  const cut = (s, n) => (up(s).length > n ? up(s).slice(0, n - 1) + '.' : up(s));
  const signed = (n) => (n > 0 ? '+' + n : String(n));
  const dcol = (n) => (n > 0 ? 'G' : n < 0 ? 'R' : 'W');
  const MODE_FG = { bus: 'R', tube: 'C', 'elizabeth-line': 'M', overground: 'Y', dlr: 'C', 'national-rail': 'B', walking: 'W', drive: 'G' };
  const MODE_TAG = { bus: 'BUS', tube: 'TUBE', 'elizabeth-line': 'ELIZ', overground: 'OVGD', dlr: 'DLR', 'national-rail': 'RAIL', walking: 'WALK', drive: 'CAR' };

  async function latest() {
    try { const r = await fetch('/api/game/rooms/latest', { cache: 'no-store' }); return r.ok ? r.json() : null; } catch (e) { return null; }
  }
  function title(s, text, tag) {
    s.band(1, 'B', 2);
    s.text(1, 1, text, { fg: 'Y', bg: 'B', dh: true });
    if (tag) s.right(1, tag, { fg: 'W', bg: 'B' });
  }
  const res = (s, refresh = 1000) => ({ subs: [s], fastext: FAST, refresh });

  function join(st) {
    const s = new Screen();
    s.band(1, 'B', 4);
    s.banner(1, 1, 38, 4, 'GAME MODE', { fg: 'Y', bg: 'B' });
    s.center(5, 'SLOW LANE: MAKE LONDON SLOWER', { fg: 'C' });
    const origin = location.origin.replace(/^https?:\/\//, '');
    if (!st || !st.code) {
      s.center(9, 'PLAY ON YOUR PHONE', { fg: 'W', dh: true });
      s.center(12, 'OPEN', { fg: 'W' });
      s.center(13, cut(origin + '/play', 38), { fg: 'Y' });
      s.center(14, 'TO START A GAME', { fg: 'W' });
      rules(s, 17);
      return res(s, 2000);
    }
    s.text(7, 1, 'PLAY ON YOUR PHONE', { fg: 'W', dh: true });
    s.text(10, 1, 'ROOM CODE', { fg: 'C' });
    s.banner(11, 1, 22, 4, st.code, { fg: 'Y', bg: 'K' });
    s.text(16, 1, 'SCAN THE QR OR OPEN', { fg: 'W' });
    s.text(17, 1, cut(origin + '/play', 24), { fg: 'Y' });
    s.media = { image: `/api/game/rooms/${st.code}/qr.png`, r: 6, c: 26, w: 13, h: 10 };
    const names = st.players.map((p) => cut(p.name, 12));
    s.text(19, 1, `PLAYERS ${st.players.length}/${st.maxPlayers}:`, { fg: 'C' });
    s.text(19, 14, names.join(' V ') || '-', { fg: 'W' });
    s.text(21, 1, st.error ? cut(st.error, 38) : st.ready ? (st.players.length >= 2 ? 'READY: HOST PRESSES START' : 'WAITING FOR A SECOND PLAYER')
      : 'FETCHING TIMES FROM TFL JOURNEY PLANNER', { fg: st.error ? 'R' : st.ready ? 'G' : 'Y', flash: !st.ready && !st.error });
    return res(s, 1500);
  }

  function rules(s, r) {
    s.text(r, 1, 'SAME JOURNEY FOR BOTH PLAYERS.', { fg: 'W' });
    s.text(r + 1, 1, '2 SECRET EDITS. TIMES HIDDEN.', { fg: 'W' });
    s.text(r + 2, 1, 'EVERY MINUTE SLOWER = +1 POINT.', { fg: 'G' });
    s.text(r + 3, 1, 'FASTER BY ACCIDENT = MINUS POINTS.', { fg: 'R' });
    s.text(r + 4, 1, 'TIMES: TFL JOURNEY PLANNER.', { fg: 'C' });
  }

  function legRows(s, r, route, withTimes) {
    route.legs.forEach((l, i) => {
      const m = (l.parts && l.parts[0] && l.parts[0].mode) || l.mode;
      s.text(r, 1, (MODE_TAG[m] || 'GO').padEnd(5), { fg: MODE_FG[m] || 'W' });
      s.text(r, 6, cut(l.label, withTimes ? 26 : 33), { fg: 'W' });
      if (withTimes) s.right(r, `${l.minutes}M`, { fg: 'Y' });
      s.text(r + 1, 6, cut(`${l.from} > ${l.to}`, 33), { fg: 'C' });
      r += 2;
      if (i < route.legs.length - 1 && !withTimes) { s.text(r, 3, cut('CHANGE AT ' + route.changes[i], 36), { fg: 'M' }); r += 1; }
    });
    return r;
  }

  function live(st) {
    const s = new Screen();
    title(s, 'GAME MODE', `ROUND ${st.round}/${st.rounds}`);
    if (st.phase !== 'editing' || !st.journey) {
      s.center(10, st.phase === 'reveal' ? 'ROUND OVER - SEE 602' : 'NO ROUND IN PLAY', { fg: 'Y', dh: true });
      s.link(10, st.phase === 'reveal' ? 602 : 600);
      return res(s);
    }
    s.text(4, 1, cut(st.journey.title, 38), { fg: 'Y', dh: true });
    s.text(7, 1, 'THE ORIGINAL ROUTE:', { fg: 'C' });
    let r = legRows(s, 8, st.journey.base, false);
    r = Math.max(r + 1, 16);
    s.text(r, 1, 'PLAYERS EDITING IN SECRET', { fg: 'W' });
    st.players.forEach((p, i) => {
      s.text(r + 1 + i, 3, cut(p.name, 14), { fg: 'W' });
      s.text(r + 1 + i, 20, p.submitted ? 'LOCKED IN' : 'EDITING...', { fg: p.submitted ? 'G' : 'Y', flash: !p.submitted });
    });
    const ends = Date.now() + (st.secondsLeft || 0) * 1000;
    s.band(22, 'B');
    s.tick = (sc) => {
      const sec = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      sc.text(22, 1, `TIME LEFT ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}  `, { fg: sec <= 15 ? 'R' : 'Y', bg: 'B' });
      sc.right(22, '+3 MIN PER CHANGE', { fg: 'W', bg: 'B' });
    };
    s.tick(s);
    return res(s);
  }

  function reveal(st) {
    const s = new Screen();
    const rv = st.reveal;
    if (!rv) {
      title(s, 'GAME MODE', 'REVEAL');
      s.center(10, 'NO RESULTS YET', { fg: 'Y', dh: true });
      return res(s, 2000);
    }
    title(s, `ROUND ${rv.round} REVEAL`, '');
    s.text(4, 1, cut(rv.title, 38), { fg: 'Y' });
    s.text(5, 1, 'ORIGINAL', { fg: 'C' });
    s.right(5, `${rv.base.total} MIN`, { fg: 'W' });
    let r = 7;
    rv.players.forEach((p) => {
      s.band(r, p.delta > 0 ? 'G' : p.delta < 0 ? 'R' : 'B');
      const bg = p.delta > 0 ? 'G' : p.delta < 0 ? 'R' : 'B', fg = p.delta > 0 ? 'K' : 'W';
      s.text(r, 1, cut(p.name, 14), { fg, bg });
      s.text(r, 17, `${p.total} MIN`, { fg, bg });
      s.right(r, `${signed(p.delta)} PTS`, { fg, bg });
      r += 1;
      p.route.legs.forEach((l) => {
        const m = (l.parts && l.parts[0] && l.parts[0].mode) || l.mode;
        s.text(r, 2, (MODE_TAG[m] || 'GO').padEnd(5), { fg: MODE_FG[m] || 'W' });
        s.text(r, 7, cut(l.label, 27), { fg: "W" });
        s.right(r, `${l.minutes}M`, { fg: 'Y' });
        r += 1;
      });
      window.TT.wrap(p.why || '', 37).slice(0, 2).forEach((line) => { s.text(r, 2, up(line), { fg: 'C' }); r += 1; });
      r += 1;
    });
    s.text(Math.min(r, 21), 1, 'TFL JOURNEY PLANNER. +3 MIN PER CHANGE.', { fg: 'M' });
    s.band(22, 'B');
    s.text(22, 1, st.phase === 'final' ? 'FINAL SCORES ON 603' : 'NEXT ROUND: PRESS NEXT ON A PHONE', { fg: 'Y', bg: 'B' });
    s.link(22, 603);
    return res(s);
  }

  async function board(st) {
    const s = new Screen();
    title(s, st && st.phase === 'final' ? 'FINAL SCORES' : 'GAME SCORES', '');
    let r = 4;
    if (st && st.players && st.players.length) {
      const ps = st.players.slice().sort((a, b) => b.score - a.score);
      ps.forEach((p, i) => {
        s.text(r, 1, `${i + 1}. ${cut(p.name, 14)}`, { fg: i === 0 ? 'Y' : 'W', dh: i === 0 });
        s.right(r, `${signed(p.score)} PTS`, { fg: dcol(p.score), dh: i === 0 });
        r += i === 0 ? 2 : 1;
      });
      if (st.phase === 'final' && ps.length > 1) {
        const tie = ps[0].score === ps[1].score;
        s.center(r + 1, tie ? "IT'S A DRAW" : `${cut(ps[0].name, 14)} WINS`, { fg: 'G', flash: true, dh: true });
        r += 4;
      } else r += 1;
    }
    s.text(r, 1, 'ALL-TIME TOP 5', { fg: 'C' }); r += 1;
    try {
      const lb = await fetch('/api/leaderboard', { cache: 'no-store' }).then((x) => x.json());
      const rows = (lb.players || []).slice(0, 5);
      if (!rows.length) s.text(r, 1, 'APPEARS WHEN SNOWFLAKE IS CONNECTED', { fg: 'W' });
      rows.forEach((p, i) => {
        s.text(r + i, 1, `${i + 1}. ${cut(p.player, 16)}`, { fg: 'W' });
        s.right(r + i, `${signed(Math.round(p.points))} PTS`, { fg: dcol(p.points) });
      });
      if (rows.length) s.text(r + rows.length + 1, 1, 'STORED IN SNOWFLAKE', { fg: 'M' });
    } catch (e) { s.text(r, 1, 'ALL-TIME LEADERBOARD UNAVAILABLE', { fg: 'R' }); }
    return res(s, 3000);
  }

  window.LFExtra[600] = async () => {
    const st = await latest();
    if (!st || !st.code || st.phase === 'lobby' || st.phase === 'preparing') return join(st);
    if (st.phase === 'editing') return live(st);
    if (st.phase === 'reveal') return reveal(st);
    return board(st);
  };
  window.LFExtra[601] = async () => { const st = await latest(); return st && st.code ? live(st) : join(st); };
  window.LFExtra[602] = async () => { const st = await latest(); return st && st.code ? reveal(st) : join(st); };
  window.LFExtra[603] = async () => board(await latest());
})();
