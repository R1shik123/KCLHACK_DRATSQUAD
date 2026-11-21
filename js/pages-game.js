/* Game Mode teletext pages (600-609). Owned by Agent 3 — see docs/AGENT-3-GAME.md.
 * Placeholder until Agent 3's version lands, so page 600 already exists on the home page. */
(function () {
  if (window.LFExtra[600]) return;
  window.LFExtra[600] = async () => {
    const s = new TT.Screen();
    s.band(1, 'M', 2).text(1, 1, 'GAME MODE', { fg: 'W', bg: 'M', dh: true });
    s.text(5, 1, 'COMING ONLINE SHORTLY', { fg: 'W' });
    return { subs: [s], fastext: [{ label: 'INDEX', page: 100 }] };
  };
})();
