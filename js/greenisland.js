// GREENISLAND – een fictief eilandland in de Noordzee (145 × 50 km, 1 blok = 1 m).
// Alle tegels komen uit dezelfde centrale gegevens: greenisland-data.js (canon en voorstellen), de plaatsen,
// de wegen en spoorlijnen (greenisland-routes.js / green-net.js). Zo sluiten wegen, sporen, stations en gebouwen
// over tegelgrenzen heen altijd op elkaar aan. Vanaf het begin met de oplossingen uit de andere werelden:
// gebouwen op hun eigen hoogte met fundering, rails op de ballast, geen trappen in wegen, tunnels en viaducten.
import { B } from './blocks.js';
import { hash, noise, placeTree } from './city.js';
import { W as MW, L as ML, G, COUNTRY, PROVINCES, provinceAt, MUNKBAY_AREAS, LANDMARKS, WRECK, RAINFOREST, PEAKS, LAKES as LAKE_DEF, CENTRAL } from './greenisland-data.js';
import { rawHeight, coastDist, lakeAt, riverAt, fbm, sstep, cliffAmount } from './greenisland-terrain.js';
import { ALL_PLACES, PLACE } from './greenisland-places.js';
import { ROADS as ROAD_ROUTES, SEA as SEA_ROUTES } from './greenisland-routes.js';
import { LINES, LINE, STATIONS_ALL, TRACK, BED, trackOffset } from './green-net.js';

export { MW, ML, G, LINES, LINE, STATIONS_ALL, TRACK, trackOffset, ALL_PLACES };
export const T = 128;
export { META } from './greenisland-meta.js';
import { META } from './greenisland-meta.js';

class Grid {
  constructor(C) { this.C = C; this.m = new Map(); }
  add(o, x0, z0, x1, z1) { const C = this.C; for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) { const k = cz * 8192 + cx; let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(o); } }
  at(x, z) { return this.m.get(Math.floor(z / this.C) * 8192 + Math.floor(x / this.C)) || EMPTY; }
}
const EMPTY = [];

// ---------- plaatsen ----------
const placeGrid = new Grid(1024);
for (const p of ALL_PLACES) placeGrid.add(p, p.x - p.r - 600, p.z - p.r - 600, p.x + p.r + 600, p.z + p.r + 600);
const MUNK = PLACE.Munkbay;
const AREAS = MUNKBAY_AREAS.map(a => ({ ...a, x: MUNK.x + a.dx, z: MUNK.z + a.dz }));
function areaAt(x, z) { let best = null, bd = 1e9; for (const a of AREAS) { const d = Math.hypot(x - a.x, z - a.z) / a.r; if (d < 1 && d < bd) { bd = d; best = a; } } return best; }
// bebouwingsdichtheid 0..1 en de plaats
function urbanAt(x, z) {
  let best = null, bd = 0;
  for (const p of placeGrid.at(x, z)) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    if (d >= 1) continue;
    const base = p.kind === 'capital' ? 1 : p.kind === 'city' ? 0.8 : p.kind === 'town' ? 0.55 : p.kind === 'village' ? 0.35 : 0.2;
    const v = base * (1 - Math.pow(d, 1.6)) + 0.08 * (1 - d);
    if (v > bd) { bd = v; best = p; }
  }
  return best ? { p: best, dens: bd } : null;
}

// ---------- wegen (nationaal net) met een vloeiend hoogteprofiel ----------
const ROAD_HW = { A: 8, N: 4.2, L: 3.2 };
export const ROADS = ROAD_ROUTES.map((r, i) => {
  const pts = r.pts, xs = [], zs = [];
  for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8)); for (let q = 0; q < n; q++) { xs.push(ax + (bx - ax) * q / n); zs.push(az + (bz - az) * q / n); } }
  xs.push(pts[pts.length - 1][0]); zs.push(pts[pts.length - 1][1]);
  const n = xs.length, g = new Float32Array(n), y = new Float32Array(n), s = new Float32Array(n);
  for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
  for (let k = 0; k < n; k += 3) g[k] = G + Math.max(1, rawHeight(xs[k], zs[k]));
  g[n - 1] = G + Math.max(1, rawHeight(xs[n - 1], zs[n - 1]));
  for (let k = 0; k < n - 1; k++) if (k % 3) { const a = k - (k % 3), b = Math.min(n - 1, a + 3); g[k] = g[a] + (g[b] - g[a]) * (k - a) / (b - a || 1); }
  // hoogte: de grond afgevlakt over 160 m, hooguit 6 % (snelweg 4 %) helling
  const W2 = 10, grade = r.kind === 'A' ? 0.04 : 0.06;
  for (let k = 0; k < n; k++) { let a = 0, c = 0; for (let j = Math.max(0, k - W2); j <= Math.min(n - 1, k + W2); j++) { a += g[j]; c++; } y[k] = a / c; }
  y[0] = g[0]; y[n - 1] = g[n - 1];
  for (let it = 0; it < 2; it++) { for (let k = 1; k < n; k++) { const d = s[k] - s[k - 1]; y[k] = Math.max(y[k - 1] - grade * d, Math.min(y[k - 1] + grade * d, y[k])); } for (let k = n - 2; k >= 0; k--) { const d = s[k + 1] - s[k]; y[k] = Math.max(y[k + 1] - grade * d, Math.min(y[k + 1] + grade * d, y[k])); } }
  return { id: i, a: r.a, b: r.b, kind: r.kind, hw: ROAD_HW[r.kind], n, x: Float32Array.from(xs), z: Float32Array.from(zs), y, s, g };
});
const roadGrid = new Grid(64);
for (const R of ROADS) for (let k = 0; k < R.n - 1; k++) { const m = R.hw + 40; roadGrid.add({ R, k }, Math.min(R.x[k], R.x[k + 1]) - m, Math.min(R.z[k], R.z[k + 1]) - m, Math.max(R.x[k], R.x[k + 1]) + m, Math.max(R.z[k], R.z[k + 1]) + m); }
function roadNear(x, z, reach = 40) {
  let best = null;
  for (const { R, k } of roadGrid.at(x, z)) {
    const ax = R.x[k], az = R.z[k], vx = R.x[k + 1] - ax, vz = R.z[k + 1] - az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d <= reach && (!best || d < best.d)) best = { R, d, s: R.s[k] + (R.s[k + 1] - R.s[k]) * t, y: R.y[k] + (R.y[k + 1] - R.y[k]) * t, g: R.g[k] + (R.g[k + 1] - R.g[k]) * t, sd: (vx * (z - az) - vz * (x - ax)) > 0 ? d : -d };
  }
  return best;
}

// ---------- spoor: dalen, sleuven en dijken (zoals in de Alpen) ----------
const railGrid = new Grid(256);
for (const L of LINES) for (let i = 0; i + 10 < L.n; i += 10) { const R = Math.min(400, L.tun / 0.7) + BED + 40; railGrid.add({ L, i, j: i + 10 }, Math.min(L.x[i], L.x[i + 10]) - R, Math.min(L.z[i], L.z[i + 10]) - R, Math.max(L.x[i], L.x[i + 10]) + R, Math.max(L.z[i], L.z[i + 10]) + R); }
function railShape(x, z, h) {
  const list = railGrid.at(x, z); if (!list.length) return h;
  const seen = new Map();
  for (const sg of list) {
    const L = sg.L, ax = L.x[sg.i], az = L.z[sg.i], vx = L.x[sg.j] - ax, vz = L.z[sg.j] - az, L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)), d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    const b = seen.get(L); if (!b || d < b.d) seen.set(L, { d, k: Math.round(sg.i + 10 * t) });
  }
  let out = h;
  for (const [L, q] of seen) {
    const k = Math.min(L.n - 1, q.k), kind = L.kind[k];
    if (kind === 1) continue;
    const hb = L.y[k] - 1 - G, bed = (L.single ? 2.8 : BED) + 1;
    if (q.d <= bed) { if (kind !== 2) out = Math.min(out, hb); if (kind === 0 && out < hb) out = Math.max(out, hb); continue; }
    if (out > hb) out = Math.min(out, hb + (q.d - bed) * 0.7);
    else if (kind === 0 && hb - out < 9) out = Math.max(out, hb - (q.d - bed) / 1.6);
  }
  return out;
}
// wegen: sleuf en talud (geen trappen), bruggen boven dalen en rivieren, tunnels door bergen
function roadShape(x, z, h) {
  const q = roadNear(x, z, 40); if (!q) return h;
  const R = q.R, hy = q.y - G - 1, bed = R.hw + 1.5;
  if (hy - h > 6 && q.d <= bed + 6) return h; // brug: het terrein blijft eronder
  if (h - hy > 24) return h; // tunnel
  if (q.d <= bed) return hy;
  return h > hy ? Math.min(h, hy + (q.d - bed) * 0.8) : Math.max(h, hy - (q.d - bed) / 1.5);
}

