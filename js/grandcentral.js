// TERRANOVA 16.1 — Megatower Grand Central: het nieuwe centraal station van Megatower City op het spoorviaduct
// (z = 6016), met alle vervoersniveaus. Coördinaten in meters (blokken); o = z - RAIL_Z.
//   +1  G+17  grote stationshal boven de sporen (x 5104..5264), publieke hoofdinkom via de noordingang, galerij met
//             winkels en horeca, centraal vertrekbord, loketten, ticketautomaten, wachtruimte, liften naar alle niveaus
//    0  G+10  22 perronsporen aan 11 eilandperrons (408 m lang) met wisselstraten aan beide kanten; elke helft van het
//             station hangt aan één hoofdspoor (noord: sporen 1–11, zuid: 12–22). Hyperloopterminal aan de zuidkant.
//  straat G   onderdoorgang onder het spoordek: de lanen lopen door, trappen en liften naar de perrons
//   -1  G-9   tramstation met 10 sporen aan 5 eilandperrons (tramlijn T5 onder de laan z = 5888, via hellingen)
//   -2  G-26  metrostation met 6 sporen aan 3 eilandperrons (nieuwe metrolijn M2 noord–zuid onder de laan x = 5376)
// Alles is deterministisch en zonder three.js (wordt in de worker gebruikt, js/megacity.js).
import { B } from './blocks.js';
import { planRow, shopBlock } from './shops.js';

export const G = 120, T = 128, RAIL_Z = 47 * T, DECK = G + 8;
export const NAME = 'Megatower Grand Central';
// gebied (tegels 36..43 × 46..47); de lanen blijven, de percelen worden stationsplein en onderdoorgang
export const GC = { tx0: 36, tx1: 43, tz0: 46, tz1: 47, x0: 36 * T, x1: 44 * T, z0: 46 * T, z1: 48 * T };
export const inGC = (x, z) => x >= GC.x0 && x < GC.x1 && z >= GC.z0 && z < GC.z1;
const off = (v) => { const r = ((v % T) + T) % T; return r < 14 ? r : r >= T - 14 ? r - T : null; };
const cosS = (s) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, s)))) / 2;

// ---------- trein: 22 perronsporen ----------
export const WX0 = 4640, PX0 = 4928, PX1 = 5344, EX1 = 5624;            // wisselstraat west, perrons, wisselstraat oost
export const MAIN = { N: -3, S: 2 };                                       // hoofdsporen (zoals de rest van het viaduct)
export const TRACKS = [];
for (let k = 0; k < 22; k++) { const p = k >> 1, o = k % 2 === 0 ? -85 + 16 * p : -74 + 16 * p; TRACKS.push({ n: k + 1, o, grp: k < 11 ? 'N' : 'S' }); }
export const PLATFORMS = []; // eilandperrons: sporen 2p+1 en 2p+2
for (let p = 0; p < 11; p++) PLATFORMS.push({ n: p + 1, o0: TRACKS[2 * p].o + 2, o1: TRACKS[2 * p + 1].o - 2, tracks: [2 * p + 1, 2 * p + 2] });
// ligging van spoor k op plek x (wisselstraten: cosinusboog van het hoofdspoor naar het perronspoor)
export function trackO(k, x) {
  const t = TRACKS[k], m = MAIN[t.grp];
  if (x <= WX0 || x >= EX1) return m;
  if (x < PX0) return m + (t.o - m) * cosS((x - WX0) / (PX0 - WX0));
  if (x > PX1) return m + (t.o - m) * cosS((EX1 - x) / (EX1 - PX1));
  return t.o;
}
const platAt = (o) => PLATFORMS.find(P => o >= P.o0 && o <= P.o1);
// stationshal (+1) en de verticale verbindingen per perron
export const HALL = { x0: 5104, x1: 5264, o0: -96, o1: 96, floor: G + 16 };    // vloerrij; je staat op G+17
const LIFT_X = 5140, ESC_X = 5150, STAIR_X = 5160;                         // per perron: lift, roltrap naar de hal, trap naar de straat
const SHED = { o0: -90, o1: 91 };
const ENTR = { x0: 5134, x1: 5233, z0: 5903, z1: 5919 };                    // noordingang (monumentale glasgevel aan z = 5903)
// ---------- tram (-1) ----------
export const TRAM_Z0 = 46 * T;                                             // laan z = 5888
export const TRAM = { u0: 4700, r0: 4750, r1: 4850, f0: 4980, p0: 5040, p1: 5200, f1: 5260, e0: 5262, e1: 5362, u1: 5362, row: G - 10 };
export const TRAM_TRACKS = [-27, -20, -15, -8, -3, 4, 9, 16, 21, 28].map((o, i) => ({ n: i + 1, o, grp: i < 5 ? 'N' : 'S' }));
export const TRAM_MAIN = { N: -2, S: 1 };
export const TRAM_PLATS = [0, 1, 2, 3, 4].map(q => ({ n: q + 1, o0: TRAM_TRACKS[2 * q].o + 2, o1: TRAM_TRACKS[2 * q + 1].o - 2 }));
// trappen naar de straat: perron 1 onder de boulevard, 2 onder de noordstoep, 3 onder de middenberm, 4 onder de zuidstoep
const TRAM_STAIR_O = { 1: -24, 2: -13, 3: 0, 4: 12 }, TRAM_STAIR_X = 5170; // in het voetgangersdeel van de Grand Boulevard
// zijdelings: op straat (o -3 / 2) → verschoven (-2 / 1) vóór de helling → onder de grond waaieren naar de 10 sporen
export function tramO(k, x) {
  const t = TRAM_TRACKS[k], street = t.grp === 'N' ? -3 : 2, m = TRAM_MAIN[t.grp], U = TRAM;
  if (x <= U.u0 - 40 || x >= U.u1 + 40) return street;
  if (x < U.u0) return street + (m - street) * cosS((x - (U.u0 - 40)) / 40);
  if (x > U.u1) return street + (m - street) * cosS(((U.u1 + 40) - x) / 40);
  if (x < U.f0 || x > U.f1) return m;
  if (x < U.p0) return m + (t.o - m) * cosS((x - U.f0) / (U.p0 - U.f0));
  if (x > U.p1) return m + (t.o - m) * cosS((U.f1 - x) / (U.f1 - U.p1));
  return t.o;
}
// hoogte van het tramspoor (rij van de ballast): straat G-1, helling naar G-10
export function tramRow(x) {
  const U = TRAM;
  if (x <= U.r0 || x >= U.e1) return G - 1;
  if (x < U.r1) return Math.round(G - 1 - 9 * (x - U.r0) / (U.r1 - U.r0));
  if (x > U.e0) return Math.round(G - 1 - 9 * (U.e1 - x) / (U.e1 - U.e0));
  return U.row;
}
// ---------- metro M2 (-2): noord–zuid onder de laan x = 5376 ----------
export const M2_X = 42 * T, M2_ROW = G - 28, M2_Z0 = 20 * T, M2_Z1 = 70 * T + 64;
export const M2_STATIONS = [[20, 'Noordkwartier'], [28, 'Parkstad'], [35, 'Museumkwartier'], [43, 'Galleria'], [47, 'Grand Central'], [54, 'Zuidkade'], [62, 'Zuidpark'], [70, 'Zuidpoort']]
  .map(([tz, name]) => ({ tz, name, z: tz === 47 ? RAIL_Z + 4 : tz * T + 64 }));
