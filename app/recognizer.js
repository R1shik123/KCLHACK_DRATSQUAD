/* Signfall recogniser: MediaPipe hand landmarks -> one of 8 static ASL letters.
 * Features are ratios of distances between landmarks, so they don't change with hand size,
 * distance from the camera, rotation or which hand you use. */

const TASKS = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// LETTERS: the set the current UI has descriptions for. ALL_LETTERS: everything the recogniser can tell apart.
// Not included: E M N S T (fists that differ only in thumb detail), G H P Q (need orientation), K R X (need
// crossing/hook features), O (too close to C), J Z (need motion). Better 11 solid letters than 26 flaky ones.
export const LETTERS = ['A', 'B', 'C', 'D', 'I', 'L', 'V', 'Y'];
export const ALL_LETTERS = ['A', 'B', 'C', 'D', 'F', 'I', 'L', 'U', 'V', 'W', 'Y'];

// [thumb, index, middle, ring, pinky, spread]
const TEMPLATES = {
  A: [0.45, 0, 0, 0, 0, 0.1],
  B: [0.15, 1, 1, 1, 1, 0.1],
  C: [0.6, 0.5, 0.5, 0.5, 0.5, 0.2],
  D: [0.3, 1, 0, 0, 0, 0],
  I: [0.3, 0, 0, 0, 1, 0],
  L: [1, 1, 0, 0, 0, 0],
  V: [0.3, 1, 1, 0, 0, 0.8],
  Y: [1, 0, 0, 0, 1, 0],
  U: [0.3, 1, 1, 0, 0, 0],   // V with the two fingers together
  W: [0.3, 1, 1, 1, 0, 0.5], // index, middle, ring up
  F: [0.3, 0, 1, 1, 1, 0],   // index folded to the thumb, three fingers up
};
const WEIGHTS = [0.7, 1, 1, 1, 1, 0.6];
const ACCEPT = 0.3;          // max weighted distance to accept a letter
const MARGIN = 0.05;         // best must beat the runner-up by this much
export const STABLE_FRAMES = 8;
const REARM_FRAMES = 14;     // holding the same sign fires again after this many more frames

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, (p.z - q.z) * 0.5);

export function features(lm) {
  const palm = dist(lm[0], lm[9]) || 1e-6;
  const ext = (tip, mcp) => clamp((dist(lm[0], lm[tip]) / (dist(lm[0], lm[mcp]) || 1e-6) - 1.1) / 0.75);
  const i = ext(8, 5), m = ext(12, 9);
  // Spread only means something when both index and middle are up (V vs B); otherwise a folded
  // middle finger would read as "wide spread" and break L and D.
  const spread = clamp((dist(lm[8], lm[12]) / palm - 0.15) / 0.3) * Math.min(i, m);
  return {
    v: [clamp((dist(lm[4], lm[5]) / palm - 0.25) / 0.5), i, m, ext(16, 13), ext(20, 17), spread],
    dTouch: dist(lm[4], lm[12]) / palm,
  };
}

export function classify(lm) {
  const f = features(lm);
  const wsum = WEIGHTS.reduce((a, b) => a + b, 0);
  const scores = ALL_LETTERS.map((L) => {
    const t = TEMPLATES[L];
    let d = 0;
    for (let i = 0; i < 6; i++) d += WEIGHTS[i] * (f.v[i] - t[i]) ** 2;
    d = Math.sqrt(d / wsum);
    if (L === 'D') d += Math.max(0, f.dTouch - 0.45) * 0.4; // D needs thumb meeting the middle finger
    if (L === 'C') d += Math.max(0, 0.35 - f.dTouch) * 0.5; // C keeps a gap between thumb and fingers
    return [L, d];
  }).sort((a, b) => a[1] - b[1]);
  const [best, d1] = scores[0];
  const d2 = scores[1][1];
  const ok = d1 < ACCEPT && d2 - d1 > MARGIN;
  const confidence = clamp(1 - d1 / ACCEPT) * clamp((d2 - d1) / (MARGIN * 3), 0.4, 1);
  return { letter: ok ? best : null, guess: best, confidence: ok ? confidence : 0, distance: d1, features: f };
}

