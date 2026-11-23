// Omgevingsgeluid (WebAudio, zonder geluidsbestanden), zacht en volgens de plek:
// - stad: gefilterde ruis, luider met het aantal voertuigen rond de speler;
// - wind: zwellende ruis, sterker hoog in de bergen en bij onweer;
// - regen: fijne hoge ruis bij regen en onweer (niet ondergronds of binnen);
// - ondergronds of in een tunnel: alles gedempt, een lage galm.
// Start pas na een eerste toets of tik (de browser laat geluid niet eerder toe). Uit te zetten in de instellingen.
import { audioCtx, bus } from './sound.js';

let buf = null;
function noise(a) {
  if (buf) return buf;
  buf = a.createBuffer(1, a.sampleRate * 3, a.sampleRate);
  const d = buf.getChannelData(0); let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 4; } // wit + wat bruin
  return buf;
}
function layer(a, out, type, freq, q) {
  const s = a.createBufferSource(); s.buffer = noise(a); s.loop = true; s.loopStart = Math.random();
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(out); s.start(0, Math.random() * 2);
  return { s, f, g };
}
export class Ambient {
  constructor() { this.on = false; this.t = 0; this.levels = { stad: 0, wind: 0, regen: 0, galm: 0 }; }
  start() {
    if (this.on) return true;
    const a = audioCtx(); if (!a) return false;
    try {
      if (a.state === 'suspended') a.resume();
      this.out = a.createGain(); this.out.gain.value = 0.8; this.out.connect(bus('omgeving'));
      this.city = layer(a, this.out, 'lowpass', 380, 0.7);
      this.wind = layer(a, this.out, 'bandpass', 500, 0.6);
      this.rain = layer(a, this.out, 'highpass', 3500, 0.5);
      this.hum = layer(a, this.out, 'lowpass', 120, 1.2);
      this.on = true;
    } catch { this.on = false; }
    return this.on;
  }
  stop() { if (!this.on) return; try { for (const l of [this.city, this.wind, this.rain, this.hum]) l.s.stop(); this.out.disconnect(); } catch { /* al gestopt */ } this.on = false; }
  // o: { vehicles (aantal in de buurt), height (m boven de zee of de grond), weather, under (ondergronds), muted }
  update(dt, o) {
    if (!this.on) return;
    const a = audioCtx(); if (!a) return;
    this.t += dt;
    const t = a.currentTime, under = !!o.under, wet = o.weather === 'rain' || o.weather === 'storm';
    const stad = under || o.muted ? 0 : Math.min(0.05, (o.vehicles || 0) * 0.0012);
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 1);
    const wind = under || o.muted ? 0 : Math.min(0.06, (0.006 + Math.max(0, (o.height || 0) - 200) / 30000 + (o.weather === 'storm' ? 0.03 : o.weather === 'snow' ? 0.01 : 0)) * gust);
    const regen = under || o.muted || !wet ? 0 : (o.weather === 'storm' ? 0.05 : 0.03);
    const galm = under && !o.muted ? 0.025 : 0;
    this.city.g.gain.setTargetAtTime(stad, t, 0.8); this.wind.g.gain.setTargetAtTime(wind, t, 0.6); this.rain.g.gain.setTargetAtTime(regen, t, 1.2); this.hum.g.gain.setTargetAtTime(galm, t, 0.8);
    this.wind.f.frequency.setTargetAtTime(380 + 300 * gust, t, 0.5);
    this.levels = { stad: +stad.toFixed(3), wind: +wind.toFixed(3), regen, galm };
  }
}
