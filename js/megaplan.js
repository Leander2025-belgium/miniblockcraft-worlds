// Reisplanner van Megatower City (TERRANOVA 14.1: multimodaal). Netwerk: metro M1 (9 stations van Westpoort tot
// Luchthaven), de trein Megatower Centraal – Luchthaven, de trams T1–T4 in de middenberm van de tramlanen (haltes om de
// 384 m, zoals ze in de wereld staan: js/megacity.js) en wandelen (ook om over te stappen). Elke lijn rijdt volgens de
// dienstregeling van het speluur (js/service.js: interval en haltetijd per periode). De planner zoekt met een
// tijdsafhankelijke Dijkstra de vroegste aankomst: wachten op het eerstvolgende vertrek aan elke halte, blijven zitten
// op hetzelfde voertuig, en overstappen te voet (met 1 minuut overstaptijd).
// Bussen (TERRANOVA 14.2): vaste lijnen B1–B38 langs de buslanen (js/megacity.js), haltes om de 384 m; het verkeer laat
// de bussen op hun lijn rijden en aan beide kanten stoppen.
// Wat de kaart toont: de voertuigen van het verkeer rond de speler (echt, met rit en bezetting) en daarbuiten de
// voertuigen volgens deze dienstregeling.
import { periodOfHour, HEADWAY, DWELL, PERIOD_LABEL } from './service.js';
import { TRAM_X, TRAM_Z, TILES, avenueNS, avenueEW, zoneName, BUS_NS, BUS_EW, busLineNS, busLineEW } from './megacity.js';

const T = 128, METRO_Z = 40 * T, RAIL_Z = 47 * T;
const METRO = [[5, 'Westpoort'], [12, 'Parkzicht'], [24, 'Universiteit'], [32, 'Oude Markt'], [40, 'Megatower'], [48, 'Oostkade'], [56, 'Ziekenhuis'], [64, 'Fabriekshallen'], [70, 'Luchthaven']]
  .map(([tx, name]) => ({ id: 'M:' + name, name: 'Metro ' + name, line: 'M1', x: tx * T + 64, z: METRO_Z, kind: 'metro' }));
