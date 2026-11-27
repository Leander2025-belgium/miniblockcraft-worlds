// BEVROREN KOPIE (TERRANOVA 16.1): de generator van Megatower City versie 6, zoals vóór de Megatower Revolution.
// Alleen gebruikt door js/migrate161.js om te weten welke blokken van een bewerkte tegel de speler zelf veranderde.
// Niet aanpassen.
// The Megatower: 1.000 m boven straatniveau, 25 kelderverdiepingen tot -100 m (Megatower City, js/megacity.js).
// Elke verdieping wordt apart opgebouwd uit een vloerplan (kern met liften en trappen, ringgang, kamers,
// meubels, gevel). Alles is deterministisch: dezelfde verdieping geeft altijd hetzelfde plan. Het plan wordt in
// de worker gebruikt om de blokken van de torentegel te maken, en in de game om de naam van de kamer en
// de liften te kennen (zonder three.js).
import { B } from '../blocks.js';

export const G = 120, T = 128, TOWER_TX = 40, TOWER_TZ = 40;
export const Y0 = G - 104, TILE_H = 1112;          // de torentegel begint 104 m onder de straat
export const F_MIN = -25, F_MAX = 249, FH = 4;    // 250 verdiepingen van 4 m = 1.000 m, plus 25 kelders
export const CX = TOWER_TX * T + 64, CZ = TOWER_TZ * T + 64; // middelpunt (wereldcoördinaten)
export const BOX0 = 16, BOXW = 96;                // de toren staat in tegelcoördinaten 16..111
export const HEIGHT_M = 1000;
export const floorY = (f) => G + FH * f;          // hier sta je op verdieping f
export const floorAt = (y) => Math.floor((y - (G - 1)) / FH);
export const floorLabel = (f) => f < 0 ? 'B' + (-f) : String(f);
const h32 = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

// ---------- functie per verdieping ----------
export function zoneOf(f) {
  if (f <= -16) return 'tech'; if (f <= -6) return 'park'; if (f === -5) return 'logi'; if (f === -4) return 'metro'; if (f === -3) return 'concourse';
  if (f <= -1) return 'mall'; if (f <= 9) return 'lobby'; if (f <= 29) return 'office'; if (f <= 79) return 'hotel'; if (f <= 119) return 'apt';
  if (f <= 149) return 'sky'; if (f <= 199) return 'lux'; if (f <= 229) return 'pent'; return 'top';
}
export const ZONE_NAMES = { tech: 'Techniek en opslag', park: 'Parkeergarage', logi: 'Logistiek en bevoorrading', metro: 'Metrostation', concourse: 'Metrohal',
  mall: 'Winkelcentrum', lobby: 'Lobby, restaurants en winkels', office: 'Kantoren en congrescentrum', hotel: 'Vijfsterrenhotel', apt: 'Appartementen',
  sky: 'Sky gardens, fitness en recreatie', lux: 'Luxe woonappartementen', pent: 'Suites en penthouses', top: 'Sky lounge en observatie' };
const PLATES = [[-25, -1, 48, 0], [0, 9, 46, 10], [10, 29, 42, 12], [30, 79, 40, 14], [80, 119, 36, 14], [120, 149, 32, 12], [150, 199, 28, 10], [200, 229, 24, 9], [230, 249, 20, 8]];
export function plateOf(f) { for (const p of PLATES) if (f >= p[0] && f <= p[1]) return { a: p[2], r: p[3] }; return null; }
// gevelmaterialen per deel van de toren (silhouet: elk deel een eigen glas en kader)
const LOOK = { lobby: [B.GLASS, B.METAL], office: [B.DARKGLASS, B.PANEL_DARK], hotel: [B.GLASS_BLUE, B.PANEL_WHITE], apt: [B.MIRROR, B.METAL],
  sky: [B.GLASS_GREEN, B.PANEL_WHITE], lux: [B.GLASS_BLUE, B.METAL], pent: [B.DARKGLASS, B.COPPER], top: [B.MIRROR, B.PANEL_WHITE] };

// ---------- plaatmaskers: 0 buiten, 1 gevel, 2 binnen ----------
const N = BOXW, HALF = 48;
const masks = new Map();
function inPlate(ci, cj, a, r) {
  const u = Math.abs(ci + 0.5), v = Math.abs(cj + 0.5);
  if (u >= a || v >= a) return false;
  const ax = u - (a - r), az = v - (a - r);
  return !(r > 0 && ax > 0 && az > 0 && ax * ax + az * az > r * r);
}
export function maskOf(a, r) {
  const k = a * 100 + r;
  let m = masks.get(k);
  if (m) return m;
  m = new Uint8Array(N * N);
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    if (!inPlate(ci, cj, a, r)) continue;
    const edge = !inPlate(ci + 1, cj, a, r) || !inPlate(ci - 1, cj, a, r) || !inPlate(ci, cj + 1, a, r) || !inPlate(ci, cj - 1, a, r);
    m[(cj + HALF) * N + ci + HALF] = edge ? 1 : 2;
  }
  masks.set(k, m);
  return m;
}
const ring = (ci, cj) => Math.max(ci >= 0 ? ci : -ci - 1, cj >= 0 ? cj : -cj - 1);
// zijde 0 noord (-z), 1 oost (+x), 2 zuid, 3 west; t langs de zijde, d = afstand tot het midden (ringnummer)
export function sideToC(s, t, d) { return s === 0 ? [t, -1 - d] : s === 1 ? [d, t] : s === 2 ? [-1 - t, d] : [-1 - d, -1 - t]; }
const rot2 = (ci, cj) => [-1 - ci, -1 - cj];

// ---------- liften ----------
// noordkant van de kern: deurwand op cj = -12, schacht cj -11..-9, vijf schachten; zuidkant = 180° gedraaid
const SHAFT_CI = [-11, -7, -3, 1, 5];
const EXPRESS = [0, 30, 80, 120, 150, 200, 230];
export const LIFTS = [
  { id: 'P', name: 'Parkeerlift', kind: 'Parkeerlift', side: 0, i: 0, floors: range(-15, 0), speed: 4 },
  { id: 'K', name: 'Kantoorlift', kind: 'Kantoren', side: 0, i: 1, floors: range(-2, 29), speed: 6 },
  { id: 'XN', name: 'Snellift Noord', kind: 'Snellift', side: 0, i: 2, floors: EXPRESS, speed: 18 },
  { id: 'H', name: 'Hotellift', kind: 'Hotelgasten', side: 0, i: 3, floors: [0, ...range(30, 79)], speed: 8 },
  { id: 'L', name: 'Goederenlift', kind: 'Goederenlift', side: 0, i: 4, floors: range(-25, 249), speed: 9 },
  { id: 'W', name: 'Woonlift', kind: 'Bewoners', side: 2, i: 0, floors: range(80, 149), speed: 7 },
  { id: 'WH', name: 'Woonlift Hoog', kind: 'Bewoners', side: 2, i: 1, floors: range(150, 199), speed: 7 },
  { id: 'XS', name: 'Snellift Zuid', kind: 'Snellift', side: 2, i: 2, floors: EXPRESS, speed: 18 },
  { id: 'PH', name: 'Privélift Penthouses', kind: 'Privélift', side: 2, i: 3, floors: [0, ...range(200, 229)], speed: 12 },
  { id: 'SL', name: 'Skyloungelift', kind: 'Sky lounge', side: 2, i: 4, floors: range(230, 248), speed: 6 },
  { id: 'PA', name: 'Panoramalift', kind: 'Panoramalift', side: -1, floors: range(120, 149).filter(f => (f - 120) % 10 !== 2 && (f - 120) % 10 !== 7), speed: 3, glass: true },
];
for (const L of LIFTS) {
  L.fmin = Math.min(...L.floors); L.fmax = Math.max(...L.floors); L.stops = new Set(L.floors);
  if (L.side === -1) { L.cells = { ci0: -2, cj0: 27 }; L.door = { cj: 26, ci0: -2 }; L.button = [-3, 26]; L.out = [0, -1]; }
  else {
    const c0 = SHAFT_CI[L.i];
    const pts = [[c0, -11], [c0 + 2, -9], [c0, -12], [c0 - 1, -12]];
    const p = L.side === 0 ? pts : pts.map(([a, b]) => rot2(a, b));
    L.cells = { ci0: Math.min(p[0][0], p[1][0]), cj0: Math.min(p[0][1], p[1][1]) };
    L.door = { cj: p[2][1], ci0: L.cells.ci0 };
    L.button = p[3];
    L.out = L.side === 0 ? [0, -1] : [0, 1];
  }
  // wereldcoördinaten van het midden van de cabine
  L.wx = CX + L.cells.ci0 + 1.5; L.wz = CZ + L.cells.cj0 + 1.5;
}

// ---------- verdieping opbouwen ----------
class Floor {
  constructor(f) {
    this.f = f; this.zone = zoneOf(f); this.p = plateOf(f);
    this.mask = maskOf(this.p.a, this.p.r);
    const pb = f > F_MIN ? plateOf(f - 1) : null;
    this.below = pb ? maskOf(pb.a, pb.r) : null;
    this.b = new Uint8Array(N * N * 4);
    this.room = new Uint16Array(N * N);
    this.rooms = [null];
    this.look = LOOK[this.zone] || [B.CONCRETE, B.CONCRETE];
    this.rnd = (a, b) => h32(f * 977 + a, b, 4242);
  }
  inB(ci, cj) { return ci >= -HALF && ci < HALF && cj >= -HALF && cj < HALF; }
  m(ci, cj) { return this.inB(ci, cj) ? this.mask[(cj + HALF) * N + ci + HALF] : 0; }
  set(ci, cj, l, b) { if (this.inB(ci, cj)) this.b[((cj + HALF) * N + ci + HALF) * 4 + l] = b; }
  get(ci, cj, l) { return this.inB(ci, cj) ? this.b[((cj + HALF) * N + ci + HALF) * 4 + l] : 0; }
  // alleen binnenin (niet op de gevel en niet erbuiten)
  put(ci, cj, l, b) { if (this.m(ci, cj) === 2) this.set(ci, cj, l, b); }
  free(ci, cj) { return this.m(ci, cj) === 2 && !this.get(ci, cj, 1) && !this.get(ci, cj, 2); }
  addRoom(name, extra) { this.rooms.push({ name, ...extra }); return this.rooms.length - 1; }
  mark(ci, cj, id) { if (this.inB(ci, cj)) this.room[(cj + HALF) * N + ci + HALF] = id; }
}

// een rechthoek langs een zijde: t0..t1 (muren op t0 en t1), d0 = muur aan de gangkant, binnen tot aan de gevel
class Unit {
  constructor(F, side, t0, t1, d0, d1, mirror) {
    Object.assign(this, { F, side, t0, t1, d0, d1: d1 ?? F.p.a - 1, mirror });
    this.w = t1 - t0 - 1; this.D = this.d1 - d0 - 1;
  }
  c(a, b) { const t = this.mirror ? this.t1 - 1 - a : this.t0 + 1 + a; return sideToC(this.side, t, this.d0 + 1 + b); }
  ok(a, b) { if (a < 0 || b < 0 || a >= this.w || b >= this.D) return false; const [ci, cj] = this.c(a, b); return this.F.m(ci, cj) === 2; }
  put(a, b, l, blk) { if (a < -1 || a > this.w || b < -1 || b > this.D) return; const [ci, cj] = this.c(a, b); this.F.put(ci, cj, l, blk); }
  get(a, b, l) { const [ci, cj] = this.c(a, b); return this.F.get(ci, cj, l); }
  freeAt(a, b) { return this.ok(a, b) && !this.get(a, b, 1) && !this.get(a, b, 2); }
  furn(a, b, blk, l = 1) { if (this.freeAt(a, b) || (l > 1 && this.ok(a, b) && !this.get(a, b, l))) this.put(a, b, l, blk); }
  floor(mat) { for (let b = 0; b < this.D; b++) for (let a = 0; a < this.w; a++) if (this.ok(a, b)) { this.put(a, b, 0, mat); for (let l = 1; l <= 3; l++) this.put(a, b, l, 0); } }
  walls(mat, door) {
    for (let a = -1; a <= this.w; a++) for (let l = 1; l <= 3; l++) this.put(a, -1, l, mat);
    for (let b = -1; b < this.D; b++) for (let l = 1; l <= 3; l++) { this.put(-1, b, l, mat); this.put(this.w, b, l, mat); }
    for (let a = -1; a <= this.w; a++) this.put(a, -1, 0, B.CONCRETE);
    if (door != null) { this.put(door, -1, 1, B.DOOR_SHUT); this.put(door, -1, 2, B.DOOR_SHUT_TOP); this.put(door + 1, -1, 2, B.SWITCH); }
  }
  // binnenmuur (rij b) van a0..a1 met een deur op a = door
  wallRow(b, a0, a1, mat, door) { for (let a = a0; a <= a1; a++) for (let l = 1; l <= 3; l++) this.put(a, b, l, mat); if (door != null) { this.put(door, b, 1, B.DOOR_SHUT); this.put(door, b, 2, B.DOOR_SHUT_TOP); } }
  wallCol(a, b0, b1, mat, door) { for (let b = b0; b <= b1; b++) for (let l = 1; l <= 3; l++) this.put(a, b, l, mat); if (door != null) { this.put(a, door, 1, B.DOOR_SHUT); this.put(a, door, 2, B.DOOR_SHUT_TOP); } }
  lamps(step = 4) { for (let b = 1; b < this.D; b += step) for (let a = 1; a < this.w; a += step) if (this.ok(a, b) && !this.get(a, b, 3)) this.put(a, b, 3, B.LAMP); }
  mark(id) { for (let b = -1; b < this.D; b++) for (let a = 0; a < this.w; a++) { const [ci, cj] = this.c(a, b); if (b >= 0 || true) this.F.mark(ci, cj, id); } }
  plant(a, b) { if (this.freeAt(a, b)) { this.put(a, b, 1, B.PLANTER); this.put(a, b, 2, B.LEAVES); } }
}

