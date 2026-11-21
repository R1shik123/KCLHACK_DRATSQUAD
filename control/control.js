/* Londonfax Control Room. Talks to /api/roads/* (roads/api.py) and /api/briefing. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
  let last = null;

  async function api(path, opts = {}) {
    const r = await fetch('/api/roads' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    let body = null;
    try { body = await r.json(); } catch { body = { error: `HTTP ${r.status}` }; }
    if (!r.ok && !body.error) body.error = `HTTP ${r.status}`;
    return body;
  }

  function engineBadge(st) {
    const el = $('engine');
    if (st && st.available) { el.textContent = `ROAD MODEL ON · ${st.sampleTrips} TRIPS`; el.className = 'pill ok'; }
    else { el.textContent = st?.reason ? st.reason.toUpperCase() : 'ROAD MODEL OFFLINE'; el.className = 'pill bad'; }
  }

  function renderClosures(list) {
    const ul = $('closures');
    if (!list || !list.length) { ul.innerHTML = '<li class="muted">No roads closed.</li>'; return; }
    ul.innerHTML = list.map((c) => `<li><span class="name">${esc(c.label)}<span class="sub">about ${c.km} km closed, both directions</span></span>
      <button class="ghost" data-reopen="${esc(c.id)}">Reopen</button></li>`).join('');
  }

  function renderImpact(im) {
    const box = $('impact');
    if (!im || im.available === false) { box.className = 'muted'; box.textContent = im?.reason ? `Road model unavailable: ${im.reason}.` : 'Road model unavailable.'; $('since').textContent = ''; return; }
    last = im;
    $('assumptions').textContent = JSON.stringify(im.assumptions, null, 2);
    renderClosures(im.closures);
    if (!im.closures.length) { box.className = 'muted'; box.textContent = 'Close a road to see its impact.'; $('since').textContent = ''; return; }
    $('since').textContent = im.since ? `since ${hhmm(im.since)}` : '';
    const c = im.costPerHour, vh = im.delayVehicleHoursPerHour;
    const maxT = Math.max(1, ...im.slowedRoads.map((r) => r.extraTrips));
    box.className = '';
    box.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${im.affectedTrips} / ${im.sampleTrips}</b><span>sample trips rerouted</span></div>
        <div class="stat"><b>+${im.extraMinutesPerAffectedTrip} min</b><span>extra per rerouted trip (EST)</span></div>
        <div class="stat"><b>${vh.low}–${vh.high}</b><span>vehicle-hours lost per hour (EST, central ${vh.central})</span></div>
        <div class="stat"><b>${money(c.low)}–${money(c.high)}</b><span>cost per hour (EST, central ${money(c.central)})</span></div>
      </div>
      ${im.unreachableTrips ? `<p class="error">${im.unreachableTrips} sample trips have no open route at all.</p>` : ''}
      <h2>Roads taking the detours</h2>
      ${im.slowedRoads.length ? `<div class="bars">${im.slowedRoads.map((r) => `
        <div class="bar"><span class="name">${esc(r.name)}</span><span>+${r.extraTrips} trips</span><i style="width:${Math.round(100 * r.extraTrips / maxT)}%"></i></div>`).join('')}</div>`
        : '<p class="muted">No sample trip had to change route.</p>'}
      <p class="src">SIMULATED. A fixed, seeded sample of car trips on OpenStreetMap roads, not live traffic. Ranges show the uncertain assumptions (see How this works).</p>`;
  }

  async function refresh() {
    const st = await api('/status').catch(() => null);
    engineBadge(st);
    if (st && st.available) renderImpact(await api('/impact').catch(() => null));
    else renderImpact(st);
  }

  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    const ul = $('results');
    if (q.length < 2) return;
    ul.innerHTML = '<li class="muted">Searching…</li>';
    const r = await api('/search?q=' + encodeURIComponent(q)).catch(() => null);
    if (!r || r.available === false) { ul.innerHTML = `<li class="error">Road model unavailable${r?.reason ? ': ' + esc(r.reason) : ''}.</li>`; return; }
    if (!r.results.length) { ul.innerHTML = '<li class="muted">No main road by that name.</li>'; return; }
    ul.innerHTML = r.results.map((x, i) => `<li><span class="name">${esc(x.name)}<span class="sub">about ${x.km} km near ${x.near[0].toFixed(3)}, ${x.near[1].toFixed(3)}</span></span>
      <button class="danger" data-close="${i}">Close</button></li>`).join('');
    ul.dataset.results = JSON.stringify(r.results);
  });

  $('results').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-close]');
    if (!b) return;
    const x = JSON.parse($('results').dataset.results)[+b.dataset.close];
    b.disabled = true; b.textContent = 'Closing…';
    const r = await api('/close', { method: 'POST', body: JSON.stringify({ name: x.name, near: x.near }) });
    if (r.error || r.available === false) { b.textContent = 'Failed'; return; }
    b.textContent = 'Closed';
    $('impact').textContent = 'Rerouting sample trips…';
    refresh();
  });

  $('closures').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reopen]');
    if (!b) return;
    b.disabled = true;
    await api('/close/' + encodeURIComponent(b.dataset.reopen), { method: 'DELETE' });
    refresh();
  });

  $('reset').addEventListener('click', async () => { await api('/reset', { method: 'POST' }); refresh(); });

  $('brief').addEventListener('click', async () => {
    const b = $('brief'), t = $('brief-text'), src = $('brief-src');
    if (!last || !last.closures?.length) { t.textContent = 'Close a road first, then ask for a briefing.'; return; }
    b.disabled = true; t.textContent = 'Writing briefing…'; src.textContent = '';
    try {
      const r = await fetch('/api/briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Londonfax Control Room (SIMULATED)',
          closures: last.closures.map((c) => c.label),
          metrics: {
            sampleTrips: last.sampleTrips, reroutedTrips: last.affectedTrips, unreachableTrips: last.unreachableTrips,
            extraMinutesPerReroutedTrip: last.extraMinutesPerAffectedTrip, vehicleHoursLostPerHour: last.delayVehicleHoursPerHour,
            costPerHour: last.costPerHour, slowedRoads: last.slowedRoads.map((r) => r.name),
          },
          assumptions: last.assumptions,
        }),
      });
      const d = await r.json();
      t.className = ''; t.textContent = d.text || 'No briefing returned.';
      src.textContent = d.source === 'snowflake-cortex' ? 'Written by Snowflake Cortex from the numbers above.' : 'Automatic summary.';
    } catch {
      t.className = 'error'; t.textContent = 'Briefing service unavailable.';
    }
    b.disabled = false;
  });

  refresh();
  setInterval(refresh, 10000);
})();