export const M2_TRACKS = [-20, -12, -4, 5, 13, 21].map((o, i) => ({ n: i + 1, o, grp: i < 3 ? 'W' : 'E' }));
export const M2_MAIN = { W: -4, E: 5 };
export const M2_GC = { f0: 5900, p0: 5960, p1: 6080, f1: 6140 };            // wisselstraat noord, perrons, wisselstraat zuid
export const M2_PLATS = [0, 1, 2].map(q => ({ n: q + 1, o0: M2_TRACKS[2 * q].o + 2, o1: M2_TRACKS[2 * q + 1].o - 2 }));
export function m2O(k, z) {
  const t = M2_TRACKS[k], m = M2_MAIN[t.grp], U = M2_GC;
  if (z <= U.f0 || z >= U.f1) return m;
  if (z < U.p0) return m + (t.o - m) * cosS((z - U.f0) / (U.p0 - U.f0));
  if (z > U.p1) return m + (t.o - m) * cosS((U.f1 - z) / (U.f1 - U.p1));
  return t.o;
}
// ---------- hyperloop (fictief toekomstconcept): terminal A (Grand Central, niveau 0) ↔ terminal B (luchthaven) ----------
export const HYPER = { y: G + 9, A: { x0: 5150, x1: 5250, o: 99, dock: 5200 }, B: { x0: 8872, x1: 8992, o: 22, dock: 8932 } };
// middenlijn van de buis als functie van x (o t.o.v. RAIL_Z)
export function hyperO(x) {
  if (x < HYPER.A.x0 - 2 || x > HYPER.B.x1 + 2) return null;
  if (x <= PX1) return HYPER.A.o;
  if (x < EX1) return 11 + (HYPER.A.o - 11) * cosS((EX1 - x) / (EX1 - PX1));
  if (x < 8700) return 11;
  if (x < 8860) return 11 + (HYPER.B.o - 11) * cosS((x - 8700) / 160);
  return HYPER.B.o;
}
// polylijn van de rit (voor js/hyperloop.js): punten om de 4 m, A.dock → B.dock
export function hyperPath() {
  const pts = []; for (let x = HYPER.A.dock; x <= HYPER.B.dock; x += 4) pts.push([x, HYPER.y + 1, RAIL_Z + hyperO(x)]);
  return pts;
}

// ---------- winkels en horeca in de stationshal (twee rijen langs de oost- en westwand) ----------
const used = new Set();
export const HALL_SHOPS = {
  west: planRow(HALL.o1 - HALL.o0 - 1, ['supermarkt', 'bakker', 'cafe', 'kleding', 'boek', 'restaurant', 'loket', 'toiletten', 'elektronica', 'fastfood', 'kluizen', 'apotheek'], 4401, used),
  east: planRow(HALL.o1 - HALL.o0 - 1, ['restaurant', 'cafe', 'kleding', 'telefoon', 'chocolade', 'kluizen', 'toiletten', 'cadeau', 'fastfood', 'parfum', 'cafe'], 4402, used),
};
const SHOP_D = 16;
function hallShop(x, o, l) { // blok van een winkel in de hal (of -1 als hier geen winkel is)
  const row = x < HALL.x0 + 1 + SHOP_D ? 'west' : x > HALL.x1 - 1 - SHOP_D ? 'east' : null; if (!row) return -1;
  const u = o - HALL.o0 - 1, S = HALL_SHOPS[row].find(s => u >= s.u0 && u < s.u0 + s.w); if (!S) return -1;
  const v = row === 'west' ? HALL.x0 + SHOP_D - x : x - (HALL.x1 - SHOP_D); // 0 = pui naar het midden van de hal
  return shopBlock(S, u - S.u0, v, l, SHOP_D, 5, true);
}
export function hallShopAt(x, z) {
  const o = z - RAIL_Z; if (x < HALL.x0 || x > HALL.x1 || o <= HALL.o0 || o >= HALL.o1) return null;
  const row = x < HALL.x0 + 1 + SHOP_D ? 'west' : x > HALL.x1 - 1 - SHOP_D ? 'east' : null; if (!row) return null;
  const u = o - HALL.o0 - 1; return HALL_SHOPS[row].find(s => u >= s.u0 && u < s.u0 + s.w) || null;
}

// ---------- straatniveau binnen het stationsgebied (percelen; de lanen blijven gewone lanen) ----------
export function gcGround(x, z, col) {
  const o = z - RAIL_Z;
  col[G - 1] = ((x >> 2) + (z >> 2)) % 2 ? B.GRANITE : B.MARBLE;
  // onder het spoordek: onderdoorgang met tegelvloer, ticketautomaten en wegwijzers
  if (o >= SHED.o0 && o <= SHED.o1 && x >= WX0 && x <= EX1) {
    col[G - 1] = B.TILE;
    if (o % 16 === 0 && x % 24 === 4) { col[G] = B.TICKET; return G; }
    if (o % 32 === 8 && x % 48 === 20) { col[G] = B.POST; col[G + 1] = B.POST; col[G + 2] = B.SIGN; return G + 2; }
    return G - 1;
  }
  // stationsplein noord en zuid: banken, bomen in bakken, fietsenrekken
  if ((x % 16 === 8) && (z % 12 === 6)) { col[G] = B.PLANTER; col[G + 1] = B.LEAVES; col[G + 2] = B.LEAVES; return G + 2; }
  if ((x % 16 === 12) && (z % 12 === 6)) { col[G] = B.BENCH; return G; }
  if (o > 92 && o < 112 && x % 6 === 0 && (x >> 3) % 4 === 1) { col[G] = B.METAL; return G; }            // fietsenrekken
  return G - 1;
}

