// Tunnels, metrostations, trappen/roltrappen en liften uitgraven.
// Een "graafstuk" is een rechte lijn met hoogtes aan beide uiteinden. Dezelfde regels worden gebruikt
// in de kaartomzetting (alles boven de tegelbodem: inritten, trappen naar de straat) en in de diepe
// ondergrond (tunnels en perronhallen), zodat alles naadloos aansluit.
import { B } from './blocks.js';

// soorten: 'tube' (spoortunnel), 'hall' (perronhal), 'stair' (trap met roltrap naar de straat)
export function carveAt(seg, x, z, y) {
  const vx = seg.bx - seg.ax, vz = seg.bz - seg.az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x + 0.5 - seg.ax) * vx + (z + 0.5 - seg.az) * vz) / L2));
  const dx = x + 0.5 - seg.ax - vx * t, dz = z + 0.5 - seg.az - vz * t, d = Math.hypot(dx, dz);
  const s = t * Math.sqrt(L2);
  const ty = Math.round(seg.ay + (seg.by - seg.ay) * t); // vloer (ballast) van het spoor
  if (seg.type === 'tube') {
    if (d > 3.6 || y < ty - 1 || y > ty + 6) return -1;
    if (d <= 2.5) {
      if (y === ty) return d <= 1.7 ? B.BALLAST : B.CONCRETE;
      if (y > ty && y <= ty + 4) return 0;
      if (y === ty + 5) return B.CONCRETE;
      return B.CONCRETE;
    }
    if (y === ty + 4 && Math.round(s) % 12 === 0) return B.LAMP;
    return B.CONCRETE;
  }
  if (seg.type === 'tube2') {
    // dubbelsporige spoortunnel (Alpen): 10 m breed, 6 m hoog, lampen langs de wand
    if (d > 6.2 || y < ty - 1 || y > ty + 8) return -1;
    if (d <= 5.4) {
      if (y === ty) return d <= 4.7 ? B.BALLAST : B.CONCRETE;
      if (y > ty && y <= ty + 6) return 0;
      return B.CONCRETE;
    }
    if (y === ty + 5 && Math.round(s) % 24 === 0) return B.LAMP;
    return B.CONCRETE;
  }
  if (seg.type === 'hall') {
    const hw = seg.hw; // halve breedte van het perron
    const W = hw + 4.6;
    if (d > W + 1 || y < ty - 1 || y > ty + 8) return -1;
    if (d > W) return y === ty + 3 && Math.round(s) % 9 === 4 ? B.PAINT_BLUE : (y === ty + 4 && Math.round(s) % 9 === 4 ? B.PAINT_WHITE : B.PANEL_WHITE); // wand met naambord
    if (y === ty + 7) return Math.round(s) % 6 === 0 && d < W - 1 ? B.LAMP : B.PANEL_WHITE; // plafond met verlichting
    if (y < ty) return B.CONCRETE;
    const onPlat = d <= hw;
    if (onPlat) {
      if (y === ty) return B.CONCRETE + 1000;
      if (y === ty + 1) return (d > hw - 0.8 ? B.LINE_YELLOW : B.TILE) + 1000; // geleidelijn aan de rand (perron wint van tunnellucht)
      if (y === ty + 2 && Math.round(s) % 14 === 7 && d < 1) return B.DARK_PLANKS; // bank
      if (y >= ty + 2 && y <= ty + 6 && Math.round(s) % 14 === 0 && d < 0.8) return B.PANEL_DARK; // zuil
      return 0;
    }
    if (y === ty) return B.BALLAST;
    return 0;
  }
  if (seg.type === 'stair') {
    // trap van het perron (ay) naar de straat (by), 4 breed: links trap, rechts roltrap
    const hw = seg.hw || 2.2;
    if (d > hw + 1 || t <= 0 || t >= 1) return -1;
    const fl = Math.floor(seg.ay + (seg.by - seg.ay) * t); // treden
    if (y < fl - 1 || y > fl + 5) return -1;
    if (d > hw) return y <= fl + 4 ? B.PANEL_WHITE : -1;
    if (y < fl) return B.CONCRETE + 1000;
    if (y === fl) return ((dx * vz - dz * vx > 0) ? B.ESCALATOR : B.TILE) + 1000;
    if (y <= fl + 3) return 0;
    if (y === fl + 4) return Math.round(s) % 5 === 0 ? B.LAMP : B.PANEL_WHITE;
    return -1;
  }
  if (seg.type === 'lift') {
    // lift van het perron naar de straat, met een glazen liftkoker en een M-bord op straatniveau
    const ax = Math.abs(x + 0.5 - seg.ax), az = Math.abs(z + 0.5 - seg.az);
    if (ax > 2 || az > 2) return -1;
    const core = ax < 0.5 && az < 0.5;
    if (core && (y === seg.ay || y === seg.by)) return B.ELEVATOR + 1000;
    if (core && (y === seg.ay + 1 || y === seg.ay + 2 || y === seg.by + 1 || y === seg.by + 2)) return 0;
    if (y > seg.by && y <= seg.by + 3 && ax < 1.6 && az < 1.6 && !core) return (y === seg.by + 3) ? B.PAINT_BLUE : (az > 1 && ax < 0.6 && y < seg.by + 3 ? 0 : B.GLASS);
    if (y === seg.by + 4 && core) return B.PAINT_WHITE;
    return -1;
  }
  return -1;
}