// ---------- interieurstijlen ----------
const STYLES = [
  { name: 'modern', floor: B.PARQUET, wall: B.PANEL_WHITE, bed: B.BED, sofa: B.SOFA, chair: B.CHAIR, carpet: B.CARPET_GREY, wet: B.TILE },
  { name: 'Scandinavisch', floor: B.PLANKS, wall: B.PAINT_WHITE, bed: B.BED, sofa: B.SOFA, chair: B.CHAIR, carpet: B.CARPET_BEIGE, wet: B.TILE },
  { name: 'industrieel', floor: B.CONCRETE, wall: B.BRICK_DARK, bed: B.BED_BLUE, sofa: B.SOFA_LEATHER, chair: B.CHAIR_RED, carpet: B.CARPET_GREY, wet: B.CHECKER },
  { name: 'ultra-luxe', floor: B.MARBLE, wall: B.WALL_WOOD, bed: B.BED, sofa: B.SOFA_LEATHER, chair: B.CHAIR, carpet: B.CARPET_BLUE, wet: B.MARBLE },
];

// ---------- meubels (in eenheidscoördinaten a langs de zijde, b naar het raam) ----------
function bed(U, a, b, S, dbl = true) { // hoofdeinde op a, 3 lang, 1 of 2 breed
  for (let k = 0; k < (dbl ? 2 : 1); k++) { U.furn(a, b + k, B.PILLOW); U.furn(a + 1, b + k, S.bed); U.furn(a + 2, b + k, S.bed); }
}
function bathroom(U, a0, b0, a1, b1, S, lux) {
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) if (U.ok(a, b)) U.put(a, b, 0, S.wet);
  // de cel aan de deur (a0, b0) blijft vrij
  U.put(a1, b0, 0, B.SHOWER_FLOOR); U.put(a1, b0, 3, B.METAL);
  U.furn(a1, b1, B.TOILET);
  U.furn(a0, b1, B.SINK); U.put(a0, b1, 2, B.MIRROR_WALL);
  if (lux && a1 - a0 >= 2 && b1 - b0 >= 3) { U.furn(a1, b0 + 1, B.BATHTUB); U.furn(a1, b0 + 2, B.BATHTUB); }
  else if (b1 - b0 >= 2 && a1 > a0) U.furn(a1, b0 + 1, B.GLASS);
  U.put(Math.round((a0 + a1) / 2), Math.round((b0 + b1) / 2), 3, B.LAMP);
}
function kitchen(U, a0, a1, b) { // keukenblok langs een rij
  const seq = [B.FRIDGE, B.COUNTER, B.STOVE, B.COUNTER, B.SINK, B.COUNTER];
  for (let a = a0, i = 0; a <= a1; a++, i++) { const k = seq[i % seq.length]; U.furn(a, b, k); if (k === B.FRIDGE) U.furn(a, b, B.FRIDGE, 2); else if (U.ok(a, b)) U.put(a, b, 3, B.COUNTER); }
}
function living(U, a0, a1, b0, b1, S, big) {
  // zetel aan de raamkant, salontafel, tv tegen de zijmuur, eettafel met stoelen
  const sb = b1 - 1;
  for (let a = a0 + 1; a <= Math.min(a1 - 1, a0 + (big ? 4 : 3)); a++) U.furn(a, sb, S.sofa);
  if (big) U.furn(a0 + 1, sb - 1, S.sofa);
  U.furn(a0 + 2, sb - 2, B.TABLE);
  U.furn(a1, sb - 1, B.TABLE); U.furn(a1, sb - 1, B.TV, 2);
  const db = b0 + 1;
  if (b1 - b0 >= 5) { U.furn(a0 + 2, db, B.TABLE); U.furn(a0 + 3, db, B.TABLE); U.furn(a0 + 1, db, S.chair); U.furn(a0 + 4, db, S.chair); U.furn(a0 + 2, db + 1, S.chair); U.furn(a0 + 3, db + 1, S.chair); }
  U.plant(a0, b1); U.plant(a1, b1);
  if (U.ok(a0 + 2, sb - 2)) U.put(a0 + 2, sb - 2, 0, S.carpet);
}
function bedroom(U, a0, a1, b0, b1, S, label) {
  bed(U, a0, b1 - 2, S, a1 - a0 >= 3);
  U.furn(a0, b1 - 3, B.TABLE); U.furn(a0, b1, B.TABLE);
  U.furn(a1, b0, B.WARDROBE); U.furn(a1, b0, B.WARDROBE, 2); if (a1 - a0 >= 3) { U.furn(a1 - 1, b0, B.WARDROBE); U.furn(a1 - 1, b0, B.WARDROBE, 2); }
  if (label === 'kind') { U.furn(a1, b1, B.CRATE); U.furn(a1, b1 - 1, B.TABLE); U.furn(a1 - 1, b1 - 1, S.chair); }
  U.put(Math.round((a0 + a1) / 2), Math.round((b0 + b1) / 2), 3, B.LAMP);
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) if (U.ok(a, b) && !U.get(a, b, 1)) U.put(a, b, 0, S.carpet);
}

// ---------- woning met kolommen: gang (b 0..1), scheidingsmuur (b 2), dan kamers naast elkaar ----------
// cols: [{ type: 'bath'|'bed'|'kid'|'living'|'store', w }]
function dwelling(U, cols, S, opts = {}) {
  U.floor(S.floor);
  U.walls(S.wall, 1);
  U.lamps(5);
  const D = U.D, hb = 2;
  let a = 0;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i], a0 = a, a1 = Math.min(U.w - 1, a + c.w - 1);
    if (i > 0) U.wallCol(a0 - 1, hb, D - 1, S.wall);
    if (c.type !== 'living') U.wallRow(hb, a0, a1, S.wall, a0 + (c.type === 'bath' ? 0 : 1));
    if (c.type === 'bath') bathroom(U, a0, hb + 1, a1, Math.min(D - 1, hb + 4), S, opts.lux);
    if (c.type === 'bath' && D - 1 > hb + 5) { U.wallRow(hb + 5, a0, a1, S.wall, a0 + 1); for (let b = hb + 6; b < D; b++) U.furn(a0, b, B.SHELF); U.furn(a1, D - 1, B.CRATE); }
    if (c.type === 'bed' || c.type === 'kid') bedroom(U, a0, a1, hb + 1, D - 1, S, c.type);
    if (c.type === 'living') { kitchen(U, a0, Math.min(a1, a0 + 4), hb); living(U, a0, a1, hb + 1, D - 1, S, c.w >= 9); }
    if (c.type === 'store') { for (let b = hb + 1; b < D; b++) U.furn(a0, b, B.SHELF); }
    a = a1 + 2;
  }
  if (opts.balcony) balcony(U);
}
function balcony(U) {
  // balkon voor het raam: vloer buiten de gevel en een glazen borstwering; glazen deur in de gevel
  const F = U.F, a0 = Math.floor(U.w / 2) - 2;
  const fac = U.d1, out1 = fac + 1, out2 = fac + 2;
  if (out2 >= HALF) return;
  for (let a = a0; a < a0 + 4; a++) {
    const t = U.mirror ? U.t1 - 1 - a : U.t0 + 1 + a;
    const [ci, cj] = sideToC(U.side, t, fac), [bi, bj] = sideToC(U.side, t, out1), [ri, rj] = sideToC(U.side, t, out2);
    if (F.m(ci, cj) !== 1 || F.m(bi, bj)) return;
    F.set(bi, bj, 0, B.PLANKS); F.set(ri, rj, 0, B.CONCRETE); F.set(ri, rj, 1, B.GLASS);
    if (a === a0 || a === a0 + 3) F.set(bi, bj, 1, B.GLASS);
    if (a === a0 + 1) { F.balc = F.balc || []; F.balc.push([ci, cj]); }
    if (a === a0 + 2) U.furn(a, U.D - 1, 0); // geen meubel voor de deur
  }
}

// ---------- strook rond de ringgang verdelen in eenheden ----------
// d0 = muur aan de gangkant; de strook loopt van t = -(d0) tot a-1 (de hoek hoort bij de strook)
function strip(F, side, d0, pattern, fn) {
  // gewone eenheden tot vlak voor de hoek, dan de hoekeenheid (die begint nog aan de gang: de deur komt op de gang uit)
  const tStart = -d0 - 1, tCorner = Math.min(F.p.a - 5, d0 - 6), tEnd = F.p.a - 1;
  const widths = fit(tCorner - tStart, pattern);
  let t = tStart;
  widths.forEach((w, i) => {
    const t1 = i === widths.length - 1 ? tCorner : Math.min(tCorner, t + w + 1);
    if (t1 - t < 3) return;
    fn(new Unit(F, side, t, t1, d0, null, false), i, false);
    t = t1;
  });
  if (tEnd - t >= 4) fn(new Unit(F, side, t, tEnd, d0, null, false), widths.length, true);
}
function fit(total, pattern) { // breedtes (met muur) herhalen tot de strook vol is; de laatste krijgt de rest
  const out = []; let s = 0, i = 0;
  while (s + pattern[i % pattern.length] + 1 <= total - 6) { const w = pattern[i % pattern.length]; out.push(w); s += w + 1; i++; }
  out.push(total - s - 1);
  return out;
}