// ---------- boven het straatniveau: spoordek, sporen, perrons, kap, hal, ingang, hyperloopterminal ----------
// col is geïndexeerd met de echte hoogte; geeft de hoogste gebruikte rij terug (of 0)
export function gcUpper(x, z, col) {
  const o = z - RAIL_Z; let top = 0;
  const road = (off(x) !== null) || (o >= -14 && o <= 13);                    // lanen onder het dek (auto's)
  const median = (off(x) !== null && off(x) >= -4 && off(x) <= 3) || (o >= -4 && o <= 3);
  if (x >= WX0 && x <= EX1) {
    // sporen op deze x (wisselstraten: gebogen)
    let lo = 1e9, hi = -1e9, near = 1e9, nk = -1;
    for (let k = 0; k < 22; k++) { const y = trackO(k, x); if (y < lo) lo = y; if (y > hi) hi = y; const d = Math.abs(o + 0.5 - (y + 0.5)); if (d < near) { near = d; nk = k; } }
    const plat = x >= PX0 && x <= PX1;
    const d0 = plat ? SHED.o0 + 1 : Math.floor(lo) - 4, d1 = plat ? SHED.o1 - 1 : Math.ceil(hi) + 4;
    if (o >= d0 - 1 && o <= d1 + 1) {
      if (o === d0 - 1 || o === d1 + 1) { col[DECK - 1] = B.CONCRETE; col[DECK] = B.CONCRETE; col[DECK + 1] = B.CONCRETE; col[DECK + 2] = B.GLASS; top = DECK + 2; }
      else {
        col[DECK - 1] = B.CONCRETE; col[DECK] = B.CONCRETE; top = DECK;
        const yk = trackO(nk, x), dd = o + 0.5 - (yk + 0.5);
        if (Math.abs(dd) <= 2.2) col[DECK] = B.BALLAST;
        // pijlers onder het dek: om de 16 m, tussen de sporen, niet op de rijbaan (wel in de middenberm)
        if (x % 16 === 8 && (!road || median) && Math.abs(dd) > 2.5) for (let y = G; y < DECK - 1; y++) col[y] = B.CONCRETE;
        else if (!road && x % 16 === 0 && o % 8 === 0) col[DECK - 2] = B.LAMP;              // verlichting in de onderdoorgang
      }
      // perrons
      const P = plat ? platAt(o) : null;
      if (P && x >= PX0 + 2 && x <= PX1 - 2) top = Math.max(top, platform(x, o, P, col));
    }
    // overkapping over de perrons (behalve waar de hal staat)
    if (plat && o >= SHED.o0 && o <= SHED.o1 && !(x >= HALL.x0 && x <= HALL.x1)) {
      const ry = G + 26 + Math.round(8 * (1 - ((o - 0.5) / 91) ** 2));
      const wall = o === SHED.o0 || o === SHED.o1, end = x === PX0 || x === PX1;
      col[ry] = (x % 16 === 0 || o % 8 === 0) ? B.METAL : B.GLASS;
      if (x % 16 === 0) col[ry - 1] = B.METAL;                                            // spanten
      if (wall) for (let y = DECK + 1; y < ry; y++) col[y] = (x % 8 === 0) ? B.METAL : (y - DECK) % 6 === 0 ? B.METAL : B.GLASS;
      if (end && !wall && (o > -3 + 0 && false)) col[ry] = B.METAL;
      const P = platAt(o);
      if (P && (o === P.o0 + 3 || o === P.o1 - 3) && x % 32 === 16 && x >= PX0 + 2 && x <= PX1 - 2) for (let y = DECK + 2; y < ry - 1; y++) col[y] = B.METAL; // kolommen op het perron
      top = Math.max(top, ry);
    }
  }
  // stationshal
  if (x >= HALL.x0 && x <= HALL.x1 && o >= HALL.o0 && o <= HALL.o1) top = Math.max(top, hall(x, o, col));
  // noordingang
  if (x >= ENTR.x0 && x <= ENTR.x1 && z >= ENTR.z0 && z <= ENTR.z1) top = Math.max(top, entrance(x, z, col));
  // hyperloopterminal A
  if (x >= HYPER.A.x0 - 1 && x <= HYPER.A.x1 + 1 && o >= 91 && o <= 107) top = Math.max(top, terminal(x, o, HYPER.A, col, true));
  return top;
}
function platform(x, o, P, col) {
  const edge = o === P.o0 || o === P.o1, c0 = P.o0 + 3, c1 = P.o0 + 4;
  col[DECK + 1] = edge ? ((x & 3) === 0 ? B.LINE_YELLOW : B.TILE) : B.TILE;
  let top = DECK + 1;
  const n = P.n;
  // lift (straat, perron, hal), roltrap naar de hal, trap naar de straat
  if (x === LIFT_X && o === P.o0 + 6) {
    for (let y = G - 1; y <= HALL.floor; y++) col[y] = 0;
    col[G - 1] = B.ELEVATOR; col[DECK + 1] = B.ELEVATOR; col[HALL.floor] = B.ELEVATOR;
    for (let y = G; y < HALL.floor; y++) if (y !== DECK + 1 && y !== DECK + 2 && y !== DECK + 3 && y !== G && y !== G + 1 && y !== G + 2) col[y] = B.GLASS;
    return HALL.floor;
  }
  if ((x === LIFT_X - 1 || x === LIFT_X + 1) && o >= P.o0 + 5 && o <= P.o0 + 7) { for (let y = G; y < HALL.floor; y++) if (y !== DECK + 1) col[y] = B.GLASS; col[DECK + 1] = B.TILE; return HALL.floor - 1; }
  const k = x - ESC_X;
  if (k >= 0 && k < 7 && (o === P.o0 + 3 || o === P.o0 + 4)) {                 // roltrap (o0+3) en trap (o0+4) naar de hal
    for (let y = DECK + 2; y <= HALL.floor; y++) col[y] = 0;
    const y = DECK + 1 + k; for (let yy = DECK + 1; yy < y; yy++) col[yy] = B.CONCRETE;
    col[y] = o === P.o0 + 3 ? B.ESCALATOR : B.TILE;
    return y;
  }
  if (k >= -1 && k < 8 && (o === P.o0 + 2 || o === P.o0 + 5)) { col[DECK + 2] = B.GLASS; top = DECK + 2; }
  const s = x - STAIR_X;
  if (s >= 0 && s < 10 && (o === P.o1 - 2 || o === P.o1 - 1)) {                 // trap naar de onderdoorgang (10 treden)
    for (let y = G; y <= DECK + 4; y++) col[y] = 0;
    const y = G - 1 + s; for (let yy = G - 1; yy < y; yy++) col[yy] = B.CONCRETE;
    col[y] = B.TILE;
    return y;
  }
  if (s >= -1 && s < 11 && (o === P.o1 - 3 || o === P.o1)) { col[DECK + 2] = B.GLASS; return DECK + 2; }
  // meubilair: banken, vertrekborden, perronnummers, lampen
  if ((o === c0 || o === c1) && x % 24 === 4) { col[DECK + 2] = B.BENCH; top = DECK + 2; }
  if (o === c1 + 1 && x % 48 === 28) { col[DECK + 2] = B.POST; col[DECK + 3] = B.POST; col[DECK + 4] = B.DEPARTURE_BOARD; top = DECK + 4; }
  if (o === c0 - 1 && x % 64 === 40) { col[DECK + 2] = B.POST; col[DECK + 3] = B.POST; col[DECK + 4] = B.POST; col[DECK + 5] = B.SIGN; top = DECK + 5; }
  if ((o === c0 || o === c1) && x % 8 === 0) { col[DECK + 7] = B.LAMP; top = Math.max(top, DECK + 7); }
  if (o === P.o1 - 1 && x % 40 === 12) { col[DECK + 2] = B.TICKET; top = Math.max(top, DECK + 2); }
  return top;
}
function hall(x, o, col) {
  const F = HALL.floor, edgeX = x === HALL.x0 || x === HALL.x1, edgeO = o === HALL.o0 || o === HALL.o1;
  const roof = F + 22 + Math.round(18 * Math.sqrt(Math.max(0, 1 - (o / 97) ** 2)));
  // vloer, behalve boven de roltrappen/trappen van de perrons
  const P = platAt(o), overStair = P && x >= ESC_X && x < ESC_X + 7 && (o === P.o0 + 3 || o === P.o0 + 4);
  if (!overStair) col[F] = (edgeX || edgeO) ? B.CONCRETE : ((x + o) % 8 < 4 ? B.MARBLE : B.GRANITE);
  if (P && x === LIFT_X && o === P.o0 + 6) col[F] = B.ELEVATOR;
  if (x === HYPER.A.x0 + 16 && o === HYPER.A.o - 6) col[F] = B.ELEVATOR;             // lift van de hyperloopterminal
  for (let y = F + 1; y < roof; y++) col[y] = 0;
  // gevels: glas met stalen stijlen; deuren naar de noordingang (o = -96) in het midden
  if (edgeX || edgeO) {
    const door = edgeO && o === HALL.o0 && Math.abs(x - 5184) <= 20;
    for (let y = F + 1; y < roof; y++) col[y] = door && y <= F + 4 ? 0 : ((edgeX ? o : x) % 8 === 0 || (y - F) % 8 === 0) ? B.METAL : B.GLASS;
  } else {
    // dakspanten om de 16 m, kolommen, winkels, vertrekbord, infobalie, loketten, automaten, wachtruimte
    if (x % 16 === 0) col[roof - 1] = B.METAL;
    if (x % 32 === 0 && x > 5130 && x < 5240 && (o === -48 || o === 48)) for (let y = F + 1; y < roof - 1; y++) col[y] = B.METAL;
    for (let l = 0; l < 5; l++) { const b = hallShop(x, o, l); if (b >= 0 && l > 0) col[F + l] = b; else if (b >= 0 && l === 0 && b) col[F] = b; }
    const cx = x - 5184, co = o;
    if (Math.abs(cx) <= 14 && co === -36) { for (let y = F + 5; y <= F + 10; y++) col[y] = B.DEPARTURE_BOARD; col[F + 11] = B.METAL; }   // groot vertrekbord
    if ((cx === -15 || cx === 14) && co === -36) for (let y = F + 1; y <= F + 11; y++) col[y] = B.METAL;
    const ri = Math.hypot(cx + 0.5, co + 0.5);
    if (ri > 3.5 && ri < 4.6) col[F + 1] = B.COUNTER;                                             // infobalie
    if (ri < 1) { col[F + 1] = B.POST; col[F + 2] = B.POST; col[F + 3] = B.SIGN; }
    if (co === -52 && Math.abs(cx) <= 20 && cx % 2 === 0) col[F + 1] = B.TICKET;                  // ticketautomaten
    if ((co === 30 || co === 34) && Math.abs(cx) <= 18 && Math.abs(cx) % 6 !== 0) col[F + 1] = B.BENCH;  // wachtruimte
    if (co === 32 && Math.abs(cx) % 6 === 3) { col[F + 1] = B.PLANTER; col[F + 2] = B.LEAVES; }
    if (x % 24 === 12 && o % 24 === 12 && !hallShopAt(x, o + RAIL_Z)) { col[F + 9] = B.LAMP; for (let y = F + 10; y < roof; y++) col[y] = B.METAL; } // hanglampen aan het dak
    if ((o === -60 || o === 60) && x % 40 === 4) { col[F + 1] = B.POST; col[F + 2] = B.POST; col[F + 3] = B.SIGN; }   // wegwijzers
  }
  col[roof] = edgeX || edgeO ? B.METAL : (x % 16 === 0 || o % 6 === 0) ? B.METAL : B.GLASS;
  return roof;
}
function entrance(x, z, col) {
  const E = ENTR, F = HALL.floor, front = z === E.z0, sideW = x === E.x0 || x === E.x1, back = z === E.z1;
  const H = G + 30;
  col[G - 1] = B.MARBLE;
  for (let y = G; y <= H; y++) col[y] = 0;
  if (front || sideW) {
    const door = front && Math.abs(x - 5184) <= 10 && x % 4 !== 0;
    for (let y = G; y < H; y++) col[y] = door && y <= G + 3 ? 0 : ((x % 6 === 0 || z % 6 === 0) || (y - G) % 10 === 9) ? B.METAL : B.GLASS;
    if (front && Math.abs(x - 5184) <= 16) { col[G + 12] = B.PANEL_WHITE; if (Math.abs(x - 5184) <= 12) col[G + 13] = B.SIGN; } // naam boven de deuren
    col[H] = B.METAL; return H;
  }
  col[H] = (x % 6 === 0 || z % 4 === 0) ? B.METAL : B.GLASS;                              // glazen dak
  // grote roltrappen (west) en trap (oost) van de straat naar de hal, bordes op hallhoogte
  const ex = x - 5140, sx = 5228 - x;
  if (ex >= 0 && ex < 17 && z >= 5906 && z <= 5915) {
    const y = G - 1 + ex; for (let yy = G - 1; yy < y; yy++) col[yy] = B.CONCRETE;
    col[y] = (z - 5906) % 3 === 2 ? B.GLASS : B.ESCALATOR; if ((z - 5906) % 3 === 2) { col[y] = B.CONCRETE; col[y + 1] = B.GLASS; }
    return H;
  }
  if (sx >= 0 && sx < 17 && z >= 5906 && z <= 5915) { const y = G - 1 + sx; for (let yy = G - 1; yy <= y; yy++) col[yy] = yy === y ? B.TILE : B.CONCRETE; return H; }
  if (x >= 5157 && x <= 5211 && z >= 5904 && z <= 5918) {                                 // bordes op hallhoogte
    const liftT = x === 5184 && z === 5912;
    col[F] = liftT ? B.ELEVATOR : B.MARBLE;
    if (z === 5904) col[F + 1] = B.GLASS;
    if (liftT) { col[G - 1] = B.ELEVATOR; for (let y = G; y < F; y++) col[y] = (y >= G && y <= G + 2) ? 0 : B.GLASS; }
    else if ((x === 5183 || x === 5185) && z >= 5911 && z <= 5913) { for (let y = G; y < F; y++) col[y] = B.GLASS; }
    // trap naar het tramstation (-1): 9 treden onder de vloer, met glazen balustrade
    const t = x - 5190;
    if (t >= 0 && t < 10 && (z === 5911 || z === 5912)) { col[G - 1] = t === 0 ? B.MARBLE : 0; }
    if (t >= 0 && t < 10 && (z === 5910 || z === 5913)) col[G] = B.GLASS;
    return H;
  }
  return H;
}
function terminal(x, o, A, col, atA) { // atA: buis vertrekt naar het oosten, anders komt ze uit het westen
  const y0 = HYPER.y, x0 = A.x0, x1 = A.x1, c = A.o;
  const ox = o - c, edgeX = x === x0 - 1 || x === x1 + 1, wallO = ox === -8 || ox === 8, inside = !edgeX && Math.abs(ox) < 8;
  if (!(edgeX && Math.abs(ox) <= 8) && !wallO && !inside) return 0;
  // vloer
  col[y0] = Math.abs(ox) <= 1 ? B.METAL : Math.abs(ox) === 3 ? B.LINE_YELLOW : B.TILE;
  for (let y = y0 + 1; y <= y0 + 6; y++) col[y] = 0;
  const roof = y0 + 6;
  col[roof] = (x % 4 === 0) ? B.METAL : B.HYPER_GLASS;
  if (edgeX || wallO) {
    const tubeIn = edgeX && Math.abs(ox) <= 1 && (atA ? x === x1 + 1 : x === x0 - 1);     // waar de buis het gebouw in gaat
    if (x % 16 === 0 || edgeX) for (let y = G; y < y0; y++) col[y] = B.CONCRETE;           // pijlers
    for (let y = y0 + 1; y < roof; y++) col[y] = tubeIn && y <= y0 + 3 ? 0 : (x % 6 === 0 || (y - y0) % 3 === 0) ? B.METAL : B.GLASS;
    col[roof] = B.METAL; return roof;
  }
  // perronschermen met openingen ter hoogte van de deuren van de capsule (dock ± 3..4)
  if (Math.abs(ox) === 2) { const dd = Math.abs(x - A.dock); const door = dd === 3 || dd === 4; for (let y = y0 + 1; y <= y0 + 3; y++) col[y] = door && y <= y0 + 2 ? 0 : B.HYPER_GLASS; return roof; }
  if (Math.abs(ox) <= 1) return roof;                                                     // spoor van de capsule
  // perrons (ox -7..-3 noord, 3..7 zuid): vertrekscherm, banken, poortjes; trap en lift
  if (Math.abs(ox) === 5 && x % 20 === 10) { col[y0 + 1] = B.POST; col[y0 + 2] = B.DEPARTURE_BOARD; }
  if (Math.abs(ox) === 6 && x % 12 === 6) col[y0 + 1] = B.BENCH;
  if (Math.abs(ox) === 4 && x % 4 === 2 && Math.abs(x - A.dock) > 8) col[y0 + 1] = B.GLASS;     // veiligheidshek, open bij de deuren
  if (atA) {
    // trap van de straat (zuidperron) en lift (noordperron, ook naar de stationshal)
    const s = x - (x0 + 4);
    if (ox >= 5 && ox <= 6 && s >= 0 && s < 10) { for (let y = G; y <= y0 + 3; y++) col[y] = 0; const y = G - 1 + s; for (let yy = G - 1; yy < y; yy++) col[yy] = B.CONCRETE; col[y] = B.TILE; return roof; }
    if (x === x0 + 16 && ox === -6) { col[G - 1] = B.ELEVATOR; col[y0] = B.ELEVATOR; for (let y = G; y < y0; y++) col[y] = y <= G + 2 ? 0 : B.GLASS; return roof; }
  } else {
    const s = x - (x0 + 4);
    if (ox >= 5 && ox <= 6 && s >= 0 && s < 10) { for (let y = G; y <= y0 + 3; y++) col[y] = 0; const y = G - 1 + s; for (let yy = G - 1; yy < y; yy++) col[yy] = B.CONCRETE; col[y] = B.TILE; return roof; }
  }
  return roof;
}
// buis tussen de terminals (glas op een stalen bodem, pijlers om de 24 m)
export function tubeColumn(x, z, col) {
  const c = hyperO(x); if (c === null) return 0;
  if ((x >= HYPER.A.x0 - 1 && x <= HYPER.A.x1 + 1) || (x >= HYPER.B.x0 - 1 && x <= HYPER.B.x1 + 1)) return 0; // terminals zelf
  const ox = z - RAIL_Z - Math.round(c); if (ox < -2 || ox > 2) return 0;
  const y = HYPER.y;
  col[y] = Math.abs(ox) === 2 ? B.METAL : B.METAL;
  for (let yy = y + 1; yy <= y + 3; yy++) col[yy] = Math.abs(ox) === 2 ? B.HYPER_GLASS : 0;
  col[y + 4] = B.HYPER_GLASS;
  if (ox === 0 && x % 24 === 0) for (let yy = G; yy < y; yy++) col[yy] = B.CONCRETE;
  if (ox === 0 && x % 8 === 0) col[y + 4] = B.FACADE_LED;
  return y + 4;
}
export function terminalB(x, z, col) { const o = z - RAIL_Z; if (x >= HYPER.B.x0 - 1 && x <= HYPER.B.x1 + 1 && o >= HYPER.B.o - 8 && o <= HYPER.B.o + 8) return terminal(x, o, HYPER.B, col, false); return 0; }

