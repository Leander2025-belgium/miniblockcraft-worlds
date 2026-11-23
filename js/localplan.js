// TERRANOVA 16 fase 6 — reisplanner voor de verkeerswerelden zonder eigen planner (Nova Metropool, echte steden):
// plant over het echte OV-net dat rond de speler geladen is (js/traffic.js): metro, trein, tram en bus, met lopen
// naar de eerste halte, overstappen te voet (tot 250 m) en lopen naar de bestemming. Kortste reistijd (Dijkstra):
// rijtijd met de plansnelheid per soort, een gemiddelde wachttijd bij instappen en een overstapstraf.
// Grens (eerlijk): alleen het geladen gebied (± 1–2 km rond de speler) en zonder dienstregeling (wachten = gemiddelde
// interval). Megatower City, Greenisland en de Alpen hebben hun eigen planner met dienstregeling.
import { PLAN_SPEED } from './traffic.js';

const MODE = { metro: 'metro', rail: 'train', tram: 'tram', road: 'bus' };
const NAME = { metro: '🚇 metro', train: '🚆 trein', tram: '🚋 tram', bus: '🚌 bus' };
const WAIT = { metro: 150, train: 420, tram: 240, bus: 300 }; // gemiddelde wachttijd (s): half het interval
const WALK = 1.35, TRANSFER = 120, WALK_MAX = 700, XFER_MAX = 250;

