// Alpenspoornet in het spel: dienstregeling (zonder botsingen), treinen met interieur waarin je kan rondlopen,
// meerijden (zitplaats kiezen, in- en uitstappen aan perrons), zelf rijden vanuit de cabine (tractie, rem,
// noodrem, seinen, snelheidsbeperkingen, haltes, deuren, omroepen) en een interactieve kaart met reisplanner.
import * as THREE from 'three';
import { B } from './blocks.js';
import { meshChunk } from './mesher.js';
import { LINES, LINE, STATIONS_ALL, TRACK, OX, OZ } from './alpen-net.js';
import { trackOffset, LIFTS, PATCHES, HEMEL, MW, ML, SUMMIT_XZ, STATIONS as CABLE_ST, CROSSINGS, groundAt } from './alpen.js';

const KMH = 3.6, P = 14400; // de dienstregeling herhaalt zich elke 4 uur
const GAP = 0.6; // tussen twee rijtuigen

// ---------- rijtuigen (x = breedte 0..3, y = 0..5, z = lengte, voorkant = +z) ----------
const LIVERY = {
  AE: [B.PAINT_RED, B.PAINT_WHITE], RB: [B.PAINT_WHITE, B.PAINT_RED], EN: [B.PAINT_BLUE, B.PAINT_WHITE], IC: [B.PAINT_BLUE, B.PAINT_WHITE],
  S1: [B.PAINT_WHITE, B.PAINT_BLUE], ICE: [B.PAINT_WHITE, B.PAINT_RED], PE: [B.PAINT_ORANGE, B.PAINT_WHITE], ZB: [B.PAINT_RED, B.PAINT_WHITE],
  ME: [B.PAINT_GREEN, B.PAINT_WHITE], G: [B.BRICK_DARK, B.PAINT_BLACK],
};
const CAR_LEN = { loco: 19, coach1: 26, coach2: 26, dining: 26, sleeper: 26, panorama: 24, emuCab: 26, emuMid: 26, iceHead: 26, ice: 26, rack: 16, rackLoco: 12, box: 15, tank: 14, flat: 15 };
function design(type, liv) {
  const L = CAR_LEN[type], W = 4, H = 6, size = Math.max(W, L), vox = new Uint8Array(size * size * H);
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < L) vox[(z * size + x) * H + y] = b; };
  const box = (x0, y0, z0, x1, y1, z1, b) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b); };
  const [c1, c2] = LIVERY[liv] || LIVERY.AE;
  const seats = [], doors = [];
  let cab = null;
  const freight = type === 'box' || type === 'tank' || type === 'flat';
  // onderstel met draaistellen
  box(0, 0, 1, W - 1, 0, L - 2, B.METAL);
  for (const z of [2, 3, L - 4, L - 3]) box(0, 0, z, W - 1, 0, z, B.PAINT_BLACK);
  if (freight) {
    if (type === 'box') { box(0, 1, 0, W - 1, 4, L - 1, c1); for (let z = 2; z < L; z += 3) box(0, 1, z, W - 1, 4, z, B.PAINT_BLACK); }
    else if (type === 'tank') { box(1, 1, 1, 2, 4, L - 2, B.METAL); box(0, 2, 1, W - 1, 3, L - 2, B.METAL); box(1, 5, L >> 1, 2, 5, L >> 1, B.PAINT_BLACK); }
    else { box(0, 1, 0, W - 1, 1, L - 1, B.DARK_PLANKS); box(0, 2, 1, W - 1, 4, 6, B.PAINT_BLUE); box(0, 2, 8, W - 1, 4, 13, B.PAINT_ORANGE); }
    return { W, H, L, size, vox, seats, doors, cab, type, walk: false };
  }
  const glassRoof = type === 'panorama';
  // vloer, wanden, ramen, dak
  box(0, 1, 0, W - 1, 1, L - 1, type === 'coach1' || type === 'dining' ? B.WOOL_RED : type === 'sleeper' ? B.DARK_PLANKS : B.TILE);
  for (let z = 0; z < L; z++) for (const x of [0, W - 1]) {
    set(x, 2, z, c1);
    set(x, 3, z, (z % 4 === 0 || z < 1 || z > L - 2) ? c1 : (glassRoof ? B.GLASS_BLUE : B.GLASS));
    set(x, 4, z, glassRoof ? B.GLASS_BLUE : c2);
  }
  for (let z = 0; z < L; z++) for (let x = 0; x < W; x++) set(x, 5, z, glassRoof && x > 0 && x < W - 1 && z > 1 && z < L - 2 ? B.GLASS_BLUE : (x > 0 && x < W - 1 && z % 6 === 3 ? B.LAMP : B.PAINT_WHITE));
  // kopwanden met een doorgang naar het volgende rijtuig
  for (const z of [0, L - 1]) { for (let x = 0; x < W; x++) for (let y = 2; y <= 4; y++) set(x, y, z, c1); set(1, 2, z, 0); set(2, 2, z, 0); set(1, 3, z, 0); set(2, 3, z, 0); }
  // deuren (geel, dicht tijdens de rit; in- en uitstappen met J)
  for (const z of [2, L - 3]) { for (const x of [0, W - 1]) { set(x, 2, z, B.PAINT_YELLOW); set(x, 3, z, B.GLASS_GREEN); } doors.push(z); }
  const cabFront = type === 'loco' || type === 'emuCab' || type === 'iceHead' || type === 'rack' || type === 'rackLoco';
  if (cabFront) {
    // cabine vooraan: lessenaar, frontruit, stoel van de machinist
    const zf = L - 1;
    for (let x = 0; x < W; x++) { set(x, 2, zf, c1); set(x, 3, zf, B.GLASS); set(x, 4, zf, type === 'iceHead' ? B.GLASS : c2); }
    if (type === 'iceHead') { for (let x = 0; x < W; x++) { set(x, 5, zf, 0); set(x, 5, zf - 1, B.GLASS); } }
    set(1, 2, zf - 1, B.PANEL_DARK); set(2, 2, zf - 1, B.PANEL_DARK);
    set(0, 2, zf - 3, c1); set(W - 1, 2, zf - 3, c1); // wand achter de cabine
    for (let x = 0; x < W; x++) if (x !== 1 && x !== 2) set(x, 3, zf - 3, c1);
    cab = [2, 2, zf - 2];
  }
  if (type === 'loco' || type === 'rackLoco') {
    // machinekamer in het midden (niet toegankelijk), cabines aan beide kanten
    box(1, 2, 3, 2, 4, L - 5, B.METAL); for (let z = 4; z < L - 5; z += 3) set(0, 3, z, B.METAL), set(W - 1, 3, z, B.METAL);
    set(1, 2, 0, B.PANEL_DARK); set(2, 2, 0, 0);
  }
  if (type === 'coach1' || type === 'coach2' || type === 'emuCab' || type === 'emuMid' || type === 'ice' || type === 'iceHead' || type === 'panorama' || type === 'rack') {
    const z0 = 4, z1 = cabFront ? L - 5 : L - 4;
    for (let z = z0; z <= z1; z++) {
      if ((z - z0) % 2 === 0) { set(1, 2, z, type === 'coach1' ? B.WOOL_RED : type === 'panorama' ? B.PAINT_ORANGE : B.PAINT_BLUE); seats.push([1.5, 3, z + 0.5]); }
      if (type === 'coach1' && (z - z0) % 4 === 1) set(1, 2, z, B.DARK_PLANKS); // tafeltje
    }
  }
  if (type === 'dining') {
    for (let z = 4; z < L - 8; z++) { if (z % 3 === 1) set(1, 2, z, B.PLANKS); else { set(1, 2, z, B.WOOL_RED); seats.push([1.5, 3, z + 0.5]); } }
    box(1, 2, L - 7, 2, 2, L - 7, B.PLANKS); box(1, 2, L - 6, 1, 3, L - 4, B.METAL); // toog en keuken
  }
  if (type === 'sleeper') {
    // coupés met bedden aan één kant van de gang
    for (let z = 4; z < L - 4; z++) {
      if (z % 4 === 0) { set(1, 2, z, B.PLANKS); set(1, 3, z, B.PLANKS); set(1, 4, z, B.PLANKS); } // tussenwand
      else if (z % 4 === 2) { set(1, 2, z, B.WOOL_RED); set(1, 4, z, B.WOOL_RED); seats.push([1.5, 3, z + 0.5]); } // onder- en bovenbed
    }
  }
  return { W, H, L, size, vox, seats, doors, cab, type, walk: true };
}