// ---------- tram onder de grond (-1) en de hellingen in de middenberm van de laan z = 5888 ----------
export function tramColumn(x, z, col) {
  const U = TRAM, o = z - TRAM_Z0;
  if (x < U.r0 || x > U.e1) return 0;
  const row = tramRow(x), under = row < G - 1;
  // in de helling: een open sleuf in de middenberm (sporen o -2 / 1, wanden o -5 en 3)
  if ((x < U.r1 || x > U.e0)) {
    if (o < -5 || o > 3) return 0;
    if (o === -5 || o === 3) { for (let y = row - 1; y <= G; y++) col[y] = B.CONCRETE; return G; }
    for (let y = row - 1; y <= G - 1; y++) col[y] = B.CONCRETE;
    for (let y = row + 1; y <= G + 1; y++) col[y] = 0;
    col[row] = B.BALLAST;
    return G - 1;
  }
  // tunnel en station: doos van rij G-11 tot G-2
  const st = x >= U.f0 && x <= U.f1, w0 = st ? -30 : -5, w1 = st ? 31 : 3;
  if (o < w0 || o > w1) return 0;
  for (let y = G - 12; y <= G - 2; y++) col[y] = B.CONCRETE;
  if (o === w0 || o === w1) { if (st && o === w0 && x % 8 === 0) col[G - 6] = B.SIGN; return G - 2; }
  for (let y = row; y <= G - 3; y++) col[y] = 0;
  col[row] = B.BALLAST; col[row - 1] = B.CONCRETE;
  let near = 1e9, nk = 0; for (let k = 0; k < 10; k++) { const c = tramO(k, x), d = Math.abs(o - c); if (d < near) { near = d; nk = k; } }
  const c = tramO(nk, x), dd = o - c;
  if (x % 16 === 0 && o % 6 === 0) col[G - 3] = B.LAMP;
  if (st && x >= U.p0 && x <= U.p1) {
    const P = TRAM_PLATS.find(p => o >= p.o0 && o <= p.o1);
    if (P) {
      const edge = o === P.o0 || o === P.o1; col[row] = edge && (x & 3) === 0 ? B.LINE_YELLOW : B.TILE;
      // trappen naar de straat: perron 1 (boulevard), 2 (noordstoep), 3 (middenberm), 4 (zuidstoep), 5 (noordingang)
      const s = x - TRAM_STAIR_X, mid = TRAM_STAIR_O[P.n];
      if (s >= 0 && s < 10 && (o === mid || o === mid + 1) && P.n !== 5) { const y = G - 10 + (9 - s); for (let yy = row; yy <= G - 1; yy++) col[yy] = yy <= y ? (yy === y ? B.TILE : B.CONCRETE) : 0; if (y >= G - 1) col[G - 1] = B.TILE; return G - 1; }
      if (P.n === 5 && x >= 5190 && x < 5200 && (z === 5911 || z === 5912)) { const y = G - 1 - (x - 5190); for (let yy = row; yy <= G - 2; yy++) col[yy] = yy <= y ? (yy === y ? B.TILE : B.CONCRETE) : 0; return G - 2; }
      if (P.n === 5 && x === 5184 && z === 5912) { col[row] = B.ELEVATOR; return G - 2; }
      if (o === P.o0 + 2 && x % 24 === 4) col[row + 1] = B.BENCH;
      if (o === P.o0 + 1 && x % 40 === 20) { col[row + 1] = B.POST; col[row + 2] = B.DEPARTURE_BOARD; }
      if (o === P.o0 + 2 && x % 40 === 0) { col[row + 1] = B.POST; col[row + 2] = B.POST; col[row + 3] = B.SIGN; }
    }
  }
  return G - 2;
}
// opening in de straat boven de tramtrappen (glazen balustrade rond het trapgat)
export function tramStairTop(x, z, col) {
  const o = z - TRAM_Z0;
  for (const P of TRAM_PLATS) {
    if (P.n === 5) continue;
    const mid = TRAM_STAIR_O[P.n], s = x - TRAM_STAIR_X, lane = (q) => q >= -11 && q <= -5 || q >= 4 && q <= 10; // geen balustrade op de rijbaan
    if (s >= 1 && s < 10 && (o === mid || o === mid + 1)) { col[G - 1] = 0; for (let y = G; y <= G + 2; y++) col[y] = 0; return true; }
    if (s >= 0 && s <= 10 && (o === mid - 1 || o === mid + 2) && !lane(o)) { col[G] = B.GLASS; return true; }
    if ((s === 10) && (o === mid || o === mid + 1)) { col[G] = B.GLASS; return true; }
  }
  return false;
}