// ---------- het landschap ----------
export function natural(x, z) {
  let h = rawHeight(x, z);
  if (h < -0.5) return h;
  h = roadShape(x, z, h);
  return railShape(x, z, h);
}
export const surfaceAt = natural;
export const heightAt = (x, z) => G + natural(x, z);
export const groundAt = (x, z) => Math.round(G + natural(x, z));

// ---------- stratenplan en kavels in de bebouwde kom ----------
// elke plaats heeft een eigen raster (oorsprong in het centrum), blokken van 70–120 m; brede lanen om de 4 blokken
function gridFor(p) {
  const B0 = p.kind === 'capital' ? 120 : p.kind === 'city' ? 110 : p.kind === 'town' ? 95 : 80;
  return { B: B0, ox: p.x - B0 / 2, oz: p.z - B0 / 2 };
}
function streetAt(x, z, u) {
  const g = gridFor(u.p), lx = x - g.ox, lz = z - g.oz, bx = Math.floor(lx / g.B), bz = Math.floor(lz / g.B), fx = lx - bx * g.B, fz = lz - bz * g.B;
  const avX = ((bx % 4) + 4) % 4 === 0, avZ = ((bz % 4) + 4) % 4 === 0;
  const hwX = avX && u.dens > 0.45 ? 9 : 5, hwZ = avZ && u.dens > 0.45 ? 9 : 5; // halve breedte incl. stoep
  const inX = fx < hwX, inZ = fz < hwZ; // straat langs de westrand (x) of noordrand (z) van het blok
  if (inX || inZ) {
    const d = inX ? fx : fz, hw = inX ? hwX : hwZ;
    return { street: true, d, hw, avenue: inX ? avX : avZ, alongX: !inX, bx, bz, g };
  }
  return { street: false, bx, bz, fx, fz, g, hwX, hwZ };
}
// kavel (deterministisch uit het blok): 2 rijen kavels, breedte afhankelijk van de dichtheid
function lotAt(x, z, u, st) {
  const { g, bx, bz, hwX, hwZ } = st, x0b = g.ox + bx * g.B + hwX, z0b = g.oz + bz * g.B + hwZ, x1b = g.ox + (bx + 1) * g.B, z1b = g.oz + (bz + 1) * g.B;
  const area = areaAt(x, z), dens = u.dens;
  // parken en pleinen
  const r0 = hash(bx * 31 + u.p.x, bz * 17 + u.p.z, 501);
  if (area && area.kind === 'park') return { park: true };
  if (r0 < 0.06 && dens > 0.3) return { park: true };
  const lw = dens > 0.8 ? 40 : dens > 0.5 ? 26 : dens > 0.3 ? 20 : 16, depth = (z1b - z0b) / 2;
  const row = z - z0b < depth ? 0 : 1, nLots = Math.max(1, Math.floor((x1b - x0b) / lw)), w = (x1b - x0b) / nLots, li = Math.min(nLots - 1, Math.floor((x - x0b) / w));
  const lx0 = x0b + li * w, lz0 = z0b + row * depth;
  const id = (bx * 7919 + bz * 104729 + li * 31 + row) | 0;
  const r = hash(id, u.p.x | 0, 503), r2 = hash(id, u.p.z | 0, 504);
  // in dorpen niet elke kavel bebouwd
  if (r > 0.25 + dens * 1.2 && dens < 0.6) return { garden: true };
  const set = dens > 0.8 ? 1.5 : dens > 0.5 ? 3 : 5;
  const b = { x0: Math.round(lx0 + set), x1: Math.round(lx0 + w - set), z0: Math.round(lz0 + set), z1: Math.round(lz0 + depth - set), id, face: row === 0 ? 'z0' : 'z1' };
  if (b.x1 - b.x0 < 7 || b.z1 - b.z0 < 7) return { garden: true };
  // soort en hoogte
  const akind = area ? area.kind : null, style = u.p.style;
  let floors, kind;
  if (akind === 'cbd') { kind = 'tower'; floors = 12 + Math.floor(Math.pow(r2, 1.8) * 58 * (1 - Math.hypot(x - area.x, z - area.z) / area.r * 0.6)); }
  else if (akind === 'oldtown') { kind = 'old'; floors = 2 + Math.floor(r2 * 3); }
  else if (akind === 'campus') { kind = 'campus'; floors = 3 + Math.floor(r2 * 5); }
  else if (akind === 'harbour') { kind = 'warehouse'; floors = 2 + Math.floor(r2 * 2); }
  else if (akind === 'airport' || akind === 'beach') return { garden: true };
  else if (dens > 0.75) { kind = 'apartment'; floors = 5 + Math.floor(r2 * 9); }
  else if (dens > 0.5) { kind = r2 < 0.3 ? 'shop' : 'apartment'; floors = 3 + Math.floor(r2 * 4); }
  else { kind = style === 'berg' ? 'chalet' : style === 'tropisch' ? 'villa' : 'house'; floors = 1 + Math.floor(r2 * 2.2); }
  b.kind = kind; b.floors = floors; b.style = style; b.r = r; b.r2 = r2;
  return { b };
}
// vloerhoogte van een gebouw (eenmaal per kavel berekend, gecachet per tegel)
function fitLot(b, cache) {
  const k = b.id + ':' + b.x0 + ':' + b.z0; let f = cache && cache.get(k);
  if (f !== undefined) return f;
  let lo = 1e9, hi = -1e9;
  for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]]) { const h = G + natural(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const fx = (b.x0 + b.x1) / 2, fz = b.face === 'z0' ? b.z0 - 3 : b.z1 + 3;
  const hd = Math.round(G + natural(fx, fz));
  f = (hi - lo > 8 || lo < G) ? null : Math.max(Math.round(lo), Math.min(Math.round(hi), hd));
  // niet op het spoor of een nationale weg
  if (f !== null) for (const L of LINES) if (L.near((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + BED + 4)) { f = null; break; }
  if (f !== null) { const q = roadNear((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 10); if (q && q.d < Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + q.R.hw + 2) f = null; }
  if (cache) cache.set(k, f);
  return f;
}

// ---------- bijzondere gebouwen (landmarks) en de luchthaven ----------
export const BLD = [];
const bldGrid = new Grid(64);
for (const lm of LANDMARKS) {
  const p = PLACE[lm.town]; if (!p) continue;
  const x = p.x + lm.dx, z = p.z + lm.dz;
  const b = { x0: Math.round(x - lm.w / 2), x1: Math.round(x + lm.w / 2), z0: Math.round(z - lm.d / 2), z1: Math.round(z + lm.d / 2), kind: lm.kind, floors: lm.floors, name: lm.name, face: 'z1', landmark: true, id: BLD.length };
  BLD.push(b); bldGrid.add(b, b.x0 - 3, b.z0 - 3, b.x1 + 3, b.z1 + 3);
}
const AIRPORT = (() => { const a = AREAS.find(q => q.kind === 'airport'); return { name: 'Munkbay International Airport (GreenAir)', x0: a.x - 2600, x1: a.x + 2600, z0: a.z - 900, z1: a.z + 900, cx: a.x, cz: a.z }; })();
function inAirport(x, z) { return x >= AIRPORT.x0 && x <= AIRPORT.x1 && z >= AIRPORT.z0 && z <= AIRPORT.z1; }
export { AIRPORT };

// ---------- zones ----------
const snowLine = (x, z) => 1950 + fbm(x / 400, z / 400, 2, 70) * 120;
const rockLine = (x, z) => 1500 + fbm(x / 300, z / 300, 2, 71) * 120;
const treeLine = (x, z) => 1250 + fbm(x / 260, z / 260, 2, 72) * 100;
function rainforest(x, z) { return Math.hypot((x - RAINFOREST.x) / RAINFOREST.rx, (z - RAINFOREST.z) / RAINFOREST.rz) < 1 + fbm(x / 2000, z / 2000, 2, 73) * 0.25; }

// ---------- kolommen ----------
let treeKind = 0;
const under = (col, top, y, mat) => { for (let k = Math.max(1, top - 3); k < y; k++) col[k] = mat; };
function treeSpot(x, z, s, p) { const cx = Math.floor(x / s), cz = Math.floor(z / s); return x - cx * s === Math.floor(hash(cx, cz, 41) * s) && z - cz * s === Math.floor(hash(cx, cz, 42) * s) && hash(cx, cz, 43) < p; }

function railColumn(x, z, col, top, ctx, only) {
  // eerst: ligt deze kolom op het spoorbed van een lijn? (gaat voor op een perron of plein van een andere lijn)
  let q = null, qb = null;
  for (const L of only ? [only] : ctx.lines) { const r = L.near(x, z, 40); if (!r) continue; r.line = L; if (!q || r.d < q.d) q = r; if (r.d <= (L.single ? 2.6 : BED) && (!qb || r.d < qb.d)) qb = r; }
  if (qb) q = qb;
  if (!q) return -1;
  const L = q.line, by = Math.round(q.y), ad = q.d;
  let two = !L.single;
  if (L.single) for (const st2 of L.stations) if (q.s > st2.s0 - 95 && q.s < st2.s1 + 95) two = true;
  const bed = L.single && !two ? 2.6 : BED, st = L.stationAt(q.s), kind = q.kind;
  if (kind === 1) {
    if (ad > bed + 1.2) return -1;
    if (top <= by + 7) { if (ad <= bed) { for (let y = by + 1; y <= top; y++) col[y] = 0; col[by] = ad < bed - 0.7 ? B.BALLAST : B.GRAVEL; col[by - 1] = B.STONE; return by; } for (let y = by + 1; y <= Math.max(top, by + 9); y++) col[y] = B.CONCRETE; return Math.max(top, by + 9); }
    if (ad <= bed) { col[by - 1] = B.CONCRETE; col[by] = ad < bed - 0.7 ? B.BALLAST : B.CONCRETE; for (let y = by + 1; y <= by + 6; y++) col[y] = 0; col[by + 7] = B.CONCRETE; col[by + 8] = B.CONCRETE; if (ad > bed - 1 && Math.round(q.s) % 24 === 0) col[by + 5] = B.LAMP; if (top - by < 14) for (let y = by + 9; y <= top; y++) col[y] = B.CONCRETE; return Math.max(top, by + 8); }
    for (let y = by - 1; y <= by + 8; y++) col[y] = B.CONCRETE; return Math.max(top, by + 8);
  }
  // perrons (ook gedeelde: in Munkbay Central liggen de lijnen 15 m uit elkaar, perrons tussen twee lijnen versmelten)
  if (st) {
    const pIn = (L.single && !two ? 0 : TRACK) + 2.2, pOut = pIn + 4.2;
    if (ad > bed && ad <= pOut + 0.4) {
      under(col, top, by + 1, B.CONCRETE);
      for (let y = top + 1; y <= by; y++) col[y] = B.CONCRETE;
      for (let y = by + 2; y <= Math.max(top, by + 1); y++) col[y] = 0;
      col[by + 1] = ad < pIn + 0.6 ? B.LINE_WHITE : ad < pIn + 1.2 ? B.LINE_YELLOW : B.TILE;
      let t = by + 1;
      const mid = (st.s0 + st.s1) / 2;
      if (st.central) { // grote stationshal over alle sporen
        if (Math.abs(q.s - mid) < st.len / 2 + 4) { col[by + 14] = Math.round(q.s) % 9 === 0 ? B.METAL : B.GLASS; t = by + 14; if (Math.round(q.s) % 27 === 0 && Math.abs(ad - (pIn + 2.6)) < 0.6) for (let y = by + 2; y < by + 14; y++) col[y] = B.METAL; }
      } else if (Math.abs(q.s - mid) < st.len * 0.3 && ad > pIn + 1.4) {
        col[by + 5] = Math.round(q.s) % 7 === 0 ? B.METAL : B.GLASS; t = by + 5;
        if (Math.abs(ad - (pOut - 1.2)) < 0.5 && Math.round(q.s) % 8 === 0) for (let y = by + 2; y < by + 5; y++) col[y] = B.POST;
      }
      if (Math.abs(ad - (pIn + 2.2)) < 0.5 && Math.round(q.s) % 40 === 20) { col[by + 2] = B.POST; col[by + 3] = B.PAINT_GREEN; col[by + 4] = B.PAINT_GREEN; t = Math.max(t, by + 4); } // vertrekbord
      if (Math.abs(ad - (pOut - 1.2)) < 0.5 && Math.round(q.s) % 16 === 8) col[by + 2] = B.DARK_PLANKS; // bank
      return t;
    }
    // stationsplein tot het stationsgebouw / de straat
    if (ad > pOut + 0.4 && ad <= pOut + 10 && Math.abs(q.s - (st.s0 + st.s1) / 2) < st.len * 0.35) {
      under(col, top, by, B.STONE); for (let y = top + 1; y < by; y++) col[y] = B.STONE; for (let y = by + 1; y <= Math.max(top, by + 4); y++) col[y] = 0;
      col[by] = (Math.round(q.s) + Math.round(ad)) % 6 === 0 ? B.COBBLE : B.TILE;
      if (Math.abs(ad - (pOut + 9.4)) < 0.5 && top > by) { for (let y = by + 1; y <= top; y++) col[y] = B.ASHLAR; return top; }
      if (Math.abs(ad - (pOut + 5)) < 0.5 && Math.abs(q.s - (st.s0 + st.s1) / 2) < 6) { for (let y = by + 1; y <= by + 7; y++) col[y] = y > by + 4 ? B.GLASS_GREEN : 0; col[by + 8] = B.PAINT_GREEN; return by + 8; } // ingang (luifel)
      return by;
    }
  }
  if (ad > bed + 1.4) { if (ad <= bed + 2.4 && top > by + 2) { for (let y = by; y <= top; y++) col[y] = (y - by) % 4 === 0 ? B.CONCRETE : B.ASHLAR; return top; } return -1; }
  const high = by - top;
  if (kind === 2 || high > 9) {
    let other = false; for (const L2 of ctx.lines) if (L2 !== L && L2.near(x, z, 12)) { other = true; break; }
    if (high <= 60) { const span = 36, u = ((q.s % span) + span) % span - span / 2, ya = by - 3 - (high - 3) * Math.pow(Math.abs(u) / (span / 2), 2.4); for (let y = Math.max(top + 1, Math.ceil(ya)); y < by; y++) if (!other || y > by - 10) col[y] = (y + Math.round(q.s)) % 5 === 0 ? B.STONE : B.ASHLAR; }
    else { const u = ((q.s % 60) + 60) % 60; if (u < 5 && ad < bed - 1 && !other) for (let y = top + 1; y < by - 3; y++) col[y] = B.CONCRETE; col[by - 3] = B.CONCRETE; col[by - 2] = B.CONCRETE; }
    col[by - 1] = B.CONCRETE; col[by] = ad < bed - 0.7 ? B.BALLAST : B.CONCRETE;
    if (ad > bed - 0.7) { col[by + 1] = B.METAL; return Math.max(by + 1, top); }
    for (let y = by + 1; y <= by + 6; y++) if (y <= top) col[y] = 0;
    return Math.max(by, top < by ? by : by);
  }
  under(col, top, by, B.STONE);
  for (let y = top + 1; y < by; y++) col[y] = B.GRAVEL;
  for (let y = by + 1; y <= top + 1; y++) col[y] = 0;
  col[by] = ad < bed - 0.7 ? B.BALLAST : B.GRAVEL;
  if (ad > bed - 0.6 && q.sd > 0 && Math.round(q.s) % 1200 === 600) { for (let y = by + 1; y <= by + 5; y++) col[y] = B.METAL; col[by + 6] = B.PAINT_BLACK; return by + 6; }
  return by;
}
// ongelijkvloerse kruising: beide sporen in dezelfde kolom (onderste eerst, ook een tunnel eronder)
function railColumnAll(x, z, col, top, ctx) {
  let lines = null;
  for (const L of ctx.lines) { const r = L.near(x, z, 7); if (r && r.d <= (L.single ? 2.6 : BED)) (lines || (lines = [])).push([L, r]); }
  if (!lines || lines.length < 2) return railColumn(x, z, col, top, ctx);
  lines.sort((a, b) => a[1].y - b[1].y);
  const [Lo, ql] = lines[0], [Lh, qh] = lines[lines.length - 1], yl = Math.round(ql.y), yh = Math.round(qh.y);
  if (yh - yl < 6) return railColumn(x, z, col, top, ctx);
  if (ql.kind === 1) { // tunnel eronder: eerst uitgraven, dan het bovenste spoor gewoon bouwen
    railColumn(x, z, col, top, ctx, Lo);
    return Math.max(railColumn(x, z, col, top, ctx, Lh), yh);
  }
  const t = railColumn(x, z, col, top, ctx);
  for (let y = Math.max(1, yl - 3); y < yl; y++) if (!col[y]) col[y] = B.STONE;
  col[yl] = ql.d < (Lo.single ? 2 : BED - 0.7) ? B.BALLAST : B.GRAVEL;
  for (let y = yl + 1; y <= Math.min(yl + 6, yh - 4); y++) col[y] = 0;
  col[yh - 2] = B.CONCRETE; col[yh - 1] = B.CONCRETE; col[yh] = qh.d < (Lh.single ? 2 : BED - 0.7) ? B.BALLAST : B.CONCRETE;
  for (let y = yh + 1; y <= yh + 5; y++) if (col[y] !== B.LAMP) col[y] = 0;
  return Math.max(t, yh);
}
// nationale weg
function roadColumn(x, z, col, top) {
  const q = roadNear(x, z, 14); if (!q) return -1;
  const R = q.R, hw = R.hw, ry = Math.round(q.y) - 1; // wegdek = bovenste blok op ry
  if (q.d > hw + 1.6) return -1;
  const high = ry - top, deep = top - ry;
  if (deep > 24 && q.d <= hw + 1.2) { // tunnel
    col[ry] = B.ASPHALT; for (let y = ry + 1; y <= ry + 6; y++) col[y] = 0; col[ry + 7] = B.CONCRETE; if (Math.round(q.s) % 20 === 0 && q.d > hw) col[ry + 5] = B.LAMP; return Math.max(top, ry + 7);
  }
  if (high > 6) { // brug
    if (Math.round(q.s) % 40 < 4 && q.d < hw - 1) for (let y = top + 1; y < ry - 1; y++) col[y] = B.CONCRETE;
    col[ry - 1] = B.CONCRETE; col[ry] = q.d <= hw ? B.ASPHALT : B.CONCRETE;
    if (q.d > hw) { col[ry + 1] = B.METAL; return ry + 1; }
    return ry;
  }
  under(col, top, ry, B.GRAVEL);
  for (let y = top + 1; y < ry; y++) col[y] = B.GRAVEL;
  for (let y = ry + 1; y <= Math.max(top, ry + 4); y++) col[y] = 0;
  if (q.d <= hw) {
    const lane = Math.abs(q.sd);
    col[ry] = R.kind === 'A' && lane < 0.6 ? B.METAL : (R.kind !== 'A' && lane < 0.5 && Math.floor(q.s / 4) % 2 === 0) || (R.kind === 'A' && Math.abs(lane - 4) < 0.4 && Math.floor(q.s / 6) % 2 === 0) || lane > hw - 0.5 ? B.LINE_WHITE : B.ASPHALT;
    if (R.kind === 'A' && lane < 0.6) { col[ry + 1] = B.METAL; return ry + 1; } // vangrail in het midden
    return ry;
  }
  col[ry] = B.GRAVEL; // berm
  if (R.kind !== 'L' && Math.round(q.s) % 50 === 25 && q.d > hw + 1) { for (let y = ry + 1; y <= ry + 5; y++) col[y] = B.POST; col[ry + 6] = B.LAMP; return ry + 6; }
  return ry;
}

// gebouwen (kavels en landmarks)
const STYLE_MAT = {
  land: [[B.BRICK, B.BRICK, B.CLAY_ROOF], [B.BRICK_DARK, B.BRICK_DARK, B.ROOF_DARK], [B.PLASTER_BEIGE, B.BRICK, B.CLAY_ROOF]],
  kust: [[B.PLASTER, B.PLASTER, B.ROOF_DARK], [B.PAINT_WHITE, B.PLASTER, B.CLAY_ROOF], [B.PLASTER_PINK, B.PLASTER, B.ROOF_RED]],
  berg: [[B.ASHLAR, B.DARK_PLANKS, B.ROOF_DARK], [B.PLASTER, B.PLANKS, B.CLAY_ROOF]],
  tropisch: [[B.PLASTER, B.PLASTER, B.ROOF_GREEN], [B.PLASTER_BEIGE, B.PLANKS, B.ROOF_GREEN], [B.PAINT_WHITE, B.PAINT_WHITE, B.SOLAR]],
  stad: [[B.PLASTER_GREY, B.PLASTER_GREY, B.CONCRETE], [B.BRICK, B.BRICK, B.CONCRETE], [B.YELLOWBRICK, B.YELLOWBRICK, B.CONCRETE], [B.PLASTER_BEIGE, B.PLASTER_BEIGE, B.ROOF_DARK]],
};
function matsFor(b) {
  if (b.kind === 'tower') return b.r < 0.33 ? [B.GLASS_BLUE, B.GLASS_BLUE, B.PANEL_DARK] : b.r < 0.66 ? [B.GLASS, B.GLASS_GREEN, B.PANEL_DARK] : [B.MIRROR, B.MIRROR, B.PANEL_WHITE];
  if (b.kind === 'old') return [[B.HALF_TIMBER, B.HALF_TIMBER, B.CLAY_ROOF], [B.BRICK, B.BRICK, B.ROOF_DARK], [B.LIMESTONE, B.LIMESTONE, B.ROOF_DARK]][Math.floor(b.r2 * 3)];
  if (b.kind === 'warehouse' || b.kind === 'factory') return [B.PANEL_WHITE, B.PANEL_WHITE, B.METAL];
  if (b.kind === 'parliament' || b.kind === 'palace') return [B.MARBLE, B.LIMESTONE, B.COPPER];
  if (b.kind === 'hospital' || b.kind === 'university' || b.kind === 'campus' || b.kind === 'office') return [B.GLASS, B.PANEL_WHITE, B.CONCRETE];
  if (b.kind === 'lighthouse') return [B.PAINT_WHITE, B.PAINT_RED, B.PAINT_RED];
  const set = STYLE_MAT[b.style] || STYLE_MAT.land; return set[Math.floor(b.r2 * set.length) % set.length];
}
function buildingColumn(b, F, x, z, col, top) {
  const [gf, uf, roof] = matsFor(b), inCore = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, wall = !inCore;
  const fh = b.kind === 'tower' || b.kind === 'office' ? 4 : b.kind === 'warehouse' || b.kind === 'factory' ? 6 : 3;
  const wallTop = F + b.floors * fh;
  // fundering tot op de grond; aan de hoge kant de helling weggraven
  for (let y = Math.max(1, Math.min(top, F) - 3); y < F; y++) col[y] = y <= top - 4 ? (col[y] || B.STONE) : B.ASHLAR;
  for (let y = F + 1; y <= top; y++) col[y] = 0;
  col[F] = b.kind === 'tower' || b.landmark ? B.MARBLE : B.PLANKS;
  if (b.kind === 'lighthouse') {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.hypot(x - cx, z - cz);
    if (d > 3.6) return Math.max(F, top);
    for (let y = F + 1; y < wallTop; y++) col[y] = d > 2.6 ? (Math.floor((y - F) / 5) % 2 ? B.PAINT_RED : B.PAINT_WHITE) : (y % 6 === 0 ? B.PLANKS : 0);
    if (d <= 2.6) col[F + 1] = B.LADDER;
    col[wallTop] = B.METAL; col[wallTop + 1] = d < 2 ? B.LAMP : B.GLASS; col[wallTop + 2] = d < 2 ? B.LAMP : B.GLASS; col[wallTop + 3] = B.PAINT_RED;
    return wallTop + 3;
  }
  const face = b.face, mid = Math.round((b.x0 + b.x1) / 2);
  const onFace = (face === 'z0' && z === b.z0) || (face === 'z1' && z === b.z1);
  const door = onFace && Math.abs(x - mid) <= (b.kind === 'tower' || b.landmark ? 2 : 0);
  const along = z === b.z0 || z === b.z1 ? x - b.x0 : z - b.z0;
  // torens: inspringende top
  let top2 = wallTop;
  if (b.kind === 'tower' && b.floors > 25) { const inset = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z); if (inset < 3) top2 = F + Math.floor(b.floors * 0.75) * fh; }
  for (let y = F + 1; y < top2; y++) {
    const lvl = y - F - 1, inLvl = lvl % fh, fl = Math.floor(lvl / fh);
    if (!wall) { if (inLvl === fh - 1 && y + 1 < top2) col[y + 1] = b.kind === 'tower' ? B.CONCRETE : B.PLANKS; continue; }
    if (door && fl === 0 && inLvl < 2) { col[y] = 0; continue; }
    const corner = (x === b.x0 || x === b.x1) && (z === b.z0 || z === b.z1);
    if (b.kind === 'tower') { col[y] = corner || along % 4 === 0 ? B.PANEL_DARK : inLvl === fh - 1 ? B.PANEL_DARK : (fl === 0 ? B.GLASS : gf); continue; }
    if (corner) { col[y] = b.style === 'berg' ? B.LOG : fl === 0 ? gf : uf; continue; }
    const mat = fl === 0 ? gf : uf;
    const win = (b.kind === 'shop' && fl === 0) ? along % 6 !== 0 : along % 3 === 1 && inLvl <= 1;
    col[y] = win ? (b.style === 'tropisch' ? B.GLASS_GREEN : B.GLASS) : mat;
  }
  let t = top2;
  const flat = b.kind === 'tower' || b.kind === 'apartment' || b.kind === 'warehouse' || b.kind === 'factory' || b.kind === 'campus' || b.kind === 'office' || b.kind === 'hospital' || b.kind === 'university' || b.style === 'tropisch' || b.landmark;
  if (flat) {
    col[top2] = roof; t = top2;
    if (b.kind === 'parliament' || b.kind === 'palace') { const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = Math.hypot(x - cx, z - cz); if (r < 14) { const dh = Math.round(Math.sqrt(Math.max(0, 196 - r * r)) * 0.8); for (let y = top2 + 1; y <= top2 + dh; y++) col[y] = B.COPPER; t = top2 + dh; if (r < 1) { col[t + 1] = B.POST; col[t + 2] = B.PAINT_GREEN; t += 2; } } }
    if (b.kind === 'hospital' && Math.abs(x - mid) < 6 && Math.abs(z - (b.z0 + b.z1) / 2) < 6) { col[top2] = B.PAINT_RED; }
  } else {
    const longX = (b.x1 - b.x0) >= (b.z1 - b.z0), dEdge = longX ? Math.min(z - b.z0, b.z1 - z) : Math.min(x - b.x0, b.x1 - x);
    const roofY = top2 + Math.floor(Math.max(0, dEdge) * (b.style === 'berg' ? 0.75 : 0.6));
    const gable = longX ? (x === b.x0 || x === b.x1) : (z === b.z0 || z === b.z1);
    if (gable) for (let y = top2; y < roofY; y++) col[y] = uf;
    col[roofY] = roof; t = roofY;
    if (b.style !== 'tropisch' && hash(x, z, 77) < 0.01 && dEdge > 2) { col[roofY + 1] = B.BRICK; t = roofY + 1; }
  }
  // binnen: trap (ladder) en wat meubels
  if (inCore && x - b.x0 === 2 && z - b.z0 === 2 && b.floors > 1) for (let y = F + 1; y < top2; y++) col[y] = B.LADDER;
  return Math.max(t, top);
}

// straten in de bebouwde kom
function streetColumn(st, u, x, z, col, top) {
  const y = top;
  for (let k = Math.max(1, y - 3); k < y; k++) col[k] = B.GRAVEL;
  for (let k = y + 1; k <= y + 4; k++) col[k] = 0;
  const lane = st.hw - st.d, inner = st.hw - (st.avenue && st.hw > 6 ? 3 : 2.2); // stoep aan beide kanten
  if (st.d < 2.2 || st.d > st.hw - 2.2) {
    col[y] = u.p.kind === 'capital' || u.p.kind === 'city' ? B.SIDEWALK : B.COBBLE;
    if (st.d > st.hw - 1 && ((st.alongX ? x : z) % 24 === 12)) { for (let k = y + 1; k <= y + 4; k++) col[k] = B.POST; col[y + 5] = B.LAMP; return y + 5; }
    return y;
  }
  void lane; void inner;
  const mid = Math.abs(st.d - st.hw / 2);
  col[y] = mid < 0.5 && Math.floor((st.alongX ? x : z) / 4) % 2 === 0 ? B.LINE_WHITE : B.ASPHALT;
  if (st.avenue && st.hw > 6 && mid < 1.6) col[y] = B.METAL; // tramsporen in het midden van de laan
  return y;
}

function fillColumn(x, z, col, slope, ctx, h) {
  treeKind = 0;
  const top = Math.round(G + h);
  col[0] = B.BEDROCK;
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  // spoor en wegen eerst (ook bruggen en viaducten over water); daaronder vult het water aan
  const water = (top <= G - 1) ? G - 1 : -1;
  { const rc = railColumnAll(x, z, col, top, ctx); if (rc >= 0) { if (water > 0) for (let y = Math.max(1, top + 1); y <= water; y++) if (!col[y]) col[y] = B.WATER; return Math.max(rc, water); } }
  { const rd = roadColumn(x, z, col, top); if (rd >= 0) { if (water > 0) for (let y = Math.max(1, top + 1); y <= water; y++) if (!col[y]) col[y] = B.WATER; return Math.max(rd, water); } }
  // zee, rivieren, meren
  if (top <= G - 1) {
    for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.SAND;
    col[top] = h < -6 ? B.GRAVEL : B.SAND;
    // wrak van de SS Viridonia
    if (Math.hypot(x - WRECK.x, z - WRECK.z - 1600) < 60) { const d = Math.abs(x - WRECK.x) < 7 && Math.abs(z - WRECK.z - 1600) < 45; if (d) { const hh = 4 + Math.round(3 * Math.sin((z - WRECK.z) / 9)); for (let y = top + 1; y <= Math.min(G - 2, top + hh); y++) col[y] = (x + y) % 3 ? B.METAL : B.BRICK_DARK; } }
    for (let y = top + 1; y <= G - 1; y++) if (!col[y]) col[y] = B.WATER;
    return G - 1;
  }
  const lk = lakeAt(x, z);
  if (lk && top < lk.level) { for (let y = top + 1; y <= lk.level; y++) col[y] = B.WATER; col[top] = B.SAND; return lk.level; }
  const rv = riverAt(x, z);
  if (rv) { const wl = Math.max(top + 1, top + 2); col[top] = B.GRAVEL; for (let y = top + 1; y <= wl; y++) col[y] = B.WATER; if (ctx.bridgeOver(x, z)) return wl; return wl; }
  // landmarks
  for (const b of bldGrid.at(x, z)) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) { const F = ctx.fitLandmark(b); if (F !== null) return buildingColumn(b, F, x, z, col, top); }
  // luchthaven: banen, taxibanen, terminal
  if (inAirport(x, z)) return airportColumn(x, z, col, top);
  // bebouwde kom
  const u = urbanAt(x, z);
  if (u && u.dens > 0.12) {
    const area = areaAt(x, z);
    if (area && area.kind === 'beach') { /* strand: natuur hieronder */ }
    else {
      const st = streetAt(x, z, u);
      if (st.street) return streetColumn(st, u, x, z, col, top);
      const lot = lotAt(x, z, u, st);
      if (lot.b && x >= lot.b.x0 && x <= lot.b.x1 && z >= lot.b.z0 && z <= lot.b.z1) { const F = fitLot(lot.b, ctx.lots); if (F !== null) return buildingColumn(lot.b, F, x, z, col, top); }
      // tuin of park
      for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
      col[top] = lot.park ? (hash(x, z, 9) < 0.06 ? B.FLOWERS : B.GRASS) : (hash(x, z, 8) < 0.03 ? B.FLOWERS : B.GRASS);
      if (lot.park && treeSpot(x, z, 9, 0.6)) treeKind = 1;
      else if (!lot.b && hash(x, z, 10) < 0.004) treeKind = 1;
      else if (lot.b && treeSpot(x, z, 11, 0.25) && (x < lot.b.x0 - 2 || x > lot.b.x1 + 2 || z < lot.b.z0 - 2 || z > lot.b.z1 + 2)) treeKind = 1;
      return top;
    }
  }
  // natuur
  const m = coastDist(x, z);
  if (h < 2.2 && m < 220) { for (let y = Math.max(1, top - 3); y <= top; y++) col[y] = B.SAND; if (hash(x, z, 31) < 0.004) treeKind = 3; return top; } // strand
  const cliff = cliffAmount(x, z) > 0.3 && slope > 1.2;
  const snow = h > snowLine(x, z) && slope < 1.4, rock = cliff || (!snow && (h > rockLine(x, z) || slope > 1.15)), meadow = !rock && !snow && h > treeLine(x, z);
  if (rock || snow) for (let y = Math.max(1, top - 3); y < top; y++) col[y] = (y % 5 === 0) ? B.GRANITE : B.STONE;
  else for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
  if (snow) { col[top] = B.SNOW; return top; }
  if (rock) { col[top] = noise(x / 7, z / 7, 8) < 0.25 ? B.GRAVEL : B.STONE; return top; }
  col[top] = B.GRASS;
  if (ctx.noTree(x, z) || slope > 1.05) return top;
  if (meadow) { if (hash(x, z, 12) < 0.05) col[top] = B.FLOWERS; if (h < treeLine(x, z) + 60 && treeSpot(x, z, 7, 0.25)) treeKind = 2; return top; }
  // regenwoud: heel dicht, hoge loofbomen
  if (rainforest(x, z)) { if (treeSpot(x, z, 4, 0.95)) treeKind = 8; else if (hash(x, z, 13) < 0.12) treeKind = 3; else if (hash(x, z, 14) < 0.05) col[top] = B.FLOWERS; return top; }
  // landbouw: akkers in stroken (laag en vlak), anders bos of weide
  const farm = h < 260 && slope < 0.35 && noise(x / 1800, z / 1800, 80) > 0.45;
  if (farm) {
    const fx = Math.floor(x / 60), fz = Math.floor(z / 140), crop = hash(fx, fz, 81);
    col[top] = crop < 0.3 ? B.DIRT : crop < 0.55 ? B.GRASS : crop < 0.75 ? B.HEDGE : B.FLOWERS;
    if (crop < 0.3 && x % 3 === 0) col[top] = B.GRASS;
    if (x - fx * 60 === 0 && hash(x, z, 82) < 0.4) { col[top + 1] = B.HEDGE; return top + 1; } // heg tussen de akkers
    return top;
  }
  const forest = noise(x / 2400, z / 2400, 83) > 0.5 || h > 500;
  if (forest) {
    if (treeSpot(x, z, 5, h > 700 ? 0.7 : 0.85)) { const r = hash(x, z, 19); treeKind = h > 600 ? (r < 0.4 ? 6 : 2) : r < 0.25 ? 5 : r < 0.4 ? 2 : 1; }
    else if (hash(x, z, 16) < 0.03) treeKind = 3;
  } else if (treeSpot(x, z, 18, 0.35)) treeKind = 1;
  else if (hash(x, z, 17) < 0.03) col[top] = B.FLOWERS;
  return top;
}
function airportColumn(x, z, col, top) {
  const A = AIRPORT, y = Math.max(top, G + 6);
  under(col, top, y, B.STONE); for (let k = top + 1; k < y; k++) col[k] = B.STONE; for (let k = y + 1; k <= y + 30; k++) col[k] = 0;
  const lz = z - A.z0, lx = x - A.x0, D = A.z1 - A.z0;
  // twee start- en landingsbanen, taxibaan, terminal in het midden
  for (const rz of [D * 0.2, D * 0.8]) if (Math.abs(lz - rz) < 30 && lx > 200 && lx < A.x1 - A.x0 - 200) { const c = Math.abs(lz - rz); col[y] = c < 0.6 && Math.floor(lx / 30) % 2 === 0 ? B.LINE_WHITE : c > 28 ? B.LINE_WHITE : B.ASPHALT; return y; }
  for (const rz of [D * 0.32, D * 0.68]) if (Math.abs(lz - rz) < 12) { col[y] = Math.abs(lz - rz) < 0.5 ? B.LINE_YELLOW : B.ASPHALT; return y; }
  const tx0 = (A.x1 - A.x0) / 2 - 600, tx1 = tx0 + 1200;
  if (lx > tx0 && lx < tx1 && Math.abs(lz - D / 2) < 70) {
    const edge = Math.abs(lz - D / 2) > 68 || lx < tx0 + 2 || lx > tx1 - 2, roof = y + 18;
    col[y] = B.MARBLE;
    if (edge) for (let k = y + 1; k < roof; k++) col[k] = (k - y) % 6 === 0 ? B.PANEL_DARK : B.GLASS_BLUE;
    else if ((Math.floor(lx) % 30 === 15) && Math.abs(lz - D / 2) < 40) col[y + 1] = B.METAL; // bagageband / balies
    col[roof] = B.PANEL_WHITE; if (Math.abs(lz - D / 2) < 1 && Math.floor(lx) % 60 === 0) { col[roof + 1] = B.PAINT_GREEN; return roof + 1; }
    return roof;
  }
  col[y] = (Math.floor(lx / 4) + Math.floor(lz / 4)) % 2 ? B.CONCRETE : B.ASPHALT;
  return y;
}

// ---------- bomen ----------
function placeSpruce(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.LOG, true);
  const cs = gy + 3 + (th > 12 ? 1 : 0);
  for (let y = cs; y <= gy + th + 1; y++) { const f = (gy + th + 1 - y) / (gy + th + 1 - cs), r = Math.max(0, Math.round(f * (th > 12 ? 3.4 : 2.6) * (((y - cs) % 2) ? 0.75 : 1))); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dz * dz > r * r + 0.6 || (dx === 0 && dz === 0 && y <= gy + th)) continue; set(x + dx, y, z + dz, B.SPRUCE, false); } }
  set(x, gy + th + 1, z, B.SPRUCE, false); set(x, gy + th + 2, z, B.SPRUCE, false);
}
function placeBirch(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.BIRCH_LOG, true);
  for (let y = gy + th - 3; y <= gy + th + 1; y++) { const r = y >= gy + th ? 1 : 2; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dz * dz > r * r + 0.5 || (dx === 0 && dz === 0 && y <= gy + th)) continue; set(x + dx, y, z + dz, B.BIRCH_LEAVES, false); } }
}
function placePine(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.LOG, true);
  for (let y = gy + th - 2; y <= gy + th + 1; y++) { const r = y === gy + th + 1 ? 1 : y === gy + th - 2 ? 2 : 3; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dz * dz > r * r || (dx === 0 && dz === 0 && y <= gy + th)) continue; set(x + dx, y, z + dz, B.PINE_LEAVES, false); } }
}
// regenwoudreus: hoge stam, brede platte kruin in lagen
function placeJungle(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.LOG, true);
  for (const [dy, r] of [[-4, 2], [-1, 4], [1, 3], [2, 1]]) { const y = gy + th + dy; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dz * dz > r * r + 0.8 || (dx === 0 && dz === 0 && y <= gy + th)) continue; set(x + dx, y, z + dz, B.LEAVES, false); } }
}