// ---------- diensten ----------
const SERVICES = [
  { id: 'ICE', line: 'HSL', name: 'ICE', liv: 'ICE', cars: ['iceHead', 'ice', 'ice', 'dining', 'ice', 'iceHead'], vmax: 69, h: 1200, acc: 0.8 },
  { id: 'IC', line: 'NZ', name: 'IC Noord-Zuid', liv: 'IC', stops: ['Sneeuwbrück', 'Grenspas', 'Reuzenberg Hauptbahnhof', 'Hemelpoort'], cars: ['loco', 'coach1', 'coach2', 'dining', 'coach2', 'coach2'], vmax: 39, h: 1800 },
  { id: 'AE', line: 'AE', name: 'IC Alpenexpress', liv: 'AE', stops: ['Wolkendorf', 'Reuzendal', 'Reuzenberg Hauptbahnhof', 'Oostpoort'], cars: ['loco', 'coach1', 'coach2', 'dining', 'coach2'], vmax: 44, h: 3600 },
  { id: 'RB', line: 'AE', name: 'Reuzenberg Bahn', liv: 'RB', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 33, h: 3600, acc: 0.9 },
  { id: 'S1', line: 'NZ', name: 'S1', liv: 'S1', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 30, h: 1800, acc: 0.9 },
  { id: 'PE', line: 'PE', name: 'Panorama Express', liv: 'PE', cars: ['loco', 'panorama', 'panorama', 'dining', 'panorama'], vmax: 22, h: 3600 },
  { id: 'ZB', line: 'ZB', name: 'Zugspitzbahn', liv: 'ZB', cars: ['rack', 'rack'], vmax: 9, h: 1800, acc: 0.5 },
  { id: 'ME', line: 'ME', name: 'Matterhorn Express', liv: 'ME', cars: ['rackLoco', 'panorama', 'coach2'], vmax: 17, h: 3600, acc: 0.5 },
  { id: 'EN', line: 'AE', name: 'Nachttrein Alpenster', liv: 'EN', stops: ['Wolkendorf', 'Reuzenberg Hauptbahnhof', 'Oostpoort'], cars: ['loco', 'sleeper', 'sleeper', 'dining', 'coach2'], vmax: 36, h: 14400 },
  { id: 'GAE', line: 'AE', name: 'Goederentrein', liv: 'G', stops: [], cars: ['loco', 'box', 'tank', 'box', 'flat', 'box', 'tank', 'box'], vmax: 25, h: 7200, freight: true, acc: 0.35 },
  { id: 'GNZ', line: 'NZ', name: 'Goederentrein', liv: 'G', stops: [], cars: ['loco', 'flat', 'box', 'box', 'tank', 'flat', 'box'], vmax: 25, h: 7200, freight: true, acc: 0.35 },
];

// ---------- snelheidsbeperkingen per lijn ----------
for (const L of LINES) {
  const v = new Float32Array(L.n), vmax = Math.max(...SERVICES.filter(s => s.line === L.id).map(s => s.vmax));
  for (let i = 0; i < L.n; i++) {
    const a = Math.max(0, i - 10), c = Math.min(L.n - 1, i + 10);
    const ax = L.x[a], az = L.z[a], bx = L.x[i], bz = L.z[i], cx = L.x[c], cz = L.z[c];
    const A2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)), ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz);
    const R = A2 < 1e-6 ? 1e9 : ab * bc * ca / (2 * A2);
    v[i] = Math.min(vmax, Math.sqrt(1.15 * R));
    if (L.kind[i] === 3) v[i] = Math.min(v[i], 33); // oud spoor door het dal
  }
  // over 120 m het minimum nemen (de hele trein moet door de bocht)
  const w = new Float32Array(L.n);
  for (let i = 0; i < L.n; i++) { let m = 1e9; for (let j = Math.max(0, i - 30); j <= Math.min(L.n - 1, i + 30); j++) m = Math.min(m, v[j]); w[i] = Math.max(6, m); }
  L.vlim = w;
  L.limAt = (s) => w[L.idx(s)];
}

// ---------- rijprofiel: tijd ↔ plaats voor een dienst in één richting ----------
function runProfile(sv, dir) {
  const L = LINE[sv.line], len = sv.cars.reduce((a, c) => a + CAR_LEN[c] + GAP, 0) - GAP;
  const stops = L.stations.filter(st => !sv.stops || sv.stops.includes(st.name) || (sv.freight && (st === L.stations[0] || st === L.stations[L.stations.length - 1])));
  const all = L.stations;
  // kop van de trein staat bij het stoppen op het einde van het perron (trein midden op het perron)
  const headStop = (st) => st.s + dir * Math.min(len / 2, st.len / 2 - 2);
  const first = dir > 0 ? all[0] : all[all.length - 1], last = dir > 0 ? all[all.length - 1] : all[0];
  const s0 = headStop(first), s1 = headStop(last), D = Math.abs(s1 - s0), dx = 4, n = Math.ceil(D / dx) + 1;
  const sOf = (x) => s0 + dir * x;
  const stopX = (sv.freight ? [first, last] : stops).map(st => ({ x: Math.abs(headStop(st) - s0), st })).sort((a, b) => a.x - b.x);
  const acc = sv.acc || 0.6, dec = 0.55;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // de beperking geldt over de hele treinlengte
    const sh = sOf(i * dx), st = sOf(Math.max(0, i * dx - len));
    v[i] = Math.min(sv.vmax, L.limAt(sh), L.limAt(st), L.limAt((sh + st) / 2));
  }
  const isStop = new Uint8Array(n);
  for (const q of stopX) isStop[Math.min(n - 1, Math.round(q.x / dx))] = 1;
  isStop[0] = 1; isStop[n - 1] = 1;
  for (let i = 0; i < n; i++) if (isStop[i]) v[i] = 0;
  for (let i = 1; i < n; i++) if (!isStop[i]) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * acc * dx));
  for (let i = n - 2; i >= 0; i--) if (!isStop[i]) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * dec * dx));
  // tijd: bij elke halte een wachttijd
  const xs = [], ts = [], stopsOut = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { const vm = Math.max(0.4, (v[i] + v[i - 1]) / 2); t += dx / vm; }
    xs.push(Math.min(D, i * dx)); ts.push(t);
    if (isStop[i] && i > 0 && i < n - 1) {
      const q = stopX.find(q => Math.abs(q.x - i * dx) < dx);
      const dwell = sv.freight ? 0 : q && q.st.hbf !== undefined ? 90 : q && q.st.name === 'Reuzendal' ? 60 : 45;
      if (dwell) { stopsOut.push({ st: q.st, arr: t, dep: t + dwell }); t += dwell; xs.push(Math.min(D, i * dx)); ts.push(t); }
    }
  }
  return { sv, dir, L, len, s0, s1, D, xs: Float32Array.from(xs), ts: Float32Array.from(ts), T: t, stops: stopsOut, first, last, v };
}
// plaats (afstand vanaf het begin) op tijd t na vertrek
function posAt(pr, t) {
  const ts = pr.ts, xs = pr.xs;
  if (t <= 0) return [0, 0];
  if (t >= pr.T) return [pr.D, 0];
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  const dt = ts[hi] - ts[lo], f = dt > 0 ? (t - ts[lo]) / dt : 0, dx = xs[hi] - xs[lo];
  return [xs[lo] + dx * f, dt > 0 ? dx / dt : 0];
}
// tijd waarop de kop op afstand x is
function timeAt(pr, x) {
  const xs = pr.xs; let lo = 0, hi = xs.length - 1;
  if (x <= 0) return 0; if (x >= pr.D) return pr.T;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m; else hi = m; }
  const f = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
  return pr.ts[lo] + (pr.ts[hi] - pr.ts[lo]) * f;
}

