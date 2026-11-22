// TERRANOVA 16 — geluidslandschap (WebAudio, zonder geluidsbestanden), bovenop js/ambient.js:
// - voetstappen per ondergrond (zacht, hard, hout, metaal, zand, sneeuw, water), in het ritme van het lopen;
// - donder bij onweer (met een korte bliksemflits, uit te zetten met 'minder beweging');
// - vogels overdag en krekels 's nachts buiten de drukke stad, niet bij regen, sneeuw of ondergronds;
// - aankomstgong als een trein, metro of tram vlak bij de speler aan een halte stopt;
// - demping van alles bij sneeuw (laagdoorlaat) en onder water (sterk gedempt);
// - banden die piepen als de auto zonder grip remt of stuurt.
// Alles loopt via de mixer (js/sound.js): categorieën omgeving, voertuigen en effecten met eigen volume.
import { audioCtx, bus, setMuffle } from './sound.js';
import { BLOCKS } from './blocks.js';

let nb = null;
function noiseBuf(a) {
  if (nb) return nb;
  nb = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}
// ondergrond van een blok → soort voetstap
export function surfaceOf(id, snowCover = 0) {
  const n = (BLOCKS[id] && BLOCKS[id].name || '').toLowerCase();
  if (!id) return null;
  if (/water/.test(n)) return 'water';
  if (/sneeuw|ijs/.test(n)) return 'sneeuw';
  if (snowCover > 0.35 && /gras|aarde|blad|stoep|asfalt|steen|beton|grind|zand/.test(n)) return 'sneeuw';
  if (/zand|grind/.test(n)) return 'zand';
  if (/gras|aarde|blad|mos|bloem|hooi/.test(n)) return 'zacht';
  if (/plank|hout|parket/.test(n)) return 'hout';
  if (/metaal|staal|ijzer|rail|rooster/.test(n)) return 'metaal';
  return 'hard';
}
// klankkleur per ondergrond: filterfrequentie, Q, duur, luidheid
const STEP = {
  zacht: [500, 0.8, 0.09, 0.10], hard: [1800, 1.4, 0.05, 0.12], hout: [900, 3, 0.07, 0.12], metaal: [2600, 8, 0.09, 0.09],
  zand: [3200, 0.6, 0.11, 0.07], sneeuw: [1400, 0.5, 0.14, 0.08], water: [700, 0.7, 0.18, 0.11],
};

