// Hele reizen voor reizigers (TERRANOVA 15): van een gebouw naar een ander gebouw, met de reisplanner.
//
// Een reiziger vertrekt aan de deur van een woning, kantoor of openbaar gebouw (een echte deur in de blokken), loopt
// naar de halte die de planner kiest (js/megaplan.js: metro, trein, tram en bus volgens de dienstregeling), wacht op
// het juiste voertuig (lijn én richting), stapt in, stapt uit aan de juiste halte (naam én plek), stapt over en loopt
// het laatste stuk naar de deur van zijn bestemming. Wat buiten beeld gebeurt (een rit van 6 km) wordt op afstand
// gesimuleerd met de tijden van de planner (js/travelers.js 'op afstand'); komt de reiziger weer in de buurt van de
// speler, dan wordt hij daar weer zichtbaar en gaat het lopen verder in de echte wereld.
//
// Hier staan de hulpstukken die geen tekenwerk doen: deuren en voorzieningen zoeken in de blokken, en een plan van
// de planner omzetten in de stappen die js/travelers.js uitvoert.
import { B } from './blocks.js';

export const MODE_KIND = { metro: 'metro', trein: 'train', tram: 'tram', bus: 'bus' };
const DOORS = new Set([B.DOOR, B.DOOR_GLASS, B.DOOR_OPEN, B.DOOR_SHUT]);
const BENCH = new Set([B.PLANKS, B.DARK_PLANKS]);

// een deur in de buurt van (x, z) op straatniveau, en de beloopbare plek ervoor (buiten)
// nav: NavGrid (js/travelers.js), get(x, y, z): bloksoort, y0: straatniveau (vloer = y0, de deur staat op y0)
export function doorNear(nav, get, x, z, y0, r = 40, rnd = Math.random) {
  const found = [];
  const x0 = Math.floor(x), z0 = Math.floor(z);
  for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) {
    const bx = x0 + dx, bz = z0 + dz;
    for (const y of [y0, y0 + 1]) {
      if (!DOORS.has(get(bx, y, bz))) continue;
      // de beloopbare kant van de deur: buiten (straat), op dezelfde hoogte
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = { x: bx + ox, y, z: bz + oz };
        if (nav.walkable(q.x, q.y, q.z) && nav.walkable(bx + 2 * ox, y, bz + 2 * oz)) { found.push({ x: q.x, y: q.y, z: q.z, door: { x: bx, y, z: bz } }); break; }
      }
      break;
    }
    if (found.length > 24) break;
  }
  if (!found.length) return null;
  return found[Math.floor(rnd() * found.length)];
}

// een plek bij een gebouw als er geen deur is: stoep naast een gevel van minstens 6 blokken hoog
export function facadeNear(nav, solid, x, z, y0, rnd = Math.random) {
  for (let k = 0; k < 24; k++) {
    const a = rnd() * 6.283, r = 6 + rnd() * 30, px = Math.floor(x + Math.cos(a) * r), pz = Math.floor(z + Math.sin(a) * r);
    if (!nav.walkable(px, y0, pz)) continue;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let h = 0; while (h < 8 && solid(px + ox, y0 + h, pz + oz)) h++;
      if (h >= 6) return { x: px, y: y0, z: pz, wall: true };
    }
  }
  return null;
}

// bank (één plank op vloerhoogte met lucht erboven) binnen r m van de wachtplek, met een vrije plek ernaast
export function benchNear(nav, get, solid, p, r = 6, taken = new Set()) {
  let best = null;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = Math.floor(p.y);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const bx = x0 + dx, bz = z0 + dz, k = bx + ',' + y + ',' + bz;
    if (taken.has(k) || !BENCH.has(get(bx, y, bz)) || solid(bx, y + 1, bz) || !solid(bx, y - 1, bz)) continue;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!nav.walkable(bx + ox, y, bz + oz)) continue;
      const d = Math.hypot(dx, dz);
      if (!best || d < best.d) best = { x: bx + ox, y, z: bz + oz, seat: { x: bx + 0.5, y: y + 0.45, z: bz + 0.5 }, key: k, d, yaw: Math.atan2(-ox, -oz) + Math.PI };
      break;
    }
  }
  return best;
}

// ticketautomaat binnen r m (en ±10 blokken hoogte) van een station: de beloopbare plek ervoor
const ticketCache = new Map();
export function ticketNear(nav, get, p, r = 28) {
  const key = Math.round(p.x / 16) + ',' + Math.round(p.y / 4) + ',' + Math.round(p.z / 16);
  if (ticketCache.has(key)) return ticketCache.get(key);
  let best = null;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y0 = Math.floor(p.y);
  for (let dy = -10; dy <= 10; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const bx = x0 + dx, by = y0 + dy, bz = z0 + dz;
    if (get(bx, by, bz) !== B.TICKET) continue;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const fy of [by, by - 1, by - 2]) if (nav.walkable(bx + ox, fy, bz + oz)) {
        const d = Math.hypot(dx, dz) + Math.abs(dy);
        if (!best || d < best.d) best = { x: bx + ox, y: fy, z: bz + oz, d, yaw: Math.atan2(-ox, -oz) };
        break;
      }
    }
  }
  if (ticketCache.size > 200) ticketCache.clear();
  ticketCache.set(key, best);
  return best;
}

// halte in de wereld met deze naam, het dichtst bij de plek van de planner (veel haltes heten hetzelfde)
export function stopFor(stops, name, kind, near, maxD = 120) {
  const want = kind === 'metro' ? 'metrostop' : kind === 'train' ? 'railstop' : 'busstop';
  let best = null, bd = maxD;
  for (const s of stops) {
    if (s.name !== name || (s.kind !== want && !(kind === 'train' && s.kind === 'metrostop'))) continue;
    const d = Math.hypot(s.x - near.x, s.z - near.z); if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// plan → stappen voor js/travelers.js. Elke rit: soort, lijn, in- en uitstaphalte (naam + plek), richting (de
// uitstaphalte) en de geplande tijden (voor de simulatie op afstand). Wandelstukken lopen naar de wachtplek van de rit.
export function stepsFromPlan(r, dest) {
  const steps = [];
  for (const l of r.legs) {
    if (l.mode === 'wandelen') continue; // de reiziger loopt zelf naar de wachtplek van de volgende rit (of de bestemming)
    const kind = MODE_KIND[l.mode]; if (!kind) return null;
    steps.push({ ride: { kind, line: l.line, board: l.from.name, alight: l.to.name, from: { x: l.from.x, z: l.from.z }, at: { x: l.to.x, z: l.to.z }, toward: { x: l.to.x, z: l.to.z }, dep: l.dep, arr: l.arr, dir: l.dir, perron: l.perron } });
  }
  if (!steps.length) return null;
  steps.push({ goal: { x: dest.x, z: dest.z, name: dest.name || null } });
  return steps;
}