// ---------- metro M2 ----------
export function m2Column(x, z, col) {
  const o = x - M2_X;
  if (z < M2_Z0 - 4 || z > M2_Z1 + 4 || o < -24 || o > 25) return;
  const inGcSt = z >= M2_GC.f0 && z <= M2_GC.f1;
  const S = M2_STATIONS.find(s => s.name !== 'Grand Central' && Math.abs(z - s.z) <= 48);
  const w0 = inGcSt ? -23 : -7, w1 = inGcSt ? 24 : 8;
  if (o < w0 || o > w1) return;
  const R = M2_ROW, hallTop = (S || inGcSt) ? R + 9 : R + 6;
  for (let y = R - 1; y <= hallTop + 1; y++) col[y] = B.CONCRETE;
  if (o === w0 || o === w1 || z < M2_Z0 || z > M2_Z1) { if ((S || inGcSt) && (o === w0 || o === w1) && z % 8 === 0) col[R + 4] = B.SIGN; return; }
  for (let y = R + 1; y <= hallTop; y++) col[y] = 0;
  col[R] = B.BALLAST;
  let near = 1e9, nk = 0; for (let k = 0; k < 6; k++) { const c = m2O(k, z), d = Math.abs(o - c); if (d < near) { near = d; nk = k; } }
  if (o === 0 && z % 16 === 0) col[hallTop] = B.LAMP;
  // perrons: Grand Central (3 eilandperrons) of een gewoon station (eilandperron o -2..3)
  let P = null;
  if (inGcSt && z >= M2_GC.p0 && z <= M2_GC.p1) P = M2_PLATS.find(p => o >= p.o0 && o <= p.o1);
  else if (S && o >= -2 && o <= 3) P = { n: 1, o0: -2, o1: 3 };
  if (!P) return;
  col[R + 1] = (o === P.o0 || o === P.o1) && (z & 3) === 0 ? B.LINE_YELLOW : B.TILE; col[R] = B.CONCRETE;
  const mid = P.o0 + 2;
  if (o === mid && z % 16 === 8) col[R + 2] = B.BENCH;
  if (o === mid + 1 && z % 32 === 4) { col[R + 2] = B.POST; col[R + 3] = B.DEPARTURE_BOARD; }
  if (o === mid - 1 && z % 32 === 20) col[R + 2] = B.TICKET;
  // trap naar de straat (middenberm) en lift: gewoon station 26 treden in de middenberm (o -1..0), GC: per perron een
  // trap naar de onderdoorgang onder het spoordek (die ligt voor dit stuk over de laan) en één lift
  const zz = inGcSt ? z - 6032 : z - S.z;                                              // GC: ten zuiden van de laan onder het dek
  if ((o === mid || o === mid + 1) && zz >= 0 && zz < 26) {
    const y = R + 1 + zz; for (let yy = R + 1; yy <= G + 2; yy++) col[yy] = yy < y ? B.CONCRETE : yy === y ? B.TILE : 0;
    return;
  }
  if ((o === mid - 1 || o === mid + 2) && zz >= 0 && zz < 26) { for (let yy = R + 1; yy <= G - 2; yy++) col[yy] = B.CONCRETE; col[G - 1] = B.TILE; col[G] = B.GLASS; return; }
  if (o === mid && zz === -3) { col[R + 1] = B.ELEVATOR; for (let yy = R + 2; yy < G - 1; yy++) col[yy] = yy <= R + 4 ? 0 : B.CONCRETE; col[G - 1] = B.ELEVATOR; col[G] = 0; col[G + 1] = 0; col[G + 2] = B.GLASS; }
}