// ---------- tegel maken ----------
const spare = new Uint8Array(3200);
export function generateTile(tx, tz) {
  const X0 = tx * T, Z0 = tz * T, P = 4, N = T + 2 * P + 1;
  const hgt = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hgt[z * N + x] = natural(X0 + x - P, Z0 + z - P);
  const lines = LINES.filter(L => { for (let i = 0; i < L.n; i += 6) if (L.x[i] > X0 - 60 && L.x[i] < X0 + T + 60 && L.z[i] > Z0 - 60 && L.z[i] < Z0 + T + 60) return true; return false; });
  const lmFit = new Map();
  const ctx = {
    lines, lots: new Map(),
    bridgeOver: () => false,
    fitLandmark: (b) => { let f = lmFit.get(b.id); if (f === undefined) { let lo = 1e9, hi = -1e9; for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) { const hh = G + natural(x, z); lo = Math.min(lo, hh); hi = Math.max(hi, hh); } f = Math.round(Math.max(lo, Math.min(hi, G + natural((b.x0 + b.x1) / 2, b.z1 + 3)))); lmFit.set(b.id, f); } return f; },
    noTree: (x, z) => { if (roadNear(x, z, 12)) return true; for (const L of lines) if (L.near(x, z, 12)) return true; return false; },
  };
  const cols = new Array(T * T);
  const col = new Uint8Array(3200);
  const trees = [];
  let lo = 1e9, hi = 0;
  for (let z = -P; z < T + P; z++) for (let x = -P; x < T + P; x++) {
    const gx = X0 + x, gz = Z0 + z;
    if (gx < 0 || gz < 0 || gx >= MW || gz >= ML) continue;
    const inside = x >= 0 && z >= 0 && x < T && z < T, i0 = (z + P) * N + (x + P);
    const slope = Math.max(Math.abs(hgt[i0 + 1] - hgt[i0]), Math.abs(hgt[i0 + N] - hgt[i0]), Math.abs(hgt[i0 - 1] - hgt[i0]), Math.abs(hgt[i0 - N] - hgt[i0]));
    if (!inside) { spare.fill(0); const tp = fillColumn(gx, gz, spare, slope, ctx, hgt[i0]); if (treeKind === 1 || treeKind === 2 || treeKind === 5 || treeKind === 6 || treeKind === 8) trees.push(x, z, tp, treeKind); continue; }
    col.fill(0);
    const top = fillColumn(gx, gz, col, slope, ctx, hgt[i0]);
    cols[z * T + x] = col.slice(0, top + 1);
    let ground = Math.round(G + Math.min(hgt[i0], hgt[i0 + 1], hgt[i0 - 1], hgt[i0 + N], hgt[i0 - N]));
    for (let y = 1; y < Math.min(ground, top); y++) if (col[y] === 0 || col[y] === B.WATER) { ground = y; break; }
    if (ground < lo) lo = ground;
    if (top > hi) hi = top;
    if (treeKind) trees.push(x, z, top, treeKind);
  }
  const Y0 = Math.max(0, lo - 24);
  const H = Math.min(META.maxH - Y0, Math.ceil((hi + 30 - Y0) / 8) * 8);
  const edge = new Int16Array(4 * T);
  for (let i = 0; i < T; i++) { edge[i] = Math.round(G + natural(X0 - 1, Z0 + i)); edge[T + i] = Math.round(G + natural(X0 + T, Z0 + i)); edge[2 * T + i] = Math.round(G + natural(X0 + i, Z0 - 1)); edge[3 * T + i] = Math.round(G + natural(X0 + i, Z0 + T)); }
  const vox = new Uint8Array(T * T * H);
  for (let i = 0; i < T * T; i++) if (cols[i]) { const c = cols[i]; vox.set(c.subarray(Y0, Math.min(c.length, Y0 + H)), i * H); }
  const set = (x, y, z, b, force) => { y -= Y0; if (x < 0 || z < 0 || x >= T || z >= T || y < 0 || y >= H) return; const i = (z * T + x) * H + y; if (!vox[i] || force) vox[i] = b; };
  for (let i = 0; i < trees.length; i += 4) {
    const x = trees[i], z = trees[i + 1], gy = trees[i + 2], k = trees[i + 3], r = hash(x + X0, z + Z0, 44);
    if (k === 1) placeTree(x, z, gy, 5 + Math.floor(r * 4), null, set);
    else if (k === 2) placeSpruce(x, z, gy, 8 + Math.floor(r * 9), set);
    else if (k === 3) { set(x, gy + 1, z, B.LEAVES); if (r < 0.4) set(x + 1, gy + 1, z, B.LEAVES); }
    else if (k === 5) placeBirch(x, z, gy, 6 + Math.floor(r * 4), set);
    else if (k === 6) placePine(x, z, gy, 11 + Math.floor(r * 6), set);
    else if (k === 8) placeJungle(x, z, gy, 14 + Math.floor(r * 10), set);
  }
  return { vox, H, y0: Y0, edge, ground: G, paths: tilePaths(X0, Z0, lines), tunnels: tileTunnels(X0, Z0, lines) };
}

