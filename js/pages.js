/* Londonfax pages. Each builder returns { subs: [Screen...], fastext, refresh }
 * or null when the page is not in service. Rows can carry links, so every
 * list on screen is clickable as well as reachable by page number. */
(function () {
  const { Screen, wrap, COLS } = window.TT;
  const D = window.LFData;

  // ---------- helpers ----------
  function london(d = new Date()) {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d);
    const p = Object.fromEntries(f.map(x => [x.type, x.value]));
    return { wd: p.weekday, day: p.day, mon: p.month, h: +p.hour % 24, m: +p.minute, s: +p.second };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => { const t = london(d); return `${pad(t.h)}:${pad(t.m)}`; };
  const hhmmss = (d) => { const t = london(d); return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`; };
  const dur = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; };
  const dist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}M` : `${(m / 1000).toFixed(1)}KM`);
  const ago = (d) => { const m = Math.round((Date.now() - d) / 60000); return m <= 0 ? 'JUST NOW' : `${m} MIN AGO`; };
  const placeTag = () => D.place.label.slice(0, 16);

  function title(s, text, o = {}) {
    s.band(1, o.bg || 'B', 2);
    s.text(1, 1, text, { fg: o.fg || 'Y', bg: o.bg || 'B', dh: true });
    if (o.tag) s.right(1, o.tag, { fg: o.tagFg || 'W', bg: o.bg || 'B' });
    return s;
  }
  const footerNote = (s, text, fg = 'C') => s.text(23, 1, text, { fg });
  function offline(s, what) {
    s.center(10, `${what} UNAVAILABLE`, { fg: 'R', dh: true });
    s.center(13, 'THE DATA FEED DID NOT ANSWER.', { fg: 'W' });
    s.center(14, 'LONDONFAX WILL TRY AGAIN SHORTLY.', { fg: 'W' });
    return s;
  }
  const FAST_MAIN = [{ label: 'TUBE', page: 300 }, { label: 'NEAR ME', page: 110 }, { label: 'WEATHER', page: 400 }, { label: 'CAMERAS', page: 500 }];

  const worst = (line) => line.lineStatuses.slice().sort((a, b) => a.statusSeverity - b.statusSeverity)[0];
  function statusStyle(sev) {
    if (sev === 10) return { fg: 'G' };
    if ([6, 3, 2, 1, 20, 16].includes(sev)) return { fg: 'R', flash: true };
    if ([4, 5].includes(sev)) return { fg: 'R' };
    return { fg: 'Y' };
  }
  const SHORT = { 'Hammersmith & City': 'H&CITY', 'Waterloo & City': 'W&CITY', Metropolitan: 'METRO', 'Elizabeth line': 'ELIZABETH' };
  const shortLine = (n) => (SHORT[n] || n || '').toUpperCase().slice(0, 10);
  function lineBlockColour(id) { const c = (D.LINE_COLOURS[id] || ['W'])[0]; return c === 'K' ? 'W' : c; }
  const cleanStation = (n) => (n || '').replace(/ (Underground|DLR|Rail|Tram) Stop/i, '').replace(/ (Underground|DLR|Rail|Tram) Station/ig, '')
    .replace(/ \(.*?\)/g, '').replace(/-Underground/i, '').toUpperCase();
  function block(s, r, c, colour) { const x = s.cell(r, c); if (x) Object.assign(x, { ch: ' ', mos: 63, fg: colour, bg: 'K' }); }
  const mins = (sec) => { const m = Math.floor(sec / 60); return m < 1 ? ['DUE', { fg: 'G', flash: true }] : [`${m} MIN`, { fg: 'Y' }]; };

  // ---------- P100 index ----------
  async function p100() {
    const s = new Screen();
    s.band(1, 'B', 4);
    s.banner(1, 1, 38, 4, 'LONDONFAX', { fg: 'Y', bg: 'B', size: 1.05 });
    s.center(5, 'LIVE LONDON IN FORTY COLUMNS', { fg: 'C' });
    const items = [
      ['LONDON NOW', '101', 101], ['NEAR ME', '110', 110], ['BUS STOP LIVE', '150', 150],
      ['TUBE STATUS', '300', 300], ['ELIZABETH, OVERGROUND', '310', 310], ['STATION DEPARTURES', '320-325', 320],
      ['WEATHER', '400', 400], ['CYCLE HIRE DOCKS', '450', 450], ['TRAFFIC CAMERAS (LIVE)', '500-599', 500],
      ['FIRST YEAR HACK', '199', 199], ['ABOUT LONDONFAX', '700', 700],
    ];
    items.forEach(([label, num, page], i) => {
      const r = 7 + i;
      s.text(r, 3, label, { fg: page === 199 ? 'G' : 'W' });
      s.text(r, 3 + label.length + 1, '.'.repeat(Math.max(0, 27 - label.length)), { fg: 'B' });
      s.text(r, 31, num, { fg: 'Y' });
      s.link(r, page);
    });
    try {
      const lines = await D.tubeStatus();
      const bad = lines.filter(l => worst(l).statusSeverity !== 10);
      s.band(19, bad.length ? 'R' : 'G');
      s.center(19, bad.length ? `${bad.length} TUBE LINES DISRUPTED - SEE 300` : 'GOOD SERVICE ON ALL TUBE LINES',
        { fg: bad.length ? 'W' : 'K', bg: bad.length ? 'R' : 'G' });
      s.link(19, 300);
    } catch { /* index still works offline */ }
    s.text(21, 1, 'TYPE A PAGE NUMBER, OR CLICK ANY LINE', { fg: 'G' });
    s.text(22, 1, 'SEARCH STATIONS, BUS STOP CODES + ROADS', { fg: 'G' });
    footerNote(s, 'TFL OPEN DATA + OPEN-METEO', 'M');
    return { subs: [s], fastext: FAST_MAIN, refresh: 60_000 };
  }

  // ---------- P101 London now ----------
  async function p101() {
    const s = title(new Screen(), 'LONDON NOW', { bg: 'R', fg: 'Y', tag: 'LIVE', tagFg: 'W' });
    const [w, lines, arr] = await Promise.allSettled([D.weather(), D.tubeStatus(), D.stationArrivals(D.STATIONS[0].id)]);
    s.text(4, 1, 'WEATHER', { fg: 'C' }); s.link(4, 400); s.link(5, 400);
    if (w.status === 'fulfilled') {
      const c = w.value.current, desc = D.describeWeather(c.weather_code);
      s.text(5, 1, `${Math.round(c.temperature_2m)}C  ${desc.text}`, { fg: 'Y' });
      s.text(5, 24, `WIND ${Math.round(c.wind_speed_10m)}KM/H`, { fg: 'W' });
    } else s.text(5, 1, 'WEATHER FEED UNAVAILABLE', { fg: 'R' });

    s.text(7, 1, 'TUBE', { fg: 'C' });
    if (lines.status === 'fulfilled') {
      const all = lines.value, bad = all.filter(l => worst(l).statusSeverity !== 10);
      s.text(8, 1, `${all.length - bad.length} OF ${all.length} LINES: GOOD SERVICE`, { fg: bad.length ? 'Y' : 'G' });
      bad.slice(0, 4).forEach((l, i) => {
        const st = worst(l);
        block(s, 9 + i, 1, lineBlockColour(l.id));
        s.text(9 + i, 3, shortLine(l.name), { fg: 'W' });
        s.text(9 + i, 15, st.statusSeverityDescription.toUpperCase(), statusStyle(st.statusSeverity));
      });
      for (let r = 7; r <= 12; r++) s.link(r, 300);
    } else s.text(8, 1, 'TUBE FEED UNAVAILABLE', { fg: 'R' });

    s.text(14, 1, 'NEXT FROM TEMPLE (KCL STRAND)', { fg: 'C' });
    if (arr.status === 'fulfilled') {
      arr.value.slice().sort((a, b) => a.timeToStation - b.timeToStation).slice(0, 4).forEach((t, i) => {
        block(s, 15 + i, 1, lineBlockColour(t.lineId));
        s.text(15 + i, 3, cleanStation(t.towards || t.destinationName).slice(0, 26), { fg: 'W' });
        const [txt, st] = mins(t.timeToStation); s.right(15 + i, txt, st);
      });
      for (let r = 14; r <= 18; r++) s.link(r, 320);
    } else s.text(15, 1, 'DEPARTURES UNAVAILABLE', { fg: 'R' });

    s.band(20, 'M', 2); s.link(20, 199);
    s.tick = (sc) => {
      const t = london(), now = t.h * 3600 + t.m * 60 + t.s;
      const start = 11 * 3600, end = 18 * 3600;
      const msg = now < start ? `HACKING STARTS IN ${dur(start - now)}`
        : now < end ? `HACKING ENDS IN ${dur(end - now)}` : 'HACKING HAS ENDED - JUDGING';
      for (let c = 0; c < COLS; c++) Object.assign(sc.cells[20][c], { ch: ' ', mos: 0, dh: false, bg: 'M' });
      sc.text(20, 2, msg, { fg: 'W', bg: 'M', dh: true });
    };
    s.tick(s);
    return { subs: [s], fastext: FAST_MAIN, refresh: 30_000 };
  }

  // ---------- P110 near me ----------
  async function p110() {
    const s = title(new Screen(), 'NEAR ME', { bg: 'G', fg: 'K', tag: placeTag(), tagFg: 'K' });
    const [stations, stops, docks, cams] = await Promise.allSettled([D.nearbyStations(), D.nearbyBusStops(), D.bikes(), D.camsNear(D.place, 1)]);
    s.text(3, 1, 'STATIONS', { fg: 'C' }); s.right(3, 'WALK', { fg: 'C' });
    if (stations.status === 'fulfilled' && stations.value.length) {
      stations.value.slice(0, 5).forEach((st, i) => {
        const r = 4 + i;
        s.text(r, 1, cleanStation(st.name).slice(0, 28), { fg: 'W' });
        s.right(r, `${D.walkMins(st.distance)} MIN`, { fg: 'Y' });
        s.link(r, { page: 330, data: { id: st.id, name: st.name } });
      });
    } else s.text(4, 1, 'NO STATIONS WITHIN 1.2KM', { fg: 'Y' });

    s.text(10, 1, 'BUS STOPS', { fg: 'C' }); s.text(10, 23, 'ROUTES', { fg: 'C' });
    if (stops.status === 'fulfilled' && stops.value.length) {
      stops.value.slice(0, 5).forEach((b, i) => {
        const r = 11 + i;
        s.text(r, 1, (b.letter || '-').slice(0, 2), { fg: 'Y' });
        s.text(r, 4, b.name.toUpperCase().replace(/ \/ /g, '/').slice(0, 18), { fg: 'W' });
        s.text(r, 23, b.routes.join(' ').slice(0, 16), { fg: 'G' });
        s.link(r, { page: 150, data: b });
      });
    } else s.text(11, 1, 'NO BUS STOPS WITHIN 400M', { fg: 'Y' });

    s.text(17, 1, 'CYCLE HIRE', { fg: 'C' });
    if (docks.status === 'fulfilled' && docks.value.length) {
      const near = docks.value.filter(d => d.distance <= 500);
      const bikes = near.reduce((a, d) => a + d.bikes, 0), spaces = near.reduce((a, d) => a + d.spaces, 0);
      s.text(18, 1, `${near.length} DOCKS: ${bikes} BIKES, ${spaces} SPACES`, { fg: 'W' });
    } else s.text(18, 1, 'NO DOCKS NEARBY', { fg: 'Y' });
    s.link(17, 450); s.link(18, 450);

    s.text(20, 1, 'NEAREST TRAFFIC CAMERA', { fg: 'C' });
    if (cams.status === 'fulfilled' && cams.value.length) {
      const c = cams.value[0];
      s.text(21, 1, '501', { fg: 'Y' }); s.text(21, 6, c.name.toUpperCase().slice(0, 25), { fg: 'W' });
      s.right(21, dist(c.distance), { fg: 'C' });
    }
    s.link(20, 501); s.link(21, 501);
    footerNote(s, D.place.home ? 'PRESS NEAR ME BELOW TO USE YOUR GPS' : 'USING YOUR LOCATION', 'G');
    return { subs: [s], fastext: [{ label: 'BUS STOP', page: 150 }, { label: 'CYCLES', page: 450 }, { label: 'CAMERA', page: 501 }, { label: 'INDEX', page: 100 }], refresh: 30_000 };
  }

  // ---------- P150 bus stop ----------
  async function p150(stop) {
    const fastext = [{ label: 'NEAR ME', page: 110 }, { label: 'CYCLES', page: 450 }, { label: 'TUBE', page: 300 }, { label: 'INDEX', page: 100 }];
    if (!stop) {
      try { stop = (await D.nearbyBusStops())[0]; } catch { /* handled below */ }
    }
    if (!stop) {
      const s = title(new Screen(), 'BUS STOP LIVE', { bg: 'R', fg: 'W' });
      s.text(5, 1, 'TYPE THE 5-DIGIT CODE FROM ANY LONDON', { fg: 'W' });
      s.text(6, 1, 'BUS STOP INTO THE SEARCH BOX BELOW.', { fg: 'W' });
      return { subs: [s], fastext };
    }
    const s = title(new Screen(), `STOP ${(stop.letter || '').slice(0, 3)}`.trim(), { bg: 'R', fg: 'W', tag: 'LIVE', tagFg: 'Y' });
    s.text(3, 1, stop.name.toUpperCase().slice(0, 38), { fg: 'C' });
    let list;
    try { list = await D.busArrivals(stop.id); } catch { offline(s, 'BUS TIMES'); return { subs: [s], fastext, refresh: 20_000 }; }
    list = list.slice().sort((a, b) => a.timeToStation - b.timeToStation);
    if (list[0]?.towards) s.text(4, 1, `TOWARDS ${list[0].towards.toUpperCase()}`.slice(0, 38), { fg: 'W' });
    s.text(6, 1, 'ROUTE', { fg: 'C' }); s.text(6, 8, 'DESTINATION', { fg: 'C' }); s.right(6, 'DUE', { fg: 'C' });
    if (!list.length) s.text(8, 1, 'NO BUSES DUE IN THE NEXT 30 MINUTES', { fg: 'Y' });
    list.slice(0, 14).forEach((b, i) => {
      const r = 7 + i;
      s.text(r, 1, b.lineName.toUpperCase().slice(0, 5), { fg: 'Y' });
      s.text(r, 8, (b.destinationName || '').toUpperCase().slice(0, 24), { fg: 'W' });
      const [txt, st] = mins(b.timeToStation); s.right(r, txt, st);
    });
    footerNote(s, `UPDATED ${hhmmss(new Date())}`, 'G');
    return { subs: [s], fastext, refresh: 20_000 };
  }

  // ---------- P300 / P310 line status ----------
  function statusPage(name, groups, extraFast) {
    const s = title(new Screen(), name, { tag: `AT ${hhmm()}` });
    let r = 3;
    const bad = [];
    for (const g of groups) {
      if (g.heading) s.text(r++, 1, g.heading, { fg: 'C' });
      for (const l of g.lines) {
        const [bg, fg] = D.LINE_COLOURS[l.id] || ['W', 'K'];
        s.fill(r, 1, 19, bg);
        s.text(r, 1, ' ' + l.name.toUpperCase().slice(0, 18), { fg: bg === 'K' ? 'W' : fg, bg });
        const st = worst(l);
        s.text(r, 21, st.statusSeverityDescription.toUpperCase().slice(0, 18), statusStyle(st.statusSeverity));
        if (st.statusSeverity !== 10) bad.push(l);
        r++;
      }
      r++;
    }
    r = Math.max(r, 17);
    if (bad.length) s.text(Math.min(r, 20), 1, `DETAILS FOR ${bad.length} LINE${bad.length > 1 ? 'S' : ''} ON THE NEXT PAGES`, { fg: 'C' });
    else s.text(Math.min(r, 20), 1, 'NO REPORTED PROBLEMS', { fg: 'G' });
    footerNote(s, 'SOURCE: TFL OPEN DATA');
    const subs = [s];
    for (const l of bad) {
      const [bg, fg] = D.LINE_COLOURS[l.id] || ['W', 'K'];
      const d = title(new Screen(), l.name.toUpperCase(), { bg: bg === 'K' ? 'W' : bg, fg: bg === 'K' ? 'K' : fg });
      const st = worst(l);
      d.text(4, 1, st.statusSeverityDescription.toUpperCase(), statusStyle(st.statusSeverity));
      const reasons = [...new Set(l.lineStatuses.map(x => x.reason).filter(Boolean))];
      let rr = 6;
      for (const reason of reasons) {
        for (const ln of wrap(reason, 38)) { if (rr > 21) break; d.text(rr++, 1, ln, { fg: 'W' }); }
        rr++;
      }
      if (rr > 22) d.text(21, 35, '...', { fg: 'W' });
      subs.push(d);
    }
    return { subs, fastext: extraFast, refresh: 60_000 };
  }
  async function p300() {
    let lines;
    try { lines = await D.tubeStatus(); } catch { return { subs: [offline(title(new Screen(), 'TUBE STATUS'), 'TUBE STATUS')], fastext: FAST_MAIN, refresh: 30_000 }; }
    return statusPage('TUBE STATUS', [{ lines }], [{ label: 'INDEX', page: 100 }, { label: 'RAIL', page: 310 }, { label: 'TRAINS', page: 320 }, { label: 'NEAR ME', page: 110 }]);
  }
  async function p310() {
    let lines;
    try { lines = await D.railStatus(); } catch { return { subs: [offline(title(new Screen(), 'OTHER RAIL'), 'RAIL STATUS')], fastext: FAST_MAIN, refresh: 30_000 }; }
    const og = lines.filter(l => l.modeName === 'overground');
    const other = lines.filter(l => l.modeName !== 'overground');
    return statusPage('RAIL STATUS', [{ heading: 'ELIZABETH LINE, DLR AND TRAM', lines: other }, { heading: 'LONDON OVERGROUND', lines: og }],
      [{ label: 'INDEX', page: 100 }, { label: 'TUBE', page: 300 }, { label: 'TRAINS', page: 320 }, { label: 'NEAR ME', page: 110 }]);
  }

  // ---------- departures boards (320-325 presets, 330 any station) ----------
  async function board(st, fastext) {
    let list;
    try { list = await D.stationArrivals(st.id); } catch { return { subs: [offline(title(new Screen(), st.name), 'DEPARTURES')], fastext, refresh: 20_000 }; }
    const groups = {};
    for (const t of list) (groups[t.platformName || 'PLATFORM'] ||= []).push(t);
    const rows = [];
    Object.keys(groups).sort().forEach((p) => {
      const trains = groups[p].sort((a, b) => a.timeToStation - b.timeToStation).slice(0, 4);
      const label = /^[A-Z0-9]{1,2}$/i.test(p) ? `PLATFORM ${p}` : p;
      rows.push({ head: label.toUpperCase().replace(/ - /, ' ').slice(0, 38) });
      trains.forEach(t => rows.push({ t }));
    });
    const PER = 17, chunks = [];
    let cur = [];
    for (const row of rows) {
      if ((row.head && cur.length >= PER - 2) || cur.length >= PER) { chunks.push(cur); cur = []; }
      cur.push(row);
    }
    if (cur.length) chunks.push(cur);
    if (!chunks.length) chunks.push([]);
    const fetched = new Date();
    const subs = chunks.map((chunk) => {
      const s = title(new Screen(), st.name.slice(0, 26), { bg: 'B', fg: 'W', tag: 'LIVE', tagFg: 'Y' });
      if (st.note) s.text(3, 1, st.note, { fg: 'C' });
      let r = 4;
      if (!chunk.length) {
        s.text(6, 1, 'NO TRAINS EXPECTED RIGHT NOW', { fg: 'Y' });
        s.text(8, 1, 'NATIONAL RAIL-ONLY STATIONS ARE NOT', { fg: 'W' });
        s.text(9, 1, 'COVERED BY TFL LIVE ARRIVALS.', { fg: 'W' });
      }
      for (const row of chunk) {
        if (row.head) { s.text(r++, 1, row.head, { fg: 'C' }); continue; }
        const t = row.t;
        block(s, r, 1, lineBlockColour(t.lineId));
        s.text(r, 3, shortLine(t.lineName), { fg: 'W' });
        const dest = cleanStation(t.towards || t.destinationName).replace('CHECK FRONT OF TRAIN', 'SEE FRONT OF TRAIN');
        s.text(r, 14, dest.slice(0, 18), { fg: 'W' });
        const [txt, sty] = mins(t.timeToStation); s.right(r, txt, sty);
        r++;
      }
      footerNote(s, `UPDATED ${hhmmss(fetched)}`, 'G');
      return s;
    });
    return { subs, fastext, refresh: 20_000 };
  }
  async function preset(st) {
    const i = D.STATIONS.indexOf(st), n = D.STATIONS.length;
    return board(st, [{ label: 'PREV STN', page: D.STATIONS[(i + n - 1) % n].page }, { label: 'NEXT STN', page: D.STATIONS[(i + 1) % n].page },
      { label: 'TUBE', page: 300 }, { label: 'NEAR ME', page: 110 }]);
  }
  async function p330(data) {
    const fastext = [{ label: 'NEAR ME', page: 110 }, { label: 'TUBE', page: 300 }, { label: 'RAIL', page: 310 }, { label: 'INDEX', page: 100 }];
    if (!data) {
      try { const near = await D.nearbyStations(); if (near[0]) data = near[0]; } catch { /* below */ }
    }
    if (!data) {
      const s = title(new Screen(), 'ANY STATION', { bg: 'B', fg: 'W' });
      s.text(5, 1, 'SEARCH FOR A STATION BELOW THE TV.', { fg: 'W' });
      return { subs: [s], fastext };
    }
    return board({ id: data.id, name: cleanStation(data.name), note: 'LIVE DEPARTURES' }, fastext);
  }

  // ---------- P400 weather ----------
  function weatherIcon(kind, day = true) {
    const cv = document.createElement('canvas'); cv.width = 28; cv.height = 24;
    const x = cv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 28, 24);
    const cloud = (cx, cy, k = 1, col = '#fff') => {
      x.fillStyle = col; x.beginPath();
      x.arc(cx - 5 * k, cy, 4 * k, 0, 7); x.arc(cx, cy - 3 * k, 5 * k, 0, 7); x.arc(cx + 5 * k, cy, 4 * k, 0, 7);
      x.rect(cx - 9 * k, cy, 18 * k, 4 * k); x.fill();
    };
    const sun = (cx, cy, r) => {
      x.fillStyle = day ? '#ff0' : '#fff'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      if (!day) { x.fillStyle = '#000'; x.beginPath(); x.arc(cx + r * 0.6, cy - r * 0.3, r, 0, 7); x.fill(); return; }
      x.strokeStyle = '#ff0'; x.lineWidth = 2;
      for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(t) * (r + 2), cy + Math.sin(t) * (r + 2)); x.lineTo(cx + Math.cos(t) * (r + 5), cy + Math.sin(t) * (r + 5)); x.stroke(); }
    };
    if (kind === 'sun') sun(14, 12, 6);
    else if (kind === 'part') { sun(9, 8, 5); cloud(17, 15, 1); }
    else if (kind === 'cloud') { cloud(14, 11, 1.2); }
    else if (kind === 'fog') { x.fillStyle = '#fff'; for (let i = 0; i < 4; i++) x.fillRect(3 + (i % 2) * 3, 4 + i * 5, 20, 2); }
    else {
      cloud(14, 8, 1.1);
      x.fillStyle = kind === 'snow' ? '#fff' : '#0ff';
      for (let i = 0; i < 5; i++) x.fillRect(5 + i * 4, 15 + (i % 2) * 3, 2, kind === 'snow' ? 2 : 4);
      if (kind === 'storm') { x.fillStyle = '#ff0'; x.beginPath(); x.moveTo(15, 13); x.lineTo(11, 19); x.lineTo(14, 19); x.lineTo(12, 24); x.lineTo(18, 17); x.lineTo(15, 17); x.fill(); }
    }
    return cv;
  }
  async function p400() {
    let w;
    try { w = await D.weather(); } catch { return { subs: [offline(title(new Screen(), 'LONDON WEATHER'), 'WEATHER')], fastext: FAST_MAIN, refresh: 60_000 }; }
    const c = w.current, desc = D.describeWeather(c.weather_code);
    const s = title(new Screen(), 'LONDON WEATHER', { bg: 'C', fg: 'B', tag: `AT ${hhmm()}`, tagFg: 'K' });
    s.image(4, 1, 14, 8, weatherIcon(desc.icon, !!c.is_day));
    s.banner(4, 16, 23, 5, `${Math.round(c.temperature_2m)}°C`, { fg: 'Y', size: 1.15 });
    s.text(10, 16, desc.text, { fg: 'W' });
    s.text(12, 16, 'FEELS LIKE', { fg: 'C' }); s.text(12, 28, `${Math.round(c.apparent_temperature)}C`, { fg: 'W' });
    s.text(13, 16, 'WIND', { fg: 'C' }); s.text(13, 28, `${Math.round(c.wind_speed_10m)} KM/H`, { fg: 'W' });
    s.text(14, 16, 'HUMIDITY', { fg: 'C' }); s.text(14, 28, `${Math.round(c.relative_humidity_2m)}%`, { fg: 'W' });
    const nowIso = w.current.time.slice(0, 13);
    let start = w.hourly.time.findIndex(t => t.slice(0, 13) >= nowIso); if (start < 0) start = 0;
    const hrs = w.hourly.time.slice(start, start + 12), temps = w.hourly.temperature_2m.slice(start, start + 12);
    const rain = w.hourly.precipitation_probability.slice(start, start + 12);
    s.text(16, 1, 'NEXT 12 HOURS', { fg: 'C' }); s.text(16, 16, '(TEMPERATURE IN C)', { fg: 'W' });
    const cv = document.createElement('canvas'); cv.width = 72; cv.height = 12;
    const x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 72, 12);
    const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 0.5;
    temps.forEach((t, i) => { const h = Math.max(1, Math.round((t - lo) / (hi - lo) * 12)); x.fillStyle = rain[i] >= 50 ? '#0ff' : '#ff0'; x.fillRect(i * 6, 12 - h, 4, h); });
    s.image(17, 2, 36, 4, cv, { palette: ['K', 'Y', 'C'] });
    hrs.forEach((t, i) => { s.text(21, 2 + i * 3, t.slice(11, 13), { fg: 'W' }); s.text(22, 2 + i * 3, String(Math.round(temps[i])), { fg: 'Y' }); });
    footerNote(s, 'CYAN BARS = RAIN LIKELY', 'C');

    const f = title(new Screen(), '5 DAY FORECAST', { bg: 'C', fg: 'B' });
    f.text(4, 1, 'DAY  WEATHER', { fg: 'C' }); f.text(4, 23, 'HIGH LOW RAIN', { fg: 'C' });
    w.daily.time.forEach((t, i) => {
      const r = 6 + i * 3, dd = D.describeWeather(w.daily.weather_code[i]);
      const wd = new Date(t + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
      f.text(r, 1, i === 0 ? 'TODAY' : wd, { fg: 'Y' });
      f.text(r, 7, dd.text.slice(0, 15), { fg: 'W' });
      f.text(r, 24, `${Math.round(w.daily.temperature_2m_max[i])}`.padStart(3), { fg: 'R' });
      f.text(r, 28, `${Math.round(w.daily.temperature_2m_min[i])}`.padStart(3), { fg: 'C' });
      f.text(r, 33, `${w.daily.precipitation_probability_max[i] ?? 0}%`.padStart(4), { fg: 'W' });
    });
    f.text(21, 1, `SUNRISE ${w.daily.sunrise[0].slice(11)}`, { fg: 'Y' });
    f.text(21, 20, `SUNSET ${w.daily.sunset[0].slice(11)}`, { fg: 'M' });
    footerNote(f, 'DATA: OPEN-METEO.COM (CC BY 4.0)', 'C');
    return { subs: [s, f], fastext: FAST_MAIN, refresh: 600_000 };
  }

  // ---------- P450 cycle hire ----------
  async function p450() {
    const fastext = [{ label: 'NEAR ME', page: 110 }, { label: 'BUS STOP', page: 150 }, { label: 'WEATHER', page: 400 }, { label: 'INDEX', page: 100 }];
    const s = title(new Screen(), 'CYCLE HIRE', { bg: 'R', fg: 'W', tag: placeTag(), tagFg: 'Y' });
    let docks;
    try { docks = await D.bikes(); } catch { offline(s, 'CYCLE HIRE'); return { subs: [s], fastext, refresh: 60_000 }; }
    s.text(3, 1, 'DOCKING STATION', { fg: 'C' });
    s.text(3, 23, 'BIKE', { fg: 'G' }); s.text(3, 28, 'EBIK', { fg: 'C' }); s.text(3, 33, 'FREE', { fg: 'Y' });
    if (!docks.length) s.text(5, 1, 'NO DOCKS WITHIN 800M', { fg: 'Y' });
    docks.slice(0, 9).forEach((d, i) => {
      const r = 5 + i * 2;
      s.text(r, 1, d.name.toUpperCase().replace(/,.*$/, '').slice(0, 21), { fg: 'W' });
      s.text(r + 1, 1, `${dist(d.distance)} - ${D.walkMins(d.distance)} MIN WALK`, { fg: 'M' });
      s.text(r, 23, String(d.bikes - d.ebikes).padStart(3), { fg: d.bikes ? 'G' : 'R' });
      s.text(r, 28, String(d.ebikes).padStart(3), { fg: 'C' });
      s.text(r, 33, String(d.spaces).padStart(3), { fg: d.spaces ? 'Y' : 'R' });
    });
    footerNote(s, `LIVE AT ${hhmm()}  RED = NONE LEFT`, 'G');
    return { subs: [s], fastext, refresh: 60_000 };
  }

  // ---------- P500-599 traffic cameras ----------
  async function p500() {
    const fastext = [{ label: 'NEAREST', page: 501 }, { label: 'NEAR ME', page: 110 }, { label: 'TUBE', page: 300 }, { label: 'INDEX', page: 100 }];
    let cams;
    try { cams = await D.camsNear(); } catch { return { subs: [offline(title(new Screen(), 'TRAFFIC CAMERAS'), 'CAMERAS')], fastext, refresh: 60_000 }; }
    const subs = [];
    for (let i = 0; i < cams.length; i += 15) {
      const s = title(new Screen(), 'TRAFFIC CAMERAS', { bg: 'G', fg: 'K', tag: placeTag(), tagFg: 'K' });
      s.text(3, 1, 'LIVE VIDEO - NEAREST FIRST', { fg: 'C' }); s.right(3, 'AWAY', { fg: 'C' });
      cams.slice(i, i + 15).forEach((c, k) => {
        const r = 5 + k, page = 501 + i + k;
        s.text(r, 1, String(page), { fg: 'Y' });
        s.text(r, 6, c.name.toUpperCase().slice(0, 26), { fg: 'W' });
        s.right(r, dist(c.distance), { fg: 'C' });
        s.link(r, page);
      });
      s.text(21, 1, 'CLICK A CAMERA OR TYPE ITS PAGE.', { fg: 'G' });
      s.text(22, 1, 'SEARCH ANY ROAD IN THE BOX BELOW.', { fg: 'G' });
      subs.push(s);
    }
    return { subs, fastext, refresh: 300_000 };
  }

  async function camPage(n) {
    let cams;
    try { cams = await D.camsNear(); } catch { return { subs: [offline(title(new Screen(), 'TRAFFIC CAMERA'), 'CAMERA')], fastext: FAST_MAIN, refresh: 60_000 }; }
    const cam = cams[n - 501];
    if (!cam) return null;
    const last = 500 + cams.length;
    const fastext = [{ label: 'PREV CAM', page: n > 501 ? n - 1 : last }, { label: 'NEXT CAM', page: n < last ? n + 1 : 501 },
      { label: 'CAM LIST', page: 500 }, { label: 'NEAR ME', page: 110 }];
    const s = new Screen();
    s.band(1, 'B');
    s.text(1, 1, `CAM ${n}`, { fg: 'Y', bg: 'B' });
    s.text(1, 9, cam.name.toUpperCase().slice(0, 30), { fg: 'W', bg: 'B' });
    let still = null;
    try {
      still = await D.camStill(cam);
      // the teletext version of the picture, shown when REVEAL is pressed
      s.image(2, 0, 40, 20, still.bitmap, { filter: 'saturate(1.6)', photo: true });
    } catch {
      s.center(11, 'TELETEXT VIEW UNAVAILABLE', { fg: 'Y' });
    }
    s.media = { video: cam.video, image: still ? still.url : cam.image, r: 2, c: 0, w: 40, h: 20 };
    s.text(22, 1, 'LIVE', { fg: 'R', flash: true });
    s.text(22, 6, still && still.modified ? `UPDATED ${ago(still.modified)}` : 'TFL JAMCAM', { fg: 'W' });
    if (cam.distance >= 20) s.right(22, `${dist(cam.distance)} AWAY`, { fg: 'C' });
    else s.right(22, 'SEARCHED', { fg: 'C' });
    if (cam.view) s.text(23, 1, cam.view.toUpperCase().slice(0, 29), { fg: 'C' });
    return { subs: [s], fastext, refresh: 120_000 };
  }

  // ---------- P199 First Year Hack ----------
  const SCHEDULE = [
    ['09:00', 'DOORS OPEN + CHECK-IN'], ['10:15', 'OPENING CEREMONY'], ['11:00', 'HACKING STARTS'],
    ['11:00', 'TEAM BUILDING (AUDITORIUM)'], ['11:30', 'GIT + GITHUB WORKSHOP'], ['13:00', 'LUNCH (6TH FLOOR)'],
    ['15:30', 'MINI ACTIVITY'], ['17:30', 'SOFT DEADLINE'], ['18:00', 'HARD DEADLINE'], ['18:10', 'JUDGING'],
    ['19:30', 'CLOSING CEREMONY + PRIZES'],
  ];
  async function p199() {
    const s = title(new Screen(), 'FIRST YEAR HACK', { bg: 'M', fg: 'W', tag: 'KCL TECH', tagFg: 'Y' });
    s.text(3, 1, 'TODAY: BUILD SOMETHING IN 7 HOURS', { fg: 'C' });
    s.tick = (sc) => {
      const t = london(), now = t.h * 60 + t.m;
      let cur = -1;
      SCHEDULE.forEach(([hm], i) => { const [h, m] = hm.split(':').map(Number); if (h * 60 + m <= now) cur = i; });
      SCHEDULE.forEach(([hm, what], i) => {
        const r = 5 + i;
        sc.text(r, 1, hm, { fg: 'Y' });
        sc.text(r, 7, what.padEnd(27), { fg: i === cur ? 'G' : 'W' });
        sc.text(r, 35, i === cur ? 'NOW ' : '    ', { fg: 'G', flash: true });
      });
      const sec = t.h * 3600 + t.m * 60 + t.s;
      const urgent = sec >= 61200 && sec < 64800;
      const msg = sec < 39600 ? `STARTS IN ${dur(39600 - sec)}` : sec < 64800 ? `DEADLINE ${dur(64800 - sec)}` : 'PENS DOWN! JUDGING';
      sc.band(18, urgent ? 'R' : 'B', 2);
      for (let c = 0; c < COLS; c++) Object.assign(sc.cells[18][c], { ch: ' ', mos: 0, dh: false });
      sc.center(18, msg, { fg: 'Y', bg: urgent ? 'R' : 'B', dh: true });
    };
    s.tick(s);
    s.text(21, 1, 'TRACKS: CREATIVE TECH + RETRO REMIX', { fg: 'W' });
    footerNote(s, 'SUBMIT AT MLH.LINK/FIRST-YEAR-HACK', 'G');
    return { subs: [s], fastext: FAST_MAIN };
  }

  // ---------- P700 about ----------
  async function p700() {
    const s = title(new Screen(), 'ABOUT LONDONFAX', { bg: 'Y', fg: 'B' });
    const lines = [
      ['C', 'TELETEXT (1974-2012) PUT NEWS ON EVERY'], ['C', 'TV AS 40 X 25 COLOURED CHARACTERS.'], ['W', ''],
      ['W', 'LONDONFAX REBUILDS IT AS A REAL TOOL:'],
      ['Y', ' 110 EVERYTHING NEAR YOU, BY GPS'], ['Y', ' 150 LIVE BUSES BY STOP CODE'],
      ['Y', ' 330 ANY STATION, LIVE DEPARTURES'], ['Y', ' 450 CYCLE HIRE BIKES + SPACES'],
      ['Y', ' 501 LIVE VIDEO FROM 900 TFL CAMERAS'], ['W', ''],
      ['G', 'PRESS REVEAL ON A CAMERA TO REDRAW IT'], ['G', 'AS 1980S TELETEXT BLOCK GRAPHICS.'], ['W', ''],
      ['M', 'POWERED BY TFL OPEN DATA. CONTAINS OS'], ['M', 'DATA (C) CROWN COPYRIGHT. WEATHER BY'], ['M', 'OPEN-METEO.COM (CC BY 4.0).'],
    ];
    lines.forEach(([fg, t], i) => s.text(4 + i, 1, t, { fg }));
    footerNote(s, 'BUILT AT KCL TECH FIRST YEAR HACK 2026', 'G');
    return { subs: [s], fastext: FAST_MAIN };
  }

  // ---------- registry ----------
  async function build(n, data) {
    // Pages added by feature modules (Game Mode js/pages-game.js, Control Room js/pages-control.js)
    const extra = window.LFExtra && window.LFExtra[n];
    if (extra) return extra(data);
    switch (n) {
      case 100: return p100();
      case 101: return p101();
      case 110: return p110();
      case 150: return p150(data);
      case 199: return p199();
      case 300: return p300();
      case 310: return p310();
      case 330: return p330(data);
      case 400: return p400();
      case 450: return p450();
      case 500: return p500();
      case 700: return p700();
    }
    const st = D.STATIONS.find(x => x.page === n); if (st) return preset(st);
    if (n >= 501 && n <= 599) return camPage(n);
    return null;
  }
  function notFound(n) {
    const s = title(new Screen(), `PAGE ${n}`, { bg: 'R', fg: 'W' });
    s.center(9, 'THIS PAGE IS NOT', { fg: 'Y', dh: true });
    s.center(11, 'IN SERVICE', { fg: 'Y', dh: true });
    s.center(15, 'TRY 100 FOR THE INDEX', { fg: 'W' });
    s.link(15, 100);
    return { subs: [s], fastext: FAST_MAIN };
  }

  window.LFPages = { build, notFound, london, pad };
})();
