// Hand-shape recogniser. MediaPipe finds 21 landmarks per hand; we turn them into 6 size-independent features and
// pick the nearest letter template. Every number comes from design/recognizer.json so the app matches exactly.

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

export function classify(lm, cfg) {
  const f = features(lm);
  const w = cfg.weights, wsum = w.reduce((x, y) => x + y, 0);
  const scores = Object.entries(cfg.templates).map(([L, t]) => {
    let d = 0;
    for (let i = 0; i < 6; i++) d += w[i] * (f.v[i] - t[i]) ** 2;
    d = Math.sqrt(d / wsum);
    for (const r of cfg.rules[L] || []) d += penalty(r, f);
    return [L, d];
  }).sort((a, b) => a[1] - b[1]);
  const [best, d1] = scores[0];
  const d2 = scores[1][1];
  const ok = d1 < cfg.accept && d2 - d1 > cfg.margin;
  const confidence = clamp(1 - d1 / cfg.accept) * clamp((d2 - d1) / (cfg.margin * 3), 0.4, 1);
  return { letter: ok ? best : null, guess: best, confidence: ok ? confidence : 0, distance: d1 };
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

/** Owns the camera stream and the per-frame loop. One instance is shared by every screen. */
export class Recognizer {
  constructor(cfg) {
    this.cfg = cfg;
    this.video = document.createElement("video");
    this.video.playsInline = true; this.video.muted = true; this.video.autoplay = true;
    this.state = "off"; // off | loading | on | denied | error
    this.listeners = new Set();
    this.canvas = null;
    this.lastTime = -1;
    this._loop = this._loop.bind(this);
  }

  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Attach the live video and landmark overlay to a camera frame element. */
  mount(frameEl) {
    const old = frameEl.querySelector("video, canvas");
    if (old) return;
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
    if (this.state === "on" || this.state === "loading") this.state = "off";
  }

  _loop() {
    if (this.state !== "on") return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      let res = null;
      try { res = this.landmarker.detectForVideo(v, performance.now()); } catch { res = null; }
      // Up to two hands: classify each and keep the most confident, so either hand works.
      let lm = null, out = { letter: null, guess: null, confidence: 0, distance: Infinity };
      for (const hand of res?.landmarks || []) {
        const c = classify(hand, this.cfg);
        const better = !lm || (c.letter && !out.letter) || (!!c.letter === !!out.letter && (c.letter ? c.confidence > out.confidence : c.distance < out.distance));
        if (better) { lm = hand; out = c; }
      }
      const frame = { ...out, landmarks: lm, hand: !!lm };
      this._draw(frame);
      this.listeners.forEach((f) => f(frame));
    }
    requestAnimationFrame(this._loop);
  }

  _draw(frame) {
    const c = this.canvas;
    if (!c || !c.isConnected) return;
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (!frame.landmarks) return;
    // Match object-fit: cover on the video.
    const vw = this.video.videoWidth || 4, vh = this.video.videoHeight || 3;
    const scale = Math.max(c.width / vw, c.height / vh);
    const ox = (c.width - vw * scale) / 2, oy = (c.height - vh * scale) / 2;
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = frame.letter ? css.getPropertyValue("--color-accent").trim() || "#0071E3" : "rgba(255,255,255,0.9)";
    const r = 3.5 * dpr;
    for (const p of frame.landmarks) {
      g.beginPath();
      g.arc(ox + (1 - p.x) * vw * scale, oy + p.y * vh * scale, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}