// ---------- kern, liftlobby, trappen, liften ----------
function core(F) {
  const f = F.f;
  for (let cj = -12; cj < 12; cj++) for (let ci = -12; ci < 12; ci++) for (let l = 0; l < 4; l++) F.set(ci, cj, l, l === 0 ? B.CONCRETE : (f < 0 || f > 239 ? B.CONCRETE : B.PANEL_DARK));
  // technische schachten zichtbaar aan de buitenkant van de kern (oost/west, tussen trap en liften)
  for (const [ci, cj] of [[11, -6], [11, 5], [-12, -6], [-12, 5]]) for (let l = 1; l < 4; l++) F.set(ci, cj, l, B.VENT);
  // liftlobby: ring van 3 m rond de kern
  const fin = f < -5 ? B.CONCRETE : f < 0 ? B.TILE : (F.zone === 'lux' || F.zone === 'pent' || F.zone === 'top' || f === 0) ? B.MARBLE : F.zone === 'hotel' ? B.CARPET_BLUE : B.TILE;
  for (let cj = -15; cj < 15; cj++) for (let ci = -15; ci < 15; ci++) {
    const k = ring(ci, cj);
    if (k < 12) continue;
    F.set(ci, cj, 0, fin); for (let l = 1; l < 4; l++) F.set(ci, cj, l, 0);
    if (k === 13 && (ci + cj) % 6 === 0) F.set(ci, cj, 3, B.LAMP);
  }
  const lid = F.addRoom('Liftlobby');
  for (let cj = -15; cj < 15; cj++) for (let ci = -15; ci < 15; ci++) if (ring(ci, cj) >= 12) F.mark(ci, cj, lid);
  for (const L of LIFTS) shaft(F, L);
  stairs(F, false); stairs(F, true);
  // bord met de verdieping aan de kern (oost en west, naast de trap)
  for (const [ci, cj] of [[11, 3], [-12, -4]]) F.set(ci, cj, 2, B.SIGN);
}
function shaft(F, L) {
  const f = F.f;
  if (f < L.fmin || f > L.fmax) return;
  const { ci0, cj0 } = L.cells;
  for (let cj = cj0; cj < cj0 + 3; cj++) for (let ci = ci0; ci < ci0 + 3; ci++) for (let l = 0; l < 4; l++) F.set(ci, cj, l, l === 0 && f === L.fmin ? B.CONCRETE : 0);
  if (L.glass) {
    for (let cj = cj0 - 1; cj <= cj0 + 3; cj++) for (const ci of [ci0 - 1, ci0 + 3]) for (let l = 0; l < 4; l++) F.set(ci, cj, l, l === 0 ? B.METAL : B.GLASS);
    for (let ci = ci0; ci < ci0 + 3; ci++) for (let l = 0; l < 4; l++) F.set(ci, cj0 + 3, l, l === 0 ? B.METAL : B.GLASS);
  }
  const dj = L.door.cj, stop = L.stops.has(f);
  for (let ci = ci0 - 1; ci <= ci0 + 3; ci++) for (let l = 1; l < 4; l++) F.set(ci, dj, l, L.glass ? (ci === ci0 - 1 || ci === ci0 + 3 ? B.METAL : B.GLASS) : (stop ? B.LIFT_DOOR : B.CONCRETE));
  if (L.glass) F.set(ci0 - 1, dj, 0, B.METAL);
  if (stop) {
    for (let ci = ci0; ci < ci0 + 3; ci++) { F.set(ci, dj, 1, 0); F.set(ci, dj, 2, 0); F.set(ci, dj, 0, B.METAL); }
    F.set(L.button[0], L.button[1], 2, B.LIFT_BUTTON);
    // vrije ruimte voor de deur
    for (let k = 1; k <= 2; k++) for (let ci = ci0; ci < ci0 + 3; ci++) { const cj = dj + L.out[1] * k; if (F.get(ci, cj, 1) && F.get(ci, cj, 1) !== B.GLASS) { F.set(ci, cj, 1, 0); F.set(ci, cj, 2, 0); } }
  }
}
// wenteltrap: 12 treden rond een kern van 2×2, 4 treden hoger per verdieping
const STAIR_RING = [[10, -2], [10, -1], [10, 0], [10, 1], [9, 1], [8, 1], [7, 1], [7, 0], [7, -1], [7, -2], [8, -2], [9, -2]];
function stairs(F, west) {
  const f = F.f, R = (c) => west ? rot2(c[0], c[1]) : c;
  const mat = f < 0 ? B.CONCRETE : B.TILE;
  for (let cj = -3; cj <= 2; cj++) for (let ci = 6; ci <= 11; ci++) { const [a, b] = R([ci, cj]); for (let l = 0; l < 4; l++) F.set(a, b, l, B.CONCRETE); }
  for (let ci = 8; ci <= 9; ci++) for (let cj = -1; cj <= 0; cj++) { const [a, b] = R([ci, cj]); for (let l = 0; l < 4; l++) F.set(a, b, l, B.CONCRETE); }
  STAIR_RING.forEach((c, i) => {
    const [a, b] = R(c), h = Math.floor(i / 3), none = f === F_MAX && h > 0;
    for (let l = 0; l < 4; l++) F.set(a, b, l, l === h && !none ? mat : (l < h && f === F_MIN) ? B.CONCRETE : 0);
    if (h === 0 || f === F_MIN) F.set(a, b, 0, mat);
  });
  const [da, db] = R([11, -1]); F.set(da, db, 1, B.DOOR_SHUT); F.set(da, db, 2, B.DOOR_SHUT_TOP); F.set(da, db, 3, B.CONCRETE);
  const [ea, eb] = R([11, 0]); F.set(ea, eb, 1, B.SIGN);
  const id = F.addRoom('Trappenhuis ' + (west ? 'west' : 'oost'));
  for (let cj = -3; cj <= 2; cj++) for (let ci = 6; ci <= 10; ci++) { const [a, b] = R([ci, cj]); F.mark(a, b, id); }
}

// ---------- algemene vloer: plaat, afwerking, lampen ----------
function slab(F, fin, lampStep = 6) {
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const m = F.m(ci, cj);
    if (!m) continue;
    F.set(ci, cj, 0, m === 2 ? fin : B.CONCRETE);
    if (m === 2 && lampStep && ((ci + 100) % lampStep === 3) && ((cj + 100) % lampStep === 3)) F.set(ci, cj, 3, B.LAMP);
  }
}
function areaRoom(F, name, k0, k1, extra) { // alles tussen ring k0..k1 heet zo
  const id = F.addRoom(name, extra);
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const k = ring(ci, cj); if (k >= k0 && k <= k1 && F.m(ci, cj)) F.mark(ci, cj, id); }
  return id;
}
function corridorRing(F, c, mat) {
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const k = ring(ci, cj);
    if ((k === c || k === c + 1) && F.m(ci, cj) === 2) { F.set(ci, cj, 0, mat); for (let l = 1; l < 4; l++) F.set(ci, cj, l, 0); if (k === c && (ci + cj + 100) % 5 === 0) F.set(ci, cj, 3, B.LAMP); }
  }
}
// dwarsgangen van de liftlobby naar de ringgang (midden van elke zijde)
function crossCorridors(F, c, mat, walls = B.PANEL_WHITE) {
  for (let s = 0; s < 4; s++) for (let d = 15; d < c; d++) for (let t = -2; t <= 1; t++) {
    const [ci, cj] = sideToC(s, t, d);
    if (t === -2 || t === 1) { for (let l = 1; l < 4; l++) F.put(ci, cj, l, walls); F.put(ci, cj, 0, B.CONCRETE); }
    else { F.put(ci, cj, 0, mat); for (let l = 1; l < 4; l++) F.put(ci, cj, l, 0); if (d % 4 === 0) F.put(ci, cj, 3, B.LAMP); }
  }
}
// binnenzone (tussen lobby en ringgang): dienstruimtes per zijde
function innerRooms(F, c, kinds, mat = B.PANEL_WHITE) {
  for (let s = 0; s < 4; s++) {
    const d0 = 15, dEnd = c - 1;
    for (const [t0, t1] of [[-16, -2], [1, c - 1]]) {
      const U = new Unit(F, s, t0, t1, d0, dEnd, false);
      const kind = kinds[((s * 2 + (t0 > 0 ? 1 : 0) + F.f) % kinds.length + kinds.length) % kinds.length];
      U.floor(B.CONCRETE);
      // muren: rondom, deur naar de ringgang (aan de kant van d = c-1)
      for (let a = -1; a <= U.w; a++) for (let l = 1; l < 4; l++) { U.put(a, -1, l, mat); U.put(a, U.D, l, mat); }
      for (let b = -1; b <= U.D; b++) for (let l = 1; l < 4; l++) { U.put(-1, b, l, mat); U.put(U.w, b, l, mat); }
      U.put(2, U.D, 1, B.DOOR_SHUT); U.put(2, U.D, 2, B.DOOR_SHUT_TOP); U.put(3, U.D, 2, B.SWITCH);
      U.lamps(4);
      const id = F.addRoom(kind.name); U.mark(id);
      kind.fill(U);
    }
  }
}
const SERVICE = {
  linen: { name: 'Linnenkamer', fill: (U) => { for (let b = 0; b < U.D; b += 2) for (let a = 0; a < U.w; a++) if (a % 4 !== 3) { U.furn(a, b, B.SHELF); U.furn(a, b, B.SHELF, 2); } } },
  storage: { name: 'Opslagruimte', fill: (U) => { for (let b = 0; b < U.D; b += 2) for (let a = 0; a < U.w; a++) if (a % 5 !== 4) { U.furn(a, b, B.CRATE); if ((a + b) % 3) U.furn(a, b, B.CRATE, 2); } } },
  staff: { name: 'Personeelsruimte', fill: (U) => { for (let a = 1; a < U.w - 1; a += 4) { U.furn(a, 3, B.TABLE); U.furn(a + 1, 3, B.TABLE); U.furn(a, 4, B.CHAIR); U.furn(a + 1, 2, B.CHAIR); } kitchen(U, 0, 4, 0); U.furn(U.w - 1, 0, B.WARDROBE); U.furn(U.w - 1, 0, B.WARDROBE, 2); } },
  laundry: { name: 'Wasruimte', fill: (U) => { for (let a = 0; a < U.w; a += 2) { U.furn(a, 0, B.FRIDGE); U.furn(a, 0, B.FRIDGE, 2); } for (let a = 1; a < U.w - 1; a += 3) U.furn(a, U.D - 2, B.TABLE); } },
  techn: { name: 'Technische ruimte', fill: (U) => { for (let a = 0; a < U.w; a += 3) { U.furn(a, 0, B.PUMP); U.furn(a, 2, B.VENT); U.furn(a, 2, B.VENT, 2); } } },
  wc: { name: 'Toiletten', fill: (U) => { for (let a = 0; a < U.w; a += 2) { U.furn(a, U.D - 1, B.TOILET); U.wallCol(a + 1, U.D - 2, U.D - 1, B.PANEL_WHITE); } for (let a = 0; a < U.w; a += 2) U.furn(a, 0, B.SINK); for (let a = 0; a < U.w; a += 2) U.put(a, 0, 2, B.MIRROR_WALL); } },
  meeting: { name: 'Vergaderzaal', fill: (U) => { const b = Math.floor(U.D / 2); for (let a = 2; a < U.w - 2; a++) { U.furn(a, b, B.TABLE); U.furn(a, b - 1, B.CHAIR); U.furn(a, b + 1, B.CHAIR); } U.furn(U.w - 1, b, B.TV, 2); } },
  ice: { name: 'Ijsmachine en automaten', fill: (U) => { U.furn(0, 0, B.FRIDGE); U.furn(0, 0, B.FRIDGE, 2); U.furn(1, 0, B.PAY_MACHINE); U.furn(2, 0, B.FRIDGE); } },
};

// ---------- gevel ----------
function facade(F) {
  const f = F.f, [glass, frame] = F.look, top = F.zone === 'top';
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    if (F.m(ci, cj) !== 1) continue;
    if (f < 0) { for (let l = 0; l < 4; l++) F.set(ci, cj, l, B.CONCRETE); continue; }
    const along = Math.abs(ci) > Math.abs(cj) ? cj : ci;
    const mull = ((along + 100) % 3) === 0;
    F.set(ci, cj, 0, f % 8 === 7 ? B.VENT : frame);
    for (let l = 1; l < 4; l++) F.set(ci, cj, l, mull && l < 3 ? B.METAL : (top && f >= 244 && l === 3 && (along % 2 === 0)) ? B.LAMP : glass);
    if (F.zone === 'lobby' && f <= 1) for (let l = 1; l < 4; l++) F.set(ci, cj, l, mull ? B.METAL : B.GLASS);
  }
  for (const [ci, cj] of F.balc || []) { F.set(ci, cj, 1, B.DOOR_GLASS); F.set(ci, cj, 2, B.DOOR_GLASS); }
  // terras op de dakrand van de lagere plaat (getrapte vorm)
  if (F.below && f > 0) for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const mb = F.below[(cj + HALF) * N + ci + HALF];
    if (!mb || F.m(ci, cj)) continue;
    const id = F.terraceId || (F.terraceId = F.addRoom('Terras op ' + (plateOf(f - 1).a * 2) + ' × ' + (plateOf(f - 1).a * 2) + ' m'));
    F.mark(ci, cj, id);
    F.set(ci, cj, 0, mb === 1 ? B.CONCRETE : (F.zone === 'sky' || (ci + cj) % 9 === 0 ? B.GRASS : B.PLANKS));
    if (mb === 1) F.set(ci, cj, 1, B.GLASS);
    else if (h32(ci, cj, f) < 0.05) { F.set(ci, cj, 1, B.PLANTER); F.set(ci, cj, 2, B.LEAVES); }
  }
  // deuren naar het terras: midden van elke zijde
  if (F.terraceId) for (let s = 0; s < 4; s++) {
    for (const t of [-1, 0]) { const [ci, cj] = sideToC(s, t, F.p.a - 1); if (F.m(ci, cj) === 1) { F.set(ci, cj, 1, B.DOOR_GLASS); F.set(ci, cj, 2, B.DOOR_GLASS); const [ii, ij] = sideToC(s, t, F.p.a - 2); F.set(ii, ij, 1, 0); F.set(ii, ij, 2, 0); } }
  }
  // kroon: verticale vinnen langs de bovenste verdiepingen (silhouet), dak met helikopterplatform
  if (f >= 230) for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const k = ring(ci, cj);
    if (k !== F.p.a || F.m(ci, cj)) continue;
    const along = Math.abs(ci) > Math.abs(cj) ? cj : ci;
    if ((along + 100) % 4 === 0 && inPlate(ci, cj, F.p.a + 1, F.p.r)) for (let l = 0; l < 4; l++) F.set(ci, cj, l, f >= 246 && l === 3 ? B.LAMP : B.PANEL_WHITE);
  }
}

