// Reisplanner van Megatower City (TERRANOVA 14.1: multimodaal). Netwerk: metro M1 (9 stations van Westpoort tot
// Luchthaven), de trein Megatower Centraal – Luchthaven, de trams T1–T4 in de middenberm van de tramlanen (haltes om de
// 384 m, zoals ze in de wereld staan: js/megacity.js) en wandelen (ook om over te stappen). Elke lijn rijdt volgens de
// dienstregeling van het speluur (js/service.js: interval en haltetijd per periode). De planner zoekt met een
// tijdsafhankelijke Dijkstra de vroegste aankomst: wachten op het eerstvolgende vertrek aan elke halte, blijven zitten
// op hetzelfde voertuig, en overstappen te voet (met 1 minuut overstaptijd).
// Bussen rijden in Megatower City zonder vaste lijn (elke bus kiest zijn route): die staan daarom niet in de planner.
// Wat de kaart toont: de voertuigen van het verkeer rond de speler (echt, met rit en bezetting) en daarbuiten de
// voertuigen volgens deze dienstregeling.
import { periodOfHour, HEADWAY, DWELL, PERIOD_LABEL } from './service.js';
import { TRAM_X, TRAM_Z, TILES, avenueNS, avenueEW, zoneName } from './megacity.js';

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
function tramLines() {
  const out = [], step = 3 * T;
  const mk = (line, axis, b) => {
    let run = [];
    const flush = () => { if (run.length >= 2) out.push({ id: line + '/' + out.filter(l => l.line === line).length, line, mode: 'tram', color: TRAM_COLOR[line], stops: run }); run = []; };
    for (let g = 80; g < TILES * T; g += step) {
      const t = Math.floor(g / T), ok = axis === 'x' ? avenueNS(b, t) : avenueEW(b, t);
      // spoor tussen de vorige halte en deze: alle tegels ertussen hebben de laan
      if (run.length) { const t0 = Math.floor((g - step) / T); let cont = true; for (let q = t0; q <= t; q++) if (!(axis === 'x' ? avenueNS(b, q) : avenueEW(b, q))) cont = false; if (!cont) flush(); }
      if (!ok) { flush(); continue; }
      const x = axis === 'x' ? b * T : g, z = axis === 'x' ? g : b * T;
      run.push({ id: `${line}:${g}`, name: 'Tramhalte ' + (axis === 'x' ? zoneName(b * T, g) : zoneName(g, b * T)), x, z, kind: 'tram' });
    }
    flush();
  };
  TRAM_X.forEach((b, i) => mk('T' + (i + 1), 'x', b));
  TRAM_Z.forEach((b, i) => mk('T' + (i + 3), 'z', b));
  return out;
}
const TRAM_COLOR = { T1: '#e67e22', T2: '#16a085', T3: '#8e44ad', T4: '#c0392b' };
export const LINES = [
  { id: 'M1', line: 'M1', mode: 'metro', color: '#2f6db5', stops: METRO },
  { id: 'IC', line: 'IC', mode: 'trein', color: '#f1c40f', stops: RAIL },
  ...tramLines(),
];
const speedOf = (L) => L.mode === 'metro' ? METRO_V : L.mode === 'trein' ? TRAIN_V : TRAM_V;
const headwayOf = (L, per) => L.mode === 'trein' ? TRAIN_HEADWAY[per] : HEADWAY[per][L.mode === 'metro' ? 'metro' : 'tram'];
const dwellOf = (L, per) => L.mode === 'trein' ? TRAIN_DWELL : DWELL[per][L.mode === 'metro' ? 'metro' : 'tram'];
// tijdsprofiel per richting: vertrek aan halte i = vertrek aan de beginhalte + cum[i]
function profile(L, dir, per) {
  const st = dir ? [...L.stops].reverse() : L.stops, cum = [0], dw = dwellOf(L, per);
  for (let i = 1; i < st.length; i++) cum.push(cum[i - 1] + Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z) / speedOf(L) + (L.mode === 'trein' ? 0 : dw));
  // vaste verschuiving per lijn en richting (de trein zoals het vertrekbord van Centraal: :02 en :07 na het interval)
  const h = headwayOf(L, per), off = L.mode === 'trein' ? (dir ? 420 : 120) : ((L.id.length * 37 + (dir ? h / 2 : 0)) % h);
  return { st, cum, h, off, dw, run: (i) => Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z) / speedOf(L) + (L.mode === 'trein' ? TRAIN_DWELL : 0) };
}
const dirName = (L, dir) => { const st = dir ? L.stops[0] : L.stops[L.stops.length - 1]; return L.mode === 'tram' ? st.name.replace('Tramhalte ', '') + ` (${L.stops[0].x === L.stops[1].x ? (dir ? 'noord' : 'zuid') : (dir ? 'west' : 'oost')})` : st.name.replace('Metro ', '').replace('Station ', ''); };
const perronOf = (L, dir) => L.mode === 'metro' ? (dir ? 2 : 1) : L.mode === 'trein' ? (dir ? 1 : 2) : null;

