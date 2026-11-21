/* Control Room teletext pages (800-809). Owned by Agent 2 — see docs/AGENT-2-ROADS.md.
 * 800 CONTROL ROOM: road model status, closures, impact (all SIMULATED).
 * 803 HOW THIS WORKS: method, sources, assumptions, limits. */
(function () {
  const FAST = [{ label: 'INDEX', page: 100 }, { label: 'CONTROL', page: 800 }, { label: 'METHOD', page: 803 }, { label: 'TUBE', page: 300 }];
  const up = (s) => String(s ?? '').toUpperCase();
  const cut = (s, n) => up(s).slice(0, n);
  const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const get = async (p) => { try { const r = await fetch('/api/roads' + p); return await r.json(); } catch { return null; } };
  const panelUrl = () => cut(location.host + '/control', 38);

  function title(s, text) {
    s.band(1, 'R', 2).text(1, 1, text, { fg: 'Y', bg: 'R', dh: true });
    s.right(1, 'SIMULATED', { fg: 'W', bg: 'R' });
    return s;
  }

  window.LFExtra[800] = async () => {
    const s = title(new TT.Screen(), 'CONTROL ROOM');
    const st = await get('/status');
    if (!st || !st.available) {
      s.center(8, 'ROAD MODEL OFFLINE', { fg: 'R', dh: true });
      s.center(11, cut(st?.reason || 'NO ANSWER FROM SERVER', 38), { fg: 'W' });
      s.center(14, 'TRY AGAIN SHORTLY', { fg: 'C' });
      return { subs: [s], fastext: FAST, refresh: 10000 };
    }
    const im = await get('/impact');
    s.text(4, 1, 'ROAD MODEL', { fg: 'C' }).text(4, 13, `ON  ${st.sampleTrips} SAMPLE TRIPS`, { fg: 'G' });
    s.text(5, 1, 'SPEEDS', { fg: 'C' }).text(5, 13, 'DEFAULT (NOT LIVE)', { fg: 'Y' });
    s.text(7, 1, 'CLOSED ROADS', { fg: 'Y' });
    const cl = im?.closures || [];
    if (!cl.length) s.text(8, 2, 'NONE. CLOSE ONE ON THE PANEL', { fg: 'W' });
    cl.slice(0, 3).forEach((c, i) => s.text(8 + i, 2, `${cut(c.label, 28)} ${c.km}KM`, { fg: 'R' }));
    if (cl.length && im.available !== false) {
      s.text(12, 1, 'IMPACT (EST)', { fg: 'Y' });
      if (im.since) s.right(12, `SINCE ${hhmm(im.since)}`, { fg: 'W' });
      s.text(13, 2, `REROUTED TRIPS  ${im.affectedTrips}/${im.sampleTrips}`, { fg: 'W' });
      s.text(14, 2, `EXTRA PER TRIP  +${im.extraMinutesPerAffectedTrip} MIN`, { fg: 'W' });
      const c = im.costPerHour;
      s.text(15, 2, `COST/HOUR ${gbp(c.low)}-${gbp(c.high)}`, { fg: 'G' });
      s.text(16, 2, `CENTRAL ${gbp(c.central)}`, { fg: 'G' });
      s.text(17, 1, 'DETOURS VIA', { fg: 'Y' });
      (im.slowedRoads || []).slice(0, 3).forEach((r, i) => s.text(18 + i, 2, `${cut(r.name, 28)} +${r.extraTrips}`, { fg: 'C' }));
    }
    s.text(21, 1, 'OPEN THE PANEL AT', { fg: 'W' });
    s.text(22, 1, panelUrl(), { fg: 'C' });
    s.text(23, 1, 'ALL ESTIMATES. METHOD: PAGE 803', { fg: 'M' });
    s.link(23, 803);
    return { subs: [s], fastext: FAST, refresh: 10000 };
  };

  window.LFExtra[803] = async () => {
    const m = await get('/method');
    const a = m?.assumptions || {};
    const p1 = title(new TT.Screen(), 'HOW THIS WORKS');
    [
      ['C', 'ROADS'], ['W', 'OPENSTREETMAP MAIN ROADS IN GREATER'], ['W', 'LONDON. POSTED SPEED LIMITS, ELSE'], ['W', 'CLASS DEFAULTS (20-70 MPH).'],
      ['Y', 'DEFAULT SPEEDS, NOT LIVE TRAFFIC.'],
      ['C', 'TRIPS'], ['W', `${m?.sampleTrips ?? 300} SEEDED CAR TRIPS BETWEEN`], ['W', 'MAIN-ROAD JUNCTIONS IN CENTRAL LONDON.'],
      ['W', 'CLOSING A ROAD REROUTES ONLY THE TRIPS'], ['W', 'THAT USED IT, TO THE FASTEST OPEN ROUTE.'],
      ['C', 'TIME'], ['W', `FREE FLOW + ${a.signalDelaySeconds ?? 15}S PER TRAFFIC LIGHT,`],
      ['W', `x${a.congestionFactor?.central ?? '?'} CENTRAL / x${a.congestionFactor?.outer ?? '?'} OUTER (DAYTIME).`],
      ['W', 'CHECK: STRAND-KINGS CROSS 24-30 MIN,'], ['W', 'REALITY ROUGHLY 15-30 MIN BY DAY.'],
    ].forEach(([fg, t], i) => p1.text(4 + i, 1, t, { fg }));
    p1.text(23, 1, 'PAGE 1/2', { fg: 'M' });

    const p2 = title(new TT.Screen(), 'HOW THIS WORKS');
    const v = a.valueOfTimePerHour || {}, pc = a.peoplePerCar || {}, tr = a.tripsPerHourPerSampleTrip || {};
    [
      ['C', 'COST = A RANGE, NOT ONE NUMBER'], ['W', '(LOW / CENTRAL / HIGH)'], ['W', `VALUE OF TIME £${v.low}/${v.central}/${v.high} PER HR`],
      ['W', `PEOPLE PER CAR ${pc.low}/${pc.central}/${pc.high}`], ['W', `REAL TRIPS PER SAMPLE TRIP`], ['W', `${tr.low}/${tr.central}/${tr.high} PER HOUR`],
      ['C', 'NOT MODELLED'], ['W', 'QUEUES ON DETOUR ROADS, BUSES,'], ['W', 'PEDESTRIANS, PEOPLE CANCELLING TRIPS.'],
      ['C', 'SOURCES'], ['W', 'OPENSTREETMAP (ODBL) VIA GEOFABRIK.'], ['W', 'ROAD GRAPH BUILT WITH AN ADAPTED'], ['W', 'OPEN-SOURCE BUILDER (SEE README).'],
      ['Y', 'EVERY FIGURE HERE IS SIMULATED.'],
    ].forEach(([fg, t], i) => p2.text(4 + i, 1, t, { fg }));
    p2.text(23, 1, 'PAGE 2/2', { fg: 'M' });
    return { subs: [p1, p2], fastext: FAST };
  };
})();
