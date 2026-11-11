// GREENISLAND – een fictief eilandland in de Noordzee (145 × 50 km, 1 blok = 1 m).
// Alle tegels komen uit dezelfde centrale gegevens: greenisland-data.js (canon en voorstellen), de plaatsen,
// de wegen en spoorlijnen (greenisland-routes.js / green-net.js). Zo sluiten wegen, sporen, stations en gebouwen
// over tegelgrenzen heen altijd op elkaar aan. Vanaf het begin met de oplossingen uit de andere werelden:
// gebouwen op hun eigen hoogte met fundering, rails op de ballast, geen trappen in wegen, tunnels en viaducten.
import { B } from './blocks.js';
import { hash, noise, placeTree } from './city.js';
import { EXTRA_ROADS } from './greenisland-data.js';
import { W as MW, L as ML, G, COUNTRY, PROVINCES, provinceAt, MUNKBAY_AREAS, LANDMARKS, WRECK, RAINFOREST, PEAKS, LAKES as LAKE_DEF, CENTRAL } from './greenisland-data.js';
import { rawHeight, coastDist, lakeAt, riverAt, fbm, sstep, cliffAmount } from './greenisland-terrain.js';
import { ALL_PLACES, PLACE } from './greenisland-places.js';
import { ROADS as ROAD_ROUTES, SEA as SEA_ROUTES } from './greenisland-routes.js';
import { LINES, LINE, STATIONS_ALL, TRACK, BED, trackOffset } from './green-net.js';
import { RLine } from './rline.js';
import { FAMILIES, familyMix, chooseFamily, archColumn } from './greenisland-arch.js';
import { buildLifts, liftColumn, liftUV } from './lifts.js';
import { CITY_BUS } from './greenisland-buses.js';

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

// ---------- gedeelde infrastructuur: wegen houden rekening met het spoor ----------
// (1) een weg die evenwijdig over of vlak naast het spoorbed loopt, wordt opzij gelegd;
// (2) een weg die in een station eindigt, stopt aan de rand ervan (stationsplein);
// (3) elke kruising krijgt een type: 'overweg', 'brug' (weg over het spoor), 'onder' (weg onder een viaduct) of 'tunnel' (spoor diep eronder).
const RAILS = LINES.filter(L => !L.metro && !L.tram);
const HIGH_SPEED = new Set(['ICEF', 'ICEA', 'AX1']);
// grof raster: welke spoorlijnen liggen binnen ~80 m van een punt (snelle voortest)
const RAIL_NEAR = new Map();
for (const L of RAILS) for (let i = 0; i < L.n; i += 8) { const cx = Math.floor(L.x[i] / 128), cz = Math.floor(L.z[i] / 128); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const k = (cz + dz) * 4096 + cx + dx; let l = RAIL_NEAR.get(k); if (!l) RAIL_NEAR.set(k, l = []); if (!l.includes(L)) l.push(L); } }
const railsNear = (x, z) => RAIL_NEAR.get(Math.floor(z / 128) * 4096 + Math.floor(x / 128)) || EMPTY;
function fitToRail(xs, zs, hw) {
  const n = xs.length;
  // eindpunten in een station of op het spoorbed: wegnemen tot buiten de spoorzone
  const inRail = (k) => railsNear(xs[k], zs[k]).some(L => { const q = L.near(xs[k], zs[k], BED + hw + 40); return q && q.kind !== 1 && (q.d < BED + hw + 4 || (L.stationAt(q.s) && q.d < BED + hw + 36)); });
  let a = 0, b = n - 1; while (a < n - 8 && inRail(a)) a++; while (b > a + 8 && inRail(b)) b--;
  if (a > 0 || b < n - 1) {
    const X = xs.slice(a, b + 1), Z = zs.slice(a, b + 1);
    // het afgeknipte einde sluit aan op het stationsplein aan deze kant van het spoor (daar komen de wegen samen)
    const join = (cut, px, pz) => { if (!cut) return null; const sq = stationSquare(px, pz, xs[cut.from], zs[cut.from]); return sq; };
    const sA = a > 0 ? join({ from: 0 }, X[0], Z[0]) : null, sB = b < n - 1 ? join({ from: n - 1 }, X[X.length - 1], Z[Z.length - 1]) : null;
    xs.length = 0; zs.length = 0;
    const seg = (x0, z0, x1, z1) => { const m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8)); for (let q = 0; q < m; q++) { xs.push(x0 + (x1 - x0) * q / m); zs.push(z0 + (z1 - z0) * q / m); } };
    if (sA) seg(sA[0], sA[1], X[0], Z[0]);
    xs.push(...X); zs.push(...Z);
    if (sB) { const x0 = xs.pop(), z0 = zs.pop(); seg(x0, z0, sB[0], sB[1]); xs.push(sB[0]); zs.push(sB[1]); }
  }
  for (let it = 0; it < 3; it++) {
    const m = xs.length, ox = new Float32Array(m), oz = new Float32Array(m);
    for (let k = 0; k < m; k++) {
      const k0 = Math.max(0, k - 2), k1 = Math.min(m - 1, k + 2), rx = xs[k1] - xs[k0], rz = zs[k1] - zs[k0], rl = Math.hypot(rx, rz) || 1;
      for (const L of railsNear(xs[k], zs[k])) {
        const reach = BED + hw + 12, q = L.near(xs[k], zs[k], reach); if (!q || q.kind === 1) continue;
        const p = L.at(q.s), cos = Math.abs((rx * p.tx + rz * p.tz) / rl);
        if (cos < 0.82) continue; // echte kruising: blijft
        const side = q.sd >= 0 ? 1 : -1, need = reach - q.d;
        ox[k] += -p.tz * side * need; oz[k] += p.tx * side * need;
      }
    }
    // verschuiving vloeiend maken (geen knikken)
    const W = 14, sx = new Float32Array(m), sz = new Float32Array(m);
    for (let k = 0; k < m; k++) { let ax = 0, az = 0, wsum = 0; for (let j = Math.max(0, k - W); j <= Math.min(m - 1, k + W); j++) { const w = W + 1 - Math.abs(j - k); ax += ox[j] * w; az += oz[j] * w; wsum += w; } sx[k] = ax / wsum; sz[k] = az / wsum; }
    for (let k = 0; k < m; k++) { const big = Math.hypot(ox[k], oz[k]) > Math.hypot(sx[k], sz[k]) ? 1 : 0; xs[k] += big ? ox[k] * 0.6 + sx[k] * 0.4 : sx[k]; zs[k] += big ? oz[k] * 0.6 + sz[k] * 0.4 : sz[k]; }
  }
}
// stationsplein: vanaf het oude eindpunt (in de spoorzone) recht van het spoor weg, aan de kant waar de weg vandaan komt,
// tot buiten elke spoorzone; alle wegen van die kant komen op hetzelfde punt uit (afgerond op 20 m)
const SQUARES = new Map();
function stationSquare(px, pz, ex, ez) {
  let best = null, bd = 1e9; for (const L of RAILS) { const q = L.near(ex, ez, 200); if (q && q.d < bd) { bd = q.d; best = { L, q }; } }
  if (!best) return null;
  const p = best.L.at(best.q.s), nx = -p.tz, nz = p.tx, side = ((px - p.x) * nx + (pz - p.z) * nz) >= 0 ? 1 : -1;
  const key = best.L.id + ':' + Math.round(best.q.s / 200) + ':' + side; if (SQUARES.has(key)) return SQUARES.get(key);
  let d = BED + 30; const clear = (x, z) => !RAILS.some(L => { const q = L.near(x, z, BED + 30); return q && q.kind !== 1 && q.d < BED + 26; });
  while (d < 400 && !clear(p.x + nx * d * side, p.z + nz * d * side)) d += 10;
  const sq = [Math.round((p.x + nx * d * side) / 4) * 4, Math.round((p.z + nz * d * side) / 4) * 4];
  SQUARES.set(key, sq); return sq;
}
function railCrossings(xs, zs, s, y, kind, hw) {
  const out = [];
  for (let k = 1; k < xs.length - 1; k++) for (const L of railsNear(xs[k], zs[k])) {
    const q = L.near(xs[k], zs[k], BED + 1); if (!q) continue;
    if (out.some(c => c.L === L && Math.abs(c.s - s[k]) < 60)) continue;
    const p = L.at(q.s), rx = xs[k + 1] - xs[k - 1], rz = zs[k + 1] - zs[k - 1], rl = Math.hypot(rx, rz) || 1, sin = Math.abs((rx * p.tz - rz * p.tx) / rl);
    const half = (BED + hw + 3) / Math.max(0.35, sin); // lengte van de weg boven het spoorbed (schuine kruising = langer)
    let type, cy;
    if (q.kind === 1) { type = 'tunnel'; cy = q.y + 12; if (y[k] > cy) continue; type = 'brug'; }
    else if (q.kind === 2 && q.y - y[k] >= 2) { type = 'onder'; cy = q.y - 9; }
    else if (kind === 'L' && !HIGH_SPEED.has(L.id) && !L.stationAt(q.s) && q.kind === 0 && Math.abs(q.y + 1 - y[k]) < 5 && sin > 0.55) { type = 'overweg'; cy = q.y + 1; }
    else { type = 'brug'; cy = q.y + 11; }
    out.push({ type, s: s[k], half, y: cy, L, rs: q.s, x: xs[k], z: zs[k], railY: q.y, ux: rx / rl, uz: rz / rl });
  }
  // kruisingen vlak na elkaar (een bundel sporen, zoals bij Munkbay Central): één ontwerp voor de hele bundel
  out.sort((a, b) => a.s - b.s);
  for (let i = 0; i < out.length;) {
    let j = i; while (j + 1 < out.length && out[j + 1].s - out[j].s < out[j].half + out[j + 1].half + 60) j++;
    if (j > i) {
      const grp = out.slice(i, j + 1), types = new Set(grp.map(c => c.type));
      if (types.size > 1 || types.has('brug')) { const top = Math.max(...grp.map(c => c.railY)); for (const c of grp) { c.type = 'brug'; c.y = top + 11; } }
      if (types.size === 1 && types.has('onder')) { const lo = Math.min(...grp.map(c => c.railY)); for (const c of grp) c.y = lo - 9; }
    }
    i = j + 1;
  }
  return out;
}

// ---------- wegen (nationaal net) met een vloeiend hoogteprofiel ----------
const ROAD_HW = { A: 8, N: 4.2, L: 3.2 };
// extra wegen (zoals de A1-doorsteek) sluiten aan beide uiteinden aan op de dichtstbijzijnde snelweg of N-weg
const EXTRA_JOINED = EXTRA_ROADS.map(r => {
  const pts = r.pts.map(p => [...p]);
  for (const end of [0, pts.length - 1]) {
    let best = null, bd = 1e18;
    for (const R of ROAD_ROUTES) for (const q of R.pts) { const d = ((q[0] - pts[end][0]) ** 2 + (q[1] - pts[end][1]) ** 2) * (R.kind === 'L' ? 4 : 1); if (d < bd) { bd = d; best = q; } }
    if (best && Math.sqrt(bd) < 6000) { if (end === 0) pts.unshift([best[0], best[1]]); else pts.push([best[0], best[1]]); }
  }
  return { ...r, pts };
});
export const ROADS = [...ROAD_ROUTES, ...EXTRA_JOINED].map((r, i) => {
  const pts = r.pts, xs = [], zs = [];
  for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8)); for (let q = 0; q < n; q++) { xs.push(ax + (bx - ax) * q / n); zs.push(az + (bz - az) * q / n); } }
  xs.push(pts[pts.length - 1][0]); zs.push(pts[pts.length - 1][1]);
  fitToRail(xs, zs, ROAD_HW[r.kind]);
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
  // kruisingen met het spoor: overweg (lokale weg, regionale lijn op dezelfde hoogte), brug over het spoor of onder een viaduct door
  const xings = railCrossings(xs, zs, s, y, r.kind, ROAD_HW[r.kind]);
  for (const c of xings) {
    for (let k = 0; k < n; k++) {
      const d = Math.max(0, Math.abs(s[k] - c.s) - c.half);
      if (c.type === 'overweg') { const lo = c.y - grade * d, hi = c.y + grade * d; y[k] = Math.max(lo, Math.min(hi, y[k])); }
      else if (c.type === 'brug') y[k] = Math.max(y[k], c.y - grade * d);
      else if (c.type === 'onder') y[k] = Math.min(y[k], c.y + grade * d);
    }
  }
  // verhoogde snelweg in de stad (op pijlers boven straten en sporen), met opritten van hooguit 4 %
  if (r.elevated) {
    for (let k = 0; k < n; k++) if (xs[k] > r.cityX[0] && xs[k] < r.cityX[1]) y[k] = Math.max(y[k], g[k] + r.elevated);
    for (let k = n - 2; k >= 0; k--) y[k] = Math.max(y[k], y[k + 1] - grade * (s[k + 1] - s[k]));
    for (let k = 1; k < n; k++) y[k] = Math.max(y[k], y[k - 1] - grade * (s[k] - s[k - 1]));
  }
  // fietspaden: N-wegen aan beide kanten (één richting per kant), andere wegen één tweerichtingsfietspad rechts; niet op een brug
  const bike = r.elevated ? 'none' : r.kind === 'N' ? 'both' : 'one';
  const R = { id: i, a: r.a, b: r.b, kind: r.kind, name: r.name, hw: ROAD_HW[r.kind], bike, n, x: Float32Array.from(xs), z: Float32Array.from(zs), y, s, g, xings };
  for (const c of xings) c.R = R;
  return R;
});
// samenloop en kruising van twee wegen: de kleinere weg neemt daar de hoogte van de grotere over (geleidelijk, max. 6 %);
// ligt de ene weg al 7 m of meer boven de andere, dan is het een ongelijkvloerse kruising en verandert er niets
{
  const RANK = { A: 3, N: 2, L: 1 }, order = [...ROADS].sort((a, b) => RANK[b.kind] - RANK[a.kind]);
  const g0 = new Grid(64); for (const R of order) for (let k = 0; k < R.n - 1; k += 1) g0.add({ R, k }, Math.min(R.x[k], R.x[k + 1]) - 12, Math.min(R.z[k], R.z[k + 1]) - 12, Math.max(R.x[k], R.x[k + 1]) + 12, Math.max(R.z[k], R.z[k + 1]) + 12);
  const done = new Set();
  for (const R2 of order) {
    const delta = new Float32Array(R2.n), has = new Uint8Array(R2.n);
    for (let k = 0; k < R2.n; k++) {
      let best = null;
      for (const { R, k: j } of g0.at(R2.x[k], R2.z[k])) {
        if (R === R2 || !done.has(R)) continue;
        const d = Math.hypot(R.x[j] - R2.x[k], R.z[j] - R2.z[k]); if (d > R.hw + R2.hw + 2) continue;
        if (!best || d < best.d) best = { d, y: R.y[j] };
      }
      if (best && Math.abs(best.y - R2.y[k]) < 7) { delta[k] = best.y - R2.y[k]; has[k] = 1; }
    }
    if (has.some(Boolean)) {
      const grade = R2.kind === 'A' ? 0.04 : 0.06, out = new Float32Array(R2.n);
      // uitlopen met hooguit de toegestane helling (heen en terug, apart voor omhoog en omlaag)
      const pos = new Float32Array(R2.n), neg = new Float32Array(R2.n);
      for (let k = 0; k < R2.n; k++) if (has[k]) { pos[k] = Math.max(0, delta[k]); neg[k] = Math.max(0, -delta[k]); }
      for (let k = 1; k < R2.n; k++) { const dd = (R2.s[k] - R2.s[k - 1]) * grade; if (!has[k]) { pos[k] = Math.max(pos[k], pos[k - 1] - dd); neg[k] = Math.max(neg[k], neg[k - 1] - dd); } }
      for (let k = R2.n - 2; k >= 0; k--) { const dd = (R2.s[k + 1] - R2.s[k]) * grade; if (!has[k]) { pos[k] = Math.max(pos[k], pos[k + 1] - dd); neg[k] = Math.max(neg[k], neg[k + 1] - dd); } }
      for (let k = 0; k < R2.n; k++) out[k] = has[k] ? delta[k] : pos[k] >= neg[k] ? pos[k] : -neg[k];
      for (let k = 0; k < R2.n; k++) R2.y[k] += out[k];
    }
    done.add(R2);
  }
}
// zoekraster voor de wegen: elk wegstuk (weg-id × 32768 + punt) alleen in de vakken van 64 m die het raakt,
// compact als Int32Array; roadNear bekijkt de vakken binnen het zoekbereik (zuinig met geheugen, ook in de workers)
const RG = 64, roadGrid = (() => {
  const tmp = new Map();
  for (const R of ROADS) for (let k = 0; k < R.n - 1; k++) {
    const m = R.hw + 6, x0 = Math.floor((Math.min(R.x[k], R.x[k + 1]) - m) / RG), x1 = Math.floor((Math.max(R.x[k], R.x[k + 1]) + m) / RG), z0 = Math.floor((Math.min(R.z[k], R.z[k + 1]) - m) / RG), z1 = Math.floor((Math.max(R.z[k], R.z[k + 1]) + m) / RG);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) { const key = cz * 8192 + cx; let l = tmp.get(key); if (!l) tmp.set(key, l = []); l.push(R.id * 32768 + k); }
  }
  const g = new Map(); for (const [k, l] of tmp) g.set(k, Int32Array.from(l)); return g;
})();
const NO_ROADS = new Int32Array(0);
const roadCell = (x, z) => roadGrid.get(Math.floor(z / RG) * 8192 + Math.floor(x / RG)) || NO_ROADS;
function roadNear(x, z, reach = 40) {
  let best = null; const x0 = Math.floor((x - reach) / RG), x1 = Math.floor((x + reach) / RG), z0 = Math.floor((z - reach) / RG), z1 = Math.floor((z + reach) / RG);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const l = roadGrid.get(cz * 8192 + cx); if (!l) continue;
    for (let e = 0; e < l.length; e++) {
      const R = ROADS[l[e] >> 15], k = l[e] & 32767;
      const ax = R.x[k], az = R.z[k], vx = R.x[k + 1] - ax, vz = R.z[k + 1] - az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
      if (d <= reach && (!best || d - R.hw < best.d - best.R.hw)) best = { R, d, s: R.s[k] + (R.s[k + 1] - R.s[k]) * t, y: R.y[k] + (R.y[k + 1] - R.y[k]) * t, g: R.g[k] + (R.g[k + 1] - R.g[k]) * t, sd: (vx * (z - az) - vz * (x - ax)) > 0 ? d : -d };
    }
  }
  return best;
}

