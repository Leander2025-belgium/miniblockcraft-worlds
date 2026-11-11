// Greenisland – het centrale netwerkmodel voor het spoor: lijnen (uit greenisland-routes.js), stations, hellingsprofielen,
// tunnels (ook onder de Noordzee), viaducten en ongelijkvloerse kruisingen. Dezelfde gegevens worden gebruikt voor de
// blokken in de tegels, de rijdende treinen, de dienstregeling, de vertrekborden en de kaart.
import { RLine, TRACK, BED } from './rline.js';
import { rawHeight, coastDist } from './greenisland-terrain.js';
import { LINE_PLAN, G, CENTRAL } from './greenisland-data.js';
import { RAIL } from './greenisland-routes.js';

// grond voor het hellingsprofiel: onder zee diep (het spoor duikt in een tunnel), op land de echte grond
// (internationale lijnen en de AX1 rijden onder de stad door: 'deep' meter onder de grond)
const groundFor = (L) => (x, z) => { const m = coastDist(x, z), h = rawHeight(x, z); if (L.international) return G + (m < 900 ? Math.min(h, 0) - 30 : h - 30); if (L.deep) return G + Math.max(h, 0) - L.deep; return G + (m < 60 ? Math.max(h, 2) : h); };
// wat er boven het spoor ligt: onder zee telt het water mee
const coverFor = (L) => L.international ? (x, z) => { const m = coastDist(x, z), h = rawHeight(x, z); return G + (m < 900 ? Math.max(h, 0) + 30 : h); } : L.deep ? (x, z) => G + Math.max(0, rawHeight(x, z)) : null;

function build() {
  const lines = [];
  for (const [id, plan] of Object.entries(LINE_PLAN)) {
    const L = new RLine(id, plan, RAIL[id], groundFor(plan), coverFor(plan));
    L.international = plan.international || null;
    L.findStations();
    lines.push(L);
  }
  // Munkbay Central ligt op straatniveau (ook voor de lijnen die daarna onder de stad duiken)
  const levels = new Map([['Munkbay Central', Math.round(G + rawHeight(CENTRAL.x, CENTRAL.z) + 0.5)]]);
  for (const L of lines) L.profile(levels);
  for (const L of lines) L.buildGrid();
  const crossings = [];
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    const A = lines[a], Bl = lines[b];
    // snelle voortest: liggen de lijnen ergens dicht bij elkaar?
    for (let i = 0; i < Bl.n - 1; i += 2) {
      if (i % 16 === 0 && !A.near(Bl.x[i], Bl.z[i], 70)) { i += 12; continue; } // 64 m verder: een kruising valt nooit tussen twee meetpunten
      const q = A.near(Bl.x[i], Bl.z[i], 6);
      if (!q) continue;
      if (A.stationAt(q.s) || Bl.stationAt(Bl.s[i])) continue;
      const dA = A.at(q.s), dB = Bl.at(Bl.s[i]);
      void dA; void dB; // ook bijna evenwijdige lijnen die over elkaar zouden lopen, worden gescheiden
      if (crossings.some(c => c.b === Bl && Math.abs(c.sb - Bl.s[i]) < 200)) continue;
      const under = Bl.kind[i] === 1;
      crossings.push({ a: A, b: Bl, sa: q.s, sb: Bl.s[i], x: Bl.x[i], z: Bl.z[i], under });
    }
  }
  // alleen bijsturen als de twee sporen niet al ver genoeg boven elkaar liggen
  // (treinen zijn 6 m hoog, met brugdek en marge: minstens 10,5 m tussen de twee sporen)
  const need = crossings.filter(c => Math.abs(c.a.at(c.sa).y - c.b.at(c.sb).y) < 10.5);
  for (const c of need) { const ya = c.a.at(c.sa).y; c.y = c.under ? ya - 10.5 : ya + 10.5; c.b.anchors.push({ s: c.sb, y: c.y }); }
  const touched = new Set(need.map(c => c.b));
  for (const L of touched) { L.profile(levels); L.buildGrid(); }
  return { lines, crossings, levels };
}
export const NET = build();
export const LINES = NET.lines;
export const LINE = Object.fromEntries(LINES.map(L => [L.id, L]));
export const STATIONS_ALL = (() => {
  const m = new Map();
  for (const L of LINES) for (const st of L.stations) {
    const p = L.at(st.s);
    let e = m.get(st.name);
    if (!e) m.set(st.name, e = { name: st.name, x: p.x, z: p.z, y: st.y ?? p.y, lines: [], stops: [], intl: !!st.intl });
    e.lines.push(L.id); e.stops.push({ line: L.id, s: st.s });
  }
  return [...m.values()];
})();
export function trackOffset(L, s) {
  if (L.single) { let k = 0; for (const st of L.stations) { const a = Math.max(0, Math.min(1, (s - (st.s0 - 90)) / 60)), b = 1 - Math.max(0, Math.min(1, (s - (st.s1 + 30)) / 60)); k = Math.max(k, Math.min(a, b)); } return TRACK * k * k * (3 - 2 * k); }
  return TRACK;
}
export { TRACK, BED };