// ---------- blokken (voor een dienstregeling zonder botsingen) ----------
function blockKey(L, s, dir) {
  if (L.oldS && s > L.oldS[0] - 300 && s < L.oldS[1] + 300) return 'AE:old'; // enkelspoor door het Reuzendal
  if (L.single) {
    for (let i = 0; i < L.stations.length; i++) { const st = L.stations[i]; if (s >= st.s0 - 30 && s <= st.s1 + 30) return `${L.id}:${dir}:st${i}`; }
    let k = 0; for (const st of L.stations) if (st.s1 < s) k++;
    return `${L.id}:seg${k}`; // enkelspoor tussen twee stations: beide richtingen
  }
  return `${L.id}:${dir}:${Math.floor(s / 400)}`;
}
function occupancy(pr) {
  const occ = new Map(), L = pr.L, dir = pr.dir;
  const pre = 120, post = 60; // al aan het perron voor vertrek, nog even blijven staan na aankomst
  for (let i = 0; i < pr.xs.length; i++) {
    const t = pr.ts[i], x = pr.xs[i];
    for (const xx of [x, Math.max(0, x - pr.len)]) {
      const k = blockKey(L, pr.s0 + dir * xx, dir);
      let o = occ.get(k); if (!o) occ.set(k, o = [1e9, -1e9]);
      o[0] = Math.min(o[0], i === 0 ? -pre : t - 15); o[1] = Math.max(o[1], i === pr.xs.length - 1 ? t + post : t + 25);
    }
  }
  return occ;
}
function buildTimetable() {
  const runs = []; // per dienst en richting: profiel, vertrektijden
  const table = new Map(); // blok -> lijst van [a, b] (mod P)
  const norm = (a) => ((a % P) + P) % P;
  const add = (k, a, b) => { let l = table.get(k); if (!l) table.set(k, l = []); const a2 = norm(a), b2 = a2 + (b - a); l.push([a2, b2]); };
  const clash = (k, a, b) => {
    const l = table.get(k); if (!l) return false;
    const a2 = norm(a), b2 = a2 + (b - a);
    for (const [c, d] of l) for (const sh of [0, P, -P]) if (a2 + sh < d && b2 + sh > c) return true;
    return false;
  };
  for (const sv of SERVICES) {
    for (const dir of [1, -1]) {
      const pr = runProfile(sv, dir), occ = [...occupancy(pr)];
      let h = sv.h, chosen = -1;
      for (let tries = 0; tries < 3 && chosen < 0; tries++) {
        for (let o = 0; o < h && chosen < 0; o += 15) {
          let ok = true;
          for (let k = 0; k < P / h && ok; k++) for (const [key, [a, b]] of occ) if (clash(key, o + k * h + a, o + k * h + b)) { ok = false; break; }
          if (ok) chosen = o;
        }
        if (chosen < 0) h *= 2; // te druk: minder vaak rijden
      }
      if (chosen < 0) { console.warn('geen plaats in de dienstregeling voor', sv.id, dir); continue; }
      for (let k = 0; k < P / h; k++) for (const [key, [a, b]] of occ) add(key, chosen + k * h + a, chosen + k * h + b);
      runs.push({ sv, dir, pr, h, off: chosen });
    }
  }
  return runs;
}
export const RUNS = buildTimetable();
export function railClock() { return (Date.now() / 1000 - new Date().getTimezoneOffset() * 60) % P; }
const hhmm = (sec) => { const d = new Date(Date.now() + (sec - railClock()) * 1000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// alle treinen die nu rijden (of klaarstaan): { run, k, t (sinds vertrek), x, v }
function activeTrains(now) {
  const out = [];
  for (const r of RUNS) {
    const n = P / r.h;
    for (let k = 0; k < n; k++) {
      let t = now - (r.off + k * r.h); t = ((t % P) + P) % P; if (t > P - 130) t -= P;
      if (t < -120 || t > r.pr.T + 60) continue;
      const [x, v] = posAt(r.pr, t);
      out.push({ id: `${r.sv.id}${r.dir > 0 ? 'a' : 'b'}${k}`, run: r, k, t, x, v: t < 0 || t > r.pr.T ? 0 : v });
    }
  }
  return out;
}
// vertrektijden aan een station (komende `n`)
export function departures(name, now, n = 8) {
  const out = [];
  for (const r of RUNS) for (const st of r.pr.stops.concat([{ st: r.pr.first, arr: 0, dep: 0 }])) {
    if (st.st.name !== name) continue;
    for (let k = 0; k < P / r.h; k++) {
      let dt = (r.off + k * r.h + st.dep) - now; dt = ((dt % P) + P) % P;
      out.push({ in: dt, run: r, st, dest: r.pr.last.name, at: now + dt });
    }
  }
  return out.sort((a, b) => a.in - b.in).slice(0, n);
}
// reisplanner: vroegste aankomst (met overstappen) van station a naar b
export function plan(a, b, now) {
  const best = new Map([[a, { t: now, legs: [] }]]), todo = [a], conn = [];
  for (const r of RUNS) {
    if (r.sv.freight) continue;
    const seq = [{ st: r.pr.first, arr: 0, dep: 0 }, ...r.pr.stops, { st: r.pr.last, arr: r.pr.T, dep: r.pr.T }];
    conn.push({ r, seq });
  }
  for (let it = 0; it < 6 && todo.length; it++) {
    const next = [];
    for (const from of todo) {
      const cur = best.get(from);
      for (const { r, seq } of conn) {
        const i = seq.findIndex(q => q.st.name === from); if (i < 0 || i === seq.length - 1) continue;
        // eerste vertrek na aankomst (+2 min overstaptijd)
        const ready = cur.t + (cur.legs.length ? 120 : 0);
        let wait = (r.off + seq[i].dep) - ready; wait = ((wait % r.h) + r.h) % r.h;
        const dep = ready + wait;
        for (let j = i + 1; j < seq.length; j++) {
          const arr = dep + (seq[j].arr - seq[i].dep), to = seq[j].st.name;
          const b0 = best.get(to);
          if (!b0 || arr < b0.t) { best.set(to, { t: arr, legs: [...cur.legs, { run: r, from, to, dep, arr }] }); next.push(to); }
        }
      }
    }
    todo.splice(0, todo.length, ...new Set(next));
  }
  return best.get(b) || null;
}

// ---------- een rijtuig als "schip": je kan erin rondlopen terwijl de trein rijdt ----------
class CarBody {
  constructor(train, i, d) { this.train = train; this.i = i; this.d = d; this.g = { W: d.W, H: d.H, L: d.L }; this.world = d.world; this.T = { name: train.name }; this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.m = new THREE.Matrix4(); this.mi = new THREE.Matrix4(); this.cx = d.W / 2; this.cz = d.L / 2; this.isTrain = true; }
  setPose(x, y, z, yaw, pitch) {
    this.pos.set(x, y, z); this.yaw = yaw; this.pitch = pitch;
    this.m.makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')).setPosition(x, y, z);
    this.mi.copy(this.m).invert();
  }
  toLocal(v, out) { out.copy(v).applyMatrix4(this.mi); out.x += this.cx; out.z += this.cz; return out; }
  toWorld(v, out) { out.set(v.x - this.cx, v.y, v.z - this.cz).applyMatrix4(this.m); return out; }
  inside(l, margin = 0) { return l.x >= -margin && l.z >= -margin - 1.5 && l.x < this.g.W + margin && l.z < this.g.L + margin + 1.5 && l.y > -1.5 && l.y < this.g.H + 2; }
}

// ---------- in het spel ----------
export class AlpRail {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.designs = new Map(); this.trains = new Map(); this.t = 0;
    this.tmpV = new THREE.Vector3(); this.tmpW = new THREE.Vector3();
    this.announced = new Set();
    // seinlampen
    const lampG = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.sigMat = new THREE.MeshBasicMaterial({ vertexColors: false }); this.sigMax = 200;
    this.sigMesh = new THREE.InstancedMesh(lampG, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.sigMax); this.sigMesh.frustumCulled = false; this.sigMesh.count = 0;
    this.sigMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.sigMax * 3), 3);
    this.group.add(this.sigMesh);
    // tunnelbekleding dichtbij (zodat je bij hoge snelheid nooit in het niets kijkt)
    this.tunnelMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.tunnel = null; this.tunnelAt = null;
    this.hud = document.getElementById('drive-hud');
    this.player = null; // trein die de speler zelf bestuurt
    // overwegen: twee rode lampen per paal, knipperen als er een trein nadert
    this.xLamps = [];
    for (const c of CROSSINGS) for (const al of [-8, 8]) for (const sd of [-1, 1]) {
      const x = c.x + c.ux * al - c.uz * sd * (c.hw + 1), z = c.z + c.uz * al + c.ux * sd * (c.hw + 1);
      this.xLamps.push({ c, x: Math.floor(x) + 0.5, y: groundAt(x, z) + 4.5, z: Math.floor(z) + 0.5 });
    }
    this.xMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, this.xLamps.length));
    this.xMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.xLamps.length) * 3), 3);
    this.xMesh.frustumCulled = false; this.group.add(this.xMesh);
    this.signals = [];
    for (const L of LINES) for (let s = 600; s < L.len; s += 1200) { const p = L.at(s); if (p.kind === 0 || p.kind === 2) this.signals.push({ L, s, x: p.x, z: p.z, y: p.y, tx: p.tx, tz: p.tz }); }
  }
  dispose() {
    for (const tr of this.trains.values()) this.dropTrain(tr);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.removeFromParent();
    if (this.tunnel) this.tunnel.geometry.dispose();
  }
  design(type, liv) {
    const k = type + ':' + liv; let d = this.designs.get(k);
    if (d) return d;
    d = design(type, liv);
    d.world = this.g.makeWorld({ size: d.size, H: d.H }, d.vox);
    // meshes één keer maken, elk rijtuig gebruikt dezelfde geometrie
    d.geos = [];
    const nc = d.world.nc;
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const out = meshChunk(d.world, cx, cz);
      for (const [buf, mat] of [[out.opaque, this.g.matOpaque], [out.trans, this.g.matTrans]]) {
        if (!buf.n) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
        geo.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2)); geo.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
        geo.setAttribute('face', new THREE.Float32BufferAttribute(buf.face, 1));
        geo.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
        geo.computeBoundingSphere();
        d.geos.push([geo, mat]);
      }
    }
    this.designs.set(k, d);
    return d;
  }
  makeTrain(a) {
    const sv = a.run.sv;
    const tr = { id: a.id, sv, run: a.run, name: `${sv.name} → ${a.run.pr.last.name}`, cars: [] };
    for (let i = 0; i < sv.cars.length; i++) {
      // de achterste stuurrijtuigen kijken achteruit
      const type = sv.cars[i], d = this.design(type, sv.liv);
      const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
      for (const [geo, mat] of d.geos) { const m = new THREE.Mesh(geo, mat); m.position.set(-d.W / 2, 0, -d.L / 2); m.layers.enable(1); if (mat === this.g.matTrans) m.renderOrder = 1; grp.add(m); }
      this.group.add(grp);
      const flip = i === sv.cars.length - 1 && sv.cars.length > 1 && (type === 'emuCab' || type === 'iceHead' || type === 'rack');
      tr.cars.push({ d, grp, body: new CarBody(tr, i, d), flip });
    }
    return tr;
  }
  dropTrain(tr) {
    if (this.g.aboard && this.g.aboard.train === tr) this.g.leaveVessel?.();
    for (const c of tr.cars) c.grp.removeFromParent();
  }
  // plaats van alle rijtuigen van een trein
  place(tr, L, sHead, dir, line) {
    const p = {}, q = {};
    let off = 0;
    for (const c of tr.cars) {
      const sc = sHead - dir * (off + c.d.L / 2), sf = sc + dir * c.d.L / 2, sb = sc - dir * c.d.L / 2;
      L.at(sf, p); L.at(sb, q);
      const of1 = trackOffset(L, sf) * dir, of2 = trackOffset(L, sb) * dir;
      const fx = p.x - p.tz * of1, fz = p.z + p.tx * of1, bx = q.x - q.tz * of2, bz = q.z + q.tx * of2;
      const fy = p.y + 1, by = q.y + 1;
      let yaw = Math.atan2(fx - bx, fz - bz), pitch = Math.atan2(fy - by, Math.hypot(fx - bx, fz - bz));
      if (c.flip) { yaw += Math.PI; pitch = -pitch; }
      const x = (fx + bx) / 2, z = (fz + bz) / 2, y = (fy + by) / 2;
      c.body.setPose(x, y, z, yaw, pitch);
      c.grp.position.set(x, y, z); c.grp.rotation.set(-pitch, yaw, 0);
      off += c.d.L + GAP;
    }
    void line;
  }
  update(dt, day) {
    const g = this.g, p = g.player.pos;
    this.t += dt;
    const now = railClock();
    const act = activeTrains(now);
    this.active = act;
    const seen = new Set();
    // treinen in de buurt tonen (3 km), de rest alleen op de kaart
    for (const a of act) {
      if (this.player && this.player.id === a.id) continue;
      const L = a.run.pr.L, dir = a.run.dir;
      let s = a.run.pr.s0 + dir * a.x;
      // achter de zelf bestuurde trein wachten (sein op rood)
      if (this.player && this.player.L === L && this.player.dir === dir) {
        const ds = (this.player.s - s) * dir;
        if (ds > 0 && ds < 600) { s = this.player.s - dir * 600; a.held = true; }
      }
      a.s = s;
      const hp = L.at(s);
      const d = Math.hypot(hp.x - p.x, hp.z - p.z);
      let tr = this.trains.get(a.id);
      const aboardThis = g.aboard && g.aboard.train && g.aboard.train === tr;
      if (d > 3000 && !aboardThis) { if (tr) { this.dropTrain(tr); this.trains.delete(a.id); } continue; }
      if (!tr) { tr = this.makeTrain(a); this.trains.set(a.id, tr); }
      tr.a = a; tr.L = L; tr.dir = dir; tr.s = s; tr.v = a.v;
      this.place(tr, L, s, dir);
      seen.add(a.id);
    }
    // de zelf bestuurde trein (na het verlaten van de cabine: uitbollen en blijven staan)
    if (this.player) {
      const pt = this.player;
      if (!g.drive) { pt.v = Math.max(0, pt.v - 0.9 * dt); pt.s += pt.dir * pt.v * dt; pt.s = Math.max(5, Math.min(pt.L.len - 5, pt.s)); }
      const hp = pt.L.at(pt.s);
      if (!g.drive && !(g.aboard && g.aboard.train === pt.tr) && Math.hypot(hp.x - p.x, hp.z - p.z) > 1500) { this.dropTrain(pt.tr); this.trains.delete(pt.tr.id); this.player = null; }
      else { this.place(pt.tr, pt.L, pt.s, pt.dir); seen.add(pt.tr.id); }
    }
    for (const [id, tr] of this.trains) if (!seen.has(id)) { if (g.aboard && g.aboard.train === tr) { this.g.toast('🚉 Deze trein rijdt de remise in. Je stapt uit.'); this.alight(true); } this.dropTrain(tr); this.trains.delete(id); }
    const light = 0.2 + 0.8 * day;
    void light;
    this.updateSignals(act);
    this.updateCrossings(act);
    this.updateTunnel(p);
    this.updateAboard(dt);
    // wachten op het perron: automatisch instappen zodra er een trein stilstaat
    if (this.waitAt && !g.aboard && !g.drive) {
      if (Math.hypot(p.x - this.waitAt.x, p.z - this.waitAt.z) > 40) this.waitAt = null;
      else if (this.nearestDoor(30)) { const d = this.nearestDoor(30); if (d.d > 14) { /* naar de deur stappen */ const w = d.c.body.toWorld(new THREE.Vector3(-1.2, 1.05, d.dz + 0.5), new THREE.Vector3()); g.player.pos.set(w.x, w.y, w.z); } this.board(); }
    }
    // knop om in te stappen (telefoon) naast een trein of op een perron
    if ((this.btnT = (this.btnT || 0) + dt) > 0.4) {
      this.btnT = 0;
      const show = !g.aboard && !g.drive && (!!this.nearestDoor() || !!this.stationHere());
      this.canBoard = show;
      if (show !== !!this.btnShown) { this.btnShown = show; document.getElementById('t-drive')?.classList.toggle('show', show || !!g.nearVehicle); if (show && !this.boardHint) { this.boardHint = true; g.toast(g.touch ? '🚆 Tik op 🚗 → Meerijden om in de trein te stappen' : '🚆 Druk J om in de trein te stappen (of om op de volgende trein te wachten)'); } }
    }
  }
  // ---------- seinen: rood als het volgende blok (1200 m) bezet is ----------
  updateSignals(act) {
    const p = this.g.player.pos, m4 = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    for (const sg of this.signals) {
      if (Math.abs(sg.x - p.x) > 1200 || Math.abs(sg.z - p.z) > 1200 || n >= this.sigMax) continue;
      let occ = 0;
      for (const a of act) {
        if ((this.player && a.id === this.player.id) || a.run.pr.L !== sg.L || a.run.dir !== 1) continue;
        const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), ds = s - sg.s;
        if (ds > -a.run.pr.len && ds < 1200) occ = Math.max(occ, 2); else if (ds >= 1200 && ds < 2400) occ = Math.max(occ, 1);
      }
      if (this.player && this.player.L === sg.L && this.player.dir === 1) { const ds = this.player.s - sg.s; if (ds > -200 && ds < 1200) occ = 2; }
      const nx = -sg.tz, nz = sg.tx, off = 5.4 - 0.6;
      m4.makeTranslation(sg.x + nx * off, sg.y + 6.5, sg.z + nz * off);
      this.sigMesh.setMatrixAt(n, m4);
      c.set(occ === 2 ? 0xff2a1a : occ === 1 ? 0xffc21a : 0x2aff5a);
      this.sigMesh.setColorAt(n, c);
      n++;
    }
    this.sigMesh.count = n;
    this.sigMesh.instanceMatrix.needsUpdate = true; if (this.sigMesh.instanceColor) this.sigMesh.instanceColor.needsUpdate = true;
  }
  updateCrossings(act) {
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), blink = Math.floor(this.t * 2) % 2;
    this.xLamps.forEach((l, i) => {
      let near = false;
      for (const a of act) { if (a.run.pr.L.id !== l.c.line || a.t < 0) continue; const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x); if (Math.abs(s - l.c.s) < 700) near = true; }
      if (this.player && this.player.L.id === l.c.line && Math.abs(this.player.s - l.c.s) < 700) near = true;
      l.c.closed = near;
      m4.makeTranslation(l.x, l.y, l.z); this.xMesh.setMatrixAt(i, m4);
      col.set(near ? ((i + blink) % 2 ? 0xff2010 : 0x300000) : 0x300000); this.xMesh.setColorAt(i, col);
    });
    this.xMesh.instanceMatrix.needsUpdate = true; if (this.xMesh.instanceColor) this.xMesh.instanceColor.needsUpdate = true;
  }
  // ---------- tunnelbekleding rond de speler ----------
  updateTunnel(p) {
    if (this.tunnelAt && Math.hypot(this.tunnelAt[0] - p.x, this.tunnelAt[1] - p.z) < 250) return;
    this.tunnelAt = [p.x, p.z];
    if (this.tunnel) { this.group.remove(this.tunnel); this.tunnel.geometry.dispose(); this.tunnel = null; }
    const pos = [], col = [];
    const quad = (a, b, c2, d, rgb) => { pos.push(...a, ...b, ...c2, ...a, ...c2, ...d); for (let i = 0; i < 6; i++) col.push(...rgb); };
    const q = {}, r = {};
    for (const L of LINES) for (const [a, b] of L.tunnels) {
      for (let s = a; s < b; s += 8) {
        L.at(s, q); if (Math.abs(q.x - p.x) > 700 || Math.abs(q.z - p.z) > 700) continue;
        L.at(Math.min(b, s + 8), r);
        const w = L.single ? 2.35 : 4.8, hgt = 5.8;
        const nx = -q.tz, nz = q.tx, mx = -r.tz, mz = r.tx;
        const A = (o, h) => [q.x + nx * o, q.y + 1 + h, q.z + nz * o], Bp = (o, h) => [r.x + mx * o, r.y + 1 + h, r.z + mz * o];
        const lit = Math.floor(s / 24) % 1 === 0 && Math.floor(s / 8) % 3 === 0;
        quad(A(-w, 0), Bp(-w, 0), Bp(-w, hgt), A(-w, hgt), [0.22, 0.22, 0.24]);
        quad(A(w, 0), Bp(w, 0), Bp(w, hgt), A(w, hgt), [0.22, 0.22, 0.24]);
        quad(A(-w, hgt), Bp(-w, hgt), Bp(w, hgt), A(w, hgt), [0.17, 0.17, 0.19]);
        if (lit) quad(A(-w + 0.02, 4.0), Bp(-w + 0.02, 4.0), Bp(-w + 0.02, 4.3), A(-w + 0.02, 4.3), [1.0, 0.9, 0.6]);
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.tunnel = new THREE.Mesh(geo, this.tunnelMat); this.tunnel.frustumCulled = false;
    this.group.add(this.tunnel);
  }
  // ---------- aan boord ----------
  trainOfBody(v) { return v && v.isTrain ? v.train : null; }
  updateAboard(dt) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v);
    if (!tr) { g.extVel = null; this.hideHud(); return; }
    // snelheid van de trein (voor het vooruit laden van tegels)
    const sp = this.player && this.player.tr === tr ? this.player.v : tr.v || 0;
    g.extVel = new THREE.Vector3(Math.sin(v.yaw) * sp, 0, Math.cos(v.yaw) * sp);
    // opstaan zodra je gaat lopen
    const l = g.player.loc, k = g.keys;
    if (g.player.seated && l && (k.has('KeyW') || k.has('KeyS') || k.has('KeyA') || k.has('KeyD') || k.has('ArrowUp') || k.has('ArrowDown') || Math.hypot(g.joy?.x || 0, g.joy?.y || 0) > 0.3)) { g.player.seated = false; l.x = 2.5; l.y = 2.05; }
    if (l) {
      const i = v.i, c = tr.cars[i], fwd = c.flip ? l.z < 0.4 : l.z > v.g.L - 0.4, back = c.flip ? l.z > v.g.L - 0.4 : l.z < 0.4;
      if (fwd && i > 0 && tr.cars[i - 1].d.walk) { const n = tr.cars[i - 1]; this.moveCar(tr, i, i - 1, n.flip ? n.d.L - 0.5 : 0.5); }
      else if (back && i < tr.cars.length - 1 && tr.cars[i + 1].d.walk) { const n = tr.cars[i + 1]; this.moveCar(tr, i, i + 1, n.flip ? 0.5 : n.d.L - 0.5); }
    }
    // omroepen en haltes
    const a = tr.a, pr = a ? a.run.pr : null;
    if (pr && !(this.player && this.player.tr === tr)) {
      const next = pr.stops.find(q => q.arr > a.t);
      if (next && next.arr - a.t < 50 && !this.announced.has(tr.id + next.st.name)) {
        this.announced.add(tr.id + next.st.name);
        const lines = (STATIONS_ALL.find(q => q.name === next.st.name)?.lines || []).filter(id => id !== pr.L.id).map(id => LINE[id].name);
        this.say(`Volgende halte: ${next.st.name}.${lines.length ? ' Overstappen op de ' + lines.join(' en de ') + '.' : ''}`);
      }
      this.showHud(tr, a);
    }
  }
  moveCar(tr, from, to, z, flip) {
    const g = this.g, A = tr.cars[from].body, Bb = tr.cars[to].body, l = g.player.loc;
    const w = A.toWorld(l, this.tmpW);
    const nl = Bb.toLocal(w, this.tmpV.clone());
    nl.z = z; nl.x = Math.max(2.32, Math.min(2.68, nl.x)); nl.y = Math.max(nl.y, 2.02);
    g.aboard = Bb; g.player.loc = nl; g.player.yawLoc = (g.player.yawLoc ?? 0) + (A.yaw - Bb.yaw);
    void flip;
  }
  // instappen: aan een perron naast een stilstaande trein
  // dichtste deur van een (bijna) stilstaande trein: { tr, c, dz, d }
  nearestDoor(maxD = 14) {
    const p = this.g.player.pos, tmp = new THREE.Vector3();
    let best = null;
    for (const tr of this.trains.values()) {
      const mine = this.player && this.player.tr === tr;
      if ((mine ? this.player.v : tr.v || 0) > 1.2) continue;
      for (const c of tr.cars) {
        if (!c.d.walk) continue;
        const l = c.body.toLocal(p, tmp);
        if (Math.abs(l.y - 1) > 5) continue;
        const side = Math.max(0, -l.x, l.x - c.d.W); // afstand tot de zijkant van het rijtuig
        for (const dz of c.d.doors) { const d = Math.hypot(l.z - dz - 0.5, side); if (d < maxD && (!best || d < best.d)) best = { tr, c, dz, d }; }
      }
    }
    return best;
  }
  // station waar de speler staat (perron of stationsplein)
  stationHere() {
    const p = this.g.player.pos;
    for (const L of LINES) { const q = L.near(p.x, p.z, 30); if (!q) continue; const st = L.stationAt(q.s); if (st && Math.abs(p.y - (st.y ?? q.y)) < 8) return st; }
    return null;
  }
  // instappen: aan een perron naast een (bijna) stilstaande trein; anders wachten op de volgende trein
  board() {
    const g = this.g, best = this.nearestDoor();
    if (!best) {
      const st = this.stationHere();
      if (!st) { this.waitAt = null; return false; }
      const dep = departures(st.name, railClock(), 1)[0];
      this.waitAt = { name: st.name, x: g.player.pos.x, z: g.player.pos.z };
      g.toast(dep ? `🚉 ${st.name}: de volgende trein is de ${dep.run.sv.name} naar ${dep.dest} (${hhmm(dep.at)}, over ${Math.max(1, Math.round(dep.in / 60))} min). Blijf op het perron staan: je stapt automatisch in zodra hij stilstaat.` : `🚉 ${st.name}: even wachten op de volgende trein…`);
      return true;
    }
    this.waitAt = null;
    const { tr, c, dz } = best;
    g.aboard = c.body; g.player.loc = new THREE.Vector3(2.5, 2.02, dz + 0.5); g.player.yawLoc = c.flip ? 0 : Math.PI; g.player.fly = false; g.player.vel.set(0, 0, 0);
    g.toast(`🚆 Ingestapt: ${tr.name}. J = zitplaats kiezen · loop gerust door de trein · aan de deur J = uitstappen`);
    this.say(`Welkom aan boord van de ${tr.sv.name} naar ${tr.a ? tr.a.run.pr.last.name : ''}.`);
    return true;
  }
  // uitstappen aan de deur (alleen stilstaand) — force: de trein verdwijnt (remise)
  alight(force) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v); if (!tr) return false;
    const sp = this.player && this.player.tr === tr ? this.player.v : tr.v || 0;
    if (sp > 0.3 && !force) { g.toast('🚪 De deuren gaan pas open als de trein stilstaat'); return true; }
    const l = g.player.loc, dz = v.d.doors.reduce((a, b) => Math.abs(b - l.z) < Math.abs(a - l.z) ? b : a, v.d.doors[0]);
    // naar de kant van het perron (of de kant met de laagste grond)
    let out = null;
    for (const side of [-1.2, v.g.W + 1.2]) {
      const w = v.toWorld(new THREE.Vector3(side, 1.0, dz + 0.5), new THREE.Vector3());
      const gy = g.world.groundY ? null : null; void gy;
      let y = Math.floor(w.y) + 3; while (y > w.y - 6 && !g.world.solidAt(Math.floor(w.x), y - 1, Math.floor(w.z))) y--;
      if (g.world.solidAt(Math.floor(w.x), y - 1, Math.floor(w.z)) && !g.world.solidAt(Math.floor(w.x), y, Math.floor(w.z))) { const sc = y - w.y; if (!out || Math.abs(sc - 0.5) < Math.abs(out.sc - 0.5)) out = { w, y, sc }; }
    }
    g.aboard = null; g.player.seated = false;
    const pos = out ? out.w : v.toWorld(new THREE.Vector3(-1.5, 2.5, dz + 0.5), new THREE.Vector3());
    g.player.pos.set(pos.x, out ? out.y + 0.02 : pos.y, pos.z); g.player.vel.set(0, 0, 0);
    g.player.yaw = (g.player.yawLoc ?? 0) + v.yaw;
    g.extVel = null; this.hideHud();
    if (!force) g.toast('🚉 Uitgestapt');
    return true;
  }
  sit() {
    const g = this.g, v = g.aboard, l = g.player.loc; if (!v || !v.d.seats.length) return false;
    const seats = v.d.seats;
    let i = seats.findIndex(s => Math.hypot(s[0] - l.x, s[2] - l.z) < 0.6);
    i = (i + 1) % seats.length;
    const s = seats[i];
    l.set(s[0], 2.02, s[2]); g.player.vel.set(0, 0, 0); g.player.seated = true;
    g.player.yawLoc = (v.train.cars[v.i].flip ? 0 : Math.PI) + (s[0] < 2 ? 0.0 : 0); // naar voren kijken
    g.toast(`🪑 Plaats ${i + 1} van ${seats.length} in dit rijtuig (J = volgende plaats)`);
    return true;
  }
  // H / J in de Alpenwereld
  handleKey(mode) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v);
    if (tr) {
      const l = g.player.loc, c = tr.cars[v.i];
      if (mode === 'drive') {
        if (c.d.cab && Math.hypot(l.x - c.d.cab[0], l.z - c.d.cab[2]) < 2.6 && !c.flip) { this.startDriving(tr, c); return true; }
        g.toast('🚆 Ga naar de cabine helemaal vooraan om zelf te rijden'); return true;
      }
      // meerijden: bij een deur uitstappen, anders een zitplaats kiezen
      const nearDoor = c.d.doors.some(dz => Math.abs(l.z - dz - 0.5) < 1.4);
      if (nearDoor) return this.alight(false);
      return this.sit() || true;
    }
    if (mode === 'passenger' || mode === 'drive') return this.board();
    return false;
  }
  // ---------- zelf rijden ----------
  startDriving(tr, c) {
    const g = this.g, a = tr.a;
    this.player = { tr, L: tr.L, dir: tr.dir, s: tr.s, v: tr.v || 0, throttle: 0, brake: 0, emergency: false, doors: false, id: tr.id, car: c, nextStop: null, delay: 0, sched: a };
    tr.id = 'speler'; this.trains.delete(a.id); this.trains.set('speler', tr);
    g.leaveVessel(); // physics: camera in de cabine
    g.drive = new TrainCab(this);
    g.toast('🚆 Cabine: W/▲ tractie · S/▼ rem · spatie noodrem · Q deuren · N omroep · H cabine verlaten');
  }
  stopDriving() {
    const g = this.g, pt = this.player; if (!pt) return;
    const c = pt.car;
    g.aboard = c.body; g.player.loc = new THREE.Vector3(c.d.cab[0], 2.02, c.d.cab[2] - 0.8); g.player.yawLoc = 0;
    if (pt.v < 0.3) {
      // de trein gaat naar de remise; de dienstregeling neemt het weer over
      g.toast('🚆 Cabine verlaten. Deze trein blijft hier staan tot je uitstapt.');
    }
    this.parked = pt; // blijft getoond
  }
  // de bestuurde trein bewegen
  drivePhys(dt) {
    const pt = this.player, L = pt.L, k = this.g.keys, g = this.g;
    const up = k.has('KeyW') || k.has('ArrowUp') || g.padUp, down = k.has('KeyS') || k.has('ArrowDown') || g.padDown;
    if (up) { pt.throttle = Math.min(1, pt.throttle + dt * 0.8); pt.brake = Math.max(0, pt.brake - dt * 2); }
    if (down) { if (pt.throttle > 0) pt.throttle = Math.max(0, pt.throttle - dt * 1.5); else pt.brake = Math.min(1, pt.brake + dt * 0.9); }
    if (!up && !down) pt.brake = Math.max(0, pt.brake - dt * 0.2);
    if (g.padStop || k.has('Space')) pt.emergency = true;
    if (pt.emergency) { pt.throttle = 0; pt.brake = 1; }
    if (pt.doors) { pt.throttle = 0; }
    // seinen en snelheidsbeperking: automatische treinbeïnvloeding remt bij rood of veel te hard
    const lim = L.limAt(pt.s), sig = this.signalAhead(pt);
    pt.lim = lim; pt.sig = sig;
    let atp = false;
    if (sig && sig.red && sig.dist < 30 && pt.v > 1) atp = true;
    if (pt.v > lim * 1.12 + 1) atp = true;
    if (atp && !pt.atpWarn) { pt.atpWarn = true; g.toast('⚠ Automatische remming: sein op rood of te snel!'); }
    if (!atp) pt.atpWarn = false;
    const grade = L.at(pt.s).grade * pt.dir;
    const acc = pt.throttle * 0.9 - pt.brake * 1.1 - (pt.emergency || atp ? 1.6 : 0) - 9.81 * grade * (L.rack ? 0.15 : 1) - 0.002 * pt.v * pt.v / 10;
    pt.v = Math.max(0, pt.v + acc * dt);
    if (pt.v === 0) pt.emergency = false;
    // einde van de lijn
    const end = pt.dir > 0 ? L.len - 5 : 5;
    pt.s += pt.dir * pt.v * dt;
    if ((pt.s - end) * pt.dir > 0) { pt.s = end; pt.v = 0; }
    // halte?
    const st = L.stations.find(q => Math.abs(pt.s - q.s) < q.len / 2);
    pt.atStation = st && pt.v < 0.3 ? st : null;
    const ahead = L.stations.filter(q => (q.s - pt.s) * pt.dir > 0).sort((a, b) => (a.s - b.s) * pt.dir)[0];
    pt.nextStop = ahead || null;
    if (ahead && Math.abs(ahead.s - pt.s) < 700 && !this.announced.has('p' + ahead.name)) { this.announced.add('p' + ahead.name); this.say(`Volgende halte: ${ahead.name}.`); }
  }
  signalAhead(pt) {
    let best = null;
    for (const a of this.active || []) {
      if (a.id === pt.id || a.run.pr.L !== pt.L || a.run.dir !== pt.dir) continue;
      const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), tail = s - a.run.dir * a.run.pr.len, ds = (tail - pt.s) * pt.dir;
      if (ds > 0 && (!best || ds < best.ds)) best = { ds };
    }
    // tegenliggers op enkelspoor
    if (pt.L.single || (pt.L.oldS && Math.abs(pt.s - (pt.L.oldS[0] + pt.L.oldS[1]) / 2) < (pt.L.oldS[1] - pt.L.oldS[0]) / 2 + 400)) {
      for (const a of this.active || []) {
        if (a.id === pt.id || a.run.pr.L !== pt.L || a.run.dir === pt.dir) continue;
        const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), ds = (s - pt.s) * pt.dir;
        if (ds > 0 && blockKey(pt.L, s, a.run.dir) === blockKey(pt.L, pt.s + pt.dir * Math.min(ds, 300), pt.dir) && (!best || ds < best.ds)) best = { ds };
      }
    }
    if (!best) return { red: false, dist: 9999 };
    const blockLen = 1200, distToSignal = best.ds - blockLen;
    return { red: distToSignal < 0, dist: Math.max(0, best.ds - 150), ahead: best.ds };
  }
  // ---------- scherm ----------
  showHud(tr, a) {
    if (!this.hud || this.g.drive) return;
    const pr = a.run.pr, next = pr.stops.find(q => q.arr > a.t), late = 0;
    const sp = Math.round((tr.v || 0) * KMH);
    this.hud.hidden = false;
    const tEnd = a.t < pr.T ? ` · aankomst ${hhmm(railClock() + pr.T - a.t)}` : '';
    this.hud.innerHTML = `<div class="dh-speed">${sp}<small> km/h</small></div><div><b>${tr.name}</b><br><span class="small">${next ? `Volgende halte: ${next.st.name} · ${hhmm(railClock() + next.arr - a.t)}` : a.t < pr.T ? `Volgende halte: ${pr.last.name} (eindstation)${tEnd}` : `Eindstation ${pr.last.name}`}${late ? ' · +' + late + ' min' : ''}</span><br><span class="small muted">J: zitplaats / uitstappen aan de deur · cabine vooraan: H</span></div>`;
  }
  hideHud() { if (this.hud && !this.g.drive && !this.hudOwned) this.hud.hidden = true; }
  say(text) { this.g.toast('📢 ' + text); try { const u = new SpeechSynthesisUtterance(text); u.lang = 'nl-BE'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* geen spraak */ } }

  // ---------- kaart met lijnen, treinen en reisplanner ----------
  openMap() {
    const g = this.g, ov = document.getElementById('ov-rail'); if (!ov) return false;
    const c = document.getElementById('railmap');
    if (!this.mapImg) {
      // het terrein als kant-en-klare afbeelding (tools/bake-alpen-map.mjs)
      this.mapImg = new Image(); this.mapImg.onload = () => { this.mapReady = true; if (!ov.hidden) this.drawMap(); };
      this.mapImg.src = './assets/alpen-map.jpg';
    }
    if (!c.dataset.bound) {
      c.dataset.bound = '1';
      c.addEventListener('click', (e) => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, z = (e.clientY - r.top) / r.height * ML;
        // dichtste station
        let best = null, bd = 1500;
        for (const st of STATIONS_ALL) { const d = Math.hypot(st.x - x, st.z - z); if (d < bd) { bd = d; best = st; } }
        if (best) { this.sel = best.name; this.renderPanel(); this.drawMap(); }
        else { this.sel = null; this.tpTo = { x, z }; this.renderPanel(); }
      });
      document.getElementById('rail-close')?.addEventListener('click', () => { g.invOpen = false; g.resume(); });
      document.getElementById('rail-plain')?.addEventListener('click', () => { g.mapPlain = true; g.openMap(); g.mapPlain = false; });
    }
    this.sel = this.sel || this.nearestStation()?.name;
    this.renderPanel();
    g.invOpen = true; g.invWhich = 'rail';
    if (document.pointerLockElement) document.exitPointerLock();
    g.paused = true;
    g.showOverlay('rail');
    this.drawMap();
    clearInterval(this.mapTimer);
    this.mapTimer = setInterval(() => { if (ov.hidden) { clearInterval(this.mapTimer); return; } this.update(0, 1); this.drawMap(); }, 1000);
    return true;
  }
  nearestStation() { const p = this.g.player.pos; let best = null, bd = 1e18; for (const st of STATIONS_ALL) { const d = (st.x - p.x) ** 2 + (st.z - p.z) ** 2; if (d < bd) { bd = d; best = st; } } return best; }
  drawMap() {
    const c = document.getElementById('railmap'); if (!c) return;
    const W = 1000; c.width = W; c.height = W;
    const k = W / MW, ctx = c.getContext('2d');
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, W, W);
    if (this.mapReady) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.mapImg, 0, 0, W, W); }
    ctx.fillStyle = 'rgba(10,14,22,.25)'; ctx.fillRect(0, 0, W, W);
    // lijnen (tunnels gestippeld)
    for (const L of LINES) {
      ctx.strokeStyle = L.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
      let open = null;
      for (let i = 0; i < L.n; i += 6) {
        const tun = L.kind[i] === 1;
        if (open !== tun) { if (open !== null) ctx.stroke(); ctx.beginPath(); ctx.setLineDash(tun ? [6, 5] : []); ctx.moveTo(L.x[i] * k, L.z[i] * k); open = tun; }
        else ctx.lineTo(L.x[i] * k, L.z[i] * k);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // kabelbanen en liften
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (const L of LIFTS) { ctx.beginPath(); ctx.moveTo(L.ax * k, L.az * k); ctx.lineTo(L.bx * k, L.bz * k); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(CABLE_ST[0].x * k, CABLE_ST[0].z * k); ctx.lineTo(CABLE_ST[1].x * k, CABLE_ST[1].z * k); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const label = (t, x, z, col = '#fff', dy = -9) => { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(t, x * k + 1, z * k + dy + 1); ctx.fillStyle = col; ctx.fillText(t, x * k, z * k + dy); };
    // toppen, meren, hotels
    for (const [n, x, z] of [['▲ Reuzenberg 2067', SUMMIT_XZ[0], SUMMIT_XZ[1]], ...PATCHES.map(P => [`▲ ${P.name} ${P.target}`, P.px, P.pz]), ['▲ Hemelhoorn 5000', HEMEL.x, HEMEL.z]]) label(n, x, z, '#ffe9a8', 0);
    for (const L of LIFTS) label('🚡 ' + L.top, L.bx, L.bz, '#dfe', 14);
    // stations
    for (const st of STATIONS_ALL) {
      ctx.fillStyle = st.name === this.sel ? '#ffd34d' : '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.x * k, st.z * k, st.name === this.sel ? 7 : 5, 0, 7); ctx.fill(); ctx.stroke();
      label(st.name, st.x, st.z, st.name === this.sel ? '#ffd34d' : '#fff', -10);
    }
    // treinen live
    for (const a of this.active || []) {
      if (a.t < 0) continue;
      const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), p = a.run.pr.L.at(s);
      ctx.fillStyle = a.run.sv.freight ? '#999' : a.run.pr.L.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.fillRect(p.x * k - 4, p.z * k - 4, 8, 8); ctx.strokeRect(p.x * k - 4, p.z * k - 4, 8, 8);
    }
    if (this.player) { const p = this.player.L.at(this.player.s); ctx.fillStyle = '#ffd34d'; ctx.fillRect(p.x * k - 5, p.z * k - 5, 10, 10); }
    // speler
    const pp = this.g.player.pos; this.g.drawArrow?.(ctx, pp.x * k, pp.z * k, 10);
  }
  renderPanel() {
    const box = document.getElementById('rail-panel'); if (!box) return;
    const now = railClock(), here = this.nearestStation();
    const esc = (t) => String(t).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
    let html = '';
    if (this.sel) {
      const st = STATIONS_ALL.find(q => q.name === this.sel);
      html += `<h3 style="margin:4px 0">🚉 ${esc(st.name)}</h3><div class="small muted">${st.lines.map(id => `<span style="color:${LINE[id].color}">■</span> ${esc(LINE[id].name)}`).join(' · ')}</div>`;
      html += '<table class="small" style="width:100%;margin-top:6px"><tr><th align="left">Vertrek</th><th align="left">Trein</th><th align="left">Naar</th></tr>';
      for (const d of departures(st.name, now, 7)) html += `<tr><td>${hhmm(d.at)}</td><td><span style="color:${d.run.pr.L.color}">■</span> ${esc(d.run.sv.name)}</td><td>${esc(d.dest)}</td></tr>`;
      html += '</table>';
      if (here && here.name !== st.name) {
        const r = plan(here.name, st.name, now);
        html += `<h4 style="margin:8px 0 2px">Reisplanner: ${esc(here.name)} → ${esc(st.name)}</h4>`;
        if (r) for (const lg of r.legs) html += `<div class="small">${hhmm(lg.dep)} <span style="color:${lg.run.pr.L.color}">■</span> <b>${esc(lg.run.sv.name)}</b> ${esc(lg.from)} → ${esc(lg.to)} · aankomst ${hhmm(lg.arr)}</div>`;
        else html += '<div class="small">Geen verbinding gevonden.</div>';
      }
      html += `<div class="row" style="margin-top:8px"><button class="btn" id="rail-tp">🧭 Naar dit station</button></div>`;
    } else if (this.tpTo) html += `<div class="row"><button class="btn" id="rail-tp">✈ Hierheen vliegen</button></div>`;
    html += '<p class="help">Tik op een station voor vertrektijden en een reisplanner vanaf het dichtste station. Gekleurde blokjes zijn treinen die nu rijden. Gestippeld = tunnel.</p>';
    box.innerHTML = html;
    document.getElementById('rail-tp')?.addEventListener('click', () => {
      const g = this.g, p = g.player;
      g.aboard = null; if (g.drive) g.leaveVehicle?.();
      if (this.sel) { const st = STATIONS_ALL.find(q => q.name === this.sel), L = LINE[st.lines[0]], s = st.stops[0].s, q = L.at(s), side = (L.single ? 1.5 : TRACK) + 4; p.pos.set(q.x - q.tz * side, st.y + 2.2, q.z + q.tx * side); p.fly = false; }
      else { p.pos.set(this.tpTo.x, (g.meta.ground ?? 12) + 120, this.tpTo.z); p.fly = true; }
      p.vel.set(0, 0, 0);
      if (g.tiled) { g.tiled.aheadKey = null; g.updateTiles(true); }
      g.invOpen = false; g.resume();
    });
  }
}