// ---------- paden voor het verkeer ----------
// geeft alle paden (wereldcoördinaten) die deze tegel raken: treinsporen in het station, tram T5 onder de grond,
// metro M2; type/line/trk/throat zoals js/traffic.js ze gebruikt
const SAMPLE = 8;
function curve(fnO, a, b, base, flip, y, alongX = true) {
  const pts = [], n = Math.max(1, Math.round(Math.abs(b - a) / SAMPLE));
  for (let i = 0; i <= n; i++) { const s = a + (b - a) * i / n, c = fnO(s); pts.push(alongX ? [s, base + c, y] : [base + c, s, y]); }
  if (flip) pts.reverse();
  return pts;
}
let ALL = null;
export function gcAllPaths() {
  if (ALL) return ALL;
  const out = [];
  const add = (type, pts, extra) => out.push({ type, pts, ...extra });
  // trein: per spoor wisselboog west, perronspoor, wisselboog oost. Richting van de punten = zoals het hoofdspoor
  // (noord: west → oost, zuid: oost → west), zodat de rijrichting (rechts rijden) overeenkomt.
  TRACKS.forEach((t, k) => {
    const flip = t.grp === 'S', ex = { line: 'IC', trk: t.n, noMast: true, gc: 'trein', run: 1 };
    add('train', curve(x => trackO(k, x), WX0, PX0, RAIL_Z, flip, DECK), { ...ex, throat: 'W' + t.grp });
    add('train', curve(() => t.o, PX0, PX1, RAIL_Z, flip, DECK), { ...ex });
    add('train', curve(x => trackO(k, x), PX1, EX1, RAIL_Z, flip, DECK), { ...ex, throat: 'E' + t.grp });
    add('railstop', [[(PX0 + PX1) / 2, RAIL_Z + t.o, DECK]], { name: NAME, trk: t.n, plat: Math.floor(k / 2) + 1 });
  });
  // tram T5: van het verschuifpunt tot onder het station en weer terug (straat → helling → tunnel → waaier)
  TRAM_TRACKS.forEach((t, k) => {
    const flip = t.grp === 'S', ex = { line: 'T5', trk: 100 + t.n, noMast: true, gc: 'tram', run: 1 }, U = TRAM;
    const seg = (a, b) => { const pts = []; const n = Math.max(1, Math.round((b - a) / 4)); for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; pts.push([x, TRAM_Z0 + tramO(k, x), tramRow(x)]); } return flip ? pts.reverse() : pts; };
    if (t.o === -3 || t.o === 4) { /* sporen 5 en 6 hebben ook de toegang */ }
    add('tram', seg(U.f0, U.p0), { ...ex, throat: 'TW' + t.grp });
    add('tram', seg(U.p0, U.p1), { ...ex });
    add('tram', seg(U.p1, U.f1), { ...ex, throat: 'TE' + t.grp });
    add('busstop', [[5100, TRAM_Z0 + t.o, TRAM.row]], { name: 'Tramstation Grand Central', trk: 100 + t.n, plat: Math.floor(k / 2) + 1 }); // niet op de tegelrand (x 5120)
  });
  for (const grp of ['N', 'S']) {               // toegang: straat → tunnel (één spoor per richting), aan beide kanten
    const k = grp === 'N' ? 4 : 5, flip = grp === 'S', U = TRAM;
    const seg = (a, b) => { const pts = []; const n = Math.max(1, Math.round((b - a) / 4)); for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; pts.push([x, TRAM_Z0 + (grp === 'N' ? (x < U.u0 || x > U.u1 ? tramO(k, x) : TRAM_MAIN.N) : (x < U.u0 || x > U.u1 ? tramO(k, x) : TRAM_MAIN.S)), tramRow(x)]); } return flip ? pts.reverse() : pts; };
    add('tram', grp === 'N' ? seg(U.u0 - 40, U.f0) : seg(U.f1, U.u1 + 40), { line: 'T5', noMast: true, gc: 'tram', run: 1 });
    add('tram', grp === 'N' ? seg(U.f1, U.u1 + 40) : seg(U.u0 - 40, U.f0), { line: 'T5', noMast: true, gc: 'tram', run: 1 });
  }
  // metro M2: hoofdsporen van noord tot zuid, met de waaier en 6 perronsporen in Grand Central
  for (const grp of ['W', 'E']) {
    const m = M2_MAIN[grp], flip = grp === 'W', y = M2_ROW, ex = { line: 'M2', gc: 'metro', run: 1 };
    const line = (a, b) => { const pts = [[M2_X + m, a, y], [M2_X + m, b, y]]; return flip ? pts.reverse() : pts; };
    add('metro', line(M2_Z0, M2_GC.f0), ex);
    add('metro', line(M2_GC.f1, M2_Z1), ex);
  }
  M2_TRACKS.forEach((t, k) => {
    const flip = t.grp === 'W', ex = { line: 'M2', trk: 200 + t.n, gc: 'metro', run: 1 }, y = M2_ROW;
    add('metro', curve(z => m2O(k, z), M2_GC.f0, M2_GC.p0, M2_X, flip, y, false), { ...ex, throat: 'MN' + t.grp });
    add('metro', curve(() => t.o, M2_GC.p0, M2_GC.p1, M2_X, flip, y, false), ex);
    add('metro', curve(z => m2O(k, z), M2_GC.p1, M2_GC.f1, M2_X, flip, y, false), { ...ex, throat: 'MS' + t.grp });
    add('metrostop', [[M2_X + t.o, 6040, y]], { name: 'Metro Grand Central', trk: 200 + t.n, plat: Math.floor(k / 2) + 1 }); // niet op de tegelrand (z 6016)
  });
  for (const S of M2_STATIONS) if (S.name !== 'Grand Central') add('metrostop', [[M2_X + 0.5, S.z, M2_ROW]], { name: 'Metro ' + S.name });
  // voetgangers (reizigers): boulevard → noordingang → roltrappen → hal (vertrekbord, automaten, infobalie, winkels)
  // → roltrap → perron, en van het perron de trap af naar de onderdoorgang. Lijnen opgeknipt op elk aansluitpunt.
  const F = HALL.floor, DY = DECK + 1, walk = (pts) => add('walk', pts);
  const cutLine = (a, b, fixed, y, cuts, alongX) => { const vs = [...new Set([a, b, ...cuts.filter(c => c > a && c < b)])].sort((p, q) => p - q); for (let i = 0; i + 1 < vs.length; i++) walk(alongX ? [[vs[i], fixed, y], [vs[i + 1], fixed, y]] : [[fixed, vs[i], y], [fixed, vs[i + 1], y]]); };
  const XS = [5131, 5175, 5237], oz = (o) => RAIL_Z + o, crossO = [-90, 90, ...PLATFORMS.map(P => P.o0 + 3.5)], shopZ = { west: [], east: [] };
  for (const row of ['west', 'east']) for (const S of HALL_SHOPS[row]) shopZ[row].push(oz(HALL.o0 + 1 + S.u0 + Math.floor(S.w / 2) - 0.5));
  const extra = { 5175: [oz(-40), oz(-52), oz(0)], 5131: shopZ.west, 5237: shopZ.east };
  for (const X of XS) cutLine(oz(-95.5), oz(95.5), X, F, [...crossO.map(oz), ...(extra[X] || [])], false);
  for (const o of crossO) cutLine(5131, 5237, oz(o), F, [5157, 5175], true);
  shopZ.west.forEach(z => walk([[5131, z, F], [5112, z, F]])); shopZ.east.forEach(z => walk([[5237, z, F], [5256, z, F]]));
  walk([[5175, oz(-40), F], [5181, oz(-40), F]]); walk([[5175, oz(-52), F], [5171, oz(-50), F]]); walk([[5175, oz(0), F], [5179, oz(0), F]]); // vertrekbord, automaat, infobalie
  for (const P of PLATFORMS) {
    const oe = P.o0 + 3.5, op = P.o0 + 1.5, os = P.o1 - 1.5;
    walk([[5157, oz(oe), F], [5150, oz(oe), DY], [5146, oz(op), DY]]);                                   // roltrap naar het perron
    cutLine(PX0 + 6, PX1 - 6, oz(op), DY, [5146, 5172], true);                                            // langs het perron
    walk([[5172, oz(op), DY], [5170, oz(os), DY], [5160, oz(os), G - 1], [5154, oz(os), G - 1]]);          // trap naar de onderdoorgang
  }
  walk([[5175, oz(-95.5), F], [5184, 5919.5, F], [5160, 5908, F], [5157, 5908, F], [5140, 5908, G - 1], [5136, 5905, G - 1], [5184, 5900, G - 1], [5170, 5888, G - 1]]); // noordingang
  walk([[5184, 5900, G - 1], [5197, 5888, G - 1]]);
  ALL = out;
  return out;
}
// paden voor één tegel, in tegelcoördinaten [x, z, y] (het verkeer knipt ze zelf op de tegelrand)
export function gcPaths(tx, tz) {
  const X0 = tx * T, Z0 = tz * T, res = [];
  for (const p of gcAllPaths()) {
    let lo = 1e9, hi = -1e9, lz = 1e9, hz = -1e9;
    for (const q of p.pts) { lo = Math.min(lo, q[0]); hi = Math.max(hi, q[0]); lz = Math.min(lz, q[1]); hz = Math.max(hz, q[1]); }
    if (hi < X0 - 2 || lo > X0 + T + 2 || hz < Z0 - 2 || lz > Z0 + T + 2) continue;
    const pts = new Float32Array(p.pts.length * 3);
    p.pts.forEach((q, i) => { pts[i * 3] = q[0] - X0; pts[i * 3 + 1] = q[1] - Z0; pts[i * 3 + 2] = q[2]; });
    if (p.pts.length === 1 && (q => q[0] < X0 || q[0] >= X0 + T || q[1] < Z0 || q[1] >= Z0 + T)(p.pts[0])) continue; // halte: alleen in de eigen tegel
    const { type, pts: _p, ...extra } = p;
    res.push({ type, pts, ...extra });
  }
  return res;
}