// ---------- paden: sporen (getekend), wegen (auto's, bussen), stoepen, scheepvaart, luchthaven ----------
function tilePaths(X0, Z0, lines) {
  const out = [];
  const clipPush = (type, pts) => {
    let run = [];
    const flush = () => { if (run.length >= 6) out.push({ type, pts: new Float32Array(run) }); run = []; };
    for (const [x, z, y] of pts) { const lx = x - X0, lz = z - Z0; if (lx < -4 || lz < -4 || lx > T + 4 || lz > T + 4) { flush(); continue; } run.push(lx, lz, y); }
    flush();
  };
  for (const L of lines) {
    let i0 = -1, i1 = -1;
    for (let i = 0; i < L.n; i++) if (L.x[i] > X0 - 8 && L.x[i] < X0 + T + 8 && L.z[i] > Z0 - 8 && L.z[i] < Z0 + T + 8) { if (i0 < 0) i0 = i; i1 = i; }
    if (i0 < 0) continue;
    const s0 = Math.max(0, L.s[i0] - 8), s1 = Math.min(L.len, L.s[i1] + 8);
    for (const side of [1, -1]) {
      const pts = [], p = {};
      for (let s = s0; s <= s1 + 0.01; s += 4) { L.at(Math.min(s, s1), p); const off = trackOffset(L, s) * side, px = p.x - p.tz * off, pz = p.z + p.tx * off, q = L.near(Math.floor(px), Math.floor(pz), 40); pts.push([px, pz, Math.round(q ? q.y : p.y)]); }
      clipPush('train', pts);
    }
  }
  // nationale wegen: rechts rijden; snelwegen en N-wegen = hoofdwegen (bussen)
  const seen = new Set();
  for (let z = Z0 - 8; z <= Z0 + T + 8; z += 32) for (let x = X0 - 8; x <= X0 + T + 8; x += 32) for (const { R } of roadGrid.at(x, z)) {
    if (seen.has(R.id)) continue; seen.add(R.id);
    const t = R.kind === 'L' ? 'car' : 'carM', lanes = R.kind === 'A' ? [2, 5.5] : [1.8];
    for (const off of lanes) for (const side of [1, -1]) {
      const pts = [];
      for (let k = 0; k < R.n; k += 2) { if (R.x[k] < X0 - 20 || R.x[k] > X0 + T + 20 || R.z[k] < Z0 - 20 || R.z[k] > Z0 + T + 20) { pts.push([1e9, 1e9, 0]); continue; } const k2 = Math.min(R.n - 1, k + 1), vx = R.x[k2] - R.x[Math.max(0, k - 1)], vz = R.z[k2] - R.z[Math.max(0, k - 1)], l = Math.hypot(vx, vz) || 1; pts.push([R.x[k] - vz / l * off * side, R.z[k] + vx / l * off * side, Math.round(R.y[k]) - 1]); }
      clipPush(t, side > 0 ? pts : pts.reverse());
    }
  }
  // straten in de bebouwde kom: één baan per richting langs de rasterlijnen in deze tegel
  for (const p of placeGrid.at(X0 + T / 2, Z0 + T / 2)) {
    if (Math.hypot(X0 + T / 2 - p.x, Z0 + T / 2 - p.z) > p.r + 100) continue;
    const g = gridFor(p);
    for (let gx = Math.ceil((X0 - g.ox) / g.B); g.ox + gx * g.B < X0 + T; gx++) { const x = g.ox + gx * g.B + 2.5, pts = []; for (let z = Z0 - 4; z <= Z0 + T + 4; z += 8) { const u = urbanAt(x, z); pts.push(u && u.dens > 0.12 ? [x, z, Math.round(G + natural(x, z))] : [1e9, 1e9, 0]); } clipPush('car', pts); clipPush('walk', pts.map(q => [q[0] - 1.6, q[1], q[2]])); }
    for (let gz = Math.ceil((Z0 - g.oz) / g.B); g.oz + gz * g.B < Z0 + T; gz++) { const z = g.oz + gz * g.B + 2.5, pts = []; for (let x = X0 - 4; x <= X0 + T + 4; x += 8) { const u = urbanAt(x, z); pts.push(u && u.dens > 0.12 ? [x, z, Math.round(G + natural(x, z))] : [1e9, 1e9, 0]); } clipPush('car', pts); clipPush('walk', pts.map(q => [q[0], q[1] - 1.6, q[2]])); }
    // bushalte en tramhalte in het centrum
    if (p.x >= X0 && p.x < X0 + T && p.z >= Z0 && p.z < Z0 + T) out.push({ type: 'busstop', name: p.name, pts: new Float32Array([p.x - X0 + 6, p.z - Z0 + 6, groundAt(p.x + 6, p.z + 6)]) });
  }
  // scheepvaart: veerboten en cruiseschepen langs de kust (ruim buiten de kustlijn)
  for (const R of SEA_ROUTES) {
    // de route ligt om de ~400 m: binnen deze tegel om de 8 m bijvullen
    const pts = [];
    for (let i = 0; i < R.length; i++) {
      const [ax, az] = R[i], [bx, bz] = R[(i + 1) % R.length];
      if (Math.max(ax, bx) < X0 - 10 || Math.min(ax, bx) > X0 + T + 10 || Math.max(az, bz) < Z0 - 10 || Math.min(az, bz) > Z0 + T + 10) { pts.push([1e9, 1e9, 0]); continue; }
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, G - 1]);
    }
    clipPush('sea', pts);
  }
  // luchthaven: banen en gates
  const A = AIRPORT;
  if (A.x1 >= X0 && A.x0 <= X0 + T && A.z1 >= Z0 && A.z0 <= Z0 + T) {
    const D = A.z1 - A.z0, y = G + 6;
    for (const rz of [D * 0.2, D * 0.8]) out.push({ type: 'runway', pts: new Float32Array([A.x0 + 260 - X0, A.z0 + rz - Z0, y, A.x1 - 260 - X0, A.z0 + rz - Z0, y]) });
    const tx0 = (A.x1 - A.x0) / 2 - 600;
    for (let gi = 0; gi < 12; gi++) for (const side of [1, -1]) { const gx = A.x0 + tx0 + 50 + gi * 100, gz = A.z0 + D / 2 + side * 110; if (gx >= X0 && gx < X0 + T && gz >= Z0 && gz < Z0 + T) out.push({ type: 'gate', pts: new Float32Array([gx - X0, gz - Z0, y, side > 0 ? Math.PI : 0]) }); }
  }
  return out;
}
// zeeroutes (voorstel): rond het eiland op 1,6 en 3,2 km van de kust (berekend door tools/plan-green.mjs)
function tileTunnels(X0, Z0, lines) {
  const out = [];
  for (const L of lines) for (const [a, b] of L.tunnels) {
    const p = {}, q = {};
    for (let s = Math.max(a, 0); s < b; s += 16) {
      L.at(s, p); L.at(Math.min(b, s + 16), q);
      if (Math.max(p.x, q.x) < X0 - 8 || Math.min(p.x, q.x) > X0 + T + 8 || Math.max(p.z, q.z) < Z0 - 8 || Math.min(p.z, q.z) > Z0 + T + 8) continue;
      out.push({ type: L.single ? 'tube' : 'tube2', ax: p.x, az: p.z, ay: Math.round(p.y), bx: q.x, bz: q.z, by: Math.round(q.y), key: `${L.id}:${Math.round(s)}` });
    }
  }
  return out;
}

