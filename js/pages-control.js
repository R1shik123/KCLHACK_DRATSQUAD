/* Control Room teletext pages (800-809). Owned by Agent 2 — see docs/AGENT-2-ROADS.md.
 * Placeholder until Agent 2's version lands, so page 800 already exists on the home page. */
(function () {
  if (window.LFExtra[800]) return;
  window.LFExtra[800] = async () => {
    const s = new TT.Screen();
    s.band(1, 'R', 2).text(1, 1, 'CONTROL ROOM', { fg: 'Y', bg: 'R', dh: true });
    s.text(5, 1, 'COMING ONLINE SHORTLY', { fg: 'W' });
    return { subs: [s], fastext: [{ label: 'INDEX', page: 100 }] };
  };
})();