// ruimtelijke index (per 32 m)
export class CarveIndex {
  constructor() { this.grid = new Map(); this.list = []; this.keys = new Set(); }
  add(seg) {
    const k = seg.key || `${seg.type}:${seg.ax.toFixed(1)},${seg.az.toFixed(1)},${seg.bx.toFixed(1)},${seg.bz.toFixed(1)}`;
    if (this.keys.has(k)) return false;
    this.keys.add(k); this.list.push(seg);
    const R = seg.type === 'hall' ? (seg.hw + 6) : seg.type === 'lift' ? 3 : seg.type === 'tube2' ? 7 : 5;
    for (let cz = Math.floor((Math.min(seg.az, seg.bz) - R) / 32); cz <= Math.floor((Math.max(seg.az, seg.bz) + R) / 32); cz++)
      for (let cx = Math.floor((Math.min(seg.ax, seg.bx) - R) / 32); cx <= Math.floor((Math.max(seg.ax, seg.bx) + R) / 32); cx++) {
        const key = cz * 100000 + cx; let l = this.grid.get(key); if (!l) this.grid.set(key, l = []); l.push(seg);
      }
    return true;
  }
  // laagste vloer van een tunnel op deze plek (of null)
  minY(x, z) {
    const l = this.grid.get(Math.floor(z / 32) * 100000 + Math.floor(x / 32));
    if (!l) return null;
    let m = null; for (const sg of l) { const y = Math.min(sg.ay, sg.by) - 2; if (m === null || y < m) m = y; }
    return m;
  }
  // blok op deze plek, of -1 als er niets gegraven wordt
  at(x, y, z) {
    const l = this.grid.get(Math.floor(z / 32) * 100000 + Math.floor(x / 32));
    if (!l) return -1;
    let best = -1, rank = -1;
    for (const seg of l) {
      let b = carveAt(seg, x, z, y);
      if (b < 0) continue;
      // perronvloeren en treden winnen van alles, dan lucht, dan vloeren, dan lampen, dan muren
      let r;
      if (b >= 1000) { b -= 1000; r = 4; } else r = b === 0 ? 3 : (b === B.BALLAST || b === B.DARK_PLANKS || b === B.PANEL_DARK) ? 2 : b === B.LAMP ? 1 : 0;
      if (r > rank) { rank = r; best = b; }
    }
    return best;
  }
}