const RAIL = [{ id: 'T:Centraal', name: 'Station Megatower Centraal', line: 'IC', x: 38 * T + 64, z: RAIL_Z, kind: 'train' }, { id: 'T:Luchthaven', name: 'Station Luchthaven', line: 'IC', x: 70 * T + 64, z: RAIL_Z, kind: 'train' }];
export const STOPS = [...METRO, ...RAIL];
export const PLACES = [
  { id: 'P:toren', name: 'The Megatower (hoofdingang)', x: 40 * T + 64, z: 40 * T + 64 },
  { id: 'P:centraal', name: 'Station Megatower Centraal', x: 38 * T + 64, z: RAIL_Z + 18 },
  { id: 'P:luchthaven', name: 'Luchthaven (terminal)', x: 72 * T, z: 40 * T },
  { id: 'P:busstation', name: 'Busstation Centraal', x: 38 * T + 64, z: 47 * T + 110 },
  { id: 'P:park', name: 'Centraal Park', x: 45 * T + 64, z: 34 * T },
  { id: 'P:ziekenhuis', name: 'Ziekenhuis Sint-Elisabeth', x: 56 * T + 64, z: 42 * T },
  { id: 'P:uni', name: 'Universiteitscampus', x: 24 * T + 64, z: 38 * T },
  ...METRO.map(s => ({ id: s.id, name: s.name, x: s.x, z: s.z })),
];
const WALK = 1.35, METRO_V = 16, TRAIN_V = 33, TRAM_V = 9.5, TRANSFER = 60, WALK_MAX = 1600;
export const TRAIN_HEADWAY = { spits: 600, dal: 900, avond: 1200, nacht: 1800 };
const TRAIN_DWELL = 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) * 1.25; // wandelen langs straten (omweg)
const fmt = (sec) => { sec = ((sec % 86400) + 86400) % 86400; const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
// eerstvolgend vertrek na tijd t (seconden sinds middernacht) bij een interval h en een vaste verschuiving
const nextDep = (t, h, off) => Math.ceil((t - off) / h) * h + off;

// ---------- lijnen ----------
// tramhaltes: zoals in de wereld (om de 3 tegels, op 80 m), alleen waar de laan (en dus het tramspoor) doorloopt;
// een onderbreking (park, rivier, landmark) splitst de lijn in delen
function lineRuns(mode, off, colorOf, defs) {
  const out = [], step = 3 * T;
  const mk = (line, axis, b) => {
    let run = [];
    const flush = () => { if (run.length >= 2) out.push({ id: line + '/' + out.filter(l => l.line === line).length, line, mode, color: colorOf(line), stops: run }); run = []; };
    for (let g = off; g < TILES * T; g += step) {
      const t = Math.floor(g / T), ok = axis === 'x' ? avenueNS(b, t) : avenueEW(b, t);
      // spoor tussen de vorige halte en deze: alle tegels ertussen hebben de laan
      if (run.length) { const t0 = Math.floor((g - step) / T); let cont = true; for (let q = t0; q <= t; q++) if (!(axis === 'x' ? avenueNS(b, q) : avenueEW(b, q))) cont = false; if (!cont) flush(); }
      if (!ok) { flush(); continue; }
      const x = axis === 'x' ? b * T : g, z = axis === 'x' ? g : b * T;
      run.push({ id: `${line}:${g}`, name: (mode === 'tram' ? 'Tramhalte ' : 'Halte ') + (axis === 'x' ? zoneName(b * T, g) : zoneName(g, b * T)), x, z, kind: mode });
    }
    flush();
  };
  for (const [line, axis, b] of defs) mk(line, axis, b);
  return out;
}
const tramLines = () => lineRuns('tram', 80, (l) => TRAM_COLOR[l], [...TRAM_X.map((b, i) => ['T' + (i + 1), 'x', b]), ...TRAM_Z.map((b, i) => ['T' + (i + 3), 'z', b])]);
const busLines = () => lineRuns('bus', 42, () => '#27ae60', [...BUS_NS.map(b => [busLineNS(b), 'x', b]), ...BUS_EW.map(b => [busLineEW(b), 'z', b])]);
export const BUS_HEADWAY = { spits: 600, dal: 900, avond: 1200, nacht: 1800 };
const TRAM_COLOR = { T1: '#e67e22', T2: '#16a085', T3: '#8e44ad', T4: '#c0392b' };
export const LINES = [
  { id: 'M1', line: 'M1', mode: 'metro', color: '#2f6db5', stops: METRO },
  { id: 'IC', line: 'IC', mode: 'trein', color: '#f1c40f', stops: RAIL },
  ...tramLines(),
  ...busLines(),
];
const BUS_V = 8;
const speedOf = (L) => L.mode === 'metro' ? METRO_V : L.mode === 'trein' ? TRAIN_V : L.mode === 'bus' ? BUS_V : TRAM_V;
const headwayOf = (L, per) => L.mode === 'trein' ? TRAIN_HEADWAY[per] : L.mode === 'bus' ? BUS_HEADWAY[per] : HEADWAY[per][L.mode === 'metro' ? 'metro' : 'tram'];
const dwellOf = (L, per) => L.mode === 'trein' ? TRAIN_DWELL : DWELL[per][L.mode];
// tijdsprofiel per richting: vertrek aan halte i = vertrek aan de beginhalte + cum[i]
function profile(L, dir, per) {
  const st = dir ? [...L.stops].reverse() : L.stops, cum = [0], dw = dwellOf(L, per);
  for (let i = 1; i < st.length; i++) cum.push(cum[i - 1] + Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z) / speedOf(L) + (L.mode === 'trein' ? 0 : dw));
  // vaste verschuiving per lijn en richting (de trein zoals het vertrekbord van Centraal: :02 en :07 na het interval)
  const h = headwayOf(L, per), off = L.mode === 'trein' ? (dir ? 420 : 120) : ((L.id.length * 37 + (dir ? h / 2 : 0)) % h);
  return { st, cum, h, off, dw, run: (i) => Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z) / speedOf(L) + (L.mode === 'trein' ? TRAIN_DWELL : 0) };
}
const dirName = (L, dir) => { const st = dir ? L.stops[0] : L.stops[L.stops.length - 1]; return L.mode === 'tram' || L.mode === 'bus' ? st.name.replace('Tramhalte ', '').replace('Halte ', '') + ` (${L.stops[0].x === L.stops[1].x ? (dir ? 'noord' : 'zuid') : (dir ? 'west' : 'oost')})` : st.name.replace('Metro ', '').replace('Station ', ''); };
const perronOf = (L, dir) => L.mode === 'metro' ? (dir ? 2 : 1) : L.mode === 'trein' ? (dir ? 1 : 2) : null;

