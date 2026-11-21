/* Londonfax data layer: free, keyless, browser-friendly feeds only.
 * - TfL Unified API: line status, live arrivals, nearby stops, search, cycle hire
 * - TfL JamCams: live traffic camera stills and 10-second video clips
 * - Open-Meteo: weather
 * Responses are cached briefly so page flips feel instant and we stay polite.
 */
(function () {
  // Through our server (cached, team app key, survives the venue's shared-IP rate limit);
  // straight to TfL only when the page is opened as a plain file.
  const TFL = location.protocol.startsWith('http') ? '/api/tfl' : 'https://api.tfl.gov.uk';
  const cache = new Map();

  async function getJSON(url, ttl) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      cache.set(url, { t: Date.now(), v });
      return v;
    } catch (e) {
      if (hit) return hit.v; // keep showing the last good copy
      throw e;
    }
  }

  // ---------- where "near me" means ----------
  const HOME = { lat: 51.5115, lon: -0.1160, label: 'KCL STRAND', home: true };
  let place = { ...HOME };
  const listeners = new Set();
  function setPlace(p) { place = { ...p }; listeners.forEach(fn => fn(place)); }
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available in this browser'));
      navigator.geolocation.getCurrentPosition(
        (pos) => { setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'YOUR LOCATION' }); resolve(place); },
        (err) => reject(err), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  }
  function metres(a, b) {
    const R = 6371000, t = Math.PI / 180;
    const dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Straight-line distance x1.3 approximates real street routes; 80 m/min is a typical walking pace.
  const walkMins = (m) => Math.max(1, Math.round((m * 1.3) / 80));
  const fixed = (p) => `lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}`;

  // ---------- fixed lists ----------
  const STATIONS = [
    { page: 320, id: '940GZZLUTMP', name: 'TEMPLE', note: 'FOR KCL STRAND CAMPUS' },
    { page: 321, id: '940GZZLUEMB', name: 'EMBANKMENT', note: 'FOR THE SOUTH BANK' },
    { page: 322, id: '940GZZLUWLO', name: 'WATERLOO', note: 'FOR KCL WATERLOO CAMPUS' },
    { page: 323, id: '940GZZLUKSX', name: "KING'S CROSS", note: 'ST PANCRAS INTERNATIONAL' },
    { page: 324, id: '940GZZLUOXC', name: 'OXFORD CIRCUS', note: 'FOR THE WEST END' },
    { page: 325, id: '940GZZLUBNK', name: 'BANK', note: 'FOR THE CITY' },
  ];
  const LINE_COLOURS = { // nearest of the eight teletext colours
    bakerloo: ['R', 'W'], central: ['R', 'W'], circle: ['Y', 'K'], district: ['G', 'K'],
    'hammersmith-city': ['M', 'K'], jubilee: ['W', 'K'], metropolitan: ['M', 'W'],
    northern: ['K', 'W'], piccadilly: ['B', 'W'], victoria: ['C', 'K'], 'waterloo-city': ['C', 'K'],
    elizabeth: ['M', 'W'], dlr: ['C', 'K'], tram: ['G', 'K'], liberty: ['W', 'K'], lioness: ['Y', 'K'],
    mildmay: ['B', 'W'], suffragette: ['G', 'K'], weaver: ['M', 'W'], windrush: ['R', 'W'],
  };

  // ---------- status ----------
  const tubeStatus = () => getJSON(`${TFL}/Line/Mode/tube/Status`, 60_000);
  const railStatus = () => getJSON(`${TFL}/Line/Mode/elizabeth-line,overground,dlr,tram/Status`, 60_000);

  // ---------- arrivals ----------
  const rawArrivals = (id) => getJSON(`${TFL}/StopPoint/${id}/Arrivals`, 20_000);
  async function stationArrivals(id) {
    if (!/^HUB/i.test(id)) return rawArrivals(id);
    // A "hub" groups several stations (e.g. Tube + Elizabeth line); fetch each one
    const hub = await getJSON(`${TFL}/StopPoint/${id}`, 3_600_000);
    const kids = (hub.children || []).filter(c => /NaptanMetroStation|NaptanRailStation/.test(c.stopType)).map(c => c.naptanId);
    const lists = await Promise.allSettled(kids.map(rawArrivals));
    return lists.flatMap(l => (l.status === 'fulfilled' ? l.value : []));
  }
  const busArrivals = (id) => rawArrivals(id);

  // ---------- nearby ----------
  async function nearbyStations(p = place) {
    const d = await getJSON(`${TFL}/StopPoint?${fixed(p)}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=1200&modes=tube,dlr,overground,elizabeth-line,tram`, 600_000);
    const seen = new Set();
    return d.stopPoints
      .filter(s => { const k = s.commonName.replace(/ (Underground|DLR|Rail) Station/i, ''); if (seen.has(k)) return false; seen.add(k); return true; })
      .map(s => ({ id: s.naptanId, name: s.commonName, distance: s.distance, modes: s.modes }))
      .sort((a, b) => a.distance - b.distance);
  }
  async function nearbyBusStops(p = place) {
    const d = await getJSON(`${TFL}/StopPoint?${fixed(p)}&stopTypes=NaptanPublicBusCoachTram&radius=400&modes=bus`, 600_000);
    return d.stopPoints
      .filter(s => (s.lines || []).length)
      .map(s => ({ id: s.naptanId, name: s.commonName, letter: s.stopLetter || s.indicator || '', distance: s.distance, routes: s.lines.map(l => l.name) }))
      .sort((a, b) => a.distance - b.distance);
  }
  async function bikes(p = place) {
    const d = await getJSON(`${TFL}/BikePoint?${fixed(p)}&radius=800`, 60_000);
    const list = (d.places || d || []).map(b => {
      const prop = Object.fromEntries((b.additionalProperties || []).map(a => [a.key, a.value]));
      return { name: b.commonName, distance: b.distance ?? metres(p, b), bikes: +prop.NbBikes || 0, ebikes: +prop.NbEBikes || 0, spaces: +prop.NbEmptyDocks || 0, lat: b.lat, lon: b.lon };
    });
    return list.sort((a, b) => a.distance - b.distance);
  }

  // ---------- cameras ----------
  async function allCams() {
    const d = await getJSON(`${TFL}/Place/Type/JamCam`, 600_000);
    return d.map(c => {
      const props = c.additionalProperties || [];
      const prop = Object.fromEntries(props.map(a => [a.key, a.value]));
      const when = Object.fromEntries(props.map(a => [a.key, a.modified]));
      return {
        id: c.id.replace(/^JamCams_/, ''), name: c.commonName, view: prop.view || '',
        lat: c.lat, lon: c.lon, available: prop.available !== 'false', image: prop.imageUrl, video: prop.videoUrl,
        modified: when.videoUrl || when.imageUrl || null, // when TfL last updated this camera's clip
      };
    }).filter(c => c.available && c.image);
  }
  async function camsNear(p = place, n = 99) {
    const cams = await allCams();
    return cams.map(c => ({ ...c, distance: metres(p, c) })).sort((a, b) => a.distance - b.distance).slice(0, n);
  }
  const camCache = new Map();
  async function camStill(cam) {
    const hit = camCache.get(cam.id);
    if (hit && Date.now() - hit.t < 60_000) return hit.v;
    try {
      const r = await fetch(cam.image, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const modified = r.headers.get('Last-Modified');
      const blob = await r.blob();
      const v = { bitmap: await createImageBitmap(blob), url: URL.createObjectURL(blob), modified: modified ? new Date(modified) : null };
      camCache.set(cam.id, { t: Date.now(), v });
      return v;
    } catch (e) {
      if (hit) return hit.v;
      throw e;
    }
  }

  // ---------- search ----------
  async function search(q) {
    q = q.trim();
    if (!q) return [];
    const out = [];
    if (/^\d{5}$/.test(q)) {
      const d = await getJSON(`${TFL}/StopPoint/Search/${q}?modes=bus`, 3_600_000).catch(() => ({ matches: [] }));
      for (const m of d.matches.slice(0, 3)) out.push({ kind: 'bus', id: m.id, name: m.name, detail: `BUS STOP ${q}` });
      return out;
    }
    const [st, cams] = await Promise.allSettled([
      getJSON(`${TFL}/StopPoint/Search/${encodeURIComponent(q)}?modes=tube,dlr,overground,elizabeth-line,tram&maxResults=5`, 3_600_000),
      allCams(),
    ]);
    if (st.status === 'fulfilled') for (const m of st.value.matches.slice(0, 4)) out.push({ kind: 'station', id: m.id, name: m.name, detail: (m.modes || []).filter(x => x !== 'bus').join(', ') });
    if (cams.status === 'fulfilled') {
      const words = q.toLowerCase().split(/\s+/);
      cams.value.filter(c => words.every(w => (c.name + ' ' + c.view).toLowerCase().includes(w))).slice(0, 4)
        .forEach(c => out.push({ kind: 'camera', id: c.id, name: c.name, detail: 'TRAFFIC CAMERA', lat: c.lat, lon: c.lon }));
    }
    return out;
  }

  // ---------- weather ----------
  const weather = () => getJSON('https://api.open-meteo.com/v1/forecast?latitude=51.5115&longitude=-0.1160'
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day'
    + '&hourly=temperature_2m,precipitation_probability,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    + '&timezone=Europe%2FLondon&forecast_days=5', 600_000);

  // WMO weather codes used by Open-Meteo
  function describeWeather(code) {
    const table = [
      [[0], 'CLEAR', 'sun'], [[1], 'MAINLY CLEAR', 'sun'], [[2], 'PARTLY CLOUDY', 'part'],
      [[3], 'OVERCAST', 'cloud'], [[45, 48], 'FOG', 'fog'],
      [[51, 53, 55, 56, 57], 'DRIZZLE', 'rain'], [[61, 63, 66, 80, 81], 'RAIN', 'rain'],
      [[65, 67, 82], 'HEAVY RAIN', 'rain'], [[71, 73, 75, 77, 85, 86], 'SNOW', 'snow'],
      [[95, 96, 99], 'THUNDERSTORMS', 'storm'],
    ];
    for (const [codes, text, icon] of table) if (codes.includes(code)) return { text, icon };
    return { text: 'UNSETTLED', icon: 'cloud' };
  }

  window.LFData = {
    HOME, get place() { return place; }, setPlace, locate, onPlace: (fn) => listeners.add(fn), metres, walkMins,
    STATIONS, LINE_COLOURS, tubeStatus, railStatus, stationArrivals, busArrivals,
    nearbyStations, nearbyBusStops, bikes, allCams, camsNear, camStill, search, weather, describeWeather,
  };
})();
