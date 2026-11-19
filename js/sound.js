// Geluid van treinen, metro's en trams (WebAudio, zonder geluidsbestanden):
// - tractiemotor: zoemtoon die met de snelheid hoger wordt en harder bij tractie;
// - rolgeluid: gefilterde ruis, harder met de snelheid;
// - railvoegen: dubbele tik per draaistel om de 25 m;
// - remmen: piepen bij lage snelheid en sissende lucht bij het stilstaan.
let ctx = null, noiseBuf = null;
export function audioCtx() {
  if (ctx) return ctx;
  try { const A = window.AudioContext || window.webkitAudioContext; ctx = new A(); } catch { ctx = null; }
  return ctx;
}
function noise(a) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
export class RailSound {
  constructor(kind = 'train') {
    this.kind = kind; this.dist = 0; this.v = 0; this.stopped = true; this.on = false;
    const a = audioCtx(); if (!a) return;
    try {
      if (a.state === 'suspended') a.resume();
      this.out = a.createGain(); this.out.gain.value = 0.9; this.out.connect(a.destination);
      // motor
      this.mot = a.createOscillator(); this.mot.type = 'sawtooth'; this.mot.frequency.value = 60;
      this.mot2 = a.createOscillator(); this.mot2.type = 'triangle'; this.mot2.frequency.value = 120;
      const mf = a.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 600; mf.Q.value = 2; this.mf = mf;
      this.motG = a.createGain(); this.motG.gain.value = 0;
      this.mot.connect(mf); this.mot2.connect(mf); mf.connect(this.motG).connect(this.out);
      // rolgeluid
      this.roll = a.createBufferSource(); this.roll.buffer = noise(a); this.roll.loop = true;
      const rf = a.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 300; this.rf = rf;
      this.rollG = a.createGain(); this.rollG.gain.value = 0;
      this.roll.connect(rf).connect(this.rollG).connect(this.out);
      // remmen
      this.sq = a.createOscillator(); this.sq.type = 'sine'; this.sq.frequency.value = 2600;
      this.sqG = a.createGain(); this.sqG.gain.value = 0; this.sq.connect(this.sqG).connect(this.out);
      for (const o of [this.mot, this.mot2, this.roll, this.sq]) o.start();
      this.on = true;
    } catch { this.on = false; }
  }
  click(gain) {
    const a = ctx; if (!a) return;
    for (const dt of [0, 0.09]) {
      const s = a.createBufferSource(); s.buffer = noise(a);
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
      const g = a.createGain(), t = a.currentTime + dt;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      s.connect(f).connect(g).connect(this.out); s.start(t, Math.random(), 0.08);
    }
  }
  puff(gain) {
    const a = ctx; if (!a) return;
    const s = a.createBufferSource(); s.buffer = noise(a);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random(), 0.25);
  }
  hiss() {
    const a = ctx; if (!a) return;
    const s = a.createBufferSource(); s.buffer = noise(a);
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
    s.connect(f).connect(g).connect(this.out); s.start(t, 0, 1.5);
  }
  // v in m/s, throttle 0..1, brake 0..1, inside: in het voertuig (gedempt)
  update(dt, v, throttle = 0, brake = 0, inside = true) {
    if (!this.on) return;
    const a = ctx, t = a.currentTime, sp = Math.abs(v), damp = inside ? 0.7 : 1;
    const base = this.kind === 'metro' ? 90 : this.kind === 'tram' ? 70 : this.kind === 'steam' ? 30 : 55;
    this.mot.frequency.setTargetAtTime(base + sp * 6.5, t, 0.08); this.mot2.frequency.setTargetAtTime((base + sp * 6.5) * 2.01, t, 0.08);
    this.mf.frequency.setTargetAtTime(400 + sp * 25, t, 0.1);
    this.motG.gain.setTargetAtTime(sp < 0.05 && throttle < 0.05 ? 0.004 : (0.01 + throttle * 0.035 + Math.min(0.015, sp * 0.0006)) * damp, t, 0.1);
    this.rf.frequency.setTargetAtTime(180 + sp * 14, t, 0.2);
    this.rollG.gain.setTargetAtTime(Math.min(0.09, sp * 0.0022) * damp, t, 0.2);
    const squeal = brake > 0.2 && sp > 0.3 && sp < 7 ? 0.012 * brake * damp : 0;
    this.sqG.gain.setTargetAtTime(squeal, t, 0.05);
    // stoomlocomotief: puffen, 4 per omwenteling van de drijfwielen (omtrek 5,3 m), harder bij meer stoom
    if (this.kind === 'steam' && sp > 0.2) { this.chuff = (this.chuff || 0) + sp * dt; if (this.chuff > 1.33) { this.chuff = 0; this.puff(Math.min(0.14, 0.04 + throttle * 0.1) * damp); } }
    this.dist += sp * dt;
    if (this.dist > 25 && sp > 2) { this.dist = 0; this.click(Math.min(0.12, 0.02 + sp * 0.002) * damp); }
    if (sp < 0.05 && !this.stopped) { this.stopped = true; this.hiss(); }
    if (sp > 0.5) this.stopped = false;
    this.v = sp;
  }
  stop() {
    if (!this.on) return; this.on = false;
    try { for (const o of [this.mot, this.mot2, this.roll, this.sq]) o.stop(); this.out.disconnect(); } catch { /* al gestopt */ }
  }
}