// ---------- planner ----------
// vaste graaf per periode (TERRANOVA 15): haltes en wandelburen (≤ 1,6 km) worden één keer berekend;
// de zoektocht gebruikt een binaire heap. Zelfde uitkomst als voorheen, maar ±10× sneller (reizigers plannen ook).
const GRAPH = new Map();
function graphFor(per) {
  let G = GRAPH.get(per); if (G) return G;
  const P = LINES.flatMap(L => [0, 1].map(d => ({ L, d, pr: profile(L, d, per) })));
  const nodes = [{ key: 'O' }, { key: 'D' }], idx = new Map();
  for (const q of P) q.pr.st.forEach((s, i) => { const key = q.L.id + '|' + q.d + '|' + i; idx.set(key, nodes.length); nodes.push({ key, p: s, q, i }); });
  // ruimtelijk raster voor de wandelburen
  const cell = WALK_MAX / 1.25, grid = new Map(), ck = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  for (let v = 2; v < nodes.length; v++) { const k = ck(nodes[v].p.x, nodes[v].p.z); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
  const nb = new Array(nodes.length);
  for (let u = 2; u < nodes.length; u++) {
    const N = nodes[u], gx = Math.floor(N.p.x / cell), gz = Math.floor(N.p.z / cell), out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const v of grid.get((gx + dx) + ',' + (gz + dz)) || []) {
      if (v === u) continue; const M = nodes[v];
      if (N.q.L === M.q.L && N.q.d === M.q.d) continue; // zelfde lijn en richting: blijven zitten
      const d = dist(N.p, M.p); if (d <= WALK_MAX) out.push(v, d);
    }
    nb[u] = Float64Array.from(out);
  }
  G = { nodes, idx, nb }; GRAPH.set(per, G); return G;
}
export function plan(from, to, hour) {
  const per = periodOfHour(hour), t0 = Math.round(hour * 3600);
  const { nodes: base, idx, nb } = graphFor(per);
  const nodes = base.slice(); nodes[0] = { key: 'O', p: from }; nodes[1] = { key: 'D', p: to };
  const n = nodes.length, best = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  // vorige knoop en soort stap zonder objecten per verbetering: pU = vorige, pK = 0 wandel / 1 rit, pM = meters, pD = vertrek
  const pU = new Int32Array(n).fill(-1), pK = new Uint8Array(n), pM = new Float64Array(n), pD = new Float64Array(n);
  let hT = new Float64Array(4096), hV = new Int32Array(4096), hn = 0;
  const push = (t, v) => { if (hn === hT.length) { const a = new Float64Array(hn * 2), b = new Int32Array(hn * 2); a.set(hT); b.set(hV); hT = a; hV = b; } let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hT[p] <= t) break; hT[i] = hT[p]; hV[i] = hV[p]; i = p; } hT[i] = t; hV[i] = v; };
  const pop = () => { const v = hV[0]; hn--; if (hn) { const t = hT[hn], w = hV[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, mt = t; if (l < hn && hT[l] < mt) { m = l; mt = hT[l]; } if (r < hn && hT[r] < mt) m = r; if (m === i) break; hT[i] = hT[m]; hV[i] = hV[m]; i = m; } hT[i] = t; hV[i] = w; } return v; };
  const relax = (u, v, tv, k, m, dep) => { if (tv < best[v]) { best[v] = tv; pU[v] = u; pK[v] = k; pM[v] = m; pD[v] = dep; push(tv, v); } };
  best[0] = t0; push(t0, 0);
  while (hn) {
    const u = pop(); if (done[u]) continue;
    if (u === 1) break;
    done[u] = 1; const N = nodes[u], t = best[u];
    // rijden naar de volgende halte (zelfde richting)
    if (N.q && N.i < N.q.pr.st.length - 1) {
      const pr = N.q.pr, dep = nextDep(t, pr.h, pr.off + pr.cum[N.i]);
      relax(u, u + 1, dep + pr.run(N.i), 1, 0, dep); // de volgende halte van dezelfde lijn en richting is de volgende knoop
    }
    // wandelen: vanuit het vertrek naar elke halte, van elke halte naar de bestemming, tussen haltes tot 1,6 km (+1 min overstap)
    if (u === 0) { for (let v = 1; v < n; v++) { const d = dist(N.p, nodes[v].p); relax(u, v, t + d / WALK, 0, d, 0); } continue; }
    { const d = dist(N.p, nodes[1].p); relax(u, 1, t + d / WALK, 0, d, 0); }
    const L = nb[u]; for (let k = 0; k < L.length; k += 2) { const v = L[k]; if (!done[v]) relax(u, v, t + L[k + 1] / WALK + TRANSFER, 0, L[k + 1], 0); }
  }
  const prev = new Array(n).fill(null);
  for (let v = 0; v < n; v++) if (pU[v] >= 0) prev[v] = { u: pU[v], edge: pK[v] ? { ride: true, dep: pD[v], q: nodes[pU[v]].q, i: nodes[pU[v]].i } : { walk: true, m: Math.round(pM[v]) } };
  // reis terug opbouwen; ritten op hetzelfde voertuig samenvoegen
  const steps = []; for (let v = 1; prev[v]; v = prev[v].u) steps.push({ from: nodes[prev[v].u], to: nodes[v], e: prev[v].edge, arr: best[v], dep0: best[prev[v].u] });
  steps.reverse();
  const legs = [];
  for (const s of steps) {
    if (s.e.walk) { const last = legs[legs.length - 1]; if (last && last.mode === 'wandelen') { last.to = s.to.p; last.arr = s.arr; last.m += s.e.m; } else legs.push({ mode: 'wandelen', from: s.from.p, to: s.to.p, dep: s.dep0, arr: s.arr, m: s.e.m }); continue; }
    const L = s.e.q.L, last = legs[legs.length - 1];
    if (last && last.q === s.e.q && Math.abs(last.arr + s.e.q.pr.dw * (L.mode === 'trein' ? 0 : 1) - s.e.dep) < 1) { last.to = s.to.p; last.arr = s.arr; last.stops++; continue; }
    legs.push({ mode: L.mode, line: L.line, q: s.e.q, from: s.from.p, to: s.to.p, dep: s.e.dep, arr: s.arr, stops: 1, dir: dirName(L, s.e.q.d), perron: perronOf(L, s.e.q.d), color: L.color });
  }
  const r = { legs: legs.filter(l => l.mode !== 'wandelen' || l.m > 15), arr: best[1], dep: t0, per };
  for (const l of r.legs) delete l.q;
  r.ritten = r.legs.filter(l => l.mode !== 'wandelen').length;
  r.overstappen = Math.max(0, r.ritten - 1);
  r.wandelen = r.legs.filter(l => l.mode === 'wandelen').reduce((a, l) => a + l.m, 0);
  r.modi = [...new Set(r.legs.map(l => l.mode))];
  // wachttijd per rit: van aankomst aan de halte (einde van de vorige stap) tot het vertrek
  let tPrev = r.dep; r.wachten = 0;
  for (const l of r.legs) { if (l.mode !== 'wandelen') { l.wait = Math.max(0, l.dep - tPrev); r.wachten += l.wait; } tPrev = l.arr; }
  return r;
}
const ICON = { metro: '🚇', trein: '🚆', tram: '🚊', bus: '🚌', wandelen: '🚶' };
export function planHtml(r) {
  const min = (s) => Math.max(1, Math.round(s / 60));
  return `<div class="small muted">Dienstregeling: ${PERIOD_LABEL[r.per]} (metro om de ${HEADWAY[r.per].metro / 60} min, tram om de ${HEADWAY[r.per].tram / 60} min, bus om de ${BUS_HEADWAY[r.per] / 60} min, trein om de ${TRAIN_HEADWAY[r.per] / 60} min)</div>
    <div><b>Aankomst ${fmt(r.arr)}</b> · reistijd ${min(r.arr - r.dep)} min · ${r.overstappen} overstap${r.overstappen === 1 ? '' : 'pen'} · ${r.wandelen} m wandelen</div>
    <div class="small muted">Vertrek ${fmt(r.dep)} · ${r.ritten} rit${r.ritten === 1 ? '' : 'ten'} · totale wachttijd ${min(r.wachten || 0)} min · vertraging: niet gemeten in Megatower City (de voertuigen rond je volgen deze dienstregeling niet op de minuut)</div>
    <ol class="plan-legs">${r.legs.map(l => l.mode === 'wandelen'
      ? `<li>${ICON.wandelen} ${fmt(l.dep)} wandel ${l.m} m naar <b>${l.to.name}</b> (${min(l.arr - l.dep)} min)</li>`
      : `<li>${ICON[l.mode]} ${fmt(l.dep)} <b>${l.line}</b> richting ${l.dir}${l.perron ? `, perron ${l.perron}` : ''}, van ${l.from.name} naar <b>${l.to.name}</b> · aankomst ${fmt(l.arr)} (${l.stops} halte${l.stops === 1 ? '' : 's'}${l.wait > 30 ? ` · ${min(l.wait)} min wachten` : ''})</li>`).join('')}</ol>`;
}