// ---------- plaatsen, zones, kaart ----------
export const PLACES = [
  ...ALL_PLACES.filter(p => p.named).map(p => [`${p.name}${p.kind === 'capital' ? ' (hoofdstad)' : ''}`, Math.round(p.x), Math.round(p.z)]),
  ...AREAS.map(a => [a.name, Math.round(a.x), Math.round(a.z)]),
  ...LANDMARKS.map(l => { const p = PLACE[l.town]; return [l.name, Math.round(p.x + l.dx), Math.round(p.z + l.dz + l.d / 2 + 12)]; }),
  ['Munkbay International Airport (GreenAir)', AIRPORT.cx, AIRPORT.cz],
  ...PEAKS.map(p => [`${p.name} (${p.h} m)`, p.x, p.z]),
  [WRECK.name, WRECK.x, WRECK.z + 1600],
];
export const SPAWN = (() => { const st = STATIONS_ALL.find(s => s.name === 'Munkbay Central'), L = LINE[st.lines[0]], q = L.at(st.stops[0].s); return { x: q.x + 10, y: Math.round(st.y) + 2.1, z: q.z - 40 }; })();
export function zoneName(x, z) {
  if (x < 0 || z < 0 || x >= MW || z >= ML) return 'Buiten de wereld';
  const m = coastDist(x, z);
  if (m < 0) return Math.hypot(x - WRECK.x, z - WRECK.z - 1600) < 300 ? WRECK.name : 'Noordzee';
  const pv = PROVINCES.find(p => p.id === provinceAt(x, z)).name;
  for (const L of LINES) { const q = L.near(x, z, 12); if (q) { const st = L.stationAt(q.s); if (st) return `Station ${st.name} · ${L.name}`; return `${L.name}${q.kind === 1 ? ' · tunnel' : q.kind === 2 ? ' · viaduct' : ''} · ${pv}`; } }
  if (inAirport(x, z)) return AIRPORT.name;
  for (const b of bldGrid.at(x, z)) if (x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2) return b.name;
  const a = areaAt(x, z); if (a) return `${a.name} · Munkbay`;
  const u = urbanAt(x, z); if (u) return `${u.p.name} (${u.p.postcode}) · ${pv}`;
  const rq = roadNear(x, z, 8); if (rq) return `${rq.R.kind}-weg ${rq.R.a} – ${rq.R.b} · ${pv}`;
  const h = natural(x, z);
  const nat = h < 2.5 && m < 220 ? 'Strand' : rainforest(x, z) ? 'Regenwoud' : h > snowLine(x, z) ? 'Sneeuw' : h > rockLine(x, z) ? 'Rotsen' : h > treeLine(x, z) ? 'Bergweide' : h > 500 ? 'Viridonia Gebergte' : 'Platteland';
  return `${nat} · ${Math.round(h)} m · ${pv}`;
}
export function overviewColor(x, z, s = 100) {
  const h = natural(x, z), hx = natural(x + s, z), hz = natural(x, z + s), m = coastDist(x, z);
  const slope = Math.hypot(hx - h, hz - h) / s;
  let c;
  if (h < -0.5) c = h < -12 ? [28, 72, 140] : [46, 104, 168];
  else if (lakeAt(x, z) && lakeAt(x, z).d < 1) c = [52, 104, 170];
  else if (h < 2.5 && m < 220) c = [224, 210, 162];
  else if (h > snowLine(x, z) && slope < 1.4) c = [236, 240, 246];
  else if (h > rockLine(x, z) || slope > 1.1) c = [128, 124, 118];
  else if (h > treeLine(x, z)) c = [122, 160, 78];
  else if (rainforest(x, z)) c = [24, 92, 40];
  else { const u = urbanAt(x, z); if (u && u.dens > 0.12) { const v = 150 + 60 * (1 - u.dens); c = [v, v * 0.97, v * 0.92]; } else c = h > 500 ? [38, 82, 46] : [72, 128, 60]; }
  const shade = Math.max(0.5, Math.min(1.35, 1 + ((h - hx) + (h - hz)) / s * 0.8));
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}
export function farColor(x, z, h, slope, out) {
  const m = h < 3 ? coastDist(x, z) : 1e9;
  let c;
  if (h < -0.5 || m < 0) c = m < -3000 ? [36, 86, 150] : [46, 104, 168];
  else if (h < 2.5 && m < 220) c = [224, 210, 162];
  else if (h > snowLine(x, z) && slope < 1.4) c = [236, 240, 246];
  else if (h > rockLine(x, z) || slope > 1.1) c = [128, 124, 118];
  else if (h > treeLine(x, z)) c = [122, 160, 78];
  else if (rainforest(x, z)) c = [24, 92, 40];
  else { const u = urbanAt(x, z); if (u && u.dens > 0.12) { const v = 140 + 50 * (1 - u.dens); c = [v, v * 0.97, v * 0.93]; } else c = h > 500 ? [38, 82, 46] : [72, 128, 60]; }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out;
}
export { COUNTRY, PROVINCES, AREAS, PLACE, CENTRAL, LAKE_DEF as LAKES, PEAKS, WRECK };

// voor de controles (tools/check-green.mjs): één kolom zoals in de tegel
export function _columnAt(x, z, cache = new Map()) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T), X0 = tx * T, Z0 = tz * T;
  const lines = LINES.filter(L => { for (let i = 0; i < L.n; i += 6) if (L.x[i] > X0 - 60 && L.x[i] < X0 + T + 60 && L.z[i] > Z0 - 60 && L.z[i] < Z0 + T + 60) return true; return false; });
  const ctx = { lines, lots: cache, bridgeOver: () => false, fitLandmark: () => null, noTree: () => true };
  const col = new Uint8Array(3200), h = natural(x, z), sl = Math.max(Math.abs(natural(x + 1, z) - h), Math.abs(natural(x, z + 1) - h));
  const top = fillColumn(x, z, col, sl, ctx, h);
  return { col, top };
}