// ---------- vloertypes ----------
const P = {};
P.tech = (F) => {
  slab(F, B.CONCRETE, 6);
  corridorRing(F, 26, B.CONCRETE);
  crossCorridors(F, 26, B.CONCRETE, B.CONCRETE);
  innerRooms(F, 26, [SERVICE.techn, SERVICE.storage, SERVICE.techn, SERVICE.storage], B.CONCRETE);
  const big = [
    ['Elektriciteitsverdeling', (U) => { for (let b = 0; b < U.D; b += 3) for (let a = 0; a < U.w; a++) if (a % 6) { U.furn(a, b, B.SERVER); U.furn(a, b, B.SERVER, 2); } }],
    ['Waterpompen', (U) => { for (let b = 1; b < U.D - 1; b += 4) for (let a = 1; a < U.w - 1; a += 4) { U.furn(a, b, B.PUMP); U.furn(a + 1, b, B.PUMP); U.furn(a, b, B.METAL, 2); } }],
    ['Ventilatiecentrale', (U) => { for (let b = 1; b < U.D - 1; b += 5) for (let a = 0; a < U.w; a++) if (a % 7 !== 6) { U.furn(a, b, B.VENT); U.furn(a, b, B.VENT, 2); U.furn(a, b + 1, B.VENT); } }],
    ['Serverruimte', (U) => { for (let b = 0; b < U.D; b += 2) for (let a = 1; a < U.w - 1; a++) if (a % 8) { U.furn(a, b, B.SERVER); U.furn(a, b, B.SERVER, 2); } }],
    ['Noodgeneratoren', (U) => { for (let b = 1; b < U.D - 2; b += 5) for (let a = 1; a < U.w - 3; a += 6) for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) { U.furn(a + x, b + y, B.GENERATOR); U.furn(a + x, b + y, B.GENERATOR, 2); } }],
    ['Opslagtanks', (U) => { for (let b = 1; b < U.D - 3; b += 6) for (let a = 1; a < U.w - 3; a += 6) for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) if ((x > 0 && x < 3) || (y > 0 && y < 3)) for (let l = 1; l < 4; l++) U.furn(a + x, b + y, B.METAL, l); }],
    ['Onderhoudswerkplaats', (U) => { for (let a = 0; a < U.w; a += 3) { U.furn(a, 0, B.SHELF); U.furn(a, 0, B.SHELF, 2); } for (let a = 2; a < U.w - 2; a += 5) { U.furn(a, 4, B.TABLE); U.furn(a + 1, 4, B.TABLE); } }],
  ];
  for (let s = 0; s < 4; s++) strip(F, s, 28, [22, 26], (U, i) => {
    const [name, fill] = big[(s * 3 + i + F.f * 5 + 500) % big.length];
    U.floor(B.CONCRETE); U.walls(B.CONCRETE, 2); U.lamps(5);
    U.mark(F.addRoom(name)); fill(U);
  });
};
P.park = (F) => {
  const f = F.f;
  slab(F, B.CONCRETE, 0);
  const id = F.addRoom('Parkeergarage niveau ' + floorLabel(f));
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const k = ring(ci, cj);
    if (F.m(ci, cj) !== 2 || k < 15) continue;
    F.mark(ci, cj, id);
    const t = Math.abs(ci) > Math.abs(cj) ? (ci >= 0 ? cj : -1 - cj) : (cj < 0 ? ci : -1 - ci);
    const aisle = (k >= 22 && k <= 27) || (k >= 38 && k <= 42), walk = k <= 16;
    const cross = Math.abs(t + 0.5) < 3.5 && k < 43;  // dwarsverbinding tussen de rijstroken
    if (walk) { F.set(ci, cj, 0, B.TILE); if (k === 16 && (t + 100) % 6 === 0) F.set(ci, cj, 1, B.POST); continue; }
    if (aisle || cross) {
      F.set(ci, cj, 0, (k === 24 || k === 40) && (t + 100) % 6 < 3 ? B.LINE_YELLOW : B.ASPHALT);
      if ((k === 25 || k === 40) && (t + 100) % 8 === 0) F.set(ci, cj, 3, B.LAMP);
      continue;
    }
    // parkeervakken van 3 breed, witte lijnen; kolommen elke 9 m
    const bay = (t + 300) % 3, first = k === 17 || k === 28 || k === 33 || k === 43;
    F.set(ci, cj, 0, bay === 0 ? B.LINE_WHITE : B.CONCRETE);
    if ((t + 300) % 9 === 0 && (k === 21 || k === 32 || k === 37)) for (let l = 1; l < 4; l++) F.set(ci, cj, l, B.CONCRETE);
    if (first && bay === 0 && (t + 300) % 9 === 3) { F.set(ci, cj, 1, B.CHARGER); }
    if ((k === 19 || k === 30 || k === 35 || k === 45) && bay === 0) F.set(ci, cj, 3, B.LAMP);
  }
  // geparkeerde auto's (twee breed, vier lang) in een deel van de vakken
  const COL = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_WHITE, B.PAINT_BLACK, B.METAL, B.PAINT_GREEN, B.PAINT_YELLOW];
  for (let s = 0; s < 4; s++) for (const [k0, k1] of [[17, 21], [28, 32], [33, 37], [43, 46]]) for (let t = -k0; t < k0; t += 3) {
    if (Math.abs(t + 0.5) < 4.5) continue;
    if (s === 1 && k0 === 43 && t > -18 && t < 16) continue; // hellingbaan
    if (h32(s * 1000 + t, k0, f) > 0.72) continue;
    const col = COL[Math.floor(h32(t, k0 + s, f * 3) * COL.length)];
    for (let d = k0; d <= k1 - 1; d++) for (let q = 1; q <= 2; q++) {
      const [ci, cj] = sideToC(s, t + q, d);
      if (F.m(ci, cj) !== 2 || F.get(ci, cj, 1)) continue;
      const mid = d > k0 && d < k1 - 1;
      F.set(ci, cj, 1, col); if (mid) F.set(ci, cj, 2, B.DARKGLASS);
    }
  }
  // hellingbaan aan de oostkant (k 43..46, t -12..11): 1 blok hoger per 6 m, naar de verdieping erboven
  ramp(F);
  // betaalautomaten en bewegwijzering in de liftlobby
  for (const [ci, cj] of [[-14, -14], [13, 13]]) F.set(ci, cj, 1, B.PAY_MACHINE);
  for (const [ci, cj] of [[0, -16], [0, 15], [-16, 0], [15, -1]]) F.set(ci, cj, 2, B.SIGN);
};
function ramp(F) {
  const f = F.f, has = (g) => g >= -15 && g <= -1;
  for (let t = -16; t <= 15; t++) for (let d = 43; d <= 46; d++) {
    const [ci, cj] = sideToC(1, t, d);
    if (F.m(ci, cj) !== 2) continue;
    if (t < -12 || t > 11) { F.set(ci, cj, 0, B.ASPHALT); for (let l = 1; l < 4; l++) F.set(ci, cj, l, 0); continue; }
    for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0);
    if (has(f)) F.set(ci, cj, Math.floor((t + 12) / 6), (t + 12) % 6 === 0 ? B.LINE_YELLOW : B.ASPHALT);
    else if (!has(f - 1)) F.set(ci, cj, 0, B.CONCRETE);
    if (!has(f) && has(f - 1)) { if (d === 43 || d === 46) F.set(ci, cj, 1, B.METAL); }
  }
}
P.logi = (F) => {
  slab(F, B.CONCRETE, 6);
  corridorRing(F, 26, B.CONCRETE);
  crossCorridors(F, 26, B.CONCRETE, B.CONCRETE);
  innerRooms(F, 26, [SERVICE.storage, SERVICE.staff, SERVICE.storage, SERVICE.techn], B.CONCRETE);
  for (let s = 0; s < 4; s++) strip(F, s, 28, [24], (U, i) => {
    U.floor(B.CONCRETE); U.walls(B.CONCRETE, 2); U.lamps(5);
    const name = ['Bevoorrading en laadkades', 'Afvalcentrale', 'Magazijn winkels', 'Magazijn hotel'][(s + i) % 4];
    U.mark(F.addRoom(name));
    for (let b = 1; b < U.D - 1; b += 3) for (let a = 1; a < U.w - 1; a++) if (a % 6 !== 0) { U.furn(a, b, B.CRATE); if ((a * b) % 3) U.furn(a, b, B.CRATE, 2); }
    U.furn(0, 0, B.SIGN, 2);
  });
  ramp(F);
};
P.metro = (F) => {
  // perronniveau: de sporen lopen onder de laan aan de noordkant (js/megacity.js); hier de verbindingshal
  slab(F, B.TILE, 5);
  areaRoom(F, 'Metrostation Megatower · perronhal', 15, 47);
  P.mallShops(F, 'Metrohal', [SERVICE.storage, SERVICE.wc, SERVICE.staff, SERVICE.techn]);
  ramp(F);
};
P.concourse = (F) => {
  slab(F, B.MARBLE, 5);
  areaRoom(F, 'Metrohal · ticketautomaten', 15, 47);
  // ticketautomaten en poortjes richting de noordelijke uitgang (naar het perron onder de laan)
  for (let t = -6; t <= 5; t += 2) { const [ci, cj] = sideToC(0, t, 40); F.set(ci, cj, 1, B.TICKET); }
  for (let t = -6; t <= 5; t++) { const [ci, cj] = sideToC(0, t, 44); if (t % 2) F.set(ci, cj, 1, B.METAL); }
  for (const t of [-8, 8]) { const [ci, cj] = sideToC(0, t, 36); F.set(ci, cj, 2, B.SIGN); }
  P.mallShops(F, 'Metrohal', [SERVICE.wc, SERVICE.storage, SERVICE.staff, SERVICE.storage], true);
  ramp(F);
  // doorgang naar het metroperron onder de laan (noordkant)
  (F.after = F.after || []).push(() => { for (let t = -4; t <= 3; t++) for (const d of [46, 47]) { const [ci, cj] = sideToC(0, t, d); F.set(ci, cj, 0, B.MARBLE); for (let l = 1; l < 4; l++) F.set(ci, cj, l, (t === -4 || t === 3) ? B.CONCRETE : 0); } });
};
// winkelcentrum: winkels rondom aan de gevelkant, brede passage in het midden
const SHOPS = [
  ['Supermarkt', (U) => { for (let b = 1; b < U.D - 1; b += 3) for (let a = 2; a < U.w - 1; a++) { U.furn(a, b, B.SHELF); U.furn(a, b, B.SHELF, 2); } for (let a = 0; a < U.w; a += 3) { U.furn(a, U.D - 1, B.FRIDGE); U.furn(a, U.D - 1, B.FRIDGE, 2); } U.furn(0, 1, B.COUNTER); U.furn(0, 3, B.COUNTER); U.furn(0, 5, B.PAY_MACHINE); }],
  ['Kledingwinkel', (U) => { for (let b = 2; b < U.D - 1; b += 3) for (let a = 1; a < U.w - 1; a += 2) { U.furn(a, b, B.POST); U.furn(a, b, B.WOOL_RED, 2); } U.furn(U.w - 1, 0, B.COUNTER); }],
  ['Elektronicawinkel', (U) => { for (let a = 0; a < U.w; a++) { U.furn(a, U.D - 1, B.TABLE); U.furn(a, U.D - 1, a % 2 ? B.TV_ON : B.TV, 2); } for (let a = 1; a < U.w - 1; a += 3) U.furn(a, 3, B.TABLE); }],
  ['Boekhandel', (U) => { for (let b = 1; b < U.D; b += 2) for (let a = 0; a < U.w; a++) if (a % 5) { U.furn(a, b, B.BOOKSHELF); U.furn(a, b, B.BOOKSHELF, 2); } }],
  ['Restaurant', (U) => restaurant(U)],
  ['Koffiebar', (U) => { for (let a = 0; a < U.w; a++) U.furn(a, 1, a === 0 ? B.STOVE : B.COUNTER); for (let b = 4; b < U.D; b += 3) for (let a = 1; a < U.w - 1; a += 3) { U.furn(a, b, B.TABLE); U.furn(a + 1, b, B.CHAIR); U.furn(a - 1, b, B.CHAIR); } }],
  ['Apotheek', (U) => { for (let a = 0; a < U.w; a++) { U.furn(a, U.D - 1, B.SHELF); U.furn(a, U.D - 1, B.SHELF, 2); } U.furn(1, 2, B.COUNTER); U.furn(2, 2, B.COUNTER); }],
  ['Juwelier', (U) => { for (let a = 1; a < U.w - 1; a += 2) U.furn(a, 3, B.GLASS); U.furn(0, U.D - 1, B.COUNTER); }],
];
function restaurant(U, S) {
  U.wallRow(U.D - 4 >= 6 ? 2 : 1, 0, U.w - 1, B.WALL_WOOD, 1);
  const kb = 0; for (let a = 0; a < U.w; a++) U.furn(a, kb, a % 4 === 0 ? B.STOVE : a % 4 === 2 ? B.SINK : B.COUNTER);
  U.furn(U.w - 1, kb + 1 < 2 ? 1 : 0, B.FRIDGE);
  for (let b = 4; b < U.D - 1; b += 3) for (let a = 1; a < U.w - 2; a += 4) { U.furn(a, b, B.TABLE); U.furn(a + 1, b, B.TABLE); U.furn(a - 1, b, B.CHAIR); U.furn(a + 2, b, B.CHAIR); U.furn(a, b + 1, B.CHAIR); U.furn(a + 1, b - 1, B.CHAIR); U.put(a, b, 3, B.LAMP); }
  for (let a = 0; a < U.w; a += 5) U.plant(a, U.D - 1);
}
P.mallShops = (F, label, inner, noShops) => {
  corridorRing(F, 26, B.MARBLE);
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const k = ring(ci, cj); if (k >= 15 && k <= 25 && F.m(ci, cj) === 2) { F.set(ci, cj, 0, B.MARBLE); if ((ci + cj + 200) % 7 === 0 && k === 20) { F.set(ci, cj, 1, B.PLANTER); F.set(ci, cj, 2, B.LEAVES); } } }
  areaRoom(F, label + ' · passage', 15, 27);
  if (inner) innerRooms(F, 22, inner);
  if (noShops) return;
  for (let s = 0; s < 4; s++) strip(F, s, 28, [12, 16, 10, 14], (U, i) => {
    const [name, fill] = SHOPS[(s * 5 + i * 3 + F.f * 7 + 300) % SHOPS.length];
    U.floor(name === 'Restaurant' ? B.PARQUET : B.TILE); U.lamps(4);
    for (let a = -1; a <= U.w; a++) for (let l = 1; l < 4; l++) U.put(a, -1, l, (a + 100) % 4 === 0 ? B.METAL : B.GLASS);
    for (let b = -1; b < U.D; b++) for (let l = 1; l < 4; l++) { U.put(-1, b, l, B.PANEL_WHITE); U.put(U.w, b, l, B.PANEL_WHITE); }
    U.put(1, -1, 1, B.DOOR_GLASS); U.put(2, -1, 1, B.DOOR_GLASS); U.put(1, -1, 2, B.DOOR_GLASS); U.put(2, -1, 2, B.DOOR_GLASS);
    U.put(0, -1, 3, B.SIGN);
    U.mark(F.addRoom(name + ' · ' + label)); fill(U);
  });
};
P.mall = (F) => { slab(F, B.MARBLE, 5); P.mallShops(F, F.f === -1 ? 'Winkelcentrum niveau B1' : 'Winkelcentrum niveau B2', [SERVICE.wc, SERVICE.storage, SERVICE.staff, SERVICE.storage]); ramp(F); escalators(F); };
function escalators(F) { // roltrappen in de passage (noord- en zuidkant), naar de verdieping erboven
  if (F.f === 1) { for (const s of [0, 2]) for (let i = 1; i < 4; i++) for (const t of [7, 8, 9, 10]) { const [ci, cj] = sideToC(s, t, 22 + i); if (t === 7 || t === 10) F.set(ci, cj, 1, B.GLASS); else for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0); } return; }
  if (F.f >= 1) return;
  for (const s of [0, 2]) for (let i = 0; i < 4; i++) for (const t of [7, 10]) { const [ci, cj] = sideToC(s, t, 22 + i); F.set(ci, cj, 1, B.GLASS); F.set(ci, cj, 2, 0); } // leuningen
  for (const s of [0, 2]) for (let i = 0; i < 4; i++) for (const t of [8, 9]) {
    const [ci, cj] = sideToC(s, t, 22 + i);
    for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0);
    F.set(ci, cj, i, B.ESCALATOR);
    if (i === 3) F.set(ci, cj, 0, 0);
  }
}
P.lobby = (F) => {
  const f = F.f;
  if (f === 0) {
    slab(F, B.MARBLE, 5);
    areaRoom(F, 'Grote lobby Megatower', 15, 47);
    // receptie, zitgroepen, planten, ingangen aan alle vier de zijden
    for (let s = 0; s < 4; s++) {
      for (let t = -6; t <= 5; t++) { const [ci, cj] = sideToC(s, t, 26); F.set(ci, cj, 1, s === 0 ? B.MARBLE : 0); }
      if (s === 0) { const [ci, cj] = sideToC(0, 0, 27); F.set(ci, cj, 1, B.SIGN); }
      for (const t of [-12, 12]) for (const d of [34, 35]) for (let q = 0; q < 3; q++) { const [ci, cj] = sideToC(s, t + q, d); F.set(ci, cj, 1, d === 35 ? B.SOFA_LEATHER : 0); }
      for (const t of [-20, -16, 16, 20]) { const [ci, cj] = sideToC(s, t, 40); F.set(ci, cj, 1, B.PLANTER); F.set(ci, cj, 2, B.LEAVES); F.set(ci, cj, 3, B.LEAVES); }
      // hoofdingang: glazen deuren in de gevel en een overkapping buiten
      for (let t = -3; t <= 2; t++) {
        const [ci, cj] = sideToC(s, t, F.p.a - 1); if (F.m(ci, cj) !== 1) continue;
        F.entr = F.entr || []; F.entr.push([ci, cj]);
        for (let d = F.p.a; d < HALF; d++) { const [oi, oj] = sideToC(s, t, d); F.set(oi, oj, 3, B.GLASS); }
      }
      for (let d = F.p.a; d < HALF; d++) for (const t of [-4, 3]) { const [oi, oj] = sideToC(s, t, d); F.set(oi, oj, 3, B.METAL); if (d === HALF - 1) for (let l = 1; l < 3; l++) F.set(oi, oj, l, B.METAL); }
    }
    // inrit parkeergarage (oostkant): slagboom en betaalautomaat
    ramp(F);
    const exitHall = () => { for (let t = 12; t <= 18; t++) for (let d = 43; d <= 47; d++) { const [ci, cj] = sideToC(1, t, d); F.set(ci, cj, 0, B.ASPHALT); for (let l = 1; l < 4; l++) F.set(ci, cj, l, 0); if (d >= 45) F.set(ci, cj, 3, B.CONCRETE); } for (let d = 42; d <= 46; d++) { const [ci, cj] = sideToC(1, 13, d); F.set(ci, cj, 1, d === 42 ? B.PAY_MACHINE : B.BARRIER); } };
    exitHall(); (F.after = F.after || []).push(exitHall);
    escalators(F);
    return;
  }
  if (f === 1) { // tussenverdieping boven de lobby (vide aan de gevelkant)
    slab(F, B.PARQUET, 5);
    areaRoom(F, 'Mezzanine · cafés', 15, 47);
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
      const k = ring(ci, cj);
      if (F.m(ci, cj) === 2 && k >= 30) { for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0); }
      if (k === 29 && F.m(ci, cj) === 2) F.set(ci, cj, 1, B.GLASS);
    }
    for (let s = 0; s < 4; s++) for (let t = -10; t <= 10; t += 5) { const [ci, cj] = sideToC(s, t, 22); F.set(ci, cj, 1, B.TABLE); const [a, b] = sideToC(s, t + 1, 22); F.set(a, b, 1, B.CHAIR); const [c, d] = sideToC(s, t - 1, 22); F.set(c, d, 1, B.CHAIR); }
    for (let s = 0; s < 4; s++) for (let t = 2; t <= 5; t++) { const [ci, cj] = sideToC(s, t, 26); F.set(ci, cj, 1, B.COUNTER); }
    escalators(F);
    return;
  }
  slab(F, f <= 4 ? B.PARQUET : B.TILE, 5);
  if (f <= 4) {
    corridorRing(F, 26, B.MARBLE); crossCorridors(F, 26, B.MARBLE);
    innerRooms(F, 26, [SERVICE.wc, SERVICE.storage, SERVICE.staff, SERVICE.techn]);
    const kitchens = ['Italiaans restaurant', 'Japans restaurant', 'Brasserie', 'Steakhouse', 'Visrestaurant', 'Vegetarisch restaurant', 'Pizzeria', 'Libanees restaurant'];
    for (let s = 0; s < 4; s++) strip(F, s, 28, [26, 30], (U, i) => { U.floor(B.PARQUET); U.walls(B.WALL_WOOD, 2); U.lamps(4); U.mark(F.addRoom(kitchens[(s * 2 + i + f * 3) % kitchens.length])); restaurant(U); });
  } else P.mallShops(F, 'Winkels verdieping ' + f, [SERVICE.wc, SERVICE.storage, SERVICE.staff, SERVICE.storage]);
};
P.office = (F) => {
  const f = F.f;
  slab(F, B.CARPET_GREY, 5);
  if (f >= 20 && f <= 22) { // congrescentrum: grote zaal met stoelrijen en podium
    corridorRing(F, 15, B.CARPET_BLUE);
    areaRoom(F, f === 20 ? 'Congrescentrum · grote zaal' : f === 21 ? 'Congrescentrum · zaal Atlas' : 'Congrescentrum · foyer', 17, 47);
    for (let s = 0; s < 4; s++) {
      for (let t = -14; t < 14; t++) for (const d of [17]) { const [ci, cj] = sideToC(s, t, d); if (Math.abs(t + 0.5) > 2) for (let l = 1; l < 4; l++) F.set(ci, cj, l, B.WALL_WOOD); }
      if (f < 22) for (let d = 20; d < 36; d += 2) for (let t = -14; t < 14; t++) { if (Math.abs(t + 0.5) < 2) continue; const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, B.CHAIR_RED); }
      else for (let d = 22; d < 38; d += 6) for (let t = -12; t < 12; t += 6) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, B.TABLE); }
      if (f < 22) for (let t = -10; t < 10; t++) for (const d of [38, 39]) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, B.DARK_PLANKS); if (d === 39 && t % 4 === 0) F.set(ci, cj, 2, B.TV_ON); }
    }
    return;
  }
  corridorRing(F, 26, B.CARPET_GREY); crossCorridors(F, 26, B.CARPET_GREY);
  innerRooms(F, 26, [SERVICE.meeting, SERVICE.wc, SERVICE.meeting, SERVICE.storage, SERVICE.staff, SERVICE.meeting]);
  const firms = ['Advocatenkantoor', 'Ingenieursbureau', 'Bank', 'Verzekeraar', 'Softwarebedrijf', 'Architectenbureau', 'Rederij', 'Consultancy', 'Mediabedrijf', 'Ontwerpstudio'];
  for (let s = 0; s < 4; s++) {
    strip(F, s, 28, [30, 40], (U, i) => {
      U.floor(B.CARPET_GREY); U.lamps(4);
      for (let a = -1; a <= U.w; a++) for (let l = 1; l < 4; l++) U.put(a, -1, l, (a + 100) % 5 === 0 ? B.PANEL_DARK : B.GLASS);
      for (let b = -1; b < U.D; b++) for (let l = 1; l < 4; l++) { U.put(-1, b, l, B.PANEL_WHITE); U.put(U.w, b, l, B.PANEL_WHITE); }
      U.put(2, -1, 1, B.DOOR_GLASS); U.put(2, -1, 2, B.DOOR_GLASS); U.put(3, -1, 2, B.SWITCH);
      U.mark(F.addRoom(firms[(s * 3 + i + f * 7) % firms.length] + ' · verdieping ' + f));
      // bureaus in groepjes van 4 met stoelen, kasten tegen de zijmuur, een printer, planten
      for (let b = 2; b < U.D - 1; b += 4) for (let a = 1; a < U.w - 2; a += 4) {
        U.furn(a, b, B.TABLE); U.furn(a + 1, b, B.TABLE); U.furn(a, b + 1, B.TABLE); U.furn(a + 1, b + 1, B.TABLE);
        U.furn(a - 1, b, B.CHAIR); U.furn(a + 2, b + 1, B.CHAIR); U.furn(a, b - 1, B.CHAIR); U.furn(a + 1, b + 2, B.CHAIR);
        U.furn(a, b, B.TV, 2);
      }
      for (let b = 0; b < U.D; b += 2) U.furn(U.w - 1, b, B.BOOKSHELF);
      U.plant(0, U.D - 1); U.plant(U.w - 2, U.D - 1);
    });
  }
};
// ---------- hotel ----------
function hotelRoom(U, S, f, n, suite, last) {
  U.mirror = !last && n % 2 === 1; // om de andere kamer gespiegeld (de hoekkamer niet: daar zit de deur aan de gang)
  U.floor(S.carpet); U.walls(S.wall, 0); U.lamps(9);
  const w = U.w, D = U.D;
  U.mark(U.F.addRoom((suite ? 'Suite ' : 'Kamer ') + (f * 100 + n), { style: S.name, kind: suite ? 'suite' : 'kamer' }));
  // gangetje (a = 0) langs de badkamer, badkamer (a 2..ba1), dan de kamer naar het raam
  const ba0 = 2, ba1 = suite ? Math.min(w - 4, 5) : w - 1, bb1 = suite ? 4 : 3;
  U.wallCol(ba0 - 1, 0, bb1, S.wall, 1); U.wallRow(bb1 + 1, ba0 - 1, ba1, S.wall);
  if (ba1 + 1 < w) U.wallCol(ba1 + 1, 0, bb1 + 1, S.wall);
  bathroom(U, ba0, 0, ba1, bb1, S, suite);
  const b0 = bb1 + 2;
  if (!suite) {
    // bed met het hoofdeinde tegen de zijmuur, nachtkastjes, tv-meubel, bureau, fauteuil, kleerkast
    for (let k = 0; k < 2; k++) { U.furn(w - 1, b0 + 1 + k, B.PILLOW); U.furn(w - 2, b0 + 1 + k, S.bed); U.furn(w - 3, b0 + 1 + k, S.bed); }
    U.furn(w - 1, b0, B.TABLE); U.furn(w - 1, b0 + 3, B.TABLE);
    U.furn(0, b0 + 2, B.TABLE); U.furn(0, b0 + 2, B.TV, 2);
    U.furn(0, D - 1, B.TABLE); U.furn(1, D - 1, S.chair);
    U.furn(w - 1, D - 1, S.sofa);
    U.furn(1, b0, B.WARDROBE); U.furn(1, b0, B.WARDROBE, 2);
    U.put(Math.floor(w / 2), b0 + 2, 3, B.LAMP);
  } else {
    // suite: slaapgedeelte links, woonkamer met keukentje, eettafel en zetels rechts, groot bad, balkon
    const half = ba1 + 1;
    U.wallCol(half, b0 - 1, D - 1, S.wall, b0 + 1);
    bedroom(U, 0, half - 1, b0, D - 1, S, '');
    kitchen(U, half + 1, Math.min(w - 1, half + 4), 0);
    living(U, half + 1, w - 1, 1, D - 1, S, true);
    balcony(U);
  }
}
P.hotel = (F) => {
  const f = F.f, S0 = STYLES[f % 4];
  slab(F, B.CARPET_BLUE, 0);
  if (f >= 30 && f <= 36) return hotelPublic(F);
  corridorRing(F, 27, B.CARPET_BLUE); crossCorridors(F, 27, B.CARPET_BLUE, B.WALL_WOOD);
  innerRooms(F, 27, [SERVICE.linen, SERVICE.ice, SERVICE.storage, SERVICE.staff, SERVICE.linen, SERVICE.techn]);
  const suite = f >= 70;
  let n = 1;
  for (let s = 0; s < 4; s++) strip(F, s, 29, suite ? [12, 14] : [6, 6, 7], (U, i, last) => {
    const S = STYLES[(f + s + i) % 4], big = suite || last || U.w >= 10;
    hotelRoom(U, big ? STYLES[3] : S, f, n++, big, last);
  });
};
function hotelPublic(F) {
  const f = F.f;
  const names = { 30: 'Hotelreceptie en lobbybar', 31: 'Hotelrestaurant en ontbijtbuffet', 32: 'Conferentiecentrum hotel', 33: 'Wellness en zwembad', 34: 'Zwembad (vide)', 35: 'Fitness en spa', 36: 'Hotelkeukens, wasruimte en personeel' };
  slab(F, f === 33 || f === 34 ? B.TILE : B.MARBLE, 5);
  areaRoom(F, names[f], 15, 47);
  if (f === 30) {
    for (let s = 0; s < 4; s++) {
      for (let t = -8; t <= 7; t++) { const [ci, cj] = sideToC(s, t, 20); F.set(ci, cj, 1, s === 0 ? B.MARBLE : 0); }
      for (let t = -14; t < 14; t += 4) for (const d of [30, 31]) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, d === 31 ? B.SOFA_LEATHER : B.TABLE); }
      if (s === 2) for (let t = -10; t < 10; t++) { const [ci, cj] = sideToC(2, t, 24); F.set(ci, cj, 1, B.DARK_PLANKS); const [bi, bj] = sideToC(2, t, 22); F.set(bi, bj, 1, t % 2 ? B.SHELF : 0); }
      for (const t of [-18, 18]) { const [ci, cj] = sideToC(s, t, 36); F.set(ci, cj, 1, B.PLANTER); F.set(ci, cj, 2, B.LEAVES); }
    }
    const [ci, cj] = sideToC(0, 0, 21); F.set(ci, cj, 2, B.SIGN);
  } else if (f === 31) {
    for (let s = 0; s < 4; s++) {
      for (let t = -12; t < 12; t++) { const [ci, cj] = sideToC(s, t, 18); F.set(ci, cj, 1, s === 1 && t % 3 === 0 ? B.STOVE : B.COUNTER); }
      for (let d = 23; d < 38; d += 3) for (let t = -15; t < 15; t += 4) { for (const q of [0, 1]) { const [ci, cj] = sideToC(s, t + q, d); F.set(ci, cj, 1, B.TABLE); } for (const [q, e] of [[-1, 0], [2, 0], [0, 1], [1, -1]]) { const [ci, cj] = sideToC(s, t + q, d + e); if (!F.get(ci, cj, 1)) F.set(ci, cj, 1, B.CHAIR); } }
    }
  } else if (f === 32) {
    for (let s = 0; s < 4; s++) strip(F, s, 18, [16, 22], (U, i) => {
      U.floor(B.CARPET_BLUE); U.walls(B.WALL_WOOD, 2); U.lamps(4); U.mark(F.addRoom(['Vergaderkamer Nova', 'Conferentiezaal Orion', 'Vergaderkamer Lyra', 'Conferentiezaal Vega'][(s + i) % 4]));
      const b = Math.floor(U.D / 2); for (let a = 2; a < U.w - 2; a++) { U.furn(a, b, B.TABLE); U.furn(a, b - 1, B.CHAIR); U.furn(a, b + 1, B.CHAIR); } U.furn(U.w - 1, b, B.TV_ON, 2);
    });
  } else if (f === 33) {
    // zwembad van 40 × 12 m met een verhoogd terras (1 m diep), dubbele hoogte (de plaat van 34 is weg)
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
      const k = ring(ci, cj); if (F.m(ci, cj) !== 2 || k < 15) continue;
      F.set(ci, cj, 1, B.TILE);
      const pool = cj >= 18 && cj <= 31 && Math.abs(ci + 0.5) < 20;
      if (pool) { F.set(ci, cj, 1, B.WATER); F.set(ci, cj, 0, B.TILE); }
      if (!pool && cj > 16 && (ci + 100) % 7 === 0 && cj === 34) F.set(ci, cj, 2, B.SOFA);
    }
    for (let s = 0; s < 4; s++) if (s !== 2) for (let t = -10; t < 10; t += 4) { const [ci, cj] = sideToC(s, t, 32); F.set(ci, cj, 2, B.CHAIR); }
  } else if (f === 34) {
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const k = ring(ci, cj); if (F.m(ci, cj) === 2 && k >= 16) for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0); if (k === 15 && F.m(ci, cj) === 2) { F.set(ci, cj, 0, B.TILE); F.set(ci, cj, 1, B.GLASS); } }
  } else if (f === 35) {
    for (let s = 0; s < 4; s++) for (let d = 20; d < 38; d += 3) for (let t = -14; t < 14; t += 3) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, s % 2 ? B.GYM : (d > 30 ? B.BED : B.GYM)); }
    for (let s = 0; s < 4; s++) { const [ci, cj] = sideToC(s, 0, 17); F.set(ci, cj, 2, B.TV_ON); }
  } else if (f === 36) {
    corridorRing(F, 27, B.CONCRETE); crossCorridors(F, 27, B.CONCRETE);
    innerRooms(F, 27, [SERVICE.laundry, SERVICE.staff, SERVICE.storage, SERVICE.linen]);
    for (let s = 0; s < 4; s++) strip(F, s, 29, [30], (U, i) => {
      U.floor(B.TILE); U.walls(B.PANEL_WHITE, 2); U.lamps(4); U.mark(F.addRoom(['Hoofdkeuken', 'Banketkeuken', 'Wasserij', 'Personeelsrestaurant'][s]));
      if (s < 2) { for (let b = 1; b < U.D - 1; b += 3) for (let a = 1; a < U.w - 1; a++) U.furn(a, b, a % 3 === 0 ? B.STOVE : a % 3 === 1 ? B.COUNTER : B.SINK); for (let a = 0; a < U.w; a += 2) { U.furn(a, U.D - 1, B.FRIDGE); U.furn(a, U.D - 1, B.FRIDGE, 2); } }
      else if (s === 2) SERVICE.laundry.fill(U); else SERVICE.staff.fill(U);
    });
  }
}
// ---------- appartementen ----------
const APT = [ // naam, kolommen, minimale breedte
  ['Studio', [{ type: 'bath', w: 3 }, { type: 'living', w: 7 }]],
  ['Appartement met één slaapkamer', [{ type: 'bath', w: 3 }, { type: 'living', w: 8 }, { type: 'bed', w: 5 }]],
  ['Appartement met twee slaapkamers', [{ type: 'bath', w: 4 }, { type: 'bed', w: 5 }, { type: 'living', w: 9 }, { type: 'bed', w: 5 }]],
  ['Gezinsappartement met drie slaapkamers', [{ type: 'bed', w: 5 }, { type: 'bath', w: 4 }, { type: 'kid', w: 4 }, { type: 'living', w: 10 }, { type: 'kid', w: 4 }]],
  ['Luxe appartement met vier slaapkamers', [{ type: 'bed', w: 6 }, { type: 'bath', w: 4 }, { type: 'kid', w: 5 }, { type: 'living', w: 12 }, { type: 'bath', w: 4 }, { type: 'bed', w: 5 }, { type: 'kid', w: 5 }]],
];
const colsW = (cols) => cols.reduce((s, c) => s + c.w + 1, 0) - 1;
// kolommen van een woning (ook gebruikt voor de bovenverdieping van een duplex: de trap staat in de woonkamer)
function aptCols(w, kind) {
  let k = kind;
  while (k > 0 && colsW(APT[k][1]) > w) k--;
  const cols = APT[k][1].map(c => ({ ...c }));
  const extra = w - colsW(cols);
  if (extra > 0) cols.find(c => c.type === 'living').w += extra;
  let a = 0, stairA = w - 2;
  for (const c of cols) { if (c.type === 'living') stairA = Math.min(w - 1, a + 1); a += c.w + 1; }
  return { k, cols, stairA };
}
function aptInto(U, kind, S, label, opts) {
  // past de woning niet, dan een kleiner type
  const { k, cols, stairA } = aptCols(U.w, kind);
  U.stairA = stairA;
  U.mark(U.F.addRoom(label + ' · ' + APT[k][0], { style: S.name, kind: 'woning' }));
  dwelling(U, cols, S, opts);
}
P.apt = (F) => {
  const f = F.f;
  slab(F, B.TILE, 0);
  if (f === 80) return skyLobby(F, 'Woonlobby en bewonerslounge');
  if (f >= 110 && f % 2 === 1) return duplexUpper(F, 'Duplex');
  corridorRing(F, 23, B.CARPET_BEIGE); crossCorridors(F, 23, B.CARPET_BEIGE);
  innerRooms(F, 23, [SERVICE.storage, SERVICE.techn, SERVICE.storage, SERVICE.wc]);
  let n = 1;
  const pat = f % 3 === 0 ? [17, 26, 11] : f % 3 === 1 ? [23, 11, 17] : [11, 17, 26];
  for (let s = 0; s < 4; s++) strip(F, s, 25, pat, (U, i, last) => {
    const S = STYLES[Math.floor(h32(f, s * 10 + i, 77) * 4)];
    const kind = last ? 4 : U.w >= 25 ? 3 : U.w >= 21 ? 2 : U.w >= 16 ? 1 : 0;
    const label = 'Appartement ' + f + '.' + String(n++).padStart(2, '0');
    aptInto(U, kind, S, label, { balcony: f % 2 === 0, lux: kind >= 3 });
    if (f >= 110) duplexStair(U);
  });
};
// duplex: trap in de woning naar de verdieping erboven (binnentrap 4 treden, gat in de plaat erboven)
function duplexStair(U) {
  // binnentrap in de gang (b = 1, a 2..5), elke trede 1 hoger; erboven een trapgat in de bovenverdieping
  for (let i = 0; i < 4; i++) { const a = 2 + i; for (let l = 0; l < 4; l++) U.put(a, 1, l, l <= i ? B.PLANKS : 0); }
}
function duplexTop(U, S, label) {
  U.floor(S.floor); U.walls(S.wall, null); U.lamps(5);
  U.mark(U.F.addRoom(label, { style: S.name, kind: 'woning' }));
  for (let i = 1; i < 4; i++) for (let l = 0; l < 4; l++) U.put(2 + i, 1, l, 0); // trapgat
  const D = U.D, hb = 2;
  const cols = [{ type: 'bed', w: Math.max(5, Math.floor((U.w - 5) / 2)) }, { type: 'bath', w: 4 }];
  cols.push({ type: 'kid', w: U.w - colsW(cols) - 1 });
  let a = 0;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i], a0 = a, a1 = Math.min(U.w - 1, a + c.w - 1);
    if (a1 < a0) break;
    if (i > 0) U.wallCol(a0 - 1, hb, D - 1, S.wall);
    U.wallRow(hb, a0, a1, S.wall, a0 + (c.type === 'bath' ? 0 : 1));
    if (c.type === 'bath') bathroom(U, a0, hb + 1, a1, Math.min(D - 1, hb + 4), S, true);
    else if (a1 - a0 >= 3) bedroom(U, a0, a1, hb + 1, D - 1, S, c.type);
    a = a1 + 2;
  }
  balcony(U);
}
function duplexUpper(F, label) {
  corridorRing(F, 23, B.CARPET_BEIGE); crossCorridors(F, 23, B.CARPET_BEIGE);
  innerRooms(F, 23, [SERVICE.storage, SERVICE.techn]);
  const f = F.f;
  let n = 1;
  const pat = (f - 1) % 3 === 0 ? [17, 26, 11] : (f - 1) % 3 === 1 ? [23, 11, 17] : [11, 17, 26];
  for (let s = 0; s < 4; s++) strip(F, s, 25, pat, (U, i) => {
    const S = STYLES[Math.floor(h32(f - 1, s * 10 + i, 77) * 4)];
    duplexTop(U, S, label + ' ' + (f - 1) + '.' + String(n++).padStart(2, '0') + ' · bovenverdieping');
  });
}
function skyLobby(F, name) {
  areaRoom(F, name, 15, 47);
  slab(F, F.f >= 150 ? B.MARBLE : B.PARQUET, 5);
  for (let s = 0; s < 4; s++) {
    for (let t = -14; t < 14; t += 5) for (const d of [24, 25]) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, d === 25 ? B.SOFA : B.TABLE); }
    for (const t of [-10, 10]) { const [ci, cj] = sideToC(s, t, F.p.a - 3); F.set(ci, cj, 1, B.PLANTER); F.set(ci, cj, 2, B.LEAVES); F.set(ci, cj, 3, B.LEAVES); }
    if (s === 1) for (let t = -6; t < 6; t++) { const [ci, cj] = sideToC(1, t, 18); F.set(ci, cj, 1, t % 3 ? B.BOOKSHELF : B.SHELF); }
    const [ci, cj] = sideToC(s, 0, 17); F.set(ci, cj, 2, B.SIGN);
  }
}
// ---------- sky gardens, fitness, zwembad, bioscoop ----------
P.sky = (F) => {
  const f = F.f, m = (f - 120) % 10;
  if (f === 120) return skyLobby(F, 'Sky lobby 120');
  slab(F, B.PLANKS, 6);
  const garden = m === 1 || m === 6, voidAbove = m === 2 || m === 7;
  if (garden) {
    areaRoom(F, 'Sky garden ' + f, 15, 47);
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
      const k = ring(ci, cj); if (F.m(ci, cj) !== 2 || k < 16) continue;
      for (let l = 1; l < 4; l++) F.set(ci, cj, l, 0); F.set(ci, cj, 3, 0);
      const path = Math.abs(ci + 0.5) < 2 || Math.abs(cj + 0.5) < 2 || k === 22;
      F.set(ci, cj, 0, path ? B.PLANKS : (h32(ci, cj, f) < 0.15 ? B.FLOWERS : B.GRASS));
      if (!path && k > 24 && k < F.p.a - 3 && (ci + 100) % 7 === 3 && (cj + 100) % 7 === 3) { F.set(ci, cj, 1, B.LOG); F.set(ci, cj, 2, B.LOG); F.set(ci, cj, 3, B.LOG); F.tree = F.tree || []; F.tree.push([ci, cj]); }
      if (k === 19 && (ci + cj + 100) % 9 === 0) F.set(ci, cj, 1, B.CHAIR);
      if (k === 18 && Math.abs(ci + 0.5) > 3 && Math.abs(cj + 0.5) > 3 && (ci % 3 === 0)) F.set(ci, cj, 0, B.WATER);
    }
    return;
  }
  if (voidAbove) {
    areaRoom(F, 'Sky garden ' + (f - 1) + ' (boomkruinen)', 15, 47);
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
      const k = ring(ci, cj); if (F.m(ci, cj) !== 2) continue;
      if (k >= 16) { for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0); }
      if (k === 15) { F.set(ci, cj, 0, B.PLANKS); F.set(ci, cj, 1, B.GLASS); }
      if (k > 24 && k < F.p.a - 3 && (ci + 100) % 7 === 3 && (cj + 100) % 7 === 3) { F.set(ci, cj, 0, B.LOG); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let l = 0; l < 3; l++) if (F.m(ci + dx, cj + dz) === 2 && !(l === 2 && dx && dz)) F.set(ci + dx, cj + dz, l + 1, (dx || dz || l > 0) ? B.LEAVES : B.LOG); }
    }
    return;
  }
  const kinds = { 3: 'fitness', 4: 'pool', 5: 'poolvoid', 8: 'cinema', 9: 'lounge', 0: 'library' };
  const kind = kinds[m] || 'lounge';
  if (kind === 'fitness') { areaRoom(F, 'Fitnesscentrum ' + f, 15, 47); for (let s = 0; s < 4; s++) for (let d = 18; d < F.p.a - 2; d += 3) for (let t = -12; t < 12; t += 3) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, B.GYM); } }
  if (kind === 'pool') {
    areaRoom(F, 'Zwembad met uitzicht ' + f, 15, 47);
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const k = ring(ci, cj); if (F.m(ci, cj) !== 2 || k < 15) continue; F.set(ci, cj, 0, B.TILE); F.set(ci, cj, 1, (k >= 19 && k <= F.p.a - 4 && cj < -2) ? B.WATER : B.TILE); }
  }
  if (kind === 'poolvoid') { areaRoom(F, 'Zwembad met uitzicht (vide)', 15, 47); for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const k = ring(ci, cj); if (F.m(ci, cj) === 2 && k >= 16 && cj < -2) for (let l = 0; l < 4; l++) F.set(ci, cj, l, 0); if (F.m(ci, cj) === 2 && cj === -2 && k >= 16) F.set(ci, cj, 1, B.GLASS); } }
  if (kind === 'cinema') {
    areaRoom(F, 'Bioscoopzaal ' + f, 15, 47);
    for (let s = 0; s < 4; s++) for (let d = 18; d < F.p.a - 3; d += 2) for (let t = -10; t < 10; t++) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, B.CHAIR_RED); }
    for (let s = 0; s < 4; s++) for (let t = -8; t < 8; t++) { const [ci, cj] = sideToC(s, t, F.p.a - 2); F.set(ci, cj, 2, B.TV_ON); F.set(ci, cj, 3, B.TV_ON); }
  }
  if (kind === 'lounge' || kind === 'library') {
    areaRoom(F, (kind === 'library' ? 'Bibliotheek en leeszaal ' : 'Bewonerslounge ') + f, 15, 47);
    for (let s = 0; s < 4; s++) for (let d = 18; d < F.p.a - 2; d += 4) for (let t = -12; t < 12; t += 4) { const [ci, cj] = sideToC(s, t, d); F.set(ci, cj, 1, kind === 'library' ? B.BOOKSHELF : B.SOFA); const [ai, aj] = sideToC(s, t + 1, d); F.set(ai, aj, 1, B.TABLE); }
  }
};
// ---------- luxe woningen en penthouses: één of twee woningen per zijde, deur aan de liftlobby ----------
P.lux = (F) => {
  const f = F.f;
  if (f === 150) return skyLobby(F, 'Sky lobby 150');
  slab(F, B.MARBLE, 0);
  let n = 1;
  for (let s = 0; s < 4; s++) {
    const two = (f + s) % 3 !== 0;
    strip(F, s, 15, two ? [19, 50] : [70], (U, i) => {
      const S = STYLES[Math.floor(h32(f, s * 7 + i, 99) * 4)];
      const label = 'Woning ' + f + '.' + String(n++).padStart(2, '0');
      aptInto(U, two ? (i ? 3 : 2) : 4, S, label, { balcony: true, lux: true });
    });
  }
};
P.pent = (F) => {
  const f = F.f;
  if (f === 200) return skyLobby(F, 'Penthouselobby 200');
  slab(F, B.MARBLE, 0);
  const upper = f >= 220 && f % 2 === 1;
  let n = 1;
  for (let s = 0; s < 4; s++) strip(F, s, 15, [60], (U) => {
    const S = STYLES[(f + s) % 2 ? 3 : Math.floor(h32(f, s, 31) * 4)];
    if (upper) { duplexUpperUnit(U, S, f, n++); return; }
    const label = (f >= 220 ? 'Duplexpenthouse ' : f >= 210 ? 'Penthouse ' : 'Exclusieve suite ') + f + '.' + String(n++).padStart(2, '0');
    aptInto(U, 4, S, label, { balcony: true, lux: true });
    if (f >= 220) duplexStair(U);
  });
};
function duplexUpperUnit(U, S, f, n) {
  duplexTop(U, S, 'Duplexpenthouse ' + (f - 1) + '.' + String(n).padStart(2, '0') + ' · bovenverdieping');
}
P.top = (F) => {
  const f = F.f;
  slab(F, f >= 240 && f <= 244 || f === 249 ? B.CONCRETE : B.MARBLE, 5);
  if (f === 230) return skyLobby(F, 'Sky lounge 230');
  if (f >= 240 && f <= 244) { // stormdemper: grote stalen massa aan kabels, technische verdiepingen
    areaRoom(F, f === 242 ? 'Stormdemper (slingermassa 660 ton)' : 'Technische verdieping ' + f, 15, 47);
    for (let s = 0; s < 4; s++) for (let t = -10; t < 10; t++) { const [ci, cj] = sideToC(s, t, 16); for (let l = 1; l < 3; l++) F.set(ci, cj, l, f === 242 ? B.GOLD_ORE : B.METAL); }
    for (let s = 0; s < 4; s++) for (let t = -14; t < 14; t += 3) { const [ci, cj] = sideToC(s, t, 18); F.set(ci, cj, 1, B.SERVER); F.set(ci, cj, 2, B.VENT); }
    return;
  }
  if (f === 249) { areaRoom(F, 'Liftmachinekamer', 15, 47); for (let s = 0; s < 4; s++) for (let t = -12; t < 12; t += 3) { const [ci, cj] = sideToC(s, t, 16); F.set(ci, cj, 1, B.GENERATOR); F.set(ci, cj, 2, B.METAL); } return; }
  if (f === 248) {
    areaRoom(F, 'Observatieplatform 992 m (hoogste publieke verdieping)', 15, 47);
    for (let s = 0; s < 4; s++) { for (let t = -10; t < 10; t += 5) { const [ci, cj] = sideToC(s, t, F.p.a - 3); F.set(ci, cj, 1, B.METAL); F.set(ci, cj, 2, B.SIGN); } const [ci, cj] = sideToC(s, 0, 17); F.set(ci, cj, 2, B.SIGN); }
    return;
  }
  const kinds = ['Sky lounge bar', 'Panoramarestaurant', 'Privélounge', 'Evenementenzaal', 'Champagnebar', 'Uitkijkterras binnen'];
  const kind = kinds[(f - 231 + 6) % kinds.length];
  areaRoom(F, kind + ' · ' + f, 15, 47);
  for (let s = 0; s < 4; s++) {
    if (kind.includes('bar')) for (let t = -8; t < 8; t++) { const [ci, cj] = sideToC(s, t, 17); F.set(ci, cj, 1, B.DARK_PLANKS); }
    for (let d = 16; d < F.p.a - 2; d += 2) for (let t = -14; t < 14; t += 4) {
      const [ci, cj] = sideToC(s, t, d); if (F.m(ci, cj) !== 2 || F.get(ci, cj, 1)) continue;
      F.set(ci, cj, 1, kind.includes('restaurant') ? B.TABLE : B.SOFA_LEATHER);
      if (kind.includes('restaurant')) { const [a, b] = sideToC(s, t + 1, d); if (F.m(a, b) === 2) F.set(a, b, 1, B.CHAIR); }
    }
  }
};