export class Soundscape {
  constructor(g) {
    this.g = g; this.stride = 0; this.tThunder = 8 + Math.random() * 10; this.tBird = 2; this.tCricket = 0.5;
    this.flashT = 0; this.squealG = null;
    this.events = { stappen: 0, donder: 0, vogels: 0, krekels: 0, gong: 0, piep: 0 }; this.lastSurface = null; this.muffle = 20000;
  }
  ok() { const a = audioCtx(); return a && a.state !== 'closed' ? a : null; }
  burst(out, freq, q, dur, vol, type = 'bandpass', when = 0) {
    const a = this.ok(); if (!a || !out) return;
    const t = a.currentTime + when, s = a.createBufferSource(); s.buffer = noiseBuf(a);
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = a.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(gn).connect(out); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }
  tone(out, f0, f1, dur, vol, type = 'sine', when = 0) {
    const a = this.ok(); if (!a || !out) return;
    const t = a.currentTime + when, o = a.createOscillator(), gn = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  step(surface) {
    const [f, q, d, v] = STEP[surface] || STEP.hard;
    this.burst(bus('effecten'), f * (0.9 + Math.random() * 0.2), q, d, v);
    if (surface === 'water') this.burst(bus('effecten'), 2400, 1, 0.12, 0.04, 'highpass', 0.04);
    this.events.stappen++; this.lastSurface = surface;
  }
  thunder(dist = 1) {
    // dichtbij: scherpe klap en lang rommelen; ver weg: alleen laag rommelen, later
    const late = 0.3 + dist * 2.5, out = bus('omgeving');
    if (dist < 0.5) this.burst(out, 900, 0.4, 0.35, 0.22, 'lowpass', late);
    this.burst(out, 110, 0.6, 3.5 + Math.random() * 2, 0.35 - dist * 0.15, 'lowpass', late + 0.1);
    this.burst(out, 60, 0.8, 4.5, 0.25, 'lowpass', late + 0.5);
    this.events.donder++;
    const s = this.g.settings;
    if (!s.reduceMotion) this.flash(dist < 0.5 ? 0.55 : 0.3);
  }
  flash(k) {
    let el = document.getElementById('lightning');
    if (!el) { el = document.createElement('div'); el.id = 'lightning'; el.style.cssText = 'position:fixed;inset:0;background:#e8eeff;pointer-events:none;z-index:4;opacity:0;transition:opacity .25s ease-out'; document.body.appendChild(el); }
    el.style.transition = 'none'; el.style.opacity = String(k);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'opacity .35s ease-out'; el.style.opacity = '0'; }));
    this.flashT = 0.4;
  }
  bird() {
    const out = bus('omgeving'), base = 2400 + Math.random() * 2200, n = 2 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) this.tone(out, base * (1 + Math.random() * 0.25), base * (0.7 + Math.random() * 0.6), 0.07 + Math.random() * 0.06, 0.03, 'sine', i * (0.09 + Math.random() * 0.05));
    this.events.vogels++;
  }
  cricket() {
    const out = bus('omgeving'), f = 4300 + Math.random() * 400;
    for (let i = 0; i < 3; i++) this.tone(out, f, f * 0.98, 0.035, 0.012, 'square', i * 0.06);
    this.events.krekels++;
  }
  // gong (drie tonen) bij aankomst aan een halte in de buurt
  gong() {
    const out = bus('effecten');
    [[784, 0], [659, 0.4], [523, 0.8]].forEach(([f, w]) => { this.tone(out, f, f, 1.1, 0.07, 'sine', w); this.tone(out, f * 2, f * 2, 0.6, 0.015, 'sine', w); });
    this.events.gong++;
  }
  arrive(a, pos) {
    if (!pos || !['train', 'metro', 'tram'].includes(a.kind)) return;
    const p = this.g.player.pos; if (Math.hypot(pos.x - p.x, pos.z - p.z) > 45 || Math.abs(pos.y - p.y) > 12) return;
    this.gong();
  }
  squeal(on, k = 1) {
    const a = this.ok(); if (!a) return;
    if (on && !this.squealG) {
      const o = a.createOscillator(), o2 = a.createOscillator(), gn = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 1150; o2.type = 'sine'; o2.frequency.value = 7; gn.gain.value = 0;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 6;
      const lfo = a.createGain(); lfo.gain.value = 60; o2.connect(lfo).connect(o.frequency);
      o.connect(f).connect(gn).connect(bus('voertuigen')); o.start(); o2.start(); this.squealG = { o, o2, gn };
      this.events.piep++;
    }
    if (this.squealG) this.squealG.gn.gain.setTargetAtTime(on ? 0.035 * k : 0, a.currentTime, 0.08);
    if (!on && this.squealG && this.squealG.gn.gain.value < 0.001) { try { this.squealG.o.stop(); this.squealG.o2.stop(); } catch { /* al gestopt */ } this.squealG = null; }
  }
  // per frame vanuit de spellus
  update(dt, o) {
    const g = this.g, pl = g.player, a = this.ok(); if (!a || a.state !== 'running') return;
    const quiet = o.muted;
    // demping: onder water sterk, bij sneeuw buiten zacht
    const muffle = quiet ? 20000 : pl.inWater && !g.drive ? 700 : o.weather === 'snow' && !o.under ? 2600 : 20000;
    if (muffle !== this.muffle) { this.muffle = muffle; setMuffle(muffle); }
    if (quiet) { this.squeal(false); return; }
    // voetstappen
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (!g.drive && !g.ride && !pl.fly && (pl.onGround || pl.inWater) && sp > 0.8) {
      this.stride += sp * dt;
      const len = sp > 5 ? 1.15 : 0.8;
      if (this.stride >= len) {
        this.stride = 0;
        const x = Math.floor(pl.pos.x), z = Math.floor(pl.pos.z), y = Math.floor(pl.pos.y - 0.05);
        const id = pl.inWater ? g.world.get(x, y + 1, z) || g.world.get(x, y, z) : g.world.get(x, y - 1, z) || g.world.get(x, y, z);
        const s = pl.inWater ? 'water' : surfaceOf(id, o.under ? 0 : o.snowCover || 0);
        if (s) this.step(s);
      }
    } else this.stride = 0;
    // donder
    if (o.weather === 'storm' && !o.under) {
      this.tThunder -= dt;
      if (this.tThunder <= 0) { this.tThunder = 7 + Math.random() * 16; this.thunder(Math.random()); }
    }
    // natuur: rustige plek, droog, buiten
    const hour = o.hour ?? 12, calm = !o.under && !g.drive && (o.vehicles || 0) < 15 && !['rain', 'storm', 'snow'].includes(o.weather) && o.height < 400;
    if (calm && hour > 5 && hour < 20.5) { this.tBird -= dt; if (this.tBird <= 0) { this.tBird = 1.5 + Math.random() * 5; this.bird(); } }
    if (calm && (hour > 21.5 || hour < 4.5) && o.weather !== 'mist') { this.tCricket -= dt; if (this.tCricket <= 0) { this.tCricket = 0.5 + Math.random() * 1.2; this.cricket(); } }
    // banden: weinig grip en hard remmen of sturen
    const d = g.drive, c = d && d.car;
    if (d && d.mode !== 'passenger' && c) {
      const v = Math.abs(c.speed || 0), grip = d.grip ?? 1;
      const slip = v > 7 && ((d.braking && grip < 0.85) || (Math.abs(d.steer || 0) > 0.6 && v > 14 / Math.max(0.4, grip)));
      this.squeal(slip, Math.min(1, v / 20));
    } else this.squeal(false);
    if (this.flashT > 0) this.flashT -= dt;
  }
  stop() { this.squeal(false); if (this.squealG) { try { this.squealG.o.stop(); this.squealG.o2.stop(); } catch { /* al gestopt */ } this.squealG = null; } setMuffle(20000); }
}
