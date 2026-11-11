// Greenisland: tracés van het spoornet en het wegennet zoeken (Dijkstra op een raster van 200 m over het ruwe landschap),
// afvlakken en vereenvoudigen. Schrijft js/greenisland-routes.js. Opnieuw draaien: node tools/plan-green.mjs
import { writeFileSync } from 'fs';
import { rawHeight, coastDist, riverAt } from '../js/greenisland-terrain.js';
import { LINE_PLAN, W, L as LEN } from '../js/greenisland-data.js';
import { ALL_PLACES } from '../js/greenisland-places.js';

const S = 200, NX = Math.ceil(W / S), NZ = Math.ceil(LEN / S);
const Hg = new Float32Array(NX * NZ), Mg = new Float32Array(NX * NZ), Rg = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = i * S + S / 2, z = j * S + S / 2, k = j * NX + i; Hg[k] = Math.max(0, rawHeight(x, z)); Mg[k] = coastDist(x, z); Rg[k] = riverAt(x, z) ? 1 : 0; }
let repel = new Uint8Array(NX * NZ);
class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }

function route(ax, az, bx, bz, opt) {
  const N = NX;
  const si = Math.round(ax / S - 0.5), sj = Math.round(az / S - 0.5), ti = Math.round(bx / S - 0.5), tj = Math.round(bz / S - 0.5);
  const dist = new Float32Array(NX * NZ).fill(Infinity), from = new Int32Array(NX * NZ).fill(-1);
  const h = new Heap(); dist[sj * N + si] = 0; h.push(0, sj * N + si);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  const tgt = tj * N + ti;
  while (h.size) {
    const [d, k] = h.pop();
    if (k === tgt) break;
    if (d > dist[k]) continue;
    const i = k % N, j = (k - i) / N;
    for (const [di, dj] of D) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      if (opt.box && (ni < opt.box[0] || ni > opt.box[2] || nj < opt.box[1] || nj > opt.box[3])) continue;
      // niet langs de verkeerde kant bij een station aankomen of vertrekken
      if (opt.block) { const x = ni * S + S / 2, z = nj * S + S / 2; let no = false; for (const b of opt.block) { const dx = x - b.p[0], dz = z - b.p[1]; const d2 = dx * dx + dz * dz; if (d2 < 1100 * 1100 && d2 > 120 * 120 && -(dx * b.u[0] + dz * b.u[1]) * b.sgn < 0.6 * Math.sqrt(d2)) no = true; } if (no) continue; }
      const nk = nj * N + ni, L = Math.hypot(di, dj) * S, dh = Hg[nk] - Hg[k];
      const slope = Math.abs(dh) / L;
      // klimmen kost veel (hellingen), hoog liggen ook een beetje; tunnels/viaducten worden later bepaald
      let c = L * (1 + opt.slopeK * slope * slope) + Math.abs(dh) * opt.climbK + L * Math.max(0, Hg[nk] - opt.ref) * 0.0012;
      if (repel[nk] && opt.repel) c *= 2.2; // niet bovenop een andere lijn
      if (Mg[nk] < 60) c = opt.sea ? c * 1.2 : c * 40 + 4000; // water: alleen onderzees (ICE) of met een brug
      if (Rg[nk]) c += opt.bridge || 600; // rivier oversteken: brug
      const nd = d + c;
      if (nd < dist[nk]) { dist[nk] = nd; from[nk] = k; h.push(nd, nk); }
    }
  }
  const pts = []; let k = tgt; while (k >= 0) { const i = k % N, j = (k - i) / N; pts.push([i * S + S / 2, j * S + S / 2]); k = from[k]; }
  pts.reverse(); pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz];
  return pts;
}
// golfjes eruit (spoor heeft ruime bochten nodig), begin en einde blijven vast
function smooth(p, it) {
  // eerst om de 50 m een punt
  const q = [p[0]];
  for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 50)); for (let k = 1; k <= n; k++) q.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  for (let t = 0; t < it; t++) for (let i = 2; i < q.length - 2; i++) q[i] = [(q[i - 1][0] + q[i][0] * 2 + q[i + 1][0]) / 4, (q[i - 1][1] + q[i][1] * 2 + q[i + 1][1]) / 4];
  return q;
}
// bochten ruimer: punten om de 20 m, waar de straal te klein is het punt naar het midden van de buren schuiven.
// Stationsperrons (vaste punten) en de uiteinden blijven liggen.
function relax(p0, rmin, fixedSet) {
  const q = [], fixed = [];
  const p = []; for (const a of p0) { const l = p[p.length - 1]; if (!l || Math.hypot(a[0] - l[0], a[1] - l[1]) > 1) p.push(a); }
  for (let i = 0; i < p.length; i++) {
    const a = p[i], isF = fixedSet.has(a[0] + ',' + a[1]) || i === 0 || i === p.length - 1;
    if (i) { const b = p[i - 1], n = Math.max(1, Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) / 20)); const bothF = fixed[fixed.length - 1] && isF;
      for (let k = 1; k < n; k++) { q.push([b[0] + (a[0] - b[0]) * k / n, b[1] + (a[1] - b[1]) * k / n]); fixed.push(bothF); } }
    q.push([a[0], a[1]]); fixed.push(isF);
  }
  // 2 punten aan elk uiteinde vast (richting)
  for (const i of [1, q.length - 2]) if (i > 0 && i < q.length) fixed[i] = true;
  const radius = (a, b, c) => { const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]); const A2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return A2 < 1e-9 ? 1e9 : ab * bc * ca / (2 * A2); };
  let it = 0;
  for (; it < 20000; it++) {
    let bad = 0;
    for (let i = 1; i < q.length - 1; i++) {
      if (fixed[i] && fixed[i - 1] && fixed[i + 1]) continue;
      if (radius(q[i - 1], q[i], q[i + 1]) < rmin) {
        bad++;
        // knik op een vast punt (einde van een perron): de vrije buur op het verlengde van het perron trekken
        if (fixed[i] && fixed[i - 1] && !fixed[i + 1]) { const e = [2 * q[i][0] - q[i - 1][0], 2 * q[i][1] - q[i - 1][1]]; q[i + 1] = [(q[i + 1][0] + e[0]) / 2, (q[i + 1][1] + e[1]) / 2]; continue; }
        if (fixed[i] && fixed[i + 1] && !fixed[i - 1]) { const e = [2 * q[i][0] - q[i + 1][0], 2 * q[i][1] - q[i + 1][1]]; q[i - 1] = [(q[i - 1][0] + e[0]) / 2, (q[i - 1][1] + e[1]) / 2]; continue; }
        // het punt en zijn buren een beetje rechttrekken
        for (const j of [i - 2, i - 1, i, i + 1, i + 2]) if (j > 0 && j < q.length - 1 && !fixed[j]) q[j] = [(q[j - 1][0] + q[j][0] * 2 + q[j + 1][0]) / 4, (q[j - 1][1] + q[j][1] * 2 + q[j + 1][1]) / 4];
      }
    }
    if (!bad) break;
  }
  relax.report = (relax.report || 0) + (it >= 20000 ? 1 : 0);
  // gelijkmatig herbemonsteren is niet nodig; om de 40 m een punt bewaren (plus de vaste)
  const out = [];
  for (let i = 0; i < q.length; i++) if (fixed[i] || i % 2 === 0) out.push([Math.round(q[i][0] * 10) / 10, Math.round(q[i][1] * 10) / 10]);
  return out;
}
// Douglas-Peucker
function simplify(p, eps) {
  if (p.length < 3) return p;
  let md = 0, mi = 0; const [ax, az] = p[0], [bx, bz] = p[p.length - 1], L = Math.hypot(bx - ax, bz - az) || 1;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / L; if (d > md) { md = d; mi = i; } }
  if (md < eps) return [p[0], p[p.length - 1]];
  return [...simplify(p.slice(0, mi + 1), eps).slice(0, -1), ...simplify(p.slice(mi), eps)];
}