// ---------- waar ben ik? (voor de HUD) ----------
export function gcPlace(x, y, z) {
  const o = z - RAIL_Z;
  if (x >= HYPER.A.x0 && x <= HYPER.A.x1 && Math.abs(o - HYPER.A.o) <= 8 && y >= HYPER.y && y < HYPER.y + 7) return 'Hyperloopterminal Grand Central (niveau 0)';
  if (x >= HYPER.B.x0 && x <= HYPER.B.x1 && Math.abs(o - HYPER.B.o) <= 8 && y >= HYPER.y && y < HYPER.y + 7) return 'Hyperloopterminal Luchthaven';
  if (!inGC(x, z) && !(Math.abs(x - M2_X) < 26 && y < G - 16)) return null;
  if (y < G - 16 && Math.abs(x - M2_X) < 26) { const S = M2_STATIONS.find(s => Math.abs(z - s.z) <= 60); return S ? 'Metro M2 · ' + S.name + (S.name === 'Grand Central' ? ' (niveau -2)' : '') : 'Metro M2'; }
  if (y < G - 1 && Math.abs(z - TRAM_Z0) <= 31 && x >= TRAM.f0 && x <= TRAM.f1) { const P = TRAM_PLATS.find(p => o + RAIL_Z - TRAM_Z0 >= p.o0 && o + RAIL_Z - TRAM_Z0 <= p.o1); return 'Tramstation Grand Central (niveau -1)' + (P ? ' · perron ' + P.n : ''); }
  if (y >= HALL.floor && x >= HALL.x0 && x <= HALL.x1 && o >= HALL.o0 && o <= HALL.o1) { const S = hallShopAt(x, z); return NAME + ' · stationshal (niveau +1)' + (S ? ' · ' + S.name + ' (' + S.soort.toLowerCase() + ')' : ''); }
  if (y >= DECK && o >= SHED.o0 && o <= SHED.o1 && x >= PX0 && x <= PX1) { const P = platAt(o); return NAME + (P ? ` · perron ${P.n} (sporen ${P.tracks[0]} en ${P.tracks[1]})` : ' · sporen'); }
  if (x >= ENTR.x0 && x <= ENTR.x1 && z >= ENTR.z0 && z <= ENTR.z1) return NAME + ' · hoofdingang';
  if (o >= SHED.o0 && o <= SHED.o1 && x >= WX0 && x <= EX1 && y < DECK) return NAME + ' · onderdoorgang (straat)';
  return NAME + ' · stationsplein';
}

// bewuste openingen in het straatoppervlak (voor de controle op gaten): tramhellingen, trapgaten naar tram en metro
export function designedOpening(x, z) {
  const U = TRAM, ot = z - TRAM_Z0;
  if (((x >= U.r0 && x < U.r1) || (x > U.e0 && x <= U.e1)) && ot >= -4 && ot <= 2) return true;
  for (const n of [1, 2, 3, 4]) { const m = TRAM_STAIR_O[n]; if (x >= TRAM_STAIR_X && x <= TRAM_STAIR_X + 10 && (ot === m || ot === m + 1)) return true; }
  if (x >= 5190 && x <= 5200 && (z === 5911 || z === 5912)) return true;
  const om = x - M2_X;
  for (const S of M2_STATIONS) {
    if (S.name === 'Grand Central') { for (const P of M2_PLATS) { const mid = P.o0 + 2; if ((om === mid || om === mid + 1) && z >= 6032 && z < 6058) return true; } }
    else if ((om === 0 || om === 1) && z >= S.z && z < S.z + 26) return true;
  }
  return false;
}