// ---------- live: voertuigen volgens de dienstregeling, en vertrekken aan een halte ----------
// voertuigen die op tijd t (seconden sinds middernacht) onderweg zijn: lijn, richting, plek, volgende halte
export function scheduled(hour) {
  const per = periodOfHour(hour), t = hour * 3600, out = [];
  for (const L of LINES) for (const d of [0, 1]) {
    const pr = profile(L, d, per), n = pr.st.length, Ttot = pr.cum[n - 2] + pr.run(n - 2); // rijtijd van begin- tot eindhalte
    for (let k = Math.floor((t - pr.off - Ttot) / pr.h); ; k++) {
      const d0 = pr.off + k * pr.h, a = t - d0; if (a < 0) break; if (a > Ttot) continue;
      // waar: tussen halte i en i+1 (of aan halte i tijdens de haltetijd)
      let i = 0; while (i < n - 2 && pr.cum[i + 1] <= a) i++;
      const runT = pr.run(i), f = Math.max(0, Math.min(1, (a - pr.cum[i]) / runT));
      const A = pr.st[i], B = pr.st[i + 1];
      out.push({ line: L.line, mode: L.mode, color: L.color, dir: dirName(L, d), x: A.x + (B.x - A.x) * f, z: A.z + (B.z - A.z) * f, next: f >= 1 ? (pr.st[i + 2] || B).name : B.name, nextT: d0 + pr.cum[i] + runT, dep0: d0, id: `${L.line}-${d ? 'B' : 'A'}${String(((k % 1000) + 1000) % 1000).padStart(3, '0')}` });
    }
  }
  return out;
}
// eerstvolgende vertrekken aan een halte (alle lijnen die er stoppen, beide richtingen)
// pos: { x, z } van de aangeklikte halte (veel haltes heten hetzelfde, bv. 'Halte Centrum'): alleen haltes binnen 40 m
export function departures(stopName, hour, n = 6, pos = null) {
  const per = periodOfHour(hour), t = hour * 3600, rows = [];
  for (const L of LINES) for (const d of [0, 1]) {
    const pr = profile(L, d, per), i = pr.st.findIndex(s => s.name === stopName && (!pos || Math.hypot(s.x - pos.x, s.z - pos.z) < 40)); if (i < 0 || i === pr.st.length - 1) continue;
    let dep = nextDep(t, pr.h, pr.off + pr.cum[i]);
    for (let k = 0; k < 3; k++, dep += pr.h) rows.push({ t: dep, line: L.line, mode: L.mode, dir: dirName(L, d), perron: perronOf(L, d), color: L.color });
  }
  return rows.sort((a, b) => a.t - b.t).slice(0, n).map(r => ({ ...r, hhmm: fmt(r.t) }));
}
export const fmtTime = fmt;

// vertrekbord in de stationshal van Megatower Centraal: de volgende treinen naar de Luchthaven
export function centraalBoard(hour) {
  const per = periodOfHour(hour), t = Math.round(hour * 3600), h = TRAIN_HEADWAY[per], rows = [];
  let d = nextDep(t, h, 120);
  for (let i = 0; i < 4; i++, d += h) rows.push(`${fmt(d)}  IC → Luchthaven  spoor 2  (${Math.round((Math.abs(RAIL[1].x - RAIL[0].x) / TRAIN_V + TRAIN_DWELL) / 60)} min)`);
  return `🚆 Megatower Centraal · vertrekken (${PERIOD_LABEL[per]}, om de ${h / 60} min)\n${rows.join('\n')}\nMetro M1: halte Megatower (± 260 m) · trappen en lift naar de perrons`;
}