// ---------- de cabine (zelf rijden) ----------
class TrainCab {
  constructor(rail) { this.r = rail; this.g = rail.g; this.t = 0; this.show(true); }
  show(on) {
    const hud = this.r.hud, pad = document.getElementById('drive-pad');
    if (hud) hud.hidden = !on;
    if (pad) { pad.hidden = !on || !this.g.touch; pad.dataset.mode = 'rail'; }
    this.g.ui.root?.classList.toggle('driving', on);
  }
  camMode() { return 'first'; }
  cycleCam() { this.cam = this.cam === 'chase' ? 'cab' : 'chase'; }
  placeCamera(cam) {
    const pt = this.r.player, c = pt.car, p = this.g.player;
    const local = this.cam === 'chase' ? new THREE.Vector3(2, 9, -30) : new THREE.Vector3(c.d.cab[0], 3.75, c.d.cab[2] + 0.4);
    const w = c.body.toWorld(local, new THREE.Vector3());
    cam.position.copy(w); cam.rotation.set(p.pitch - (this.cam === 'chase' ? 0.18 : 0), c.body.yaw + Math.PI + p.yaw, 0);
    // voor het laden van de tegels: de speler staat in de cabine
    p.pos.set(w.x, w.y - 1.62, w.z);
    return true;
  }
  update(dt) {
    const r = this.r, pt = r.player; if (!pt) return;
    r.drivePhys(dt);
    this.g.extVel = (() => { const c = pt.car.body; return new THREE.Vector3(Math.sin(c.yaw) * pt.v, 0, Math.cos(c.yaw) * pt.v); })();
    if (this.g.tiled) this.g.updateTiles();
    this.t += dt;
    if (this.t > 0.2 && r.hud) {
      this.t = 0;
      const sp = Math.round(pt.v * KMH), lim = Math.round(pt.lim * KMH), sg = pt.sig;
      const ns = pt.nextStop, dist = ns ? Math.abs(ns.s - pt.s) : 0;
      r.hud.innerHTML = `<div class="dh-speed" style="color:${pt.v > pt.lim * 1.05 ? '#ff6a5a' : '#fff'}">${sp}<small> km/h</small></div>
        <div class="small"><b>${pt.tr.sv.name}</b> · max <b>${lim}</b> km/h<br>
        Tractie ${'▮'.repeat(Math.round(pt.throttle * 5)).padEnd(5, '▯')} · Rem ${'▮'.repeat(Math.round(pt.brake * 5)).padEnd(5, '▯')}${pt.emergency ? ' · <b style="color:#ff6a5a">NOODREM</b>' : ''}<br>
        Sein: <b style="color:${sg && sg.red ? '#ff4a3a' : '#4aff6a'}">${sg && sg.red ? 'ROOD' : 'GROEN'}</b>${sg && sg.ahead < 3000 ? ` (trein voor je op ${Math.round(sg.ahead)} m)` : ''}<br>
        ${ns ? `Volgende halte: <b>${ns.name}</b> over ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}` : 'Einde van de lijn'}${pt.atStation ? ` · 🚉 ${pt.atStation.name}: Q = deuren` : ''}${pt.doors ? ' · 🚪 deuren open' : ''}</div>`;
    }
  }
  key(code) {
    const r = this.r, pt = r.player;
    if (code === 'KeyH') { this.exit(); return true; }
    if (code === 'KeyV') { this.cycleCam(); return true; }
    if (code === 'KeyQ') {
      if (pt.v > 0.3) { this.g.toast('Deuren openen kan alleen stilstaand'); return true; }
      pt.doors = !pt.doors; this.g.toast(pt.doors ? '🚪 Deuren open' : '🚪 Deuren dicht');
      if (pt.doors && pt.atStation) r.say(`${pt.atStation.name}. U kan hier uitstappen.`);
      return true;
    }
    if (code === 'KeyN') { const ns = pt.nextStop; r.say(ns ? `Volgende halte: ${ns.name}.` : 'Dit is het eindstation. Iedereen uitstappen, alstublieft.'); return true; }
    if (code === 'KeyR') {
      if (pt.v > 0.3) { this.g.toast('Eerst stoppen om van rijrichting te wisselen'); return true; }
      pt.dir = -pt.dir; pt.tr.cars.reverse(); for (const c of pt.tr.cars) c.flip = !c.flip;
      const cab = pt.tr.cars.find(c => c.d.cab && !c.flip) || pt.tr.cars[0]; pt.car = cab;
      // de kop zit nu aan de andere kant
      const len = pt.tr.cars.reduce((a, c) => a + c.d.L + GAP, 0) - GAP; pt.s += pt.dir * len;
      this.g.toast('↩ Rijrichting omgekeerd (andere cabine)'); return true;
    }
    return false;
  }
  exit() { this.show(false); this.g.drive = null; this.r.stopDriving(); }
}