// ---------- planner ----------
export function plan(from, to, hour) {
  const per = periodOfHour(hour), t0 = Math.round(hour * 3600);
  // knopen: vertrek, aankomst en elke halte van elke lijn (per richting een eigen profiel)
  const P = LINES.flatMap(L => [0, 1].map(d => ({ L, d, pr: profile(L, d, per) })));
  const nodes = [{ key: 'O', p: from }, { key: 'D', p: to }];
  const idx = new Map();
  for (const q of P) q.pr.st.forEach((s, i) => { const key = q.L.id + '|' + q.d + '|' + i; idx.set(key, nodes.length); nodes.push({ key, p: s, q, i }); });
  const best = new Float64Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(null), done = new Uint8Array(nodes.length);
  best[0] = t0;
  for (;;) {
    let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = 1; const N = nodes[u], t = best[u];
    const relax = (v, tv, edge) => { if (tv < best[v]) { best[v] = tv; prev[v] = { u, edge }; } };
    // rijden naar de volgende halte (zelfde richting)
    if (N.q && N.i < N.q.pr.st.length - 1) {
      const pr = N.q.pr, dep = nextDep(t, pr.h, pr.off + pr.cum[N.i]);
      relax(idx.get(N.q.L.id + '|' + N.q.d + '|' + (N.i + 1)), dep + pr.run(N.i) , { ride: true, dep, q: N.q, i: N.i });
    }
    // wandelen: naar de bestemming, en naar haltes (vanuit het vertrek naar elke halte; tussen haltes tot 1,6 km, overstap +1 min)
    for (let v = 1; v < nodes.length; v++) {
      if (done[v] || v === u) continue;
      const M = nodes[v], d = dist(N.p, M.p);
      if (u !== 0 && v !== 1 && d > WALK_MAX) continue;
      if (N.q && M.q && N.q.L === M.q.L && N.q.d === M.q.d) continue; // zelfde lijn en richting: blijven zitten
      relax(v, t + d / WALK + (u !== 0 && v !== 1 ? TRANSFER : 0), { walk: true, m: Math.round(d) });
    }
  }
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
  return r;
}
const ICON = { metro: '🚇', trein: '🚆', tram: '🚊', wandelen: '🚶' };
export function planHtml(r) {
  const min = (s) => Math.max(1, Math.round(s / 60));
  return `<div class="small muted">Dienstregeling: ${PERIOD_LABEL[r.per]} (metro om de ${HEADWAY[r.per].metro / 60} min, tram om de ${HEADWAY[r.per].tram / 60} min, trein om de ${TRAIN_HEADWAY[r.per] / 60} min)</div>
    <div><b>Aankomst ${fmt(r.arr)}</b> · reistijd ${min(r.arr - r.dep)} min · ${r.overstappen} overstap${r.overstappen === 1 ? '' : 'pen'} · ${r.wandelen} m wandelen</div>
    <ol class="plan-legs">${r.legs.map(l => l.mode === 'wandelen'
      ? `<li>${ICON.wandelen} ${fmt(l.dep)} wandel ${l.m} m naar <b>${l.to.name}</b> (${min(l.arr - l.dep)} min)</li>`
      : `<li>${ICON[l.mode]} ${fmt(l.dep)} <b>${l.line}</b> richting ${l.dir}${l.perron ? `, perron ${l.perron}` : ''}, van ${l.from.name} naar <b>${l.to.name}</b> · aankomst ${fmt(l.arr)} (${l.stops} halte${l.stops === 1 ? '' : 's'})</li>`).join('')}</ol>`;
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
export function departures(stopName, hour, n = 6) {
  const per = periodOfHour(hour), t = hour * 3600, rows = [];
  for (const L of LINES) for (const d of [0, 1]) {
    const pr = profile(L, d, per), i = pr.st.findIndex(s => s.name === stopName); if (i < 0 || i === pr.st.length - 1) continue;
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