/** Owns the camera, the hand landmarker and the stability filter. */
export class Recognizer {
  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.state = 'off';          // off | loading | on | denied | error
    this.error = '';
    this.preview = null;          // canvas to draw the mirrored preview into
    this.listeners = new Set();   // ({letter, confidence, landmarks, stable}) per frame
    this.signListeners = new Set(); // (letter, source) when a sign is held
    this.stateListeners = new Set();
    this.run = 0; this.lastLetter = null; this.lastTime = -1;
    this._loop = this._loop.bind(this);
  }

  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onSign(fn) { this.signListeners.add(fn); return () => this.signListeners.delete(fn); }
  onState(fn) { this.stateListeners.add(fn); fn(this.state); return () => this.stateListeners.delete(fn); }
  _setState(s, err = '') { this.state = s; this.error = err; this.stateListeners.forEach((f) => f(s, err)); }
  emitSign(letter, source) { this.signListeners.forEach((f) => f(letter, source)); }

  async start() {
    if (this.state === 'on' || this.state === 'loading') return;
    if (!navigator.mediaDevices?.getUserMedia) { this._setState('error', 'This browser has no camera access.'); return; }
    this._setState('loading');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this._setState(denied ? 'denied' : 'error', denied ? 'Camera permission was blocked.' : 'No camera found.');
      return;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    try {
      if (!this.landmarker) {
        const { FilesetResolver, HandLandmarker } = await import(`${TASKS}/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${TASKS}/wasm`);
        const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
        try { this.landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); this.delegate = 'GPU'; }
        catch { this.landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); this.delegate = 'CPU'; }
      }
    } catch (e) {
      this.stop();
      this._setState('error', 'Hand tracking could not load (check the internet connection).');
      return;
    }
    this._setState('on');
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.run = 0; this.lastLetter = null;
    if (this.state !== 'denied' && this.state !== 'error') this._setState('off');
  }

  _loop() {
    if (this.state !== 'on') return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      let res = null;
      try { res = this.landmarker.detectForVideo(v, performance.now()); } catch { res = null; }
      // Up to two hands: classify each and keep the most confident letter, so either hand works.
      // Features are distance ratios, so left and right hands need no mirroring.
      let lm = null, out = { letter: null, guess: null, confidence: 0 };
      for (const hand of res?.landmarks || []) {
        const c = classify(hand);
        const better = !lm || (c.letter && !out.letter) || (!!c.letter === !!out.letter && c.confidence > out.confidence) || (!c.letter && !out.letter && c.distance < out.distance);
        if (better) { lm = hand; out = c; }
      }
      if (out.letter && out.letter === this.lastLetter) this.run++;
      else { this.run = out.letter ? 1 : 0; this.lastLetter = out.letter; }
      const fire = out.letter && (this.run === STABLE_FRAMES || (this.run > STABLE_FRAMES && (this.run - STABLE_FRAMES) % REARM_FRAMES === 0));
      const frame = { ...out, landmarks: lm, hold: Math.min(1, this.run / STABLE_FRAMES) };
      this._draw(frame);
      this.listeners.forEach((f) => f(frame));
      if (fire) this.emitSign(out.letter, 'camera');
    }
    requestAnimationFrame(this._loop);
  }

  _draw(frame) {
    const c = this.preview;
    if (!c || !c.isConnected) return;
    const v = this.video;
    const w = c.clientWidth || 320, h = Math.round(w * (v.videoHeight || 3) / (v.videoWidth || 4));
    if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
    const g = c.getContext('2d');
    g.save();
    g.scale(-1, 1);
    g.drawImage(v, -c.width, 0, c.width, c.height);
    g.restore();
    if (frame.landmarks) {
      g.fillStyle = frame.letter ? '#7cf3a0' : '#ffffff';
      for (const p of frame.landmarks) {
        g.beginPath();
        g.arc((1 - p.x) * c.width, p.y * c.height, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
