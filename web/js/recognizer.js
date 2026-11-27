// Hand-shape recogniser. MediaPipe finds 21 landmarks per hand; we turn them into 6 size-independent features and
// pick the nearest letter. Two models work together (both on the device):
//   1. Templates: hand-written ideal shapes per letter, with extra geometric rules (design/recognizer.json).
//   2. Personal model: k-nearest-neighbours over the player's own recorded samples (calibration).
// A majority vote over the last few frames smooths out flicker. Every number comes from design/recognizer.json.

const TASKS = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, (p.z - q.z) * 0.5);

export function features(lm) {
  const palm = dist(lm[0], lm[9]) || 1e-6;
  const ext = (tip, mcp) => clamp((dist(lm[0], lm[tip]) / (dist(lm[0], lm[mcp]) || 1e-6) - 1.1) / 0.75);
  const i = ext(8, 5), m = ext(12, 9);
  const spread = clamp((dist(lm[8], lm[12]) / palm - 0.15) / 0.3) * Math.min(i, m);
  const f = {
    v: [clamp((dist(lm[4], lm[5]) / palm - 0.25) / 0.5), i, m, ext(16, 13), ext(20, 17), spread],
    dTouch: dist(lm[4], lm[12]) / palm,
    up: clamp((lm[0].y - lm[9].y) / palm, -1, 1),
    tipsToThumb: [8, 12, 16, 20].reduce((a, k) => a + dist(lm[4], lm[k]) / palm, 0) / 4,
    crossed: (lm[8].x - lm[12].x) * (lm[6].x - lm[10].x) < 0,
  };
  for (const k of [6, 8, 9, 10, 13]) f["thumbTo" + k] = dist(lm[4], lm[k]) / palm;
  return f;
}

function penalty(rule, f) {
  const [kind, a, b, c] = rule;
  switch (kind) {
    case "up": return 0.35 * Math.max(0, 0.45 - f.up);
    case "side": return 0.35 * Math.max(0, Math.abs(f.up) - 0.45);
    case "down": return 0.35 * Math.max(0, f.up + 0.2);
    case "near": return 0.4 * Math.max(0, f[a] - b);
    case "touchMax": return Math.max(0, f.dTouch - a) * b;
    case "touchMin": return Math.max(0, a - f.dTouch) * b;
    case "farMin": return Math.max(0, b - f[a]) * c;
    case "crossed": return f.crossed ? a : 0;
    case "notCrossed": return f.crossed ? 0 : a;
    default: return 0;
  }
}

/** samples: { letter: [[6 numbers], ...] } from the player's calibration (may be empty). */
export function classify(lm, cfg, samples = {}) {
  const f = features(lm);
  const w = cfg.weights, wsum = w.reduce((x, y) => x + y, 0);
  const wd = (a, b) => { let d = 0; for (let i = 0; i < 6; i++) d += w[i] * (a[i] - b[i]) ** 2; return Math.sqrt(d / wsum); };
  const cal = cfg.calibration;
  const scores = Object.entries(cfg.templates).map(([L, t]) => {
    let d = wd(f.v, t);
    for (const r of cfg.rules[L] || []) d += penalty(r, f);
    const s = samples[L];
    if (cal && s && s.length >= cal.k) {
      const near = s.map((x) => wd(f.v, x)).sort((a, b) => a - b).slice(0, cal.k);
      const knn = near.reduce((a, b) => a + b, 0) / near.length;
      d = (1 - cal.blend) * d + cal.blend * knn;
    }
    return [L, d];
  }).sort((a, b) => a[1] - b[1]);
  const [best, d1] = scores[0];
  const d2 = scores[1][1];
  const ok = d1 < cfg.accept && d2 - d1 > cfg.margin;
  const confidence = clamp(1 - d1 / cfg.accept) * clamp((d2 - d1) / (cfg.margin * 3), 0.4, 1);
  return { letter: ok ? best : null, guess: best, confidence: ok ? confidence : 0, distance: d1, vec: f.v };
}