const box = (ax, az, bx, bz, m) => [Math.max(0, Math.floor((Math.min(ax, bx) - m) / S)), Math.max(0, Math.floor((Math.min(az, bz) - m) / S)), Math.min(NX - 1, Math.floor((Math.max(ax, bx) + m) / S)), Math.min(NZ - 1, Math.floor((Math.max(az, bz) + m) / S))];

// ---------- spoorlijnen ----------
const RAIL = {};
for (const [id, Lp] of Object.entries(LINE_PLAN)) {
  const opt = { slopeK: Lp.rack ? 4 : 25, climbK: Lp.rack ? 0.6 : 7, ref: Lp.ref ?? 300, repel: true, sea: !!Lp.international };
  Lp.via.forEach((v, k) => {
    if (v.dir !== undefined) return;
    const a = k > 0 ? [Lp.via[k - 1].x, Lp.via[k - 1].z] : [v.x, v.z], b = k < Lp.via.length - 1 ? [Lp.via[k + 1].x, Lp.via[k + 1].z] : [v.x, v.z];
    v.dir = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  });
  const pieces = Lp.via.map(v => { const r = v.dir * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r), h = v.len / 2; return { u: [ux, uz], entry: [v.x - ux * (h + 250), v.z - uz * (h + 250)], pts: [[v.x - ux * h, v.z - uz * h], [v.x + ux * h, v.z + uz * h]], exit: [v.x + ux * (h + 250), v.z + uz * (h + 250)] }; });
  const way = [], fixedSet = new Set(), R = (q) => [Math.round(q[0]), Math.round(q[1])];
  for (let k = 0; k < pieces.length; k++) {
    const P = pieces[k];
    if (k > 0) {
      const A = pieces[k - 1].exit, Bp = P.entry, block = [{ p: A, u: pieces[k - 1].u, sgn: -1 }, { p: Bp, u: P.u, sgn: 1 }];
      const r = simplify(smooth(route(A[0], A[1], Bp[0], Bp[1], { ...opt, block, box: box(A[0], A[1], Bp[0], Bp[1], 12000) }), Lp.rack ? 25 : 120), 30);
      way.push(...r.map(R));
    }
    for (const q of P.pts) fixedSet.add(R(q).join(','));
    if (k > 0) way.push(R(P.entry));
    way.push(...P.pts.map(R));
    if (k < pieces.length - 1) way.push(R(P.exit));
  }
  const relaxed = relax(way, Lp.rmin || 300, fixedSet);
  const clean = []; for (const q of relaxed) { const l = clean[clean.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) clean.push(q); }
  RAIL[id] = clean;
  for (const q of clean) { const i = Math.floor(q[0] / S), j = Math.floor(q[1] / S); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NZ) repel[b * NX + a] = 1; } }
  console.log('spoor', id, clean.length, 'punten', relax.report ? '(straal niet overal gehaald)' : ''); relax.report = 0;
}