// ---------- spoor: dalen, sleuven en dijken (zoals in de Alpen) ----------
const railGrid = new Grid(256);
for (const L of LINES) if (!L.metro && !L.tram) for (let i = 0; i + 10 < L.n; i += 10) { const R = Math.min(400, L.tun / 0.7) + BED + 40; railGrid.add({ L, i, j: i + 10 }, Math.min(L.x[i], L.x[i + 10]) - R, Math.min(L.z[i], L.z[i + 10]) - R, Math.max(L.x[i], L.x[i + 10]) + R, Math.max(L.z[i], L.z[i + 10]) + R); }
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
    if (q.d <= bed) { if (kind !== 2) out = Math.min(out, hb); if (kind === 0 && out < hb && !(hb - out >= 8 && streetUnderRail(x, z))) out = Math.max(out, hb); continue; } // geen dijk waar een straat onder het spoor door loopt
    if (out > hb) out = Math.min(out, hb + (q.d - bed) * 0.7);
    else if (kind === 0 && hb - out < 9) out = Math.max(out, hb - (q.d - bed) / 1.6);
  }
  return out;
}
// wegen: sleuf en talud (geen trappen), bruggen boven dalen en rivieren, tunnels door bergen
function roadShape(x, z, h) {
  const q = roadNear(x, z, 40); if (!q) return h;
  const R = q.R, hy = q.y - G - 1, bed = R.hw + (R.bike === 'none' ? 1.5 : 5.2);
  if (hy - h > 6 && q.d <= bed + 6) return h; // brug: het terrein blijft eronder
  if (h - hy > 24) return h; // tunnel
  if (q.d <= bed) return hy;
  return h > hy ? Math.min(h, hy + (q.d - bed) * 0.8) : Math.max(h, hy - (q.d - bed) / 1.5);
}

// ---------- havens (fase 6): kade, containerterminal met portaalkranen, ferry- en cruiseterminal, scheepswerf, jachthaven ----------
// Ligging: aan de kust bij Munkbay-Haven, Westport en Greenport (canon: Westport is een grote havenstad; de rest voorstel).
// Elke haven is een rechthoek langs de kust: a = langs de kade (-450 … 450 m), n = landinwaarts (0 = kadelijn).
export const HARBOURS = [
  { name: 'Haven van Munkbay', from: [136500, 30000] },
  { name: 'Haven van Westport', from: [9500, 27000] },
  { name: 'Haven van Greenport', from: [31000, 42000] },
].map(h => {
  let best = null;
  outer: for (let r = 0; r < 6000; r += 50) for (let k = 0; k < 128; k++) { const an = k / 128 * Math.PI * 2, x = h.from[0] + Math.cos(an) * r, z = h.from[1] + Math.sin(an) * r; if (Math.abs(coastDist(x, z)) < 20) { best = [x, z]; break outer; } }
  const e = 30, gx = coastDist(best[0] + e, best[1]) - coastDist(best[0] - e, best[1]), gz = coastDist(best[0], best[1] + e) - coastDist(best[0], best[1] - e), l = Math.hypot(gx, gz);
  return { ...h, x: best[0], z: best[1], nx: gx / l, nz: gz / l }; // n = richting landinwaarts
});
function harbourAt(x, z) {
  for (const H of HARBOURS) {
    const dx = x - H.x, dz = z - H.z; if (Math.abs(dx) > 800 || Math.abs(dz) > 800) continue;
    const n = dx * H.nx + dz * H.nz, a = -dx * H.nz + dz * H.nx;
    if (Math.abs(a) <= 520 && n >= -260 && n <= 260) return { H, a, n };
  }
  return null;
}
function harbourHeight(hb, raw) {
  const { a, n } = hb, aa = Math.abs(a);
  if (aa <= 450) {
    if (n < -60) return Math.min(raw, -9);                 // havenbekken (uitgebaggerd)
    if (n <= 180) return 2;                                 // kade en haventerrein
    const t = (n - 180) / 80; return 2 + (raw - 2) * t * t * (3 - 2 * t);
  }
  if (n < -60) return null;
  const t = Math.min(1, (aa - 450) / 70), u = n > 180 ? Math.max(t, (n - 180) / 80) : t, k = Math.min(1, u);
  return 2 + (raw - 2) * k * k * (3 - 2 * k);
}

// ---------- Zenvo-testterrein bij de autofabriek in Riverside (Zenvo canon, testterrein voorstel) ----------
// ovaal: twee rechte stukken van 560 m en bochten met een straal van 100 m, 14 m breed; tribune, pitgebouw en hekken
export const TRACK_Z = { name: 'Zenvo-testterrein', x: 115000, z: 22500, hx: 420, hz: 170, h: 110, straight: 280, r: 100, w: 7 };
function trackDist(x, z) { const lx = x - TRACK_Z.x, lz = z - TRACK_Z.z, S = TRACK_Z.straight; if (Math.abs(lx) <= S) return { d: Math.abs(Math.abs(lz) - TRACK_Z.r), lx, lz, turn: false }; const cx = Math.sign(lx) * S; return { d: Math.abs(Math.hypot(lx - cx, lz) - TRACK_Z.r), lx, lz, turn: true, inner: Math.hypot(lx - cx, lz) < TRACK_Z.r }; }

// ---------- het landschap ----------
export function natural(x, z) {
  let h = rawHeight(x, z);
  const hb = HARBOURS.length ? harbourAt(x, z) : null;
  if (hb) { const hh = harbourHeight(hb, h); if (hh !== null) return hh; }
  if (Math.abs(x - TRACK_Z.x) < TRACK_Z.hx + 80 && Math.abs(z - TRACK_Z.z) < TRACK_Z.hz + 80) { const t = Math.max(Math.abs(x - TRACK_Z.x) - TRACK_Z.hx, Math.abs(z - TRACK_Z.z) - TRACK_Z.hz, 0) / 80, k = t * t * (3 - 2 * t); h = TRACK_Z.h + (h - TRACK_Z.h) * k; if (k === 0) return h; }
  if (h < -0.5) return h;
  h = roadShape(x, z, h);
  return railShape(x, z, h);
}
export const surfaceAt = natural;

// ---------- kabelbanen in Silverpine (Silverpine canon; de banen zelf zijn een voorstel) ----------
const LIFT_DEF = (() => {
  const t = PLACE.Silverpine, pk = PEAKS.find(p => p.name === 'Silverpine Horn');
  const dir = (an) => [Math.cos(an), Math.sin(an)];
  const toPk = Math.atan2(pk.z - t.z, pk.x - t.x), dp = Math.hypot(pk.x - t.x, pk.z - t.z);
  const from = (an, off) => [Math.round(t.x + dir(an)[0] * off), Math.round(t.z + dir(an)[1] * off)];
  return [
    { name: 'Silverpine Horn-Kabelbaan', kind: 'cable', a: from(toPk, 560), b: [Math.round(t.x + dir(toPk)[0] * dp * 0.8), Math.round(t.z + dir(toPk)[1] * dp * 0.8)], top: 'Bergstation Silverpine Horn' },
    { name: 'Zilvergrat-Gondelbaan', kind: 'gondola', a: from(9 / 16 * Math.PI * 2, 520), b: from(9 / 16 * Math.PI * 2, 2500), top: 'Zilvergrat' },
    { name: 'Silverpine-Stoeltjeslift', kind: 'chair', a: from(3 / 16 * Math.PI * 2, 520), b: from(3 / 16 * Math.PI * 2, 1700), top: 'Skihut Silverpine' },
  ];
})();
export const LIFTS = buildLifts(LIFT_DEF, G, natural);
const liftGrid = new Grid(512);
for (const L of LIFTS) liftGrid.add(L, Math.min(L.ax, L.bx) - 60, Math.min(L.az, L.bz) - 60, Math.max(L.ax, L.bx) + 60, Math.max(L.az, L.bz) + 60);
function nearLift(x, z, pad) { for (const L of liftGrid.at(x, z)) { const [u, v] = liftUV(L, x, z); if (u > -L.stL - pad && u < L.len + L.stL + pad && Math.abs(v) < (Math.abs(u) < L.stL + pad || Math.abs(u - L.len) < L.stL + pad ? L.stW : L.track + 2) + pad) return L; } return null; }
export const heightAt = (x, z) => G + natural(x, z);
export const groundAt = (x, z) => Math.round(G + natural(x, z));

// ---------- stratenplan en kavels in de bebouwde kom ----------
// elke plaats heeft een eigen raster (oorsprong in het centrum), blokken van 70–120 m; brede lanen om de 4 blokken
function gridFor(p) {
  const B0 = p.kind === 'capital' ? 120 : p.kind === 'city' ? 110 : p.kind === 'town' ? 95 : 80;
  return { B: B0, ox: p.x - B0 / 2, oz: p.z - B0 / 2 };
}
// straatprofielen (breedte van gevel tot gevel):
//  laan (22 m): stoep | fietspad (2 richtingen) | rijstrook | tram (2 sporen, middenberm) | rijstrook | stoep
//  straat in een stad (12 m) of dorp (9 m): stoep | rijstrook | rijstrook | stoep
const AVENUE_W = 22;
function streetWidth(av, u) { return av && u.dens > 0.45 ? AVENUE_W : u.p.kind === 'village' || u.p.kind === 'hamlet' ? 9 : 12; }
// afstand vanaf de blokrand tot het midden van de rijstroken (+ = met de rasterrichting mee, - = tegen)
export function streetLanes(hw) { return hw === AVENUE_W ? [5.6, 17.9] : hw === 9 ? [3.2, 5.8] : [4, 8]; }
export const TRAM_CENTER = 11.5; // as van de tramsporen in een laan (sporen op 9 en 14)
function streetAt(x, z, u) {
  const g = gridFor(u.p), lx = x - g.ox, lz = z - g.oz, bx = Math.floor(lx / g.B), bz = Math.floor(lz / g.B), fx = lx - bx * g.B, fz = lz - bz * g.B;
  const avX = ((bx % 4) + 4) % 4 === 0, avZ = ((bz % 4) + 4) % 4 === 0;
  const hwX = streetWidth(avX, u), hwZ = streetWidth(avZ, u); // volle breedte incl. stoepen
  const inX = fx < hwX, inZ = fz < hwZ; // straat langs de westrand (x) of noordrand (z) van het blok
  if (inX || inZ) {
    const useX = inX && !(inZ && hwZ === AVENUE_W && hwX !== AVENUE_W); // op een kruispunt gaat de laan voor (tramsporen lopen door)
    const d = useX ? fx : fz, hw = useX ? hwX : hwZ;
    return { street: true, d, hw, avenue: useX ? avX : avZ, alongX: !useX, bx, bz, g };
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
  // bouwtype per straatrij (één karakter per straatwand), kavels volgens de breedte van dat type
  const half = (z1b - z0b) / 2, row = z - z0b < half ? 0 : 1, len = x1b - x0b;
  const akind = area ? area.kind : null, style = u.p.style, capital = u.p.kind === 'capital';
  if (akind === 'airport' || akind === 'beach') return { garden: true };
  const mix = familyMix(akind, dens, style, capital), rowSeed = hash(bx * 13 + row, bz * 29 + (u.p.x | 0), 505);
  const famRow = chooseFamily(mix, rowSeed), FR = FAMILIES[famRow];
  // kavels van links naar rechts (breedte binnen het bereik van het type; de laatste vult aan)
  let lx0 = x0b, li = 0, w = 0;
  for (;;) {
    w = Math.round(FR.lot[0] + (FR.lot[1] - FR.lot[0]) * hash(bx * 7 + li, bz * 11 + row, 506));
    if (lx0 + w * 1.5 > x0b + len || w >= len) { w = x0b + len - lx0; break; } // laatste kavel
    if (x < lx0 + w) break;
    lx0 += w; li++;
  }
  const nLast = lx0 + w >= x0b + len - 0.5;
  const id = (bx * 7919 + bz * 104729 + li * 31 + row) | 0;
  const r = hash(id, u.p.x | 0, 503), r2 = hash(id, u.p.z | 0, 504);
  // in dorpen niet elke kavel bebouwd
  if (r > 0.25 + dens * 1.2 && dens < 0.6) return { garden: true };
  // af en toe een ander type van dezelfde wijk (als de kavel ervoor past): geen eentonige straatwand
  let fam = famRow;
  if (r > 0.82) { const alt = chooseFamily(mix, hash(id, 7, 507)), FA = FAMILIES[alt]; if (FA.lot[0] <= w + 2 && !!FA.attached === !!FR.attached) fam = alt; }
  const F = FAMILIES[fam];
  if (w < Math.min(F.lot[0], 6) - 1) return { garden: true };
  const side = F.attached ? 0 : Math.min(F.setback ?? 2, Math.max(1, (w - 8) / 2)), front = F.attached ? (dens > 0.6 ? 0 : 2) : (F.setback ?? 2);
  const depth = Math.max(7, Math.min(Math.round(F.depth[0] + (F.depth[1] - F.depth[0]) * hash(id, 3, 508)), Math.floor(half - front - 3)));
  const b = { x0: Math.round(lx0 + side), x1: Math.round(lx0 + w - side) - 1, id, face: row === 0 ? 'z0' : 'z1', fam };
  if (row === 0) { b.z0 = Math.round(z0b + front); b.z1 = b.z0 + depth; } else { b.z1 = Math.round(z1b - front) - 1; b.z0 = b.z1 - depth; }
  if (b.x1 - b.x0 < 4 || b.z1 - b.z0 < 6) return { garden: true };
  // hoogte: in het zakencentrum hoger naar het midden toe
  let floors = Math.round(F.floors[0] + (F.floors[1] - F.floors[0]) * Math.pow(r2, 1.4));
  if (akind === 'cbd' && (fam === 'wolkenkrabber' || fam === 'woontoren' || fam === 'kantoor' || fam === 'hotel')) floors = Math.max(F.floors[0], Math.round(floors * (1.15 - Math.hypot(x - area.x, z - area.z) / area.r * 0.6)));
  if (F.attached) { if (li === 0) b.corner = -1; else if (nLast) b.corner = 1; }
  b.kind = F.kind; b.floors = floors; b.style = style; b.r = r; b.r2 = r2;
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
  if (f !== null) for (const L of LINES) if (!L.metro && !L.tram && L.near((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + BED + 4)) { f = null; break; }
  if (f !== null) { const q = roadNear((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 10); if (q && q.d < Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + q.R.hw + (q.R.bike === 'none' ? 4 : 6)) f = null; }
  if (f !== null && metroExitIn(b)) f = null;
  if (f !== null && (nearLift(b.x0, b.z0, 8) || nearLift(b.x1, b.z1, 8) || nearLift((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 8 + Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2))) f = null; // niet onder een kabelbaan // metrotrap: de uitgang komt op een vrij pleintje
  if (cache) cache.set(k, f);
  return f;
}
// richting van de metrotrap per perronkant: +1 (naar het ene perroneinde), -1 (het andere) of 0 (geen trap: overal een spoorlijn aan de oppervlakte)
const stairDirs = new Map();
export function metroStair(L, st, side) {
  const k = L.id + ':' + st.name + ':' + side; let r = stairDirs.get(k);
  if (r !== undefined) return r;
  r = 0;
  const mid = (st.s0 + st.s1) / 2, d0 = TRACK + 2.2 + 4.2 + 1.4;
  for (const dir of [1, -1]) {
    let ok = true;
    for (let u = -4; u <= 64 && ok; u += 2) for (const dd of [0, 2, 4]) {
      const q = L.at(mid - dir * 8 + dir * u), d = d0 + dd, x = q.x - q.tz * d * side, z = q.z + q.tx * d * side;
      if (Math.round(G + natural(x, z)) < Math.round(q.y) + u / 1.5 - 6) { u = 1e9; break; }
      for (const L2 of LINES) if (!L2.metro && L2.near(x, z, 14)) { ok = false; break; }
      if (!ok) break;
    }
    if (ok) { r = dir; break; }
  }
  stairDirs.set(k, r);
  return r;
}
// uitgangen van de metrotrappen (middellijn van de trap, om de 2 m), pas opgebouwd bij het eerste gebruik
let exitGrid = null;
function metroExitIn(b) {
  if (!exitGrid) {
    exitGrid = new Grid(64);
    for (const L of LINES) if (L.metro) for (const st of L.stations) for (const side of [1, -1]) {
      const mid = (st.s0 + st.s1) / 2, d = TRACK + 2.2 + 4.2 + 1.4 + 2, dir = metroStair(L, st, side); if (!dir) continue;
      for (let u = -4; u <= 64; u += 2) { const q = L.at(mid - dir * 8 + dir * u), x = q.x - q.tz * d * side, z = q.z + q.tx * d * side; if (Math.round(G + natural(x, z)) < Math.round(q.y) + u / 1.5 - 6) break; exitGrid.add({ x, z }, x - 8, z - 8, x + 8, z + 8); }
    }
  }
  for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z1], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]]) for (const e of exitGrid.at(x, z)) if (e.x > b.x0 - 5 && e.x < b.x1 + 5 && e.z > b.z0 - 5 && e.z < b.z1 + 5) return true;
  return false;
}