// ---------- verdieping maken (met cache) ----------
const cache = new Map();
export function buildFloor(f) {
  let F = cache.get(f);
  if (F) return F;
  F = new Floor(f);
  (P[F.zone] || P.office)(F);
  core(F);
  facade(F);
  for (const fn of F.after || []) fn(F);
  clearDoorways(F);
  if (F.entr) for (const [ci, cj] of F.entr) { F.set(ci, cj, 1, B.DOOR_GLASS); F.set(ci, cj, 2, B.DOOR_GLASS); F.set(ci, cj, 3, B.GLASS); }
  // dak boven de bovenste verdieping: helikopterplatform en lichten (top op exact 1.000 m)
  cache.set(f, F);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return F;
}
// voor en achter elke deur: geen meubels (geen deur die op een kast of bed uitkomt)
const FURN = new Set([B.BED, B.BED_BLUE, B.PILLOW, B.SOFA, B.SOFA_LEATHER, B.CHAIR, B.CHAIR_RED, B.TABLE, B.TV, B.TV_ON, B.COUNTER, B.STOVE, B.FRIDGE, B.SINK, B.TOILET, B.BATHTUB,
  B.WARDROBE, B.SHELF, B.CRATE, B.PLANTER, B.LEAVES, B.BOOKSHELF, B.GYM, B.SERVER, B.GENERATOR, B.PUMP, B.VENT, B.TICKET, B.PAY_MACHINE, B.CHARGER, B.POST, B.WOOL_RED, B.MIRROR_WALL, B.DARK_PLANKS, B.MARBLE, B.GLASS, B.METAL, B.SIGN]);