let landmarkerPromise = null;
async function loadLandmarker(cfg) {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(`${TASKS}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${TASKS}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: cfg.model.url, delegate }, runningMode: "VIDEO", numHands: cfg.model.numHands,
        minHandDetectionConfidence: cfg.model.minDetectionConfidence,
        minHandPresenceConfidence: cfg.model.minPresenceConfidence,
        minTrackingConfidence: cfg.model.minTrackingConfidence,
      });
      try { return await HandLandmarker.createFromOptions(files, opts("GPU")); }
      catch { return await HandLandmarker.createFromOptions(files, opts("CPU")); }
    })().catch((e) => { landmarkerPromise = null; throw e; });
  }
  return landmarkerPromise;
}

/** Majority vote over the last N frames, per tracked slot. */
class Smoother {
  constructor(window, minVotes) { this.n = window; this.min = minVotes; this.buf = []; }
  push(letter) {
    this.buf.push(letter); if (this.buf.length > this.n) this.buf.shift();
    const votes = {};
    for (const l of this.buf) if (l) votes[l] = (votes[l] || 0) + 1;
    let best = null, bestN = 0;
    for (const [l, n] of Object.entries(votes)) if (n > bestN) { best = l; bestN = n; }
    return bestN >= this.min ? best : null;
  }
  clear() { this.buf = []; }
}

/** Owns the camera stream and the per-frame loop. One instance is shared by every screen. */
export class Recognizer {
  constructor(cfg, getSamples) {
    this.cfg = cfg;
    this.getSamples = getSamples || (() => ({}));
    this.video = document.createElement("video");
    this.video.playsInline = true; this.video.muted = true; this.video.autoplay = true;
    this.state = "off"; // off | loading | on | denied | error
    this.listeners = new Set();
    this.canvas = null;
    this.lastTime = -1;
    const s = cfg.smoothing || { window: 1, minVotes: 1 };
    this.smooth = { main: new Smoother(s.window, s.minVotes), left: new Smoother(s.window, s.minVotes), right: new Smoother(s.window, s.minVotes) };
    this._loop = this._loop.bind(this);
  }

  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Attach the live video and landmark overlay to a camera frame element. */
  mount(frameEl) {
    if (frameEl.querySelector("video")) return;
    this.canvas = document.createElement("canvas");
    frameEl.prepend(this.canvas);
    frameEl.prepend(this.video);
    if (this.video.srcObject) this.video.play().catch(() => {}); // moving a video element can pause it
  }

  async start() {
    if (this.state === "on") return "on";
    if (this.state === "loading") return this._starting;
    this.state = "loading";
    this._starting = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { this.state = "error"; return this.state; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      } catch (e) {
        this.state = e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error";
        return this.state;
      }
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      try { this.landmarker = await loadLandmarker(this.cfg); }
      catch { this.stop(); this.state = "error"; return this.state; }
      this.state = "on";
      requestAnimationFrame(this._loop);
      return this.state;
    })();
    return this._starting;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.video.srcObject = null;
    Object.values(this.smooth).forEach((s) => s.clear());
    if (this.state === "on" || this.state === "loading") this.state = "off";
  }

  _loop() {
    if (this.state !== "on") return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      let res = null;
      try { res = this.landmarker.detectForVideo(v, performance.now()); } catch { res = null; }
      const samples = this.getSamples();
      const hands = (res?.landmarks || []).map((lm) => {
        const c = classify(lm, this.cfg, samples);
        // Screen side as the player sees it (the video is mirrored): wrist x < 0.5 in camera space = right of screen.
        return { ...c, landmarks: lm, side: lm[0].x > 0.5 ? "left" : "right" };
      });
      // Main slot: the most confident hand, so either hand works.
      let main = null;
      for (const h of hands) {
        if (!main || (h.letter && !main.letter) || (!!h.letter === !!main.letter && (h.letter ? h.confidence > main.confidence : h.distance < main.distance))) main = h;
      }
      const frame = {
        hand: !!main,
        letter: this.smooth.main.push(main?.letter || null),
        raw: main?.letter || null,
        confidence: main?.confidence || 0,
        vec: main?.vec || null,
        landmarks: main?.landmarks || null,
        hands,
        sides: {
          left: this.smooth.left.push(hands.find((h) => h.side === "left")?.letter || null),
          right: this.smooth.right.push(hands.find((h) => h.side === "right")?.letter || null),
        },
      };
      this._draw(hands, frame.letter);
      this.listeners.forEach((f) => f(frame));
    }
    requestAnimationFrame(this._loop);
  }

  _draw(hands, mainLetter) {
    const c = this.canvas;
    if (!c || !c.isConnected) return;
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (!hands.length) return;
    const vw = this.video.videoWidth || 4, vh = this.video.videoHeight || 3;
    const scale = Math.max(c.width / vw, c.height / vh);
    const ox = (c.width - vw * scale) / 2, oy = (c.height - vh * scale) / 2;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#0071E3";
    const r = 3.5 * dpr;
    for (const hand of hands) {
      g.fillStyle = hand.letter ? accent : "rgba(255,255,255,0.9)";
      for (const p of hand.landmarks) {
        g.beginPath();
        g.arc(ox + (1 - p.x) * vw * scale, oy + p.y * vh * scale, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

/** Turns frames into discrete signs: a letter counts after `stable` frames, and again every `rearm` frames while held. */
export class HoldTracker {
  constructor(stable, rearm) { this.stable = stable; this.rearm = rearm; this.reset(); }
  /** Returns { letter, progress (0–1), fired (letter or null) } */
  push(letter) {
    if (letter && letter === this.letter) this.run++;
    else if (letter) { this.letter = letter; this.run = 1; this.count = 0; }
    else { this.run = Math.max(0, this.run - 2); if (!this.run) { this.letter = null; this.count = 0; } }
    let fired = null;
    if (this.letter && this.run >= this.stable + this.count * this.rearm) { fired = this.letter; this.count++; }
    const progress = this.count ? 1 : Math.min(1, this.run / this.stable);
    return { letter: this.letter, progress, fired };
  }
  reset() { this.letter = null; this.run = 0; this.count = 0; }
}