// ---------- wegennet: minimale opspannende boom over alle plaatsen + snelwegen tussen de steden ----------
const P = ALL_PLACES;
const cls = (p) => p.kind === 'capital' || p.kind === 'city' ? 3 : p.kind === 'town' ? 2 : 1;
const edges = [];
{
  // Prim op de afstand (met een toeslag voor hoogteverschil)
  const inT = new Uint8Array(P.length), best = new Float64Array(P.length).fill(Infinity), par = new Int32Array(P.length).fill(-1);
  best[0] = 0;
  for (let it = 0; it < P.length; it++) {
    let u = -1; for (let i = 0; i < P.length; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
    inT[u] = 1; if (par[u] >= 0) edges.push([par[u], u]);
    for (let v = 0; v < P.length; v++) if (!inT[v]) { const d = Math.hypot(P[u].x - P[v].x, P[u].z - P[v].z) * (1 + Math.abs(rawHeight(P[u].x, P[u].z) - rawHeight(P[v].x, P[v].z)) / 400); if (d < best[v]) { best[v] = d; par[v] = u; } }
  }
  // extra verbindingen: elke stad/dorp met zijn twee dichtste buren (lussen, niet alleen een boom)
  for (let i = 0; i < P.length; i++) {
    const near = P.map((q, j) => [j, Math.hypot(q.x - P[i].x, q.z - P[i].z)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, cls(P[i]) >= 2 ? 3 : 2);
    for (const [j, d] of near) if (d < 9000 && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
  }
  // snelwegen tussen de grote steden
  const big = P.map((p, i) => [p, i]).filter(([p]) => cls(p) === 3);
  for (const [p, i] of big) { const n = big.filter(([q]) => q !== p).sort((a, b) => Math.hypot(a[0].x - p.x, a[0].z - p.z) - Math.hypot(b[0].x - p.x, b[0].z - p.z)).slice(0, 2); for (const [, j] of n) if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]); }
}
const ROADS = [];
let t0 = Date.now();
repel = new Uint8Array(NX * NZ);
for (const [i, j] of edges) {
  const a = P[i], b = P[j], c = Math.min(cls(a), cls(b)), kind = c === 3 ? 'A' : c === 2 ? 'N' : 'L';
  const opt = { slopeK: 18, climbK: 4, ref: 900, bridge: kind === 'A' ? 200 : 500 };
  const r = simplify(smooth(route(a.x, a.z, b.x, b.z, { ...opt, box: box(a.x, a.z, b.x, b.z, 6000) }), 20), 25).map(q => [Math.round(q[0]), Math.round(q[1])]);
  ROADS.push({ a: a.name, b: b.name, kind, pts: r });
}
console.log('wegen', ROADS.length, 'in', Math.round((Date.now() - t0) / 1000), 's ·', ROADS.reduce((n, r) => n + r.pts.length, 0), 'punten');
// ---------- zeeroutes rond het eiland ----------
const SEA = [];
for (const off of [-1600, -3200]) {
  const pts = [];
  for (let a = 0; a <= 720; a++) {
    const t = a / 720 * Math.PI * 2, cx = 72500, cz = 25500, ux = Math.cos(t) * 3.2, uz = Math.sin(t);
    let x = cx, z = cz;
    for (let r = 2000; r < 80000; r += 250) { x = cx + ux * r; z = cz + uz * r; if (x < 0 || x > W || z < 0 || z > LEN || coastDist(x, z) < off) break; }
    if (x > 400 && x < W - 400 && z > 400 && z < LEN - 400) pts.push([Math.round(x), Math.round(z)]);
  }
  SEA.push(pts);
}
writeFileSync(new URL('../js/greenisland-routes.js', import.meta.url), '// Gemaakt door tools/plan-green.mjs (tracés van spoor en wegen in Greenisland, wereldcoördinaten).\nexport const RAIL = ' + JSON.stringify(RAIL) + ';\nexport const ROADS = ' + JSON.stringify(ROADS) + ';\nexport const SEA = ' + JSON.stringify(SEA) + ';\n');