function clearDoorways(F) {
  for (let cj = -HALF + 1; cj < HALF - 1; cj++) for (let ci = -HALF + 1; ci < HALF - 1; ci++) {
    const d = F.get(ci, cj, 1);
    if (d !== B.DOOR_SHUT && d !== B.DOOR_GLASS) continue;
    // de muur loopt langs x of langs z; de deur gaat open naar de twee andere kanten
    const wall = (x, z) => F.get(x, z, 1) && F.get(x, z, 2) && F.get(x, z, 3);
    const wallX = wall(ci - 1, cj) && wall(ci + 1, cj), wallZ = wall(ci, cj - 1) && wall(ci, cj + 1);
    const fronts = wallX && !wallZ ? [[ci, cj - 1], [ci, cj + 1]] : wallZ && !wallX ? [[ci - 1, cj], [ci + 1, cj]] : [[ci, cj - 1], [ci, cj + 1], [ci - 1, cj], [ci + 1, cj]];
    for (const [x, z] of fronts) {
      if (F.m(x, z) !== 2) continue;
      for (let l = 1; l <= 2; l++) if (FURN.has(F.get(x, z, l)) && !(l === 2 && F.get(x, z, 1) === 0 && F.get(x, z, 2) === B.SIGN)) F.set(x, z, l, 0);
    }
  }
}
// het dak (rij G+999): helikopterplatform in het midden, lichten op de rand
function roofCell(ci, cj) {
  const p = plateOf(F_MAX), m = maskOf(p.a, p.r)[(cj + HALF) * N + ci + HALF];
  if (!m) return 0;
  if (m === 1) return (ci + cj) % 3 === 0 ? B.LAMP : B.PANEL_WHITE;
  const d = Math.hypot(ci + 0.5, cj + 0.5);
  if (d < 11) return Math.abs(d - 9.5) < 0.8 ? B.PAINT_YELLOW : B.HELIPAD;
  return B.CONCRETE;
}

