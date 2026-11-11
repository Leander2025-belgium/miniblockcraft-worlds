// Greenisland – het centrale netwerkmodel voor het spoor: lijnen (uit greenisland-routes.js), stations, hellingsprofielen,
// tunnels (ook onder de Noordzee), viaducten en ongelijkvloerse kruisingen. Dezelfde gegevens worden gebruikt voor de
// blokken in de tegels, de rijdende treinen, de dienstregeling, de vertrekborden en de kaart.
import { RLine, TRACK, BED } from './rline.js';
import { rawHeight, coastDist } from './greenisland-terrain.js';
import { LINE_PLAN, METRO_LINES, G, CENTRAL } from './greenisland-data.js';
import { RAIL } from './greenisland-routes.js';

// grond voor het hellingsprofiel: onder zee diep (het spoor duikt in een tunnel), op land de echte grond
// (internationale lijnen en de AX1 rijden onder de stad door: 'deep' meter onder de grond)
const groundFor = (L) => (x, z) => { const m = coastDist(x, z), h = rawHeight(x, z); if (L.international) return G + (m < 900 ? Math.min(h, 0) - 30 : h - 30); if (L.metro) return G + Math.max(h - L.deep, -7); if (L.deep) return G + Math.max(h, 0) - L.deep; return G + (m < 60 ? Math.max(h, 2) : h); };
// wat er boven het spoor ligt: onder zee telt het water mee
const coverFor = (L) => L.international ? (x, z) => { const m = coastDist(x, z), h = rawHeight(x, z); return G + (m < 900 ? Math.max(h, 0) + 30 : h); } : L.deep ? (x, z) => G + Math.max(0, rawHeight(x, z)) : null;

// metro: het tracé volgt rechtstreeks de geplande punten; bij elk station een recht stuk, daartussen ronde bogen
function metroWay(plan) {
  const v = plan.via, pts = [];
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    if (p.wp) { pts.push([p.x, p.z]); continue; }
    const a = v[Math.max(0, i - 1)], b = v[Math.min(v.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const h = p.len / 2 + 40;
    if (i === 0) pts.push([p.x - dx * (h + 90), p.z - dz * (h + 90)]); // kopspoor achter het eindstation
    pts.push([p.x - dx * h, p.z - dz * h], [p.x, p.z], [p.x + dx * h, p.z + dz * h]);
    if (i === v.length - 1) pts.push([p.x + dx * (h + 90), p.z + dz * (h + 90)]);
  }
  let q = pts;
  for (let it = 0; it < 3; it++) { const r = [q[0]]; for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; r.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } r.push(q[q.length - 1]); q = r; }
  return q;
}
function build() {
  const lines = [];
  for (const [id, plan] of [...Object.entries(LINE_PLAN), ...Object.entries(METRO_LINES)]) {
    const L = new RLine(id, plan, plan.metro ? metroWay(plan) : RAIL[id], groundFor(plan), coverFor(plan));
    L.metro = !!plan.metro;
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
  for (const c of need) { const ya = c.a.at(c.sa).y; if (c.b.metro) { const yb = c.b.at(c.sb).y, cov = c.b.cover[c.b.idx(c.sb)], okU = ya - 10.5 >= 5, okO = cov - (ya + 10.5) >= 9; c.under = okU && okO ? yb < ya : !okO; } c.y = c.under ? ya - 10.5 : ya + 10.5; /* de metro gaat over een diepere lijn heen, nooit onder zeeniveau */ c.b.anchors.push({ s: c.sb, y: c.y }); }
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