function pointAt(e, d) {
  const p = e.pts; let acc = 0;
  for (let i = 3; i < p.length; i += 3) {
    const l = Math.hypot(p[i] - p[i - 3], p[i + 2] - p[i - 1]);
    if (acc + l >= d) { const t = (d - acc) / Math.max(1e-6, l); return { x: p[i - 3] + (p[i] - p[i - 3]) * t, z: p[i - 1] + (p[i + 2] - p[i - 1]) * t }; }
    acc += l;
  }
  return { x: p[p.length - 3], z: p[p.length - 1] };
}
// het OV-net als graaf: knopen op eindpunten en haltes van elke OV-rand
export function buildGraph(net) {
  const edges = [...net.edges.values()], lined = edges.some(e => e.net === 'road' && e.line);
  const nodes = [], byKey = new Map(), stops = [];
  const node = (e, d, name = null) => { const k = e.id + '@' + d.toFixed(1); let n = byKey.get(k); if (!n) { const p = pointAt(e, d); n = { id: nodes.length, e, d, x: p.x, z: p.z, name, adj: [] }; nodes.push(n); byKey.set(k, n); } if (name && !n.name) n.name = name; return n; };
  for (const e of edges) {
    const mode = MODE[e.net]; if (!mode) continue;
    if (mode === 'bus' && (lined ? !e.line : !(e.stops && e.stops.length))) continue; // bus alleen over buslijnen (of straten met haltes)
    const ds = [0, ...(e.stops || []), e.len].sort((a, b) => a - b), ns = ds.map(d => { const i = (e.stops || []).indexOf(d); return node(e, d, i >= 0 ? (e.stopNames && e.stopNames[i]) || 'Halte' : null); });
    for (let i = 1; i < ns.length; i++) { const t = (ds[i] - ds[i - 1]) / PLAN_SPEED[mode]; ns[i - 1].adj.push({ n: ns[i], t, mode, line: e.line || '', ride: true }); ns[i].adj.push({ n: ns[i - 1], t, mode, line: e.line || '', ride: true }); }
    e._mode = mode; e._n0 = ns[0]; e._n1 = ns[ns.length - 1];
    for (const n of ns) if (n.name) { stops.push({ n, mode }); n.smode = n.smode || mode; }
  }
  for (const e of edges) if (e._mode) for (const k of [0, 1]) for (const nx of e.next?.[k] || []) {
    const f = nx.e; if (!f._mode || f._mode !== e._mode) continue;
    const a = k ? e._n1 : e._n0, b = nx.dir > 0 ? f._n0 : f._n1; if (a && b && a !== b) a.adj.push({ n: b, t: 0, mode: e._mode, line: f.line || '', ride: true });
  }
  // overstappen te voet tussen haltes (ook tussen soorten)
  for (const s of stops) for (const o of stops) if (s !== o && s.n !== o.n) { const d = Math.hypot(s.n.x - o.n.x, s.n.z - o.n.z); if (d <= XFER_MAX) s.n.adj.push({ n: o.n, t: d / WALK + TRANSFER, walk: true, d }); }
  return { nodes, stops, names: [...new Set(stops.map(s => s.n.name))].sort((a, b) => a.localeCompare(b, 'nl')) };
}
// plannen: van een plek naar een plek (of haltenaam); kortste reistijd in seconden
export function planLocal(net, from, to, G = buildGraph(net)) {
  if (typeof to === 'string') { const s = G.stops.find(q => q.n.name === to); if (!s) return { error: 'onbekende halte' }; to = { x: s.n.x, z: s.n.z, name: to }; }
  const direct = Math.hypot(to.x - from.x, to.z - from.z);
  const dist = new Float64Array(G.nodes.length).fill(Infinity), prev = new Array(G.nodes.length), used = new Uint8Array(G.nodes.length), boarded = new Uint8Array(G.nodes.length);
  const heap = [];
  const push = (n, t, p, via) => { if (t < dist[n.id]) { dist[n.id] = t; prev[n.id] = { p, via }; heap.push([t, n]); } };
  // instappen: lopen naar een halte + gemiddelde wachttijd van die soort
  for (const s of G.stops) { const d = Math.hypot(s.n.x - from.x, s.n.z - from.z); if (d <= WALK_MAX) push(s.n, d / WALK + WAIT[s.mode], null, { walk: true, d, wait: WAIT[s.mode] }); }
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [t, n] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
    if (used[n.id]) continue; used[n.id] = 1;
    for (const a of n.adj) push(a.n, t + a.t + (a.walk ? WAIT[a.n.smode || 'bus'] : 0), n, a);
  }
  // uitstappen: halte binnen loopafstand van de bestemming
  let best = null;
  for (const s of G.stops) { if (!Number.isFinite(dist[s.n.id])) continue; const d = Math.hypot(s.n.x - to.x, s.n.z - to.z); if (d > WALK_MAX) continue; const T = dist[s.n.id] + d / WALK; if (!best || T < best.T) best = { T, n: s.n, d }; }
  const walkOnly = direct / WALK;
  if (!best || walkOnly <= best.T) return { lopen: true, minuten: Math.round(walkOnly / 60), afstand: Math.round(direct), legs: [{ mode: 'wandelen', min: Math.round(walkOnly / 60), m: Math.round(direct) }] };
  // weg terug opbouwen en samenvatten in stukken (lopen, rit per soort/lijn)
  const path = []; let c = best.n; while (c) { const pv = prev[c.id]; path.unshift({ n: c, via: pv && pv.via }); c = pv && pv.p; }
  const legs = [];
  const first = path[0]; legs.push({ mode: 'wandelen', m: Math.round(first.via.d), min: Math.round(first.via.d / WALK / 60) });
  let cur = null;
  for (let i = 1; i < path.length; i++) {
    const v = path[i].via;
    if (v.walk) { if (cur) { legs.push(cur); cur = null; } legs.push({ mode: 'overstap', m: Math.round(v.d), min: Math.round((v.t) / 60) }); continue; }
    if (!cur || cur.mode !== v.mode || (cur.line && v.line && cur.line !== v.line)) { if (cur) legs.push(cur); cur = { mode: v.mode, naam: NAME[v.mode], lijn: v.line || '', van: path[i - 1].n.name || 'onderweg', naar: null, t: 0 }; }
    cur.t += v.t; if (path[i].n.name) cur.naar = path[i].n.name;
  }
  if (cur) legs.push(cur);
  for (const l of legs) if (l.t !== undefined) { l.min = Math.max(1, Math.round(l.t / 60)); delete l.t; }
  legs.push({ mode: 'wandelen', m: Math.round(best.d), min: Math.round(best.d / WALK / 60) });
  const rides = legs.filter(l => l.naam);
  return { minuten: Math.round(best.T / 60), ritten: rides.length, overstappen: Math.max(0, rides.length - 1), legs, naar: to.name || null, lopenZouDuren: Math.round(walkOnly / 60) };
}
export function planText(r) {
  if (r.error) return r.error;
  if (r.lopen) return `🚶 Te voet is het snelst: ${r.minuten} min (${r.afstand} m).`;
  return `⏱ ${r.minuten} min · ${r.ritten} rit${r.ritten === 1 ? '' : 'ten'}, ${r.overstappen} overstap${r.overstappen === 1 ? '' : 'pen'} (te voet: ${r.lopenZouDuren} min)\n` + r.legs.map(l => l.naam ? `${l.naam}${l.lijn ? ' ' + l.lijn : ''}: ${l.van} → ${l.naar || '?'} (${l.min} min)` : l.mode === 'overstap' ? `↔ overstappen te voet: ${l.m} m` : `🚶 ${l.m} m lopen (${l.min} min)`).join('\n');
}