// ---------- in de worker: blokken van de torentegel ----------
// schrijft de toren in vox (kolom per kolom, hoogte H, begin y0) van de tegel (tegelcoördinaten 16..111)
export function writeTower(vox, H, y0) {
  const slabRow = (f) => floorY(f) - 1 - y0;
  // fundering onder B25
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
    const x = 64 + ci, z = 64 + cj, base = (z * T + x) * H;
    for (let y = 0; y < slabRow(F_MIN); y++) vox[base + y] = y < 2 ? B.BEDROCK : B.CONCRETE;
  }
  for (let f = F_MIN; f <= F_MAX; f++) {
    const F = buildFloor(f), r0 = slabRow(f);
    for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) {
      const x = 64 + ci, z = 64 + cj, base = (z * T + x) * H + r0, src = ((cj + HALF) * N + ci + HALF) * 4;
      const inside = F.m(ci, cj) || f < 0;
      for (let l = 0; l < 4; l++) {
        const b = F.b[src + l];
        if (b || inside) vox[base + l] = b;
        else if (f > 0 && l === 0) { /* buiten de plaat: lucht (of terras, al in b) */ }
      }
    }
  }
  const roof = floorY(F_MAX + 1) - 1 - y0;
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const b = roofCell(ci, cj); if (b) vox[(((64 + cj) * T) + 64 + ci) * H + roof] = b; }
}

