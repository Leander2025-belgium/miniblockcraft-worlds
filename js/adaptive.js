// Adaptieve beeldkwaliteit (TERRANOVA 16): stuurt op gemeten frametijden, niet op een toestelnaam.
//
// Per venster van ±1,5 s: mediaan en 90e percentiel van de frametijd. Is het te traag voor het doel (60 FPS =
// 16,7 ms, of 30 FPS = 33,3 ms), dan één trede omlaag op de ladder (resolutie → schaduwen → kijkafstand →
// resolutie); is er drie vensters op rij ruim marge, dan één trede omhoog. Lukt 60 niet eens op de laagste trede,
// dan kiest de regelaar een stabiele 30 (in plaats van te schommelen tussen 30 en 60) en probeert hij later
// opnieuw 60, steeds minder vaak als het niet lukt. Met een vaste grens (Batterijbesparing: 30 FPS) is het doel die grens.
//
// Zuivere logica zonder Three.js: js/game.js geeft de frametijden en past de uitkomst toe (resolutie, schaduwen,
// kijkafstand). Getest zonder browser in tests/run-all.mjs.
const MS60 = 1000 / 60, MS30 = 1000 / 30;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function ladder(adaptView) {
  const L = [{ scale: 1, low: false, cut: 0 }, { scale: 0.9, low: false, cut: 0 }, { scale: 0.8, low: false, cut: 0 }, { scale: 0.8, low: true, cut: 0 }];
  if (adaptView) L.push({ scale: 0.8, low: true, cut: 32 }, { scale: 0.7, low: true, cut: 64 }, { scale: 0.6, low: true, cut: 96 }, { scale: 0.5, low: true, cut: 96 });
  else L.push({ scale: 0.7, low: true, cut: 0 }, { scale: 0.6, low: true, cut: 0 }, { scale: 0.5, low: true, cut: 0 });
  return L;
}

export class Adaptive {
  // o.cap: vaste grens in FPS (0 = geen); o.adaptView: ook de kijkafstand mag omlaag (profiel Adaptief)
  constructor(o = {}) {
    this.cap = o.cap || 0; this.L = ladder(!!o.adaptView); this.level = 0; this.win = []; this.t = 0;
    this.target = this.cap ? 1000 / this.cap : MS60; this.good = 0; this.clock = 0; this.retryAt = 30000; this.retryGap = 30000; this.trying60 = false;
    this.log = []; this.last = null;
  }
  get state() { return { ...this.L[this.level], level: this.level, target: Math.round(1000 / this.target) }; }
  note(what) { this.log.push({ t: Math.round(this.clock / 100) / 10, what, ...this.state, med: this.last?.med, p90: this.last?.p90 }); if (this.log.length > 40) this.log.shift(); }
  // één frame; geeft de nieuwe toestand terug als er iets verandert, anders null
  frame(ms) {
    if (!(ms > 0) || ms > 1000) return null; // tabblad verborgen, laadpauze: niet meetellen
    this.win.push(ms); this.t += ms; this.clock += ms;
    if (this.t < 1500 || this.win.length < 12) return null;
    const med = pct(this.win, 0.5), p90 = pct(this.win, 0.9); this.win = []; this.t = 0; this.last = { med: +med.toFixed(1), p90: +p90.toFixed(1) };
    const T = this.target, over = med > T * 1.1 || p90 > T * 1.7, room = p90 < T * 0.8;
    if (over) {
      this.good = 0;
      if (this.level < this.L.length - 1) { this.level++; this.note('omlaag'); return this.state; }
      if (!this.cap && this.target === MS60) {
        // 60 lukt niet, ook niet op de laagste trede: stabiel 30 en de kwaliteit weer terug naar boven laten klimmen
        if (this.trying60) { this.retryGap = Math.min(600000, this.retryGap * 2); this.trying60 = false; }
        this.target = MS30; this.retryAt = this.clock + this.retryGap; this.note('doel 30'); return this.state;
      }
      return null;
    }
    if (room) {
      if (++this.good >= 3 && this.level > 0) { this.good = 0; this.level--; this.note('omhoog'); return this.state; }
    } else this.good = 0;
    // opnieuw 60 proberen (alleen zonder vaste grens), op de huidige trede
    if (!this.cap && this.target === MS30 && this.clock >= this.retryAt) { this.target = MS60; this.trying60 = true; this.good = 0; this.note('60 proberen'); return this.state; }
    if (this.trying60 && this.target === MS60 && med <= MS60 * 1.1) { this.trying60 = false; this.retryGap = 30000; this.note('60 gehaald'); }
    return null;
  }
}

// grafische profielen (instellingen → Grafisch profiel). fpsCap: vaste grens; adaptView: kijkafstand mag mee omlaag.
export const PROFILES = {
  batterij: { quality: 'fast', shadows: false, view: 80, lod: 600, auto: true, fpsCap: 30, adaptView: false },
  laag: { quality: 'fast', shadows: false, view: 96, lod: 800, fpsCap: 0, adaptView: false },
  gemiddeld: { quality: 'normal', shadows: false, view: 160, lod: 1600, fpsCap: 0, adaptView: false },
  hoog: { quality: 'normal', shadows: true, view: 224, lod: 2600, fpsCap: 0, adaptView: false },
  ultra: { quality: 'ultra', shadows: true, view: 320, lod: 4000, fpsCap: 0, adaptView: false },
  adaptief: { quality: 'sharp', shadows: true, view: 224, lod: 2600, auto: true, fpsCap: 0, adaptView: true },
};