// ---------- bijzondere gebouwen (landmarks) en de luchthaven ----------
export const BLD = [];
const bldGrid = new Grid(64);
for (const lm of LANDMARKS) {
  const p = PLACE[lm.town]; if (!p) continue;
  let x = p.x + lm.dx, z = p.z + lm.dz;
  // op het stratenraster: midden in een bouwblok (of een groep blokken), nooit over een straat heen gezet
  const u = urbanAt(x, z);
  if (u && u.dens > 0.12) {
    const g = gridFor(u.p), snap = (c, o, w) => { const n = Math.max(1, Math.ceil((w + 26) / g.B)), b0 = Math.round((c - o) / g.B - n / 2); return o + b0 * g.B + 24 + (n * g.B - 26) / 2; };
    x = snap(x, g.ox, lm.w); z = snap(z, g.oz, lm.d);
  }
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
  // overweg: het wegdek loopt over het spoor, de rails liggen in het asfalt
  if (kind === 0 && ad <= bed + 1.4) { const lx = levelCrossingAt(x, z) || streetLevelCrossing(x, z); if (lx) {
    for (let y = Math.max(1, by - 3); y < by; y++) col[y] = B.GRAVEL;
    const rail = Math.abs(ad - TRACK) > 0.35 && Math.abs(ad - TRACK) < 1.15;
    col[by] = rail ? B.METAL : lx.q.d > lx.R.hw - 0.5 ? B.LINE_WHITE : B.ASPHALT;
    for (let y = by + 1; y <= Math.max(top, by + 7); y++) col[y] = 0;
    return by;
  } }
  if (kind === 1) {
    if (ad > bed + 1.2) return -1;
    if (top - by >= 13) { deepTunnels.push([L, q, bed]); return -1; } // diepe tunnel: eerst straat en gebouwen erboven, daarna uitgraven
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
    // weg of straat onder het viaduct: alleen het brugdek, geen bogen of pijlers op de rijbaan
    let under = false; { const rq = roadNear(x, z, 16); if ((rq && rq.d <= rq.R.hw + 5.5 && Math.round(rq.y) - 1 < by - 6) || streetUnderRail(x, z, by)) { other = true; under = true; } }
    if (under) { col[by - 2] = B.CONCRETE; } // alleen het brugdek boven de weg of straat
    else if (high <= 60) { const span = 36, u = ((q.s % span) + span) % span - span / 2, ya = by - 3 - (high - 3) * Math.pow(Math.abs(u) / (span / 2), 2.4); for (let y = Math.max(top + 1, Math.ceil(ya)); y < by; y++) if (!other || y > by - 10) col[y] = (y + Math.round(q.s)) % 5 === 0 ? B.STONE : B.ASHLAR; }
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
// fietspad naast de weg? (afstand tot de as en kant: + = rechts)
function bikeBand(R, d, sd) {
  if (R.bike === 'none') return null;
  if (R.bike === 'both') { if (d > R.hw + 1 && d <= R.hw + 4.6) return { w: 3.6, c: d - R.hw - 1 }; return null; } // breed fietspad, één richting per kant
  if (sd > R.hw + 1 && sd <= R.hw + 4.2) return { w: 3.2, c: sd - R.hw - 1, two: true }; // één fietspad rechts, voor beide richtingen
  return null;
}
// eindpunten van wegen waar geen andere weg aansluit: een ontworpen einde (dorpsplein of keerlus)
const ROAD_ENDS = (() => {
  const out = [];
  for (const R of ROADS) for (const k of [0, R.n - 1]) {
    const x = R.x[k], z = R.z[k];
    const joined = ROADS.some(R2 => R2 !== R && [0, R2.n - 1].some(j => Math.hypot(R2.x[j] - x, R2.z[j] - z) < 12));
    if (joined) continue;
    const u = urbanAt(x, z);
    out.push({ x, z, y: R.y[k] - 1, R, plaza: !!(u && u.dens > 0.12), r: R.hw + (u && u.dens > 0.12 ? 9 : 5) });
  }
  return out;
})();
export { ROAD_ENDS };
function roadColumn(x, z, col, top) {
  for (const e of ROAD_ENDS) { const d = Math.hypot(x - e.x, z - e.z); if (d <= e.r) { // dorpsplein of keerlus
    const y = Math.round(e.y); for (let k = Math.max(1, y - 3); k < y; k++) col[k] = B.GRAVEL; for (let k = y + 1; k <= Math.max(top, y + 5); k++) col[k] = 0;
    col[y] = e.plaza ? ((Math.floor(x) + Math.floor(z)) % 5 === 0 ? B.SIDEWALK : B.COBBLE) : d > e.r - 1 ? B.LINE_WHITE : B.ASPHALT;
    if (e.plaza && d < 1) { for (let k = y + 1; k <= y + 4; k++) col[k] = B.POST; col[y + 5] = B.LAMP; return y + 5; }
    if (!e.plaza && d > e.r - 0.8 && Math.round(Math.atan2(z - e.z, x - e.x) * 8) % 3 === 0) { col[y + 1] = B.POST; return y + 1; } // paaltjes
    return y;
  } }
  const q = roadNear(x, z, 16); if (!q) return -1;
  // overweg: palen met een andreaskruis en een (opgeheven) slagboom aan beide kanten
  for (const c of q.R.xings) if (c.type === 'overweg' && Math.abs(Math.abs(q.s - c.s) - Math.min(14, c.half + 1.5)) < 0.6 && Math.abs(q.d - (q.R.hw + 1)) < 0.6) {
    const y = Math.round(q.y) - 1; for (let k = y + 1; k <= y + 3; k++) col[k] = B.POST; col[y + 4] = B.PAINT_RED; col[y + 5] = B.PAINT_WHITE; col[y + 6] = B.PAINT_RED; return y + 6;
  }
  const R = q.R, hw = R.hw, ry = Math.round(q.y) - 1; // wegdek = bovenste blok op ry
  const bb = bikeBand(R, q.d, q.sd);
  if (q.d > hw + 1.6 && !bb && !(R.bike !== 'none' && q.d <= hw + 5)) return -1;
  if (q.d > hw) { const u = urbanAt(x, z); if (u && u.dens > 0.12 && streetAt(x, z, u).street) return -1; } // in de stad: de straat (met stoep en tramsporen) gaat voor op berm en fietspad
  const high = ry - top, deep = top - ry;
  if (deep > 24 && q.d <= hw + 1.2) { // tunnel
    col[ry] = B.ASPHALT; for (let y = ry + 1; y <= ry + 6; y++) col[y] = 0; col[ry + 7] = B.CONCRETE; if (Math.round(q.s) % 20 === 0 && q.d > hw) col[ry + 5] = B.LAMP; return Math.max(top, ry + 7);
  }
  if (deep > 24) return -1;
  if (high > 6) { // brug: het deel eronder (straat, gras, spoor) wordt gewoon gebouwd, het brugdek komt erbovenop
    if (q.d > hw + 1.6) return -1;
    return -2 - ry; // signaal voor fillColumn (zie bridgeDeck)
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
  if (bb) {
    // fietspad: rood asfalt met witte randlijnen (tweerichtingspad: gestreepte middellijn)
    col[ry] = bb.c < 0.35 || bb.c > bb.w - 0.35 ? B.LINE_WHITE : bb.two && Math.abs(bb.c - bb.w / 2) < 0.3 && Math.floor(q.s / 3) % 2 === 0 ? B.LINE_WHITE : B.BIKE_PATH;
    return ry;
  }
  col[ry] = B.GRASS; // berm (gras tussen weg en fietspad)
  if (R.kind !== 'L' && Math.round(q.s) % 50 === 25 && q.d > hw + 0.6 && q.d < hw + 1.2) { for (let y = ry + 1; y <= ry + 5; y++) col[y] = B.POST; col[ry + 6] = B.LAMP; return ry + 6; }
  return ry;
}
// ligt er een brugdek (hoger dan 9 m boven deze kolom) van een weg boven?
// ligt hier een overweg? → { R, q (positie op de weg), c (de kruising) }
function levelCrossingAt(x, z) {
  const q = roadNear(x, z, 12); if (!q || q.d > q.R.hw) return null;
  for (const c of q.R.xings) if (c.type === 'overweg' && Math.abs(q.s - c.s) <= c.half + 2) return { R: q.R, q, c };
  return null;
}
function deckAbove(x, z, t) { const q = roadNear(x, z, 16); if (!q || q.d > q.R.hw + 1.6) return -1; const ry = Math.round(q.y) - 1; return ry - t > 7 ? ry : -1; }
// brugdek (bv. de verhoogde snelweg) boven een kolom die al gebouwd is
function bridgeDeck(x, z, col, t, ry, overRail) {
  const q = roadNear(x, z, 16), R = q.R, hw = R.hw;
  if (!overRail && Math.round(q.s) % 40 < 4 && q.d < hw - 1 && Math.abs(q.sd) > 1.5) for (let y = t + 1; y < ry - 1; y++) col[y] = B.CONCRETE; // pijlers
  for (let y = t + 1; y < ry - 2; y++) if (col[y] && col[y] !== B.CONCRETE) col[y] = 0; // niets in de weg onder het dek (boven het eigen dak)
  col[ry - 2] = B.CONCRETE; col[ry - 1] = B.CONCRETE;
  const lane = Math.abs(q.sd);
  col[ry] = q.d > hw ? B.CONCRETE : R.kind === 'A' && lane < 0.6 ? B.METAL : (Math.abs(lane - 4) < 0.4 && Math.floor(q.s / 6) % 2 === 0) || lane > hw - 0.5 ? B.LINE_WHITE : B.ASPHALT;
  if (q.d > hw) { col[ry + 1] = B.METAL; col[ry + 2] = B.GLASS; return ry + 2; } // geluidsscherm
  if (lane < 0.6) { col[ry + 1] = B.METAL; return ry + 1; }
  if (Math.round(q.s) % 50 === 25 && Math.abs(lane - hw + 0.3) < 0.5) { for (let y = ry + 1; y <= ry + 5; y++) col[y] = B.POST; col[ry + 6] = B.LAMP; return ry + 6; }
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
  if (b.kind === 'showroom') return [B.GLASS, B.GLASS_GREEN, B.PANEL_WHITE];
  const set = STYLE_MAT[b.style] || STYLE_MAT.land; return set[Math.floor(b.r2 * set.length) % set.length];
}
function buildingColumn(b, F, x, z, col, top) {
  const [gf, uf, roof] = matsFor(b), inCore = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, wall = !inCore;
  const fh = b.kind === 'tower' || b.kind === 'office' ? 4 : b.kind === 'warehouse' || b.kind === 'factory' || b.kind === 'showroom' ? 6 : 3;
  const wallTop = F + b.floors * fh;
  // fundering tot op de grond; aan de hoge kant de helling weggraven
  for (let y = Math.max(1, Math.min(top, F) - 3); y < F; y++) col[y] = y <= top - 4 ? (col[y] || B.STONE) : B.ASHLAR;
  for (let y = F + 1; y <= top; y++) col[y] = 0;
  col[F] = b.kind === 'palace' ? (Math.abs(x - (b.x0 + b.x1) / 2) < 2 ? B.WOOL_RED : (x + z) % 2 ? B.CHECKER : B.MARBLE) : b.kind === 'parliament' ? B.WOOL_RED : b.kind === 'tower' || b.landmark ? B.MARBLE : B.PLANKS;
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
  const door = onFace && Math.abs(x - mid) <= (b.kind === 'tower' || b.landmark ? 2 : b.kind === 'shop' || b.kind === 'apartment' ? 1 : 0);
  const along = z === b.z0 || z === b.z1 ? x - b.x0 : z - b.z0;
  // torens: inspringende top
  let top2 = wallTop;
  if (b.kind === 'tower' && b.floors > 25) { const inset = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z); if (inset < 3) top2 = F + Math.floor(b.floors * 0.75) * fh; }
  const glassDoor = b.kind === 'tower' || b.kind === 'shop' || b.kind === 'office' || b.kind === 'hospital' || b.kind === 'campus' || b.kind === 'university' || b.landmark;
  for (let y = F + 1; y < top2; y++) {
    const lvl = y - F - 1, inLvl = lvl % fh, fl = Math.floor(lvl / fh);
    if (!wall) {
      if (inLvl === fh - 1 && y + 1 < top2) col[y + 1] = b.kind === 'tower' ? B.CONCRETE : B.PLANKS; // verdiepingsvloer
      const it = interior(b, x, z, fl, inLvl, fh); if (it) col[y] = it;
      continue;
    }
    if (door && fl === 0 && inLvl < 2) { col[y] = glassDoor ? B.DOOR_GLASS : inLvl === 0 ? B.DOOR : B.DOOR_TOP; continue; }
    if (door && fl === 0 && inLvl === 2) { col[y] = B.PANEL_DARK; continue; } // deurkader
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

// ---------- binnenkant: kamers met tussendeuren, een gang in het midden, meubels en lampen ----------
// begane grond van de landmarks: een eigen inrichting (null = gewone kamers)
function specialHall(b, lx, lz, W, D, inLvl, fh) {
  const top = inLvl === fh - 2, cx = W / 2, cz = D / 2;
  if (lx <= 1 || lz <= 1 || lx >= W - 1 || lz >= D - 1) return null;
  if (top) return (lx % 6 === 3 && lz % 6 === 3) ? B.LAMP : 0;
  if (b.name.startsWith('GNMI')) { // weerkamer: werkplekken met schermen en een grote kaarttafel
    if (Math.abs(lx - cx) < 5 && Math.abs(lz - cz) < 3) return inLvl === 0 ? B.GLASS_BLUE : 0;
    if (lz % 5 === 2 && lx % 4 !== 0 && lx > 3 && lx < W - 3) return inLvl === 0 ? B.PLANKS : inLvl === 1 ? B.PANEL_DARK : 0;
    if (lz % 5 === 3 && lx % 4 === 2 && inLvl === 0) return B.WOOL_RED;
    if (lx === W - 2 && inLvl >= 1 && inLvl <= 2) return B.PANEL_DARK; // schermenwand
    return 0;
  }
  if (b.name.startsWith('Nationale Bank')) { // loketten en een kluis met goud
    if (lz === Math.floor(D * 0.4) && lx > 3 && lx < W - 3) return inLvl === 0 ? B.MARBLE : inLvl === 1 && lx % 4 ? B.GLASS : 0;
    if (lx > W - 12 && lz > D - 12) { const wall = lx === W - 12 || lz === D - 12; if (wall) return inLvl < 2 && lx === W - 12 && lz === D - 6 ? (inLvl === 0 ? B.DOOR : B.DOOR_TOP) : B.METAL; return inLvl === 0 && (lx + lz) % 2 ? B.PAINT_YELLOW : 0; }
    if (lz < 5 && lx % 7 === 3 && inLvl === 0) return B.DARK_PLANKS;
    return 0;
  }
  if (b.kind === 'palace') { // rode loper naar de troon, feesttafel
    if (Math.abs(lx - cx) < 2 && lz > D - 5) return inLvl <= 1 ? B.PAINT_YELLOW : 0; // troon
    if (Math.abs(lx - cx) < 2 && inLvl === 0) return 0; // loper (de vloer is rood)
    if (Math.abs(lz - cz) < 1.5 && lx > 6 && lx < W / 2 - 4 && inLvl === 0) return B.PLANKS;
    if (Math.abs(Math.abs(lz - cz) - 2) < 0.5 && lx > 6 && lx < W / 2 - 4 && lx % 2 === 0 && inLvl === 0) return B.WOOL_RED;
    if (lx === W - 3 && lz % 6 === 0 && inLvl <= 3) return B.BOOKSHELF;
    return 0;
  }
  if (b.kind === 'university') { // collegezaal: oplopende banken naar het bord
    if (lx === 2 && lz > 4 && lz < D - 4 && inLvl >= 1 && inLvl <= 2) return B.PANEL_DARK;
    const row = Math.floor((lx - 6) / 2); if (lx >= 6 && lz > 3 && lz < D - 3 && row >= 0) { const hgt = Math.min(fh - 3, Math.floor(row / 3)); if (inLvl < hgt) return B.PLANKS; if (inLvl === hgt && (lx - 6) % 2 === 0) return B.DARK_PLANKS; }
    return 0;
  }
  if (b.kind === 'hospital') { // inkomhal met balie en wachtbanken
    if (Math.abs(lz - cz) < 1 && Math.abs(lx - cx) < 8 && inLvl === 0) return B.PAINT_WHITE;
    if (lz % 4 === 1 && lz < cz - 3 && lx % 3 !== 0 && inLvl === 0) return B.PAINT_BLUE;
    return 0;
  }
  if (b.name.startsWith('GreenAir')) { // inkomhal met een vliegtuigmodel en een balie
    if (Math.abs(lz - cz) < 0.6 && Math.abs(lx - cx) < 9 && inLvl === 2) return B.PAINT_WHITE; // romp
    if (Math.abs(lx - cx) < 0.6 && Math.abs(lz - cz) < 7 && inLvl === 2) return B.PAINT_WHITE; // vleugels
    if (lx === Math.round(cx + 8) && Math.abs(lz - cz) < 0.6 && inLvl === 3) return B.PAINT_GREEN; // staart
    if (lz === D - 4 && Math.abs(lx - cx) < 6 && inLvl === 0) return B.PAINT_GREEN;
    return 0;
  }
  return null;
}
function interior(b, x, z, fl, inLvl, fh) {
  const lx = x - b.x0, lz = z - b.z0, W = b.x1 - b.x0, D = b.z1 - b.z0;
  if (lx === 2 && lz === 2 && b.floors > 1) return 0; // trap (ladder wordt later gezet)
  const big = b.kind === 'tower' || b.kind === 'office' || b.kind === 'hospital' || b.kind === 'campus' || b.kind === 'university' || b.kind === 'apartment' || b.landmark;
  const RS = big ? 8 : 6, midZ = Math.floor(D / 2), corridor = D >= 12 && Math.abs(lz - midZ) <= 1;
  const top = inLvl === fh - 2; // net onder het plafond
  // bijzondere zalen op de begane grond van belangrijke gebouwen
  if (fl === 0 && b.landmark) { const sp = specialHall(b, lx, lz, W, D, inLvl, fh); if (sp !== null) return sp; }
  // grote zalen: geen tussenmuren
  const hall = b.kind === 'warehouse' || b.kind === 'factory' || b.kind === 'showroom' || b.kind === 'parliament' || (b.kind === 'shop' && fl === 0) || (b.kind === 'palace' && fl === 0) || b.kind === 'lighthouse';
  // tussenmuren (dwars) met een deur in elke kamer, behalve in de gang
  if (!hall && !corridor && lx % RS === 0 && lx > 1 && lx < W - 1) {
    const dz = ((lz % RS) + RS) % RS;
    if (dz === 3 && inLvl < 2) return inLvl === 0 ? B.DOOR : B.DOOR_TOP;
    return inLvl === fh - 1 ? 0 : (b.kind === 'tower' ? B.PANEL_WHITE : B.PLASTER);
  }
  // muur tussen de kamers en de gang, met een deur per kamer
  if (!hall && D >= 12 && Math.abs(lz - midZ) === 2) {
    if (((lx % RS) + RS) % RS === Math.floor(RS / 2) && inLvl < 2) return inLvl === 0 ? B.DOOR : B.DOOR_TOP;
    return inLvl === fh - 1 ? 0 : B.PLASTER;
  }
  const rx = ((lx % RS) + RS) % RS, rz = ((lz % RS) + RS) % RS;
  // lampen aan het plafond
  if (top && rx === Math.floor(RS / 2) && rz === Math.floor(RS / 2) && !corridor) return B.LAMP;
  if (corridor) return top && lx % 5 === 0 ? B.LAMP : 0;
  if (inLvl !== 0) { if (inLvl === 1 && rx === 1 && rz === 1 && !big) return B.BOOKSHELF; return 0; }
  // meubels op de vloer
  switch (b.kind) {
    case 'house': case 'chalet': case 'villa': case 'old':
      if (fl === 0) { if (rx === 3 && rz === 3) return B.PLANKS; if ((rx === 2 || rx === 4) && rz === 3) return B.DARK_PLANKS; if (rx === 1 && rz === 4) return B.METAL; if (rx === 4 && rz === 1) return B.WOOL_RED; }
      else { if (rx >= 2 && rx <= 3 && rz === 4) return B.WOOL_RED; if (rx === 4 && rz === 2) return B.CRATE; }
      return rx === 1 && rz === 1 ? B.BOOKSHELF : 0;
    case 'apartment':
      if (rx >= 2 && rx <= 3 && rz === 5) return B.WOOL_RED; if (rx === 5 && rz === 2) return B.PLANKS; if (rx === 1 && rz === 2) return B.METAL; return 0;
    case 'shop':
      if (fl === 0) { if (lz > 3 && lz < D - 3 && lx % 4 === 2) return lz % 2 ? B.BOOKSHELF : B.CRATE; if (lz === 2 && lx > W / 2) return B.PLANKS; return 0; }
      return rx === 3 && rz === 3 ? B.PLANKS : 0;
    case 'tower': case 'office': case 'campus': case 'university':
      if (rx % 3 === 1 && rz % 3 === 1) return B.PLANKS; if (rx % 3 === 1 && rz % 3 === 2) return B.DARK_PLANKS; return 0;
    case 'hospital':
      if (rx >= 2 && rx <= 3 && rz === 2) return B.PAINT_WHITE; if (rx === 5 && rz === 2) return B.METAL; return 0;
    case 'parliament': { const cx = W / 2, cz = D / 2, r = Math.hypot(lx - cx, lz - cz); if (fl === 0 && Math.round(r) % 3 === 0 && r > 6 && r < 28) return B.WOOL_RED; if (fl === 0 && r < 3) return B.PLANKS; return 0; }
    case 'palace': return fl === 0 ? (lx % 2 === lz % 2 ? 0 : 0) : (rx === 3 && rz === 3 ? B.PLANKS : 0);
    case 'warehouse': case 'factory': return (lx % 6 < 3 && lz % 8 < 5 && lx > 2 && lz > 2) ? B.CRATE : 0;
    case 'showroom': { // Zenvo-modellen op de vloer (romp, ruiten, wielen), verkoopbalie achteraan
      if (fl > 0) return rx % 4 === 1 && rz % 4 === 1 ? B.PLANKS : 0;
      const cx = lx % 12, cz = lz % 10, row = Math.floor(lz / 10), carN = Math.floor(lx / 12) + row * 7;
      const paint = [B.PAINT_GREEN, B.PAINT_WHITE, B.PAINT_BLACK, B.PAINT_RED, B.PAINT_BLUE, B.PAINT_YELLOW][carN % 6];
      if (lz > 4 && lz < D - 7 && cx >= 4 && cx <= 6 && cz >= 2 && cz <= 7) {
        if (inLvl === 0) return (cz === 2 || cz === 7) && cx !== 5 ? B.PAINT_BLACK : paint;
        if (inLvl === 1) return cz >= 3 && cz <= 6 ? (cx === 5 && cz > 3 && cz < 6 ? B.WOOL_RED : B.GLASS) : paint;
        if (inLvl === 2 && cz >= 3 && cz <= 6) return paint;
        return 0;
      }
      if (lz >= D - 4 && lz <= D - 3 && lx > W / 2 - 8 && lx < W / 2 + 8 && inLvl === 0) return B.PANEL_DARK; // verkoopbalie
      if (inLvl === 0 && (lx + lz) % 9 === 0 && lz < 4) return B.HEDGE; // plantenbak
      return 0;
    }
    default: return 0;
  }
}

// straten in de bebouwde kom
// ---------- straat × spoor: elk kruispunt van een stadsstraat met het spoor krijgt een ontwerp ----------
// 'overweg' (straat en spoor op dezelfde hoogte, regionale lijn), 'brug' (straat over een spoorsleuf),
// 'onder' (straat onder een viaduct door) of 'einde' (een netjes afgewerkt doodlopend einde met paaltjes).
const STREET_X = new Map();
const naturalNoRail = (x, z) => { const h = rawHeight(x, z); return h < -0.5 ? h : roadShape(x, z, h); };
function streetRail(x, z, st, u) {
  const list = railGrid.at(x, z); if (!list.length) return null;
  let best = null;
  for (const sg of list) {
    const L = sg.L; if (best && best.L === L) continue;
    const q = L.near(x, z, 120); if (!q) continue;
    const des = streetDesign(L, q, st, u); if (!des) continue;
    const a = Math.abs((st.alongX ? x : z) - des.ca), dist = Math.min(a, q.d);
    if (dist <= des.reach && (!best || dist < best.dist)) best = { ...des, a, dist, L };
  }
  return best;
}
function streetDesign(L, q, st, u) {
  const g = st.g, alongX = st.alongX, line = alongX ? st.bz : st.bx, key = `${u.p.name}|${alongX ? 'z' : 'x'}|${line}|${L.id}|${Math.round(q.s / 300)}`;
  let d = STREET_X.get(key); if (d !== undefined) return d;
  const c = (alongX ? g.oz + line * g.B : g.ox + line * g.B) + st.hw / 2; // as van de straat (vaste coördinaat)
  // snijpunt van het spoor met de as van de straat (in de buurt van het dichtste punt)
  let hit = null;
  for (let i = Math.max(0, q.i - 80); i < Math.min(L.n - 1, q.i + 80); i++) {
    const a0 = (alongX ? L.z[i] : L.x[i]) - c, a1 = (alongX ? L.z[i + 1] : L.x[i + 1]) - c;
    if (a0 === 0 || (a0 < 0) !== (a1 < 0)) { const t = a0 / ((a0 - a1) || 1), s = L.s[i] + (L.s[i + 1] - L.s[i]) * t; if (!hit || Math.abs(s - q.s) < Math.abs(hit - q.s)) hit = s; }
  }
  if (hit === null) { // spoor loopt evenwijdig naast de straat: de straat stopt aan de rand van de spoorzone
    const p = L.at(q.s), ry = p.y - 1 - G, sy = naturalNoRail(p.x, p.z);
    d = p.kind === 1 ? null : { type: 'einde', ca: alongX ? p.x : p.z, reach: BED + 3 + (sy > ry ? (sy - ry) / 0.7 : (ry - sy) * 1.6), parallel: true };
    STREET_X.set(key, d); return d;
  }
  const p = L.at(hit), ca = alongX ? p.x : p.z;
  if (p.kind === 1) { STREET_X.set(key, null); return null; } // spoor in een tunnel: geen invloed
  // straathoogte zonder het spoor: gemiddelde van beide kanten, buiten de spoorzone
  const off = BED + 40, sx = (dx) => alongX ? naturalNoRail(ca + dx, c) : naturalNoRail(c, ca + dx), sy = (sx(off) + sx(-off)) / 2, ry = p.y - 1 - G;
  const sin = Math.abs(alongX ? p.tz : p.tx), widen = 1 / Math.max(0.3, sin), half = (BED + 3) * widen;
  let type;
  if (L.stationAt(hit)) type = 'einde';
  else if (p.kind === 2 && ry - sy >= 8) type = 'onder';
  else if (p.kind === 0 && !HIGH_SPEED.has(L.id) && Math.abs(sy - ry) <= 2.5 && sin > 0.5 && (u.dens < 0.55 || st.hw >= 22 || ((line % 3) + 3) % 3 === 0)) type = 'overweg'; // in de drukke stad niet aan elke zijstraat een overweg
  else if (sy - ry >= 9) type = 'brug';
  else if (ry - sy >= 9) type = 'onder';
  else type = 'einde';
  const slope = sy > ry ? (sy - ry) / 0.7 : (ry - sy) * 1.6;
  d = { type, ca, s: hit, ry, sy, deckY: Math.round(G + sy), reach: (BED + 3 + slope) * widen + 2, half };
  STREET_X.set(key, d); return d;
}
// ---------- Munkbay Central: reizigerstunnel onder alle sporen (10 m breed), trappen met roltrapband naar elk perron
// en naar beide stationspleinen, winkeltjes in de tunnel ----------
function centralPassage(x, z, col, ctx) {
  let best = null;
  for (const L of ctx.lines) { const q = L.near(x, z, 30); if (!q) continue; const st = L.stationAt(q.s); if (!st || !st.central) continue; if (!best || q.d < best.q.d) best = { L, q, st }; }
  if (!best) return -1;
  const { q, st } = best, by = Math.round(q.y), ad = q.d, mid = (st.s0 + st.s1) / 2, ds = q.s - mid, pIn = TRACK + 2.2, pOut = pIn + 4.2;
  if (ds < -6 || ds > 14 || ad > pOut + 10) return -1;
  const fl = by - 7; // vloer van de tunnel
  let t = -1;
  if (Math.abs(ds) <= 5) { // de tunnel zelf
    col[fl - 1] = B.CONCRETE; col[fl] = (Math.floor(x) + Math.floor(z)) % 2 ? B.TILE : B.MARBLE;
    for (let y = fl + 1; y <= fl + 4; y++) col[y] = 0;
    col[fl + 5] = Math.floor(x) % 4 === 0 && Math.floor(z) % 4 === 0 ? B.LAMP : B.PANEL_WHITE;
    const strip = (ad > pIn + 1.4 && ad < pOut - 0.6) || (ad > pOut + 2 && ad < pOut + 5.5); // hier komt een trap uit
    if (Math.abs(Math.abs(ds) - 5) < 0.6 && !(ds > 0 && strip)) { // wanden met winkeltjes en reclame
      col[fl + 1] = Math.floor(z) % 9 < 6 ? B.GLASS : B.PANEL_WHITE; col[fl + 2] = Math.floor(z) % 9 < 6 ? B.GLASS : B.PANEL_WHITE; col[fl + 3] = [B.PAINT_RED, B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_ORANGE][Math.floor(z / 9) & 3]; col[fl + 4] = B.PANEL_WHITE;
    }
    t = fl + 5;
  }
  // trap (8 m, 1 trede per m) van de tunnel naar het perron of het plein; de buitenste strook is een roltrap
  const onPlat = ad > pIn + 1.4 && ad < pOut - 0.6, onSquare = ad > pOut + 2 && ad < pOut + 5.5;
  if ((onPlat || onSquare) && ds > 5 && ds <= 13) {
    const goal = onPlat ? by + 1 : by, fy = Math.min(goal, fl + Math.floor(ds - 5));
    for (let y = fl; y < fy; y++) col[y] = B.CONCRETE;
    col[fy] = (onPlat ? ad < pIn + 1.9 : ad < pOut + 2.5) ? B.METAL : B.TILE;
    for (let y = fy + 1; y <= Math.max(goal + 3, fy + 4); y++) col[y] = 0;
    t = Math.max(t, fy);
  } else if ((onPlat || onSquare) && ds > 5 && ds <= 13.6) { /* niets */ }
  // borstwering rond de trapopening op het perron
  if (ds > 4.6 && ds <= 13.6 && ((ad > pIn + 0.9 && ad <= pIn + 1.4) || (ad >= pOut - 0.6 && ad < pOut - 0.1))) { col[by + 2] = B.METAL; t = Math.max(t, by + 2); }
  return t;
}
// overweg in een stadsstraat? (zelfde vorm als bij een nationale weg)
function streetLevelCrossing(x, z) {
  const u = urbanAt(x, z); if (!u || u.dens <= 0.12) return null;
  const st = streetAt(x, z, u); if (!st.street) return null;
  const r = streetRail(x, z, st, u); if (!r || r.type !== 'overweg' || r.a > r.half + 2) return null;
  return { R: { hw: st.hw / 2 }, q: { d: Math.abs(st.d - st.hw / 2) }, street: true };
}
// is deze kolom een stadsstraat die hier onder het spoor door loopt?
function streetUnderRail(x, z) {
  const u = urbanAt(x, z); if (!u || u.dens <= 0.12) return false;
  const st = streetAt(x, z, u); if (!st.street) return false;
  const r = streetRail(x, z, st, u); return !!(r && r.type === 'onder' && r.a <= r.half + 2);
}
function streetColumn(st, u, x, z, col, top) {
  // voorplein rond een groot gebouw (landmark): de straat eindigt hier met paaltjes
  for (const b of bldGrid.at(x, z)) if (b.landmark && x >= b.x0 - 5 && x <= b.x1 + 5 && z >= b.z0 - 5 && z <= b.z1 + 5) {
    const ring = Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1);
    col[top] = (Math.floor(x) + Math.floor(z)) % 7 === 0 ? B.SIDEWALK : B.COBBLE; for (let k = top + 1; k <= top + 4; k++) col[k] = 0;
    if (ring > 4 && (Math.floor(x) + Math.floor(z)) % 2 === 0) { col[top + 1] = B.POST; return top + 1; }
    return top;
  }
  { const r = streetRail(x, z, st, u); if (r) {
    if (r.type === 'einde' && r.dist < r.reach) { // doodlopend: paaltjes en een bord, daarachter gras tot aan de spoorzone
      if (r.dist > r.reach - 1.5) { col[top] = B.SIDEWALK; if ((Math.floor(x) + Math.floor(z)) % 2 === 0) { col[top + 1] = B.POST; return top + 1; } if (st.d < 1.5) { col[top + 1] = B.POST; col[top + 2] = B.POST; col[top + 3] = B.PAINT_BLUE; return top + 3; } return top; }
      col[top] = B.GRASS; return top;
    }
    if (r.type === 'overweg' && Math.abs(r.a - Math.min(14, r.half + 1)) < 0.6 && (st.d < 1 || st.d >= st.hw - 1)) { for (let k = top + 1; k <= top + 3; k++) col[k] = B.POST; col[top + 4] = B.PAINT_RED; col[top + 5] = B.PAINT_WHITE; col[top + 6] = B.PAINT_RED; col[top] = B.SIDEWALK; return top + 6; }
    if (r.type === 'brug' && r.a < r.reach) { // straatbrug over de spoorsleuf: het wegdek blijft op straathoogte
      const y = r.deckY; for (let k = y + 1; k <= y + 4; k++) col[k] = 0;
      col[y - 1] = B.CONCRETE; col[y - 2] = B.CONCRETE;
      if (st.d < 1 || st.d >= st.hw - 1) { col[y] = B.CONCRETE; col[y + 1] = B.METAL; return y + 1; } // borstwering
      col[y] = Math.abs(st.d + 0.5 - st.hw / 2) < 0.5 && Math.floor((st.alongX ? x : z) / 4) % 2 === 0 ? B.LINE_WHITE : B.ASPHALT;
      if (r.a > r.reach - 3 && top < y) for (let k = top + 1; k < y - 2; k++) col[k] = B.CONCRETE; // landhoofd
      return y;
    }
  } }
  const y = top, d = st.d, hw = st.hw, along = st.alongX ? x : z;
  for (let k = Math.max(1, y - 3); k < y; k++) col[k] = B.GRAVEL;
  for (let k = y + 1; k <= y + 4; k++) col[k] = 0;
  // tramsporen (ook dwars over kruispunten), precies op de hoogte van de tramlijn
  if (hw >= 12) for (const L of TRAM_LINES) {
    const q = L.near(x, z, 5); if (!q || q.d > 4.6) continue;
    const ty = Math.round(q.y), t = Math.abs(Math.abs(q.sd) - 2.5);
    if (ty !== y) { for (let k = Math.max(1, ty - 3); k < ty; k++) col[k] = B.GRAVEL; for (let k = ty + 1; k <= Math.max(y, ty) + 4; k++) col[k] = 0; }
    col[ty] = Math.abs(t - 1) < 0.3 ? B.METAL : t < 0.8 ? B.COBBLE : hw === AVENUE_W && st.alongX === (Math.abs(L.x[1] - L.x[0]) > Math.abs(L.z[1] - L.z[0])) ? B.GRASS : B.ASPHALT;
    if (Math.abs(q.sd) < 0.6 && hw === AVENUE_W && Math.round(q.s) % 30 === 15) { for (let k = ty + 1; k <= ty + 3; k++) col[k] = B.POST; col[ty + 4] = B.METAL; return ty + 4; } // bovenleidingmast
    return ty;
  }
  const walkB = u.p.kind === 'capital' || u.p.kind === 'city' ? B.SIDEWALK : B.COBBLE;
  const sw = hw === AVENUE_W ? 2.2 : hw === 9 ? 1.5 : 2;
  if (d < sw || d >= hw - sw) { // stoepen met lantaarnpalen
    col[y] = walkB;
    if (hw === AVENUE_W) for (const L of TRAM_LINES) { // tramhalte: wachthuisje met bank, dak en haltepaal in de lijnkleur
      const q = L.near(x, z, 12); if (!q || q.d < 8) continue;
      const stp = L.stationAt(q.s); if (!stp) continue;
      const o = q.s - stp.s; if (Math.abs(o) > 6) continue;
      if (Math.abs(o) > 5) { col[y + 1] = B.POST; col[y + 2] = B.POST; col[y + 3] = B.PAINT_GREEN; return y + 3; }
      const back = d < 1 || d >= hw - 1;
      if (back) { col[y + 1] = B.GLASS; col[y + 2] = B.GLASS; }
      else if (Math.abs(o) < 3) col[y + 1] = B.DARK_PLANKS;
      col[y + 3] = B.GLASS_GREEN; return y + 3;
    }
    if (d >= hw - 1 && along % 24 === 12) { for (let k = y + 1; k <= y + 4; k++) col[k] = B.POST; col[y + 5] = B.LAMP; return y + 5; }
    const f = sidewalkFurniture(st, u, x, z, d, hw, sw, y, col); if (f >= 0) return f;
    return y;
  }
  // zebrapad vlak voor elk kruispunt (in dorpen alleen in het centrum)
  if (u.dens > 0.3) { const bi = blockAlong(st, u, x, z); if (bi.a >= bi.cw + 1 && bi.a < bi.cw + 4) { col[y] = Math.floor(d) % 2 === 0 ? B.LINE_WHITE : B.ASPHALT; return y; } }
  if (hw === AVENUE_W) {
    if (d < 4.2) { col[y] = Math.abs(d - 3.2) < 0.5 && Math.floor(along / 3) % 2 === 0 ? B.LINE_WHITE : B.BIKE_PATH; return y; } // fietspad
    if (d >= 7 && d < 16) { // tramzone: twee sporen, gras tussen de sporen en in de middenberm
      const t1 = Math.abs(d - 9), t2 = Math.abs(d - 14);
      // rijdt hier een tramlijn? dan ligt de tramzone precies op de hoogte van de lijn (geen zwevende trams)
      let ty = y; for (const L of TRAM_LINES) { const q = L.near(x, z, 7); if (q) { ty = Math.round(q.y); break; } }
      if (ty !== y) { for (let k = Math.max(1, ty - 3); k < ty; k++) col[k] = B.GRAVEL; for (let k = ty + 1; k <= Math.max(y, ty) + 4; k++) col[k] = 0; }
      return tramZone(col, ty, d, t1, t2, along);
    }
    col[y] = (d === 7 - 1 || d === 16) && Math.floor(along / 4) % 2 === 0 ? B.LINE_WHITE : B.ASPHALT;
    return y;
  }
  const mid = hw / 2;
  const busLane = !st.alongX && u.p === MUNK && BUS_BX.has(st.bx); // straat met een stadsbuslijn: busbanen
  col[y] = Math.abs(d + 0.5 - mid) < 0.5 && Math.floor(along / 4) % 2 === 0 ? B.LINE_WHITE : busLane ? B.BUS_LANE : B.ASPHALT;
  return y;
}
const BUS_BX = new Set(CITY_BUS.map(r => r.bx));
const TRAM_LINES = LINES.filter(L => L.tram);
// positie langs het bouwblok: a = meter vanaf het begin van het blok, cw = breedte van de dwarsstraat aan het begin
function blockAlong(st, u, x, z) {
  const g = st.g;
  if (st.alongX) { const b0 = g.ox + st.bx * g.B; return { a: x - b0, cw: streetWidth(((st.bx % 4) + 4) % 4 === 0, u) }; }
  const b0 = g.oz + st.bz * g.B; return { a: z - b0, cw: streetWidth(((st.bz % 4) + 4) % 4 === 0, u) };
}
// straatmeubilair op de stoep: bomen in boomvakken, bankjes, afvalbakken, straatnaamborden, verkeerslichten,
// reclamezuilen, bloembakken en paaltjes bij het kruispunt
function sidewalkFurniture(st, u, x, z, d, hw, sw, y, col) {
  const { a, cw } = blockAlong(st, u, x, z), B0 = st.g.B, dens = u.dens, outer = d < 1 || d >= hw - 1, curb = (d >= sw - 1 && d < sw) || (d >= hw - sw && d < hw - sw + 1);
  if (a < cw || a > B0 - 1) return -1; // op het kruispunt zelf niets
  const ai = Math.floor(a), city = u.p.kind === 'capital' || u.p.kind === 'city';
  // verkeerslicht op de hoek van een kruispunt met lichten (lanen en de drukke stad)
  if (ai === Math.floor(cw) && curb && city && dens >= 0.45 && (hw === AVENUE_W || cw === AVENUE_W || dens >= 0.7)) { col[y + 1] = B.POST; col[y + 2] = B.POST; col[y + 3] = B.POST; col[y + 4] = B.PAINT_BLACK; col[y + 5] = B.PAINT_BLACK; return y + 5; }
  // straatnaambord op de hoek
  if (ai === Math.floor(cw) + 1 && outer && d < 1) { col[y + 1] = B.POST; col[y + 2] = B.POST; col[y + 3] = B.PAINT_BLUE; return y + 3; }
  // paaltjes langs de stoeprand vlak bij het kruispunt
  if (curb && ai >= cw + 1 && ai <= cw + 4 && ai % 2 === 0 && dens > 0.45) { col[y + 1] = B.POST; return y + 1; }
  if (dens < 0.25) return -1;
  // bomen in boomvakken aan de stoeprand (bredere straten)
  if (curb && hw >= 12 && ai % 10 === 5 && sw >= 2) { col[y] = B.GRASS; treeKind = 1; return y; }
  // bankje en afvalbak
  if (outer && ai % 30 === 20 && dens > 0.4) { col[y + 1] = B.DARK_PLANKS; return y + 1; }
  if (outer && ai % 30 === 22 && dens > 0.4) { col[y + 1] = B.METAL; return y + 1; }
  // reclamezuil (in de stad)
  if (city && curb && ai % 60 === 40 && dens > 0.6) { col[y + 1] = B.PAINT_ORANGE; col[y + 2] = B.PAINT_WHITE; col[y + 3] = B.PAINT_GREEN; col[y + 4] = B.METAL; return y + 4; }
  // bloembakken voor de gevels (oude centra en winkelstraten)
  const area = areaAt(x, z);
  if (outer && ai % 7 === 3 && (area && (area.kind === 'oldtown' || area.kind === 'mixed'))) { col[y + 1] = B.FLOWERS; return y + 1; }
  return -1;
}
function tramZone(col, y, d, t1, t2, along) {
  col[y] = t1 === 1 || t2 === 1 ? B.METAL : t1 < 1 || t2 < 1 ? B.COBBLE : B.GRASS;
  if (d === 11 && along % 30 === 15) { col[y + 1] = B.POST; col[y + 2] = B.POST; col[y + 3] = B.POST; col[y + 4] = B.METAL; return y + 4; } // bovenleidingmast
  return y;
}

const deepTunnels = [];
function fillColumn(x, z, col, slope, ctx, h) {
  deepTunnels.length = 0;
  let t = fillColumnSurface(x, z, col, slope, ctx, h);
  if (busStopGrid().at(x, z).length) t = busShelter(x, z, col, t, Math.round(G + h));
  for (const [L, q, bed] of deepTunnels) {
    const by = Math.round(q.y), ad = q.d;
    if (ad <= bed) { col[by - 1] = B.CONCRETE; col[by] = ad < bed - 0.7 ? B.BALLAST : B.CONCRETE; for (let y = by + 1; y <= by + 6; y++) col[y] = 0; col[by + 7] = B.CONCRETE; col[by + 8] = B.CONCRETE; if (ad > bed - 1 && Math.round(q.s) % 24 === 0) col[by + 5] = B.LAMP; }
    else for (let y = by - 1; y <= by + 8; y++) col[y] = B.CONCRETE;
    t = Math.max(t, by + 8);
  }
  return ctx.metro && ctx.metro.length ? metroCarve(x, z, col, t, Math.round(G + h), ctx) : t;
}
// ---------- metro: tunnels, perronhallen en trappen naar de straat (onder de bestaande straten en gebouwen) ----------
const M_PIN = TRACK + 2.2, M_POUT = M_PIN + 4.2, M_STAIR = 4; // perron 4,2 m breed, trap 4 m breed
const METRO_PAINT = { M1: B.PAINT_RED, M2: B.PAINT_BLUE, M3: B.PAINT_YELLOW, M4: B.PAINT_GREEN, M5: B.PAINT_GREEN, M6: B.PAINT_BLACK, M7: B.PAINT_RED, M8: B.PAINT_BLUE, M9: B.PAINT_ORANGE, M10: B.PAINT_WHITE };
function metroCarve(x, z, col, t, top, ctx) {
  for (const L of ctx.metro) {
    const q = L.near(x, z, M_POUT + 1.4 + M_STAIR + 1); if (!q) continue;
    const by = Math.round(q.y), ad = q.d, st = L.stationAt(q.s);
    if (!st) {
      if (ad > BED + 1.2) continue;
      if (ad <= BED) { col[by - 1] = B.CONCRETE; col[by] = ad < BED - 0.7 ? B.BALLAST : B.CONCRETE; for (let y = by + 1; y <= by + 6; y++) col[y] = 0; if (ad > BED - 1 && Math.round(q.s) % 24 === 0) col[by + 5] = B.LAMP; col[by + 7] = B.CONCRETE; }
      else for (let y = by - 1; y <= by + 7; y++) col[y] = B.CONCRETE;
      t = Math.max(t, by + 7); continue;
    }
    const mid = (st.s0 + st.s1) / 2, sdir = metroStair(L, st, q.sd > 0 ? 1 : -1), u = sdir ? sdir * (q.s - (mid - sdir * 8)) : -99, paint = METRO_PAINT[L.id] || B.PAINT_BLUE;
    if (ad <= BED) { // sporen in de hal
      col[by - 1] = B.CONCRETE; col[by] = ad < BED - 0.7 ? B.BALLAST : B.CONCRETE; for (let y = by + 1; y <= by + 7; y++) col[y] = 0; col[by + 8] = B.CONCRETE;
    } else if (ad <= M_POUT + 0.4) { // zijperron
      col[by - 1] = B.CONCRETE; col[by] = B.CONCRETE;
      col[by + 1] = ad < M_PIN + 0.6 ? B.LINE_WHITE : ad < M_PIN + 1.2 ? B.LINE_YELLOW : B.TILE;
      for (let y = by + 2; y <= by + 7; y++) col[y] = 0;
      col[by + 8] = Math.abs(ad - (M_PIN + 2.2)) < 0.5 && Math.round(q.s) % 6 === 0 ? B.LAMP : B.PANEL_WHITE;
      if (Math.abs(ad - (M_PIN + 2.2)) < 0.5 && Math.round(q.s) % 40 === 20) { col[by + 2] = B.POST; col[by + 3] = paint; col[by + 4] = paint; } // vertrekbord in de lijnkleur
      if (Math.abs(ad - (M_POUT - 0.6)) < 0.5 && Math.round(q.s) % 14 === 7 && Math.abs(u + 1.5) > 4) col[by + 2] = B.DARK_PLANKS; // bank
    } else if (ad <= M_POUT + 1.4) { // wand met een band in de lijnkleur en een doorgang naar de trap
      for (let y = by - 1; y <= by + 8; y++) col[y] = y === by + 4 ? paint : y === by + 5 && Math.round(q.s) % 12 === 0 ? B.PAINT_WHITE : B.TILE;
      if (u >= -3 && u < 0) for (let y = by + 2; y <= by + 5; y++) col[y] = 0;
    } else if (ad <= M_POUT + 1.4 + M_STAIR) { // trap (helling 1 op 1,5, met roltrapband aan de wandkant) van het perron naar de straat
      if (u < -3 || u > (top - by) * 1.5 + 3) { if (u >= -4 && u <= (top - by) * 1.5 + 4) for (let y = by - 1; y <= Math.min(top - 1, by + Math.max(0, u / 1.5) + 6); y++) if (!col[y] || y <= by + 1) col[y] = B.CONCRETE; continue; }
      const fy = by + 1 + Math.max(0, Math.floor(u / 1.5)), lane = ad - (M_POUT + 1.4);
      if (fy > top + 1) continue;
      col[fy - 1] = B.CONCRETE; col[fy] = lane < 1.2 ? B.METAL : B.TILE;
      for (let y = fy + 1; y <= fy + 4; y++) col[y] = 0;
      if (fy + 5 < top) col[fy + 5] = B.CONCRETE;
      else { for (let y = fy + 5; y <= top + 4; y++) col[y] = 0; col[Math.max(fy + 5, top + 4)] = Math.round(u) % 6 === 0 ? paint : B.GLASS; t = Math.max(t, Math.max(fy + 5, top + 4)); } // ingang met glazen luifel
      t = Math.max(t, fy);
    } else if (u >= -4 && u <= (top - by) * 1.5 + 4) { for (let y = by - 1; y <= Math.min(top - 1, by + Math.max(0, u / 1.5) + 6); y++) if (!col[y] || y <= by + 1) col[y] = B.CONCRETE; } // buitenwand van de trap
    t = Math.max(t, by + 8);
  }
  return t;
}
function fillColumnSurface(x, z, col, slope, ctx, h) {
  treeKind = 0;
  const top = Math.round(G + h);
  col[0] = B.BEDROCK;
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  // spoor en wegen eerst (ook bruggen en viaducten over water); daaronder vult het water aan
  const water = (top <= G - 1) ? G - 1 : -1;
  { const rc = railColumnAll(x, z, col, top, ctx); if (rc >= 0) {
    if (water > 0) for (let y = Math.max(1, top + 1); y <= water; y++) if (!col[y]) col[y] = B.WATER;
    let t = Math.max(rc, water);
    // Munkbay Central: ondergrondse doorgang met trappen naar de perrons en de pleinen
    t = Math.max(t, centralPassage(x, z, col, ctx));
    // straat over of onder het spoor (stadsstraten)
    { const u = urbanAt(x, z); if (u && u.dens > 0.12) { const st = streetAt(x, z, u); if (st.street) { const r = streetRail(x, z, st, u);
      if (r && r.type === 'brug' && r.a < r.reach) t = Math.max(t, streetColumn(st, u, x, z, col, top));
      if (r && r.type === 'onder' && r.a <= r.half + 2) { const keep = col.slice(top + 6, rc + 2); streetColumn(st, u, x, z, col, top); col.set(keep, top + 6); }
    } } }
    // weg onder een viaduct door: het wegdek onder het brugdek
    { const rq = roadNear(x, z, 16); if (rq && rq.d <= rq.R.hw + 5.5 && Math.round(rq.y) - 1 < rc - 6) { const keep = col.slice(Math.round(rq.y) + 4, rc + 2); const rd = roadColumn(x, z, col, top); if (rd >= 0) { col.set(keep, Math.round(rq.y) + 4); } } }
    const dk = deckAbove(x, z, t); return dk > 0 ? Math.max(t, bridgeDeck(x, z, col, t, dk, true)) : t; } }
  let deckY = -1;
  { const rd = roadColumn(x, z, col, top); if (rd >= 0) { if (water > 0) for (let y = Math.max(1, top + 1); y <= water; y++) if (!col[y]) col[y] = B.WATER; return Math.max(rd, water); } if (rd <= -2) deckY = -2 - rd; }
  if (deckY > 0) { const t = fillColumnBelow(x, z, col, slope, ctx, h, top); return Math.max(t, bridgeDeck(x, z, col, Math.max(t, top), deckY)); }
  return fillColumnBelow(x, z, col, slope, ctx, h, top);
}
// alles behalve spoor en wegen (ook onder een brug)
function fillColumnBelow(x, z, col, slope, ctx, h, top) {
  { const hb = harbourAt(x, z); if (hb && Math.abs(hb.a) <= 450 && hb.n <= 180) return harbourColumn(hb, x, z, col, top); }
  if (Math.abs(x - TRACK_Z.x) <= TRACK_Z.hx && Math.abs(z - TRACK_Z.z) <= TRACK_Z.hz) return trackColumn(x, z, col, top);
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
  // kabelbanen: stations en masten
  { const lc = liftColumn(liftGrid, x, z, col, top); if (lc >= 0) return lc; }
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
      if (lot.b && x >= lot.b.x0 - 1 && x <= lot.b.x1 + 1 && z >= lot.b.z0 - 1 && z <= lot.b.z1 + 1) { const F = fitLot(lot.b, ctx.lots); if (F !== null) { const r = lot.b.fam ? archColumn(lot.b, F, x, z, col, top, interior) : (x >= lot.b.x0 && x <= lot.b.x1 && z >= lot.b.z0 && z <= lot.b.z1 ? buildingColumn(lot.b, F, x, z, col, top) : -1); if (r >= 0) return r; } }
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
    lines: lines.filter(L => !L.metro && !L.tram), metro: lines.filter(L => L.metro), lots: new Map(),
    bridgeOver: () => false,
    fitLandmark: (b) => { let f = lmFit.get(b.id); if (f === undefined) { let lo = 1e9, hi = -1e9; for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) { const hh = G + natural(x, z); lo = Math.min(lo, hh); hi = Math.max(hi, hh); } f = Math.round(Math.max(lo, Math.min(hi, G + natural((b.x0 + b.x1) / 2, b.z1 + 3)))); lmFit.set(b.id, f); } return f; },
    noTree: (x, z) => { if (roadNear(x, z, 12) || nearLift(x, z, 6)) return true; for (const L of lines) if (!L.metro && !L.tram && L.near(x, z, 12)) return true; return false; },
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
  for (let z = Z0 - 8; z <= Z0 + T + 8; z += 32) for (let x = X0 - 8; x <= X0 + T + 8; x += 32) for (const e of roadCell(x, z)) { const R = ROADS[e >> 15];
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
    // per rasterlijn: twee rijstroken (de breedte hangt af van laan of straat), stoepen aan beide kanten
    const lanePaths = (along, fixed, isX, busOnly = false) => {
      const plus = [], minus = [], w1 = [], w2 = [], avn = [];
      for (let a = along[0]; a <= along[1]; a += 8) {
        const px = isX ? fixed + 1 : a, pz = isX ? a : fixed + 1, u = urbanAt(px, pz);
        if (!u || u.dens <= 0.12) { for (const r of [plus, minus, w1, w2]) r.push([1e9, 1e9, 0]); avn.push(false); continue; }
        const st = streetAt(px, pz, u), hw = st.street ? st.hw : 12, [l1, l2] = streetLanes(hw);
        const P = (o) => { const x = isX ? fixed + o : a, z = isX ? a : fixed + o; return [x, z, Math.round(G + natural(x, z))]; };
        plus.push(P(isX ? l1 : l2)); minus.push(P(isX ? l2 : l1)); // rechts rijden w1.push(P(1)); w2.push(P(hw - 1)); avn.push(hw === AVENUE_W);
      }
      // lanen: hoofdwegen in de stad (daar rijden ook de stadsbussen)
      const major = avn.filter(Boolean).length > avn.length / 2;
      if (!busOnly) { clipPush(major ? 'carM' : 'car', plus); clipPush(major ? 'carM' : 'car', minus.reverse()); } // busbanen: daar rijden alleen de stadsbussen
      clipPush('walk', w1); clipPush('walk', w2);
    };
    for (let gx = Math.ceil((X0 - g.ox) / g.B); g.ox + gx * g.B < X0 + T; gx++) lanePaths([Z0 - 4, Z0 + T + 4], g.ox + gx * g.B, true, p === MUNK && BUS_BX.has(gx));
    for (let gz = Math.ceil((Z0 - g.oz) / g.B); g.oz + gz * g.B < Z0 + T; gz++) lanePaths([X0 - 4, X0 + T + 4], g.oz + gz * g.B, false);
    // verkeerslichten op de kruispunten van lanen en drukke straten (in een stad)
    if (p.kind === 'capital' || p.kind === 'city') for (let gx = Math.ceil((X0 - g.ox) / g.B); g.ox + gx * g.B < X0 + T; gx++) for (let gz = Math.ceil((Z0 - g.oz) / g.B); g.oz + gz * g.B < Z0 + T; gz++) {
      const ix = g.ox + gx * g.B + 6, iz = g.oz + gz * g.B + 6, u = urbanAt(ix, iz); if (!u || u.p !== p || u.dens < 0.45) continue;
      const av = ((gx % 4) + 4) % 4 === 0 || ((gz % 4) + 4) % 4 === 0; if (!av && u.dens < 0.7) continue;
      if (railGrid.at(ix, iz).some(sg => sg.L.near(ix, iz, 30))) continue;
      out.push({ type: 'signal', pts: new Float32Array([ix - X0, iz - Z0, Math.round(G + natural(ix, iz))]) });
    }
    // bushalte en tramhalte in het centrum
    if (p.x >= X0 && p.x < X0 + T && p.z >= Z0 && p.z < Z0 + T) out.push({ type: 'busstop', name: p.name, pts: new Float32Array([p.x - X0 + 6, p.z - Z0 + 6, groundAt(p.x + 6, p.z + 6)]) });
  }
  // Zenvo-testterrein: testauto's rijden rondjes (beide rijstroken in dezelfde richting)
  if (Math.abs(X0 + T / 2 - TRACK_Z.x) < TRACK_Z.hx + T && Math.abs(Z0 + T / 2 - TRACK_Z.z) < TRACK_Z.hz + T) for (const off of [-3, 3]) {
    const pts = [], S2 = TRACK_Z.straight, R = TRACK_Z.r + off, y = Math.round(G + TRACK_Z.h);
    for (let x = -S2; x <= S2; x += 8) pts.push([TRACK_Z.x + x, TRACK_Z.z - R, y]);
    for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 8 / R) pts.push([TRACK_Z.x + S2 + Math.cos(a) * R, TRACK_Z.z + Math.sin(a) * R, y]);
    for (let x = S2; x >= -S2; x -= 8) pts.push([TRACK_Z.x + x, TRACK_Z.z + R, y]);
    for (let a = Math.PI / 2; a <= Math.PI * 1.5; a += 8 / R) pts.push([TRACK_Z.x - S2 + Math.cos(a) * R, TRACK_Z.z + Math.sin(a) * R, y]);
    pts.push(pts[0]);
    clipPush('car', pts);
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
  for (const L of lines) if (!L.metro && !L.tram) for (const [a, b] of L.tunnels) {
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
  for (const L of liftGrid.at(x, z)) { const [u, v] = liftUV(L, x, z); if (Math.abs(v) < L.stW + 2 && (Math.abs(u) < L.stL + 2 || Math.abs(u - L.len) < L.stL + 2)) return `${L.name} · ${Math.abs(u) < L.stL + 2 ? 'dalstation' : L.top}`; }
  if (Math.abs(x - TRACK_Z.x) <= TRACK_Z.hx && Math.abs(z - TRACK_Z.z) <= TRACK_Z.hz) return `${TRACK_Z.name} · Riverside`;
  { const hb = harbourAt(x, z); if (hb && Math.abs(hb.a) <= 450 && hb.n >= -120 && hb.n <= 180) return `${hb.H.name} · ${hb.a < -170 ? 'containerterminal' : hb.a < 60 ? 'ferry- en cruiseterminal' : hb.a < 260 ? 'scheepswerf' : 'jachthaven'}`; }
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
  const ctx = { lines: lines.filter(L => !L.metro && !L.tram), metro: lines.filter(L => L.metro), lots: cache, bridgeOver: () => false, fitLandmark: () => null, noTree: () => true };
  const col = new Uint8Array(3200), h = natural(x, z), sl = Math.max(Math.abs(natural(x + 1, z) - h), Math.abs(natural(x, z + 1) - h));
  const top = fillColumn(x, z, col, sl, ctx, h);
  return { col, top };
}

// voor tools/plan-tram.mjs: kan hier een tram over de laan rijden? (laan in de stad, geen water, landmark, luchthaven of spoor op straatniveau)
export function _tramSpot(x, z) {
  const u = urbanAt(x, z); if (!u || u.dens <= 0.45 || u.p.kind !== 'capital') return null;
  const area = areaAt(x, z); if (area && (area.kind === 'beach' || area.kind === 'airport')) return null;
  if (coastDist(x, z) < 40 || riverAt(x, z) || lakeAt(x, z) || inAirport(x, z)) return null;
  const st = streetAt(x, z, u); if (!st.street) return null;
  { const gg = gridFor(u.p), bx = Math.floor((x - gg.ox) / gg.B), bz = Math.floor((z - gg.oz) / gg.B), fx = x - gg.ox - bx * gg.B, fz = z - gg.oz - bz * gg.B;
    const onX = ((bx % 4) + 4) % 4 === 0 && fx < AVENUE_W, onZ = ((bz % 4) + 4) % 4 === 0 && fz < AVENUE_W; if (!onX && !onZ) return null; } // in een laan (ook op een kruispunt met een zijstraat)
  for (const b of bldGrid.at(x, z)) if (x >= b.x0 - 3 && x <= b.x1 + 3 && z >= b.z0 - 3 && z <= b.z1 + 3) return null;
  const y = Math.round(G + natural(x, z));
  for (const L of LINES) if (!L.metro && !L.tram) { const q = L.near(x, z, 16); if (q && (q.kind !== 1 || q.y > y - 12) && (q.kind !== 2 || q.y < y + 9)) return null; }
  return { y, p: u.p };
}
export { gridFor as _gridFor, areaAt as _areaAt };

// ---------- bussen (fase 5): echte buslijnen met haltes en een dienstregeling ----------
// Streek-, snel- en bergbussen rijden over het nationale wegennet (kortste route), stadsbussen en de luchthavenshuttle
// over de straten van Munkbay. Lijnnummers, routes, haltes en frequenties zijn een voorstel (geen canon).
const BUS_REGIONAL = [
  { id: 'X10', kind: 'express', from: 'Munkbay', to: 'Viridonia', h: 1800 },
  { id: 'X20', kind: 'express', from: 'Westport', to: 'Rainforest City', h: 3600 },
  { id: 'R31', kind: 'regional', from: 'Munkbay', to: 'Easthaven', h: 1800 },
  { id: 'R32', kind: 'regional', from: 'Munkbay', to: 'Southbay', h: 3600 },
  { id: 'R41', kind: 'regional', from: 'Riverside', to: 'Northfield', h: 3600 },
  { id: 'R42', kind: 'regional', from: 'Westport', to: 'Northcliff', h: 3600 },
  { id: 'R43', kind: 'regional', from: 'Greenport', to: 'Southbay', h: 3600 },
  { id: 'R44', kind: 'regional', from: 'Black Point', to: 'Northcliff', h: 3600 },
  { id: 'B60', kind: 'mountain', from: 'Viridonia', to: 'Silverpine', h: 3600 },
];
const BUS_COLOR = { city: '#2a9d4b', express: '#1f6fd1', regional: '#e3b712', mountain: '#c0392b', airport: '#13a6a6', night: '#333a48' };
function roadPath(from, to, kind) {
  // Dijkstra over de wegen (knopen = plaatsnamen); snelbussen verkiezen snelwegen
  const adj = new Map(), add = (a, e) => { let l = adj.get(a); if (!l) adj.set(a, l = []); l.push(e); };
  for (const R of ROADS) { if (R.name) continue; const w = R.s[R.n - 1] * (kind === 'express' && R.kind === 'A' ? 0.6 : kind === 'express' && R.kind === 'L' ? 1.4 : 1); add(R.a, { R, to: R.b, w, fwd: true }); add(R.b, { R, to: R.a, w, fwd: false }); }
  const dist = new Map([[from, 0]]), prev = new Map(), todo = new Set([from]);
  while (todo.size) {
    let u = null; for (const v of todo) if (u === null || dist.get(v) < dist.get(u)) u = v;
    todo.delete(u); if (u === to) break;
    for (const e of adj.get(u) || []) { const d = dist.get(u) + e.w; if (d < (dist.get(e.to) ?? 1e18)) { dist.set(e.to, d); prev.set(e.to, { from: u, e }); todo.add(e.to); } }
  }
  if (!prev.has(to)) return null;
  const segs = []; for (let v = to; v !== from; v = prev.get(v).from) segs.unshift(prev.get(v).e);
  const pts = [], lane = [], ys = [];
  for (const { R, fwd } of segs) {
    const off = R.kind === 'A' ? 5.5 : R.hw / 2;
    for (let j = 0; j < R.n; j += 2) { const k = fwd ? j : R.n - 1 - j; if (pts.length && Math.hypot(R.x[k] - pts[pts.length - 1][0], R.z[k] - pts[pts.length - 1][1]) < 4) continue; pts.push([R.x[k], R.z[k]]); lane.push(off); ys.push(R.y[k] - 1); }
  }
  return { pts, lane, ys, via: segs.map(e => e.to) };
}
function busLineFrom(id, name, kind, pts, ys, lane, stops) {
  const plan = { name, color: BUS_COLOR[kind], vmax: kind === 'express' ? 25 : kind === 'city' || kind === 'airport' || kind === 'night' ? 13 : 19, rmin: 20, bus: true, canon: false, via: stops.map(st => ({ name: st.name, x: st.x, z: st.z, len: st.len || 30 })) };
  const L = new RLine(id, plan, pts, () => 0, null);
  L.bus = kind; L.metro = false; L.tram = false; L.international = null;
  // hoogte en rijstrook: van het dichtste punt van het tracé
  const near = new Grid(64); pts.forEach((p, i) => near.add(i, p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1));
  const idxAt = (x, z) => { let b = 0, bd = 1e18; for (let r = 0; r <= 1; r++) for (const dz of [-64, 0, 64]) for (const dx of [-64, 0, 64]) for (const i of near.at(x + dx, z + dz)) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const laneArr = new Float32Array(L.n);
  for (let i = 0; i < L.n; i++) { const k = idxAt(L.x[i], L.z[i]); laneArr[i] = lane[k]; if (kind === 'city') { L.y[i] = ys[k]; continue; } const q = roadNear(L.x[i], L.z[i], 12); L.y[i] = q ? q.y - 1 : ys[k]; if (q) laneArr[i] = q.R.kind === 'A' ? 5.5 : q.R.hw / 2; } // precies het wegdek en de rijstrook van de weg waarop de bus rijdt
  L.track = undefined; L.trackAt = (s) => laneArr[L.idx(s)];
  L.findStations();
  for (const st of L.stations) st.y = Math.round(L.at(st.s).y);
  L.kind.fill(0); L.tunnels = []; L.viaducts = [];
  L.buildGrid();
  return L;
}
function stopsAlong(pts, minGap) {
  // haltes: in elke plaats waar de route doorheen komt (benoemde plaatsen: busstation)
  const cand = [];
  let s = 0; const S = [0]; for (let i = 1; i < pts.length; i++) S.push(s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const best = new Map();
  for (let i = 0; i < pts.length; i++) for (const p of placeGrid.at(pts[i][0], pts[i][1])) { const d = Math.hypot(pts[i][0] - p.x, pts[i][1] - p.z); const b = best.get(p); if (!b || d < b.d) best.set(p, { d, i }); }
  for (const [p, { d: bd, i: bi }] of best) {
    if (bd > Math.max(160, p.r * 0.6)) continue;
    cand.push({ s: S[bi], i: bi, name: p.named ? `${p.name} Busstation` : p.name, x: pts[bi][0], z: pts[bi][1], named: p.named, len: p.named ? 40 : 30 });
  }
  cand.sort((a, b) => a.s - b.s);
  const out = [];
  for (const c of cand) { if (out.length && c.s - out[out.length - 1].s < minGap) { if (c.named && !out[out.length - 1].named) out[out.length - 1] = c; continue; } out.push(c); }
  return out;
}
// stadsbussen: over de gewone straten (12 m) van Munkbay, rechte lijnen (zelfde controles als de tram)
const CROSS_NAMES = ['Lindeplein', 'Eikhof', 'Beukenhof', 'Rozenplein', 'Marktplein', 'Kerkplein', 'Stadhuisplein', 'Schoolplein', 'Molenplein', 'Visserskaai', 'Brouwershof', 'Smidsplein', 'Torenplein', 'Poortplein', 'Ankerplein', 'Bloemenhof', 'Zonneplein', 'Maanhof', 'Sterrenplein', 'Valkenhof', 'Vossenhof', 'Reigerplein', 'Zwanenhof', 'Meeuwenplein', 'Kievitshof', 'Leeuwerikplein', 'Wrenhof', 'Hazelhof', 'Esdoornplein', 'Kastanjehof'];
function busSpot(x, z) {
  const u = urbanAt(x, z); if (!u || u.p !== MUNK || u.dens <= 0.12) return null;
  if (coastDist(x, z) < 40 || riverAt(x, z) || lakeAt(x, z) || inAirport(x, z)) return null;
  const st = streetAt(x, z, u); if (!st.street) return null;
  for (const b of bldGrid.at(x, z)) if (x >= b.x0 - 3 && x <= b.x1 + 3 && z >= b.z0 - 3 && z <= b.z1 + 3) return null;
  const y = Math.round(G + natural(x, z));
  for (const L of LINES) if (!L.metro && !L.tram) { const q = L.near(x, z, 16); if (q && (q.kind !== 1 || q.y > y - 12) && (q.kind !== 2 || q.y < y + 9)) return null; }
  if (roadNear(x, z, 14)) return null;
  return y;
}
function cityRun(bx, z0, z1) {
  const g = gridFor(MUNK), x = g.ox + bx * g.B + 6, ys = [];
  let best = null, cur = null;
  for (let z = z0; z <= z1; z += 4) {
    const y = busSpot(x - 2, z) !== null && busSpot(x + 2, z) !== null ? busSpot(x, z) : null;
    const ok = y !== null && (!cur || (Math.abs(y - cur.ys[cur.ys.length - 1]) <= 1 && (cur.ys.length < 10 || Math.abs(y - cur.ys[cur.ys.length - 10]) <= 3)));
    if (!ok) { if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur; cur = null; if (y === null) continue; }
    if (!cur) cur = { x, a: z, b: z, ys: [] };
    cur.b = z; cur.ys.push(y);
  }
  if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur;
  return best;
}
export function _cityBusRun(bx, z0, z1) { return cityRun(bx, z0, z1); }
export const BUS_LINES = (() => {
  const out = [];
  for (const b of BUS_REGIONAL) {
    const r = roadPath(b.from, b.to, b.kind); if (!r) continue;
    const stops = stopsAlong(r.pts, 900);
    if (stops.length < 2) continue;
    // begin en einde: precies aan de eerste en laatste halte
    const i0 = stops[0].i, i1 = stops[stops.length - 1].i;
    const pts = r.pts.slice(Math.max(0, i0 - 3), i1 + 4), ys = r.ys.slice(Math.max(0, i0 - 3), i1 + 4), lane = r.lane.slice(Math.max(0, i0 - 3), i1 + 4);
    const name = `${b.id} ${b.from} – ${b.to}${b.kind === 'express' ? ' Express' : b.kind === 'mountain' ? ' Bergbus' : ''}`;
    const L = busLineFrom(b.id, name, b.kind, pts, ys, lane, stops);
    L.busH = b.h; out.push(L);
  }
  // stadslijnen: rechte straten noord-zuid, gekozen door tools/plan-bus.mjs (greenisland-buses.js)
  const g = gridFor(MUNK);
  CITY_BUS.forEach((r, n) => {
    const id = 'B' + (n + 1), x = g.ox + r.bx * g.B + 6, stops = [];
    for (let j = Math.ceil((r.a + 30 - g.oz - 66) / g.B); g.oz + j * g.B + 66 <= r.b - 30; j += 3) { const c = Math.floor(j / 3); stops.push({ name: `${r.street} / ${CROSS_NAMES[((c % CROSS_NAMES.length) + CROSS_NAMES.length) % CROSS_NAMES.length]}`, x, z: g.oz + j * g.B + 66 }); }
    if (stops.length < 2) return;
    const z0 = stops[0].z - 25, z1 = stops[stops.length - 1].z + 25, pts = [], ys = [], lane = [];
    for (let z = z0; z <= z1; z += 8) { pts.push([x, z]); ys.push(Math.round(G + natural(x, z))); lane.push(2); }
    const L = busLineFrom(id, r.airport ? `${id} Airport Shuttle` : `${id} Munkbay ${r.street}`, r.airport ? 'airport' : 'city', pts, ys, lane, stops);
    L.busH = 600; L.airport = !!r.airport; out.push(L);
  });
  return out;
})();

// bushaltes: wachthuisje aan beide kanten van de weg (streek: voorbij het fietspad, stad: op de stoep); busstations met een lange luifel
let _busStops = null;
function busStopGrid() {
  if (_busStops) return _busStops;
  _busStops = new Grid(64);
  for (const L of BUS_LINES) for (const st of L.stations) {
    const p = L.at(st.s), city = L.bus === 'city', hwR = city ? 0 : (roadNear(p.x, p.z, 20)?.R.hw ?? 4);
    const big = st.name.endsWith('Busstation'), half = big ? 11 : 5, c0 = city ? 4.2 : hwR + 5, c1 = c0 + 2.2;
    for (const side of [1, -1]) {
      const e = { x: p.x, z: p.z, tx: p.tx, tz: p.tz, side, half, c0, c1, big, color: city ? B.GLASS_GREEN : L.bus === 'express' ? B.PAINT_BLUE : L.bus === 'mountain' ? B.PAINT_RED : B.PAINT_YELLOW };
      const cx = p.x - p.tz * (c0 + 1) * side, cz = p.z + p.tx * (c0 + 1) * side;
      _busStops.add(e, cx - half - 3, cz - half - 3, cx + half + 3, cz + half + 3);
    }
  }
  return _busStops;
}
function busShelter(x, z, col, t, top) {
  for (const e of busStopGrid().at(x, z)) {
    const dx = x + 0.5 - e.x, dz = z + 0.5 - e.z, a = dx * e.tx + dz * e.tz, c = (-dx * e.tz + dz * e.tx) * e.side;
    if (Math.abs(a) > e.half + 0.5 || c < e.c0 || c > e.c1) continue;
    if (t > top + 1) continue; // daar staat al iets (gebouw, boom): geen wachthuisje
    const y = top;
    col[y] = col[y] === B.ASPHALT || col[y] === B.LINE_WHITE ? col[y] : B.SIDEWALK;
    for (let k = y + 1; k <= y + 3; k++) col[k] = 0;
    if (Math.abs(a) > e.half - 0.5) { col[y + 1] = B.POST; col[y + 2] = B.POST; col[y + 3] = e.color; return Math.max(t, y + 3); } // haltepaal
    if (c > e.c1 - 0.6) { col[y + 1] = B.GLASS; col[y + 2] = B.GLASS; } // achterwand
    else if (Math.abs(a) % 4 < 2) col[y + 1] = B.DARK_PLANKS; // bank
    col[y + 3] = e.big ? B.METAL : e.color === B.GLASS_GREEN ? B.GLASS_GREEN : B.GLASS;
    return Math.max(t, y + 3);
  }
  return t;
}
export const _roadQ = (x, z) => roadNear(x, z, 30);

// een kolom van de haven
function harbourColumn(hb, x, z, col, top) {
  const { a, n } = hb, W = G - 1; // waterpeil
  const ai = Math.floor(a), ni = Math.floor(n), hsh = (p, q, k) => hash(p | 0, q | 0, k);
  // bekken: water, met een cruiseschip, een containerschip, steigers en bootjes
  if (n < -60) {
    for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.SAND;
    col[top] = B.GRAVEL; for (let y = top + 1; y <= W; y++) col[y] = B.WATER;
    let t = W;
    // portaalkraan: giek over het water
    if (a > -450 && a < -170 && ((ai % 90) + 90) % 90 < 3 && n > -95) { col[14 + 30] = B.PAINT_YELLOW; col[14 + 31] = B.PAINT_YELLOW; t = 14 + 31; }
    // containerschip aan de kade
    if (a > -440 && a < -190 && n > -100 && n < -66) { const edge = n < -97 || n > -69 || a < -437 || a > -193; for (let y = W - 6; y <= W + 4; y++) col[y] = y <= W + 1 ? (edge ? B.PAINT_BLUE : B.PAINT_BLACK) : edge ? B.PAINT_BLUE : 0; if (!edge) { const h2 = 1 + Math.floor(hsh(ai >> 3, ni >> 2, 711) * 4); for (let y = W + 2; y < W + 2 + h2 * 2; y++) col[y] = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_WHITE][Math.floor(hsh(ai >> 3, (ni >> 2) * 7 + (y >> 1), 712) * 5)]; t = Math.max(t, W + 1 + h2 * 2); } else t = Math.max(t, W + 4); if (a > -215 && !edge) { for (let y = W + 2; y <= W + 14; y++) col[y] = y % 3 === 0 ? B.GLASS : B.PAINT_WHITE; t = W + 14; } }
    // cruiseschip bij de terminal
    if (a > -150 && a < 30 && n > -112 && n < -70) { const edge = n < -109 || n > -73 || a < -147 || a > 27; for (let y = W - 7; y <= W + 3; y++) col[y] = edge ? B.PAINT_WHITE : y <= W ? B.PAINT_BLUE : 0; if (!edge) for (let y = W + 1; y <= W + 18; y++) col[y] = (y - W) % 3 === 0 ? B.PANEL_WHITE : B.GLASS_BLUE; col[W + 19] = B.PAINT_WHITE; if (Math.abs(a + 40) < 5 && Math.abs(n + 91) < 4) for (let y = W + 19; y <= W + 25; y++) col[y] = y > W + 23 ? B.PAINT_BLACK : B.PAINT_RED; t = Math.max(t, W + 25); }
    // jachthaven: hoofdsteiger, vingersteigers en bootjes
    if (a > 260 && a < 445) {
      if (n > -72 && n < -68) { col[W + 1] = B.PLANKS; t = Math.max(t, W + 1); }
      else if (n < -72 && n > -110 && ((ai % 12) + 12) % 12 < 2) { col[W + 1] = B.PLANKS; if (ni === -109 && ((ai % 12) + 12) % 12 === 0) { col[W + 2] = B.POST; t = W + 2; } else t = Math.max(t, W + 1); }
      else if (n < -74 && n > -106) { const slot = Math.floor(a / 12), s2 = ((a % 12) + 12) % 12; if (hsh(slot, 3, 713) < 0.7 && s2 > 3 && s2 < 10 && n < -78 && n > -102) { const cab = n > -95 && n < -86 && s2 > 4 && s2 < 9; col[W] = B.PAINT_WHITE; col[W + 1] = hsh(slot, 4, 714) < 0.5 ? B.PAINT_BLUE : B.PAINT_WHITE; if (cab) { col[W + 2] = B.GLASS; col[W + 3] = B.PAINT_WHITE; t = Math.max(t, W + 3); } else t = Math.max(t, W + 1); if (hsh(slot, 5, 715) < 0.4 && s2 === 6 && n > -92 && n < -89) { for (let y = W + 2; y <= W + 12; y++) col[y] = B.POST; t = W + 12; } } }
    }
    return t;
  }
  // haventerrein: betonnen kade (verstevigd tot op de bodem), kaderand met bolders
  for (let y = Math.max(1, top - 6); y < top; y++) col[y] = B.CONCRETE;
  for (let y = top + 1; y <= top + 40; y++) col[y] = 0;
  col[top] = B.CONCRETE;
  const y = top;
  if (n < -57) { if (((ai % 15) + 15) % 15 === 0) { col[y + 1] = B.PAINT_BLACK; return y + 1; } return y; } // bolders
  // containerterminal
  if (a < -170) {
    if (Math.abs(n + 52) < 0.7 || Math.abs(n + 30) < 0.7) col[y] = B.METAL; // kraanrails
    const ci = ((ai % 90) + 90) % 90;
    if (ci < 3 && n > -95 && n < -18) { // portaalkraan
      const leg = Math.abs(n + 52) < 1.5 || Math.abs(n + 30) < 1.5;
      if (leg) { for (let k = y + 1; k <= y + 31; k++) col[k] = B.PAINT_YELLOW; return y + 31; }
      col[y + 30] = B.PAINT_YELLOW; col[y + 31] = B.PAINT_YELLOW;
      if (n > -46 && n < -36 && ci === 1) { col[y + 27] = B.GLASS; col[y + 28] = B.PAINT_YELLOW; col[y + 29] = B.PAINT_YELLOW; }
      return y + 31;
    }
    if (n > -10 && n < 150) { // containerstapels (2,5 × 12 m, tot vier hoog), rijpaden ertussen
      const rowN = Math.floor((n + 10) / 9), inN = ((n + 10) % 9 + 9) % 9, colA = Math.floor(a / 14), inA = ((a % 14) + 14) % 14;
      if (inN < 6 && inA < 12) { const hgt = 1 + Math.floor(hsh(rowN, colA, 716) * 4), c = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_WHITE, B.METAL]; for (let k = 1; k <= hgt * 2.5; k++) col[y + k] = c[Math.floor(hsh(rowN * 5 + Math.floor((k - 1) / 2.5), colA, 717) * c.length)]; return y + Math.floor(hgt * 2.5); }
      col[y] = B.ASPHALT; return y;
    }
    if (n >= 150 && n < 175 && ((ai % 60) + 60) % 60 < 40) { for (let k = y + 1; k <= y + 8; k++) col[k] = k === y + 8 ? B.PANEL_DARK : (ai % 4 === 0 ? B.METAL : B.PANEL_WHITE); return y + 8; } // loodsen
    return y;
  }
  // ferry- en cruiseterminal met loopbrug
  if (a < 60) {
    if (n > 40 && n < 140 && a > -150 && a < 40) {
      const wall = n < 41 || n > 139 || a < -149 || a > 39, door = wall && n < 41 && Math.abs(((ai % 30) + 30) % 30 - 15) < 2;
      if (door) { for (let k = y + 1; k <= y + 3; k++) col[k] = k === y + 3 ? B.DOOR_GLASS : B.DOOR_GLASS; col[y + 12] = B.GLASS_GREEN; return y + 12; }
      if (wall) { for (let k = y + 1; k <= y + 12; k++) col[k] = k % 4 === 0 ? B.PANEL_WHITE : B.GLASS_BLUE; return y + 12; }
      col[y] = B.MARBLE; col[y + 12] = ai % 9 === 0 && ni % 9 === 0 ? B.LAMP : B.GLASS_GREEN;
      if (ni % 10 === 5 && ai % 6 === 0) col[y + 1] = B.DARK_PLANKS; // wachtbanken
      if (n > 120 && Math.abs(a + 55) < 12 && n < 125) { col[y + 1] = B.PANEL_DARK; } // balie
      return y + 12;
    }
    if (a > -60 && a < -40 && n > -72 && n <= 40) { for (let k = y + 1; k <= y + 5; k++) col[k] = 0; col[y + 5] = B.GLASS; if (Math.abs(a + 50) > 7) col[y + 6] = B.GLASS_GREEN; col[y + 6] = B.GLASS_GREEN; return y + 6; } // overdekte loopbrug
    return y;
  }
  // scheepswerf: droogdok met schip in aanbouw en een grote portaalkraan, loodsen
  if (a < 260) {
    if (a > 90 && a < 230 && n > -60 && n < 60) {
      const wall = a < 92 || a > 228 || n > 58;
      const floor = G - 9;
      if (wall) { for (let k = floor; k <= y; k++) col[k] = B.CONCRETE; return y; }
      for (let k = floor; k <= y + 40; k++) col[k] = 0;
      col[floor] = B.CONCRETE;
      let t = floor;
      if (n > -40 && n < 40 && a > 110 && a < 210) { // romp in aanbouw (stalen platen, deels open)
        const w = 18 * Math.sqrt(Math.max(0, 1 - ((a - 160) / 52) ** 2));
        if (Math.abs(n) < w) { const edge = Math.abs(n) > w - 1.5; for (let k = floor + 1; k <= floor + 16; k++) if (edge || k === floor + 1 || k === floor + 16 && a < 180) col[k] = (a | 0) % 9 < 6 ? B.PAINT_RED : B.METAL; t = floor + 16; }
      }
      if (((ai % 70) + 70) % 70 < 3) { col[y + 40] = B.PAINT_ORANGE; col[y + 41] = B.PAINT_ORANGE; t = y + 41; } // brug van de portaalkraan
      return t;
    }
    if (a > 90 && a < 230 && (Math.abs(n + 62) < 2 || Math.abs(n - 64) < 2) && ((ai % 70) + 70) % 70 < 3) { for (let k = y + 1; k <= y + 41; k++) col[k] = B.PAINT_ORANGE; return y + 41; } // poten van de kraan
    if (n > 80 && n < 170 && a > 80) { const wall = n < 81 || n > 169 || a < 81 || a > 258; if (wall) { const door = n < 81 && ((ai % 40) + 40) % 40 < 8; for (let k = y + 1; k <= y + 16; k++) col[k] = door && k < y + 12 ? 0 : B.PANEL_DARK; return y + 16; } col[y + 16] = ai % 11 === 0 && ni % 11 === 0 ? B.LAMP : B.PANEL_DARK; return y + 16; }
    return y;
  }
  // jachthaven: clubhuis en botenhelling
  if (n > 40 && n < 90 && a > 300 && a < 360) { const wall = n < 41 || n > 89 || a < 301 || a > 359; if (wall) { const door = n < 41 && Math.abs(a - 330) < 2; for (let k = y + 1; k <= y + 6; k++) col[k] = door && k <= y + 2 ? (k === y + 1 ? B.DOOR : B.DOOR_TOP) : k % 3 === 0 ? B.PLANKS : B.GLASS; col[y + 7] = B.ROOF_RED; return y + 7; } col[y] = B.PLANKS; col[y + 7] = B.ROOF_RED; if (ni % 6 === 0 && ai % 5 === 0) col[y + 1] = B.DARK_PLANKS; return y + 7; }
  if (n < -40 && a > 270 && a < 280) { col[y] = B.CONCRETE; return y; }
  col[y] = (ai + ni) % 23 === 0 ? B.COBBLE : B.CONCRETE;
  return y;
}

// een kolom van het testterrein
function trackColumn(x, z, col, top) {
  const t = trackDist(x, z), y = top, W = TRACK_Z.w;
  for (let k = Math.max(1, y - 3); k < y; k++) col[k] = B.DIRT;
  for (let k = y + 1; k <= y + 12; k++) col[k] = 0;
  const edgeX = Math.abs(t.lx) >= TRACK_Z.hx - 1 || Math.abs(t.lz) >= TRACK_Z.hz - 1;
  if (edgeX) { col[y] = B.GRASS; col[y + 1] = B.POST; col[y + 2] = B.POST; if ((x + z) % 3 === 0) col[y + 3] = B.METAL; return y + 2; } // hek rondom
  if (t.d < W) { // baan: asfalt, witte randlijnen, start-finish in blokjes
    col[y] = t.d >= W - 1 ? B.LINE_WHITE : B.ASPHALT;
    if (!t.turn && t.lz < 0 && Math.abs(t.lx) < 2) col[y] = (Math.floor(x) + Math.floor(z)) % 2 ? B.PAINT_BLACK : B.PAINT_WHITE;
    return y;
  }
  if (t.d < W + 1.8 && t.turn) { col[y] = (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? B.PAINT_RED : B.PAINT_WHITE; return y; } // curbs
  // tribune langs het rechte stuk aan de noordkant
  if (!t.turn && t.lz < -TRACK_Z.r - 14 && t.lz > -TRACK_Z.r - 40 && Math.abs(t.lx) < 120) {
    const step = Math.floor((-TRACK_Z.r - 14 - t.lz) / 2);
    for (let k = y; k <= y + step; k++) col[k] = B.CONCRETE;
    if (Math.floor(-TRACK_Z.r - 14 - t.lz) % 2 === 0) col[y + step + 1] = Math.abs(t.lx) % 4 < 3 ? B.PAINT_GREEN : 0;
    if (t.lz < -TRACK_Z.r - 38) { for (let k = y + step; k <= y + 18; k++) col[k] = B.PANEL_WHITE; return y + 18; }
    col[y + 18] = B.GLASS_GREEN; return y + 18; // overkapping
  }
  // pitgebouw binnen de ovaal, met boxen naar de baan
  if (!t.turn && t.lz > -TRACK_Z.r + 12 && t.lz < -TRACK_Z.r + 32 && Math.abs(t.lx) < 150) {
    const wall = t.lz > -TRACK_Z.r + 31 || Math.abs(t.lx) > 149, box = t.lz < -TRACK_Z.r + 13 && Math.floor(t.lx + 150) % 12 > 1;
    col[y] = B.CONCRETE;
    if (box) { col[y + 6] = B.PANEL_WHITE; return y + 6; }
    if (wall || t.lz < -TRACK_Z.r + 13) { for (let k = y + 1; k <= y + 6; k++) col[k] = k === y + 5 ? B.PAINT_GREEN : B.PANEL_WHITE; return y + 6; }
    if (Math.floor(t.lx + 150) % 12 === 0) { for (let k = y + 1; k <= y + 5; k++) col[k] = B.PANEL_WHITE; }
    if (Math.floor(t.lx + 150) % 12 === 6 && Math.floor(t.lz) % 7 === 0) { col[y + 1] = B.PAINT_GREEN; col[y + 2] = B.GLASS; } // auto in de box
    col[y + 6] = B.PANEL_WHITE; return y + 6;
  }
  col[y] = (t.d < W + 4) ? B.GRAVEL : B.GRASS;
  return y;
}
// voor de analyse- en controletools
export { urbanAt as _urbanAt, streetAt as _streetAt, lotAt as _lotAt, fitLot as _fitLot, roadNear as _roadNear };
export { streetRail as _streetRail };

// alle overwegen (nationale wegen en stadsstraten) voor de knipperlichten, slagbomen en het wachtende verkeer
export function levelCrossings() {
  const out = [];
  for (const R of ROADS) for (const c of R.xings) if (c.type === 'overweg') out.push({ x: c.x, z: c.z, y: Math.round(c.y) - 1, line: c.L.id, s: c.rs, ux: c.ux, uz: c.uz, hw: R.hw, al: Math.min(14, c.half + 1.5), kind: 'weg' });
  const seen = new Set();
  for (const L of RAILS) for (let i = 1; i < L.n; i++) {
    const x0 = L.x[i - 1], z0 = L.z[i - 1], x1 = L.x[i], z1 = L.z[i];
    const u = urbanAt(x1, z1); if (!u || u.dens <= 0.12) continue;
    const g = gridFor(u.p);
    for (const isX of [true, false]) {
      const o = isX ? g.ox : g.oz, a0 = isX ? x0 : z0, a1 = isX ? x1 : z1, k0 = Math.floor((a0 - o) / g.B), k1 = Math.floor((a1 - o) / g.B);
      if (k0 === k1) continue;
      const k = Math.max(k0, k1), line = o + k * g.B + 4, t = (line - a0) / ((a1 - a0) || 1), px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const st = streetAt(px, pz, u); if (!st.street || st.alongX === isX) continue;
      const r = streetRail(px, pz, st, u); if (!r || r.type !== 'overweg' || r.L !== L) continue;
      const key = L.id + ':' + Math.round(r.s); if (seen.has(key)) continue; seen.add(key);
      const c = isX ? g.ox + st.bx * g.B + st.hw / 2 : g.oz + st.bz * g.B + st.hw / 2, p = L.at(r.s);
      out.push({ x: isX ? c : p.x, z: isX ? p.z : c, y: Math.round(p.y), line: L.id, s: r.s, ux: isX ? 0 : 1, uz: isX ? 1 : 0, hw: st.hw / 2 - 1.5, al: Math.min(14, r.half + 1), kind: 'straat' });
    }
  }
  return out;
}
export { planOf as _planOf } from './greenisland-arch.js';
