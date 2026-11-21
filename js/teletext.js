/* Londonfax teletext engine
 * A 40 x 25 character screen with the eight broadcast teletext colours,
 * double-height rows, flashing and concealed text, and 2 x 3 block
 * "mosaic" graphics. Pictures and big headlines are converted into
 * mosaics, so everything on screen obeys the same limits a 1980s set had.
 */
(function () {
  const COLS = 40, ROWS = 25, CW = 12, CH = 20;
  const PAL = { K: '#000000', R: '#ff0000', G: '#00ff00', Y: '#ffff00', B: '#0000ff', M: '#ff00ff', C: '#00ffff', W: '#ffffff' };
  const RGB = { K: [0, 0, 0], R: [255, 0, 0], G: [0, 255, 0], Y: [255, 255, 0], B: [0, 0, 255], M: [255, 0, 255], C: [0, 255, 255], W: [255, 255, 255] };
  const KEYS = Object.keys(RGB);
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  // Sixel layout inside one 12 x 20 cell: two columns, three rows (7, 6, 7 px).
  const SX = [0, 6], SY = [0, 7, 13], SH = [7, 6, 7];

  const blank = () => ({ ch: ' ', fg: 'W', bg: 'K', mos: 0, flash: false, conceal: false, dh: false });

  class Screen {
    constructor() { this.clear(); }
    clear() {
      this.cells = [];
      for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) row.push(blank());
        this.cells.push(row);
      }
      this.media = null;   // { video, image, r, c, w, h } real footage shown over the grid
      this.links = [];     // { r, c0, c1, to } clickable regions; `to` is a page or {page, data}
      this.tick = null;    // optional fn(screen, now) for live-updating rows
      return this;
    }
    link(r, to, c0 = 0, c1 = COLS - 1) { this.links.push({ r, c0, c1, to }); return this; }
    linkAt(r, c) { return this.links.find(l => l.r === r && c >= l.c0 && c <= l.c1) || null; }
    inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
    cell(r, c) { return this.inside(r, c) ? this.cells[r][c] : null; }
    text(r, c, str, o = {}) {
      str = String(str);
      for (let i = 0; i < str.length; i++) {
        const cc = c + i;
        if (!this.inside(r, cc)) continue;
        const cell = this.cells[r][cc];
        cell.ch = str[i]; cell.mos = 0;
        cell.fg = o.fg || 'W';
        if (o.bg) cell.bg = o.bg;
        cell.flash = !!o.flash; cell.conceal = !!o.conceal; cell.dh = !!o.dh;
        if (o.dh && this.inside(r + 1, cc)) this.cells[r + 1][cc].bg = cell.bg;
      }
      return this;
    }
    center(r, str, o = {}) { return this.text(r, Math.max(0, Math.floor((COLS - String(str).length) / 2)), str, o); }
    right(r, str, o = {}) { return this.text(r, COLS - String(str).length - (o.pad ?? 1), str, o); }
    fill(r, c, len, bg) { for (let i = 0; i < len; i++) { const x = this.cell(r, c + i); if (x) x.bg = bg; } return this; }
    band(r, bg, rows = 1) { for (let i = 0; i < rows; i++) this.fill(r + i, 0, COLS, bg); return this; }
    clearRow(r) { for (let c = 0; c < COLS; c++) this.cells[r][c] = blank(); return this; }

    /* Convert any canvas/image into mosaic cells. Each cell picks the pair of
     * teletext colours that best matches its six sub-pixels, like a broadcast
     * graphics artist working within the format's limits. */
    image(r0, c0, w, h, source, o = {}) {
      const pw = w * 2, ph = h * 3;
      const cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      const x = cv.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      if (o.filter) x.filter = o.filter;
      x.fillStyle = '#000'; x.fillRect(0, 0, pw, ph);
      x.drawImage(source, 0, 0, pw, ph);
      const d = x.getImageData(0, 0, pw, ph).data;
      const palette = o.palette || KEYS;
      if (o.photo) return this.photo(r0, c0, w, h, d, pw, ph);
      for (let cr = 0; cr < h; cr++) {
        for (let cc = 0; cc < w; cc++) {
          const px = [];
          for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 2; sx++) {
            const i = ((cr * 3 + sy) * pw + (cc * 2 + sx)) * 4;
            px.push([d[i], d[i + 1], d[i + 2]]);
          }
          let best = null;
          for (let a = 0; a < palette.length; a++) for (let b = a; b < palette.length; b++) {
            const A = RGB[palette[a]], B = RGB[palette[b]];
            let err = 0, bits = 0;
            for (let k = 0; k < 6; k++) {
              const ea = dist(px[k], A), eb = dist(px[k], B);
              if (eb < ea) { err += eb; bits |= (1 << k); } else err += ea;
            }
            if (!best || err < best.err) best = { err, bg: palette[a], fg: palette[b], bits };
          }
          const cell = this.cell(r0 + cr, c0 + cc);
          if (!cell) continue;
          Object.assign(cell, { ch: ' ', mos: best.bits, fg: best.fg, bg: best.bg, flash: false, conceal: false, dh: false });
        }
      }
      return this;
    }

    /* Photo mode: 1-bit Floyd-Steinberg dither on brightness gives the shape,
     * then each cell's lit sixels take the nearest saturated teletext colour
     * when the scene is genuinely colourful there (red buses, trees, signs). */
    photo(r0, c0, w, h, d, pw, ph) {
      const n = pw * ph, lum = new Float32Array(n);
      for (let p = 0; p < n; p++) lum[p] = 0.3 * d[p * 4] + 0.59 * d[p * 4 + 1] + 0.11 * d[p * 4 + 2];
      const sorted = Array.from(lum).sort((a, b) => a - b);
      const lo = sorted[Math.floor(n * 0.04)], hi = sorted[Math.floor(n * 0.96)];
      const k = 255 / Math.max(1, hi - lo);
      // levels, then a gentle S-curve so mid-greys commit to black or white (less speckle)
      for (let p = 0; p < n; p++) { const v = Math.min(1, Math.max(0, (lum[p] - lo) * k / 255)); lum[p] = 255 * v * v * (3 - 2 * v); }
      const on = new Uint8Array(n);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const p = y * pw + x, v = lum[p], q = v >= 128 ? 255 : 0, e = v - q;
        on[p] = q ? 1 : 0;
        if (x + 1 < pw) lum[p + 1] += e * 7 / 16;
        if (y + 1 < ph) {
          if (x > 0) lum[p + pw - 1] += e * 3 / 16;
          lum[p + pw] += e * 5 / 16;
          if (x + 1 < pw) lum[p + pw + 1] += e / 16;
        }
      }
      const hues = ['R', 'G', 'Y', 'B', 'M', 'C'];
      for (let cr = 0; cr < h; cr++) for (let cc = 0; cc < w; cc++) {
        let bits = 0, sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 2; sx++) {
          const p = (cr * 3 + sy) * pw + (cc * 2 + sx);
          sr += d[p * 4]; sg += d[p * 4 + 1]; sb += d[p * 4 + 2]; cnt++;
          if (on[p]) bits |= 1 << (sy * 2 + sx);
        }
        sr /= cnt; sg /= cnt; sb /= cnt;
        const mx = Math.max(sr, sg, sb), mn = Math.min(sr, sg, sb);
        let fg = 'W';
        if (mx - mn > 55 && mx > 70) {
          // normalise the colour to full brightness, then pick the nearest hue
          const nr = sr / mx * 255, ng = sg / mx * 255, nb = sb / mx * 255;
          let bd = Infinity;
          for (const hcol of hues) { const dd = dist([nr, ng, nb], RGB[hcol]); if (dd < bd) { bd = dd; fg = hcol; } }
          if (!bits) bits = 0b011110; // colourful but dark: still show the colour
        }
        const cell = this.cell(r0 + cr, c0 + cc);
        if (cell) Object.assign(cell, { ch: ' ', mos: bits, fg, bg: 'K', flash: false, conceal: false, dh: false });
      }
      return this;
    }

    /* Big chunky headline text, drawn as mosaics in a single colour. */
    banner(r0, c0, w, h, str, o = {}) {
      const pw = w * 2, ph = h * 3;
      const cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      const x = cv.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#000'; x.fillRect(0, 0, pw, ph);
      x.fillStyle = '#fff';
      x.font = `${o.weight || 900} ${Math.round(ph * (o.size || 1.0))}px ${o.font || 'Arial Black, Arial, sans-serif'}`;
      x.textBaseline = 'middle';
      x.textAlign = o.align === 'left' ? 'left' : 'center';
      const tx = o.align === 'left' ? 0 : pw / 2;
      x.fillText(str, tx, ph / 2 + (o.nudge || 0), pw);
      const d = x.getImageData(0, 0, pw, ph).data;
      const fg = o.fg || 'Y', bg = o.bg || 'K', thr = o.threshold ?? 110;
      for (let cr = 0; cr < h; cr++) for (let cc = 0; cc < w; cc++) {
        let bits = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 2; sx++) {
          const i = ((cr * 3 + sy) * pw + (cc * 2 + sx)) * 4;
          if (d[i] > thr) bits |= 1 << (sy * 2 + sx);
        }
        const cell = this.cell(r0 + cr, c0 + cc);
        if (cell) Object.assign(cell, { ch: ' ', mos: bits, fg, bg, flash: false, conceal: false, dh: false });
      }
      return this;
    }
  }

  /* Auto-levels, then Floyd-Steinberg dither every sixel to the 8 colours.
   * Keeps the tones of a grey CCTV frame readable with only pure colours. */
  function ditherInPlace(d, w, h, palette) {
    const lum = [];
    for (let i = 0; i < d.length; i += 4) lum.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
    const sorted = lum.slice().sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.03)], hi = sorted[Math.floor(sorted.length * 0.97)];
    const k = 255 / Math.max(1, hi - lo);
    const buf = new Float32Array(w * h * 3);
    for (let p = 0, i = 0; i < d.length; i += 4, p += 3) {
      buf[p] = (d[i] - lo) * k; buf[p + 1] = (d[i + 1] - lo) * k; buf[p + 2] = (d[i + 2] - lo) * k;
    }
    const cols = palette.map(c => RGB[c]);
    const spread = (x, y, er, eg, eb, f) => {
      if (x < 0 || x >= w || y >= h) return;
      const p = (y * w + x) * 3; buf[p] += er * f; buf[p + 1] += eg * f; buf[p + 2] += eb * f;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      const px = [buf[p], buf[p + 1], buf[p + 2]];
      let best = cols[0], bd = Infinity;
      for (const c of cols) { const dd = dist(px, c); if (dd < bd) { bd = dd; best = c; } }
      const er = px[0] - best[0], eg = px[1] - best[1], eb = px[2] - best[2];
      spread(x + 1, y, er, eg, eb, 7 / 16); spread(x - 1, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16); spread(x + 1, y + 1, er, eg, eb, 1 / 16);
      const i = (y * w + x) * 4; d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2];
    }
  }

  function dist(p, q) {
    const dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2];
    return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
  }

  /* Draw a Screen onto a 480 x 500 canvas. */
  function render(ctx, s, st = {}) {
    const blinkOn = st.blinkOn !== false, reveal = !!st.reveal;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let skipNext = false;
    for (let r = 0; r < ROWS; r++) {
      if (skipNext) { skipNext = false; continue; } // lower half of a double-height row
      const dhTop = r < ROWS - 1 && s.cells[r].some(c => c.dh);
      skipNext = dhTop;
      for (let c = 0; c < COLS; c++) {
        const cell = s.cells[r][c];
        const x = c * CW, y = r * CH;
        const h = st.hide;
        if (h && r >= h.r && r < h.r + h.h && c >= h.c && c < h.c + h.w) { // under live video
          ctx.fillStyle = '#000'; ctx.fillRect(x, y, CW, CH); continue;
        }
        ctx.fillStyle = PAL[cell.bg];
        ctx.fillRect(x, y, CW, dhTop ? CH * 2 : CH);
        if (cell.mos) {
          ctx.fillStyle = PAL[cell.fg];
          for (let k = 0; k < 6; k++) if (cell.mos & (1 << k)) {
            const sx = k & 1, sy = k >> 1;
            ctx.fillRect(x + SX[sx], y + SY[sy], 6, SH[sy]);
          }
        } else if (cell.ch && cell.ch !== ' ') {
          if (cell.flash && !blinkOn) continue;
          if (cell.conceal && !reveal) continue;
          ctx.fillStyle = PAL[cell.fg];
          if (cell.dh) {
            ctx.font = `bold 34px ${FONT}`;
            ctx.fillText(cell.ch, x + CW / 2, y + 33, CW - 1);
          } else {
            ctx.font = `bold 17px ${FONT}`;
            ctx.fillText(cell.ch, x + CW / 2, y + 16, CW - 1);
          }
        }
      }
    }
  }

  /* Word-wrap text to a width, upper-casing it like broadcast teletext. */
  function wrap(str, width) {
    const words = String(str).replace(/\s+/g, ' ').trim().toUpperCase().split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= width) line += ' ' + w;
      else { lines.push(line); line = w; }
      while (line.length > width) { lines.push(line.slice(0, width)); line = line.slice(width); }
    }
    if (line) lines.push(line);
    return lines;
  }

  window.TT = { Screen, render, wrap, COLS, ROWS, CW, CH, PAL };
})();
