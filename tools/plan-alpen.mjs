// Tracés van het Alpenspoornet zoeken: kortste weg door de dalen (Dijkstra op een raster van 100 m over het
// ruwe landschap), daarna vereenvoudigen. Schrijft js/alpen-routes.js. Opnieuw draaien: node tools/plan-alpen.mjs
import { writeFileSync } from 'fs';
import { rawHeight, OX, OZ, OLD } from '../js/alpen-terrain.js';
import { LINE_PLAN } from '../js/alpen-plan.js';

const S = 100, N = 500;
const Hg = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) Hg[j * N + i] = rawHeight(i * S + S / 2, j * S + S / 2);
let repel;
const inOld = (i, j) => { const x = i * S + S / 2, z = j * S + S / 2; return x > OX + 150 && z > OZ + 150 && x < OX + OLD - 150 && z < OZ + OLD - 150; };

class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }

function route(ax, az, bx, bz, opt) {
  const si = Math.round(ax / S - 0.5), sj = Math.round(az / S - 0.5), ti = Math.round(bx / S - 0.5), tj = Math.round(bz / S - 0.5);
  const dist = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
  const h = new Heap(); dist[sj * N + si] = 0; h.push(0, sj * N + si);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  const tgt = tj * N + ti;
  while (h.size) {
    const [d, k] = h.pop();
    if (k === tgt) break;
    if (d > dist[k]) continue;
    const i = k % N, j = (k - i) / N;
    for (const [di, dj] of D) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (inOld(ni, nj)) continue;
      // niet langs de verkeerde kant bij een station aankomen of vertrekken
      if (opt.block) { const x = ni * S + S / 2, z = nj * S + S / 2; let no = false; for (const b of opt.block) { const dx = x - b.p[0], dz = z - b.p[1]; const d2 = dx * dx + dz * dz; if (d2 < 1100 * 1100 && d2 > 120 * 120 && -(dx * b.u[0] + dz * b.u[1]) * b.sgn < 0.6 * Math.sqrt(d2)) no = true; } if (no) continue; }
      const nk = nj * N + ni, L = Math.hypot(di, dj) * S, dh = Hg[nk] - Hg[k];
      const slope = Math.abs(dh) / L;
      // klimmen kost veel (hellingen), hoog liggen ook een beetje; tunnels/viaducten worden later bepaald
      let c = L * (1 + opt.slopeK * slope * slope) + Math.abs(dh) * opt.climbK + L * Math.max(0, Hg[nk] - opt.ref) * 0.0012;
      if (repel[nk]) c *= 2.2; // niet bovenop een andere lijn
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
const out = {};
repel = new Float32Array(N * N);
for (const [id, L] of Object.entries(LINE_PLAN)) {
  const opt = { slopeK: L.rack ? 4 : 25, climbK: L.rack ? 0.6 : 7, ref: L.ref ?? 400 };
  // stations zonder richting: de richting van vorig naar volgend station
  const pos = (v) => v.old ? v.start : [v.x, v.z];
  const posEnd = (v) => v.old ? v.end : [v.x, v.z];
  L.via.forEach((v, k) => {
    if (v.old || v.dir !== undefined) return;
    const a = k > 0 ? posEnd(L.via[k - 1]) : [v.x, v.z], b = k < L.via.length - 1 ? pos(L.via[k + 1]) : [v.x, v.z];
    v.dir = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  });
  // vaste stukken: elk station (recht, met 250 m aanloop) en het oude spoor
  const pieces = L.via.map(v => {
    if (v.old) {
      const a = v.startDir * Math.PI / 180, b = v.endDir * Math.PI / 180;
      return { old: true, u: null, entry: [v.start[0] - Math.cos(a) * 600, v.start[1] - Math.sin(a) * 600], pts: [v.start], exit: [v.end[0] + Math.cos(b) * 600, v.end[1] + Math.sin(b) * 600], end: v.end };
    }
    const r = v.dir * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r), h = v.len / 2;
    return { u: [ux, uz], entry: [v.x - ux * (h + 250), v.z - uz * (h + 250)], pts: [[v.x - ux * h, v.z - uz * h], [v.x + ux * h, v.z + uz * h]], exit: [v.x + ux * (h + 250), v.z + uz * (h + 250)] };
  });
  const way = [];
  const fixedSet = new Set();
  const R = (q) => [Math.round(q[0]), Math.round(q[1])];
  for (let k = 0; k < pieces.length; k++) {
    const P = pieces[k];
    if (k > 0) {
      const A = pieces[k - 1].exit, Bp = P.entry;
      const ua = pieces[k - 1].u, ub = P.u;
      const block = [];
      if (ua) block.push({ p: A, u: ua, sgn: -1 });
      if (ub) block.push({ p: Bp, u: ub, sgn: 1 });
      const r = simplify(smooth(route(A[0], A[1], Bp[0], Bp[1], { ...opt, block }), L.rack ? 40 : 260), 30);
      way.push(...r.map(R));
    }
    if (P.old) {
      const v = L.via[k];
      for (const q of [P.entry, v.start, v.end, P.exit]) fixedSet.add(R(q).join(','));
      way.push(R(P.entry), R(v.start), 'old', R(v.end), R(P.exit)); continue;
    }
    // stations liggen vast (recht perron)
    for (const q of P.pts) fixedSet.add(R(q).join(','));
    if (k > 0) way.push(R(P.entry));
    way.push(...P.pts.map(R));
    if (k < pieces.length - 1) way.push(R(P.exit));
  }
  if (process.env.DBG === id) console.log(JSON.stringify(way.slice(0, 40)));
  // per stuk (tussen 'old'): om de 20 m een punt, bochten ruimer maken tot de minimale straal
  const relaxed = [];
  let seg = [];
  const flush = () => { if (seg.length) relaxed.push(...relax(seg, L.rmin || 300, fixedSet)); seg = []; };
  for (const q of way) { if (q === 'old') { flush(); relaxed.push('old'); } else seg.push(q); }
  flush();
  way.length = 0; way.push(...relaxed);
  // dubbele punten weg
  const clean = []; for (const q of way) { const l = clean[clean.length - 1]; if (q === 'old' || !l || l === 'old' || l[0] !== q[0] || l[1] !== q[1]) clean.push(q); }
  out[id] = clean;
  for (const q of clean) if (q !== 'old') { const i = Math.floor(q[0] / S), j = Math.floor(q[1] / S); for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < N && b < N) repel[b * N + a] = 1; } }
  console.log(id, clean.length, 'punten', relax.report ? 'straal niet overal gehaald' : '');
  relax.report = 0;
}
writeFileSync(new URL('../js/alpen-routes.js', import.meta.url), '// Gemaakt door tools/plan-alpen.mjs (tracés van het spoornet, in wereldcoördinaten).\nexport const ROUTES = ' + JSON.stringify(out) + ';\n');