// ---------- in de game: waar ben ik? ----------
export function inTowerBox(x, z) { const ci = Math.floor(x) - CX, cj = Math.floor(z) - CZ; return ci >= -HALF && ci < HALF && cj >= -HALF && cj < HALF; }
export function roomAt(x, y, z) {
  const f = floorAt(Math.floor(y));
  if (f < F_MIN || f > F_MAX || !inTowerBox(x, z)) return null;
  const ci = Math.floor(x) - CX, cj = Math.floor(z) - CZ, F = buildFloor(f);
  const id = F.room[(cj + HALF) * N + ci + HALF];
  const r = id ? F.rooms[id] : null;
  const inside = F.m(ci, cj) > 0 || !!id;
  return { f, label: floorLabel(f), zone: F.zone, zoneName: ZONE_NAMES[F.zone], room: r ? r.name : (ring(ci, cj) < 15 ? 'Liftlobby' : ZONE_NAMES[F.zone]), style: r && r.style, inside };
}
// voor de schil-mesh en het binnenlicht (js/mesher.js, js/game.js): per verdieping het plaatmasker, snel opgezocht
const FLOOR_MASK = [], FLOOR_GLASS = [], CORNER = new Map();
for (let f = F_MIN; f <= F_MAX; f++) { const p = plateOf(f); FLOOR_MASK.push(f < 0 ? null : maskOf(p.a, p.r)); FLOOR_GLASS.push((LOOK[zoneOf(f)] || [B.GLASS])[0]); }
// afgeronde hoeken: daar in de schil ook de borstweringen als glas (anders één vlakje per verdieping per kolom)
function cornerOf(f) {
  const p = plateOf(f), k = p.a * 100 + p.r;
  let c = CORNER.get(k);
  if (c) return c;
  c = new Uint8Array(N * N);
  for (let cj = -HALF; cj < HALF; cj++) for (let ci = -HALF; ci < HALF; ci++) { const u = Math.abs(ci + 0.5), v = Math.abs(cj + 0.5); if (u > p.a - p.r - 1 && v > p.a - p.r - 1) c[(cj + HALF) * N + ci + HALF] = 1; }
  CORNER.set(k, c);
  return c;
}
// binnen de gevel? (tegelcoördinaten x, z van de torentegel, echte hoogte y)
export function shellInside(lx, wy, lz) {
  const ci = lx - 64, cj = lz - 64;
  if (ci < -HALF || ci >= HALF || cj < -HALF || cj >= HALF) return false;
  const f = Math.floor((wy - (G - 1)) / FH);
  if (f < F_MIN || f > F_MAX) return false;
  const m = FLOOR_MASK[f - F_MIN];
  return !m || m[(cj + HALF) * N + ci + HALF] === 2;
}
// vervangblok voor de gevelschil: binnen = verlichte kamer, raamstijlen en roosters in de gevel = glas (grote vlakken)
export function shellFill(lx, wy, lz, b) {
  const ci = lx - 64, cj = lz - 64;
  if (ci < -HALF || ci >= HALF || cj < -HALF || cj >= HALF) return 0;
  const f = Math.floor((wy - (G - 1)) / FH);
  if (f < F_MIN || f > F_MAX) return 0;
  const m = FLOOR_MASK[f - F_MIN];
  if (!m) return B.ROOM_FILL;
  const v = m[(cj + HALF) * N + ci + HALF];
  if (v === 2) return B.ROOM_FILL;
  if (v === 1) {
    if (b === B.METAL || b === B.VENT) return FLOOR_GLASS[f - F_MIN];
    if (b !== B.LAMP && b !== B.DOOR_GLASS && cornerOf(f)[(cj + HALF) * N + ci + HALF]) return FLOOR_GLASS[f - F_MIN];
  }
  return 0;
}
export const PLACES = [
  ['Hoofdingang Megatower', CX + 0.5, CZ - 52, G, 0],
  ['Hotelreceptie (30)', CX + 0.5, CZ - 24, floorY(30), 30],
  ['Restaurant (31)', CX + 0.5, CZ + 21, floorY(31), 31],
  ['Sky garden (121)', CX + 0.5, CZ - 16, floorY(121), 121],
  ['Zwembad hotel (33)', CX + 10.5, CZ + 16, floorY(33) + 1, 33],
  ['Penthouse (220)', CX + 0.5, CZ - 14, floorY(220), 220],
  ['Observatieplatform (248)', CX + 0.5, CZ - 16, floorY(248), 248],
  ['Metrostation (B3)', CX + 0.5, CZ - 30, floorY(-3), -3],
  ['Ondergrondse parking (B10)', CX + 0.5, CZ - 14, floorY(-10), -10],
];
