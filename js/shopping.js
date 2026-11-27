// TERRANOVA 16.1 — winkelen in Megatower City: de Grand Boulevard en Megatower Galleria.
//  Grand Boulevard  autovrije winkelstraat in tegelkolom 40 (x 5120..5247): van z 3840 tot het torenplein (1.152 m) en
//                   van het torenplein tot Grand Central (512 m) — samen 1,66 km. Een wandelstraat van 40 m breed met
//                   twee rijen bomen, fonteinen op elk pleintje, terrassen voor de horeca, banken, bloembakken,
//                   lantaarns en een fietspad in twee richtingen; links en rechts ingerichte winkels met elk een eigen
//                   gevel en hoogte (2 tot 6 verdiepingen). De lanen kruisen de boulevard met zebrapaden en verkeerslichten.
//  Megatower Galleria  winkelcentrum op de tegels 41..42 × 43..44 (228 × 228 m): logistieke kelder (-1), vijf
//                   winkelverdiepingen rond een atrium onder een glazen dak, galerijen met balustrades, bruggen, roltrappen,
//                   glazen liften, trappenhuizen, foodcourt (niveau 3), panoramagalerij (niveau 4), vier ingangen en de
//                   metro M2 (station Galleria) rechtstreeks in het atrium.
// Alles deterministisch en zonder three.js (de worker gebruikt het, js/megacity.js).
import { B } from './blocks.js';
import { planRow, shopBlock, SHOP_KINDS } from './shops.js';

const G = 120, T = 128;
const h = (a, b, c) => { let x = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// ---------- Grand Boulevard ----------
export const BLV = { tx: 40, rows: [[30, 38], [42, 45]], x0: 40 * T, west: [14, 43], street: [44, 83], east: [84, 113] };
export const isBoulevard = (tx, tz) => tx === BLV.tx && BLV.rows.some(([a, b]) => tz >= a && tz <= b);
const BLV_KINDS = ['kleding', 'cafe', 'schoenen', 'elektronica', 'bakker', 'boek', 'restaurant', 'parfum', 'speelgoed', 'juwelier', 'sport', 'chocolade', 'telefoon', 'fastfood', 'cadeau', 'meubel', 'kleding', 'supermarkt', 'warenhuis', 'apotheek', 'cafe', 'restaurant'];
const used = new Set(), ROWS = new Map();
function blvRow(tz, side) {
  const k = tz * 2 + side; let r = ROWS.get(k); if (r) return r;
  const rot = (tz * 5 + side * 11) % BLV_KINDS.length, kinds = BLV_KINDS.slice(rot).concat(BLV_KINDS.slice(0, rot));
  r = planRow(100, kinds, 7000 + k, used).map(S => ({ ...S, floors: 2 + Math.floor(h(S.seed, 3, 1) * 5), wall: BLV_WALLS[Math.floor(h(S.seed, 4, 1) * BLV_WALLS.length)], awn: h(S.seed, 5, 1) < 0.5 ? B.AWNING_RED : B.AWNING_BLUE, style: Math.floor(h(S.seed, 6, 1) * 4) }));
  ROWS.set(k, r); return r;
}
const BLV_WALLS = [B.LIMESTONE, B.BRICK, B.PLASTER_BEIGE, B.MARBLE, B.BRICK_DARK, B.PANEL_WHITE, B.YELLOWBRICK, B.RED_SANDSTONE, B.GRANITE, B.PLASTER];
// alle winkels van de boulevard (voor tests, HUD en de rapportage)
export function boulevardShops() {
  const out = [];
  for (const [a, b] of BLV.rows) for (let tz = a; tz <= b; tz++) for (const side of [0, 1]) for (const S of blvRow(tz, side)) out.push({ ...S, tz, side, z0: tz * T + 14 + S.u0, x: side ? BLV.x0 + 84 : BLV.x0 + 43 });
  return out;
}
export function boulevardShopAt(x, z) {
  const lx = x - BLV.x0, tz = Math.floor(z / T), lz = z - tz * T; if (!isBoulevard(BLV.tx, tz) || lz < 14 || lz > 113) return null;
  const side = lx >= BLV.west[0] && lx <= BLV.west[1] ? 0 : lx >= BLV.east[0] && lx <= BLV.east[1] ? 1 : -1; if (side < 0) return null;
  const u = lz - 14; return blvRow(tz, side).find(S => u >= S.u0 && u < S.u0 + S.w) || null;
}
// kolom in een boulevardtegel (buiten de lanen): lx, lz in de tegel
export function boulevardColumn(x, z, lx, lz, tz, col) {
  col[G - 1] = B.TILE;
  if (lz < 14 || lz > 113) return G - 1;
  const side = lx <= BLV.west[1] ? 0 : lx >= BLV.east[0] ? 1 : -1;
  if (side >= 0) {
    const row = blvRow(tz, side), u = lz - 14, S = row.find(q => u >= q.u0 && u < q.u0 + q.w);
    if (!S) return G - 1;
    const v = side === 0 ? BLV.west[1] - lx : lx - BLV.east[0], d = 30, su = u - S.u0;
    for (let l = 0; l < 5; l++) { const b = shopBlock(S, su, v, l, d, 5, true); col[G - 1 + l] = b; }
    // bovenverdiepingen: gevel met ramen (verlichte kamers erachter), kroonlijst, dak
    const top = G + 3 + S.floors * 4, edgeU = su === 0 || su === S.w - 1, front = v === 0, back = v === d - 1;
    for (let y = G + 4; y <= top; y++) {
      const k = y - (G + 4), lev = k % 4;
      if (front || back || edgeU) {
        const win = !edgeU && lev !== 0 && (S.style === 0 ? su % 3 !== 0 : S.style === 1 ? su % 2 === 1 : S.style === 2 ? true : su % 4 !== 0 && lev !== 3);
        col[y] = win ? (S.style === 2 ? B.GLASS_BLUE : B.GLASS) : S.wall;
        if (front && lev === 0 && S.style === 3) col[y] = B.LIMESTONE;           // waterlijsten
      } else col[y] = lev === 0 ? B.CONCRETE : B.ROOM_FILL;
    }
    col[top + 1] = front || back || edgeU ? (S.style === 1 ? B.COPPER : B.LIMESTONE) : (h(x, z, 9) < 0.04 ? B.VENT : B.CONCRETE); // kroonlijst en dak
    // luifel boven de etalage (niet boven de deur) aan de boulevardkant, één cel voor de gevel
    return top + 1;
  }
  // de wandelstraat zelf: lx 44..83
  const c = lx - 44, mz = lz % 32;                                                       // c = 0..39 dwars, mz = plek langs
  col[G - 1] = ((c >> 1) + (lz >> 1)) % 2 ? B.GRANITE : B.TILE;
  const awnW = c <= 1 ? blvRow(tz, 0).find(q => lz - 14 >= q.u0 && lz - 14 < q.u0 + q.w) : c >= 38 ? blvRow(tz, 1).find(q => lz - 14 >= q.u0 && lz - 14 < q.u0 + q.w) : null;
  if (awnW) { const su = lz - 14 - awnW.u0, mid = Math.floor(awnW.w / 2); if (su > 0 && su < awnW.w - 1 && su !== mid && su !== mid - 1) { col[G + 3] = awnW.awn; return G + 3; } return G - 1; } // luifels
  // terras voor horeca (2..6 m voor de gevel)
  for (const [sd, cc] of [[0, c - 2], [1, 37 - c]]) {
    if (cc < 0 || cc > 4) continue;
    const S = blvRow(tz, sd).find(q => lz - 14 >= q.u0 && lz - 14 < q.u0 + q.w); if (!S || !SHOP_KINDS[S.kind].horeca) continue;
    const su = lz - 14 - S.u0; if (su < 2 || su > S.w - 3 || Math.abs(su - S.w / 2) < 2) continue;
    if (cc === 2 && su % 3 === 1) { col[G] = B.TABLE; col[G + 1] = B.POST; col[G + 2] = S.kind === 'cafe' ? B.AWNING_BLUE : B.AWNING_RED; return G + 2; } // tafel met parasol
    if ((cc === 1 || cc === 3) && su % 3 === 1) { col[G] = B.CHAIR; return G; }
    if (cc === 4 && su % 2 === 0) { col[G] = B.PLANTER; col[G + 1] = B.FLOWERS; return G + 1; }
    return G - 1;
  }
  // fietspad in twee richtingen (c 31..34), met een witte middenstreep
  if (c >= 31 && c <= 34) { col[G - 1] = (c === 32 || c === 33) && lz % 6 < 3 && false ? B.LINE_WHITE : B.BIKE_PATH; if (c === 33 && lz % 8 < 4) col[G - 1] = B.LINE_WHITE; return G - 1; }
  // pleintje met fontein in het midden van elke tegel (lz 58..69)
  const fx = c - 15.5, fz = lz - 63.5, fr = Math.hypot(fx, fz * 1.3);
  if (fr < 7.5) {
    if (fr < 1.2) { for (let y = G - 2; y <= G + 2; y++) col[y] = B.WATER; return G + 2; }
    if (fr < 5.5) { col[G - 1] = B.WATER; col[G - 2] = B.WATER; return G - 1; }
    if (fr < 6.5) { col[G] = B.MARBLE; return G; }
    if (Math.abs(fx) > 4 && (lz === 63 || lz === 64)) { col[G] = B.BENCH; return G; }
    return G - 1;
  }
  // bomenrijen (c 8 en 24), banken ertussen, lantaarns, bloembakken
  if ((c === 8 || c === 24) && mz % 8 === 4) { col[G - 1] = B.GRASS; return { kind: 3, top: G - 1 }; }
  if ((c === 8 || c === 24) && mz % 8 === 0) { col[G] = B.BENCH; return G; }
  if ((c === 6 || c === 26) && mz === 12) { for (let y = G; y < G + 5; y++) col[y] = B.POST; col[G + 5] = B.LAMP; return G + 5; }
  if ((c === 10 || c === 22) && mz === 28) { col[G] = B.PLANTER; col[G + 1] = B.FLOWERS; return G + 1; }
  if (c === 16 && mz === 20 && (lz < 40 || lz > 90)) { col[G] = B.POST; col[G + 1] = B.POST; col[G + 2] = B.SIGN; return G + 2; } // wegwijzer
  if (c === 16 && lz === 100) { col[G] = B.METAL; col[G + 1] = B.METAL; return G + 1; } // kiosk/zuil
  return G - 1;
}
// zebrapaden over de lanen tussen twee boulevardtegels (x in de wandelstraat)
export function boulevardCrossing(x, z) { const lx = x - BLV.x0; if (lx < 44 || lx > 83) return false; const tz = Math.round(z / T); return isBoulevard(BLV.tx, tz) && isBoulevard(BLV.tx, tz - 1) || (isBoulevard(BLV.tx, tz) || isBoulevard(BLV.tx, tz - 1)); }

// ---------- Megatower Galleria ----------
export const GAL = { tx0: 41, tx1: 42, tz0: 43, tz1: 44, x0: 5262, z0: 5518, N: 228, levels: 5, LH: 6, ring: 20, gal: 10, name: 'Megatower Galleria' };
export const isGalleria = (tx, tz) => tx >= GAL.tx0 && tx <= GAL.tx1 && tz >= GAL.tz0 && tz <= GAL.tz1;
const GAL_KINDS = [
  ['warenhuis', 'kleding', 'schoenen', 'parfum', 'juwelier', 'kleding', 'cafe', 'telefoon', 'elektronica', 'boek', 'cadeau', 'chocolade', 'supermarkt', 'apotheek', 'bakker', 'toiletten'],
  ['kleding', 'kleding', 'schoenen', 'sport', 'juwelier', 'parfum', 'cafe', 'kleding', 'speelgoed', 'elektronica', 'telefoon', 'cadeau', 'kleding', 'schoenen'],
  ['meubel', 'speelgoed', 'sport', 'elektronica', 'boek', 'kleding', 'cafe', 'kleding', 'cadeau', 'schoenen', 'toiletten', 'sport', 'parfum'],
  ['restaurant', 'fastfood', 'cafe', 'restaurant', 'fastfood', 'restaurant', 'cafe', 'fastfood', 'restaurant', 'toiletten', 'fastfood', 'restaurant'],
  ['meubel', 'kleding', 'restaurant', 'juwelier', 'cafe', 'elektronica', 'kleding', 'cadeau', 'restaurant', 'toiletten'],
];
export const levelY = (L) => G - 1 + L * GAL.LH;                    // vloerrij van niveau L (0..4); je staat op +1
const GROWS = new Map(), gused = new Set();
// vier rijen per niveau: noord (z klein), zuid, west, oost; de noord- en zuidrij lopen over de volle breedte
function galRow(L, side) {
  const k = L * 4 + side; let r = GROWS.get(k); if (r) return r;
  const len = side < 2 ? GAL.N - 2 : GAL.N - 2 - 2 * GAL.ring, kinds = GAL_KINDS[L].slice((side * 3) % GAL_KINDS[L].length).concat(GAL_KINDS[L].slice(0, (side * 3) % GAL_KINDS[L].length));
  r = planRow(len, kinds, 9100 + k, gused).filter(S => !(S.u0 <= len / 2 && S.u0 + S.w > len / 2 - 5)); // ingang/doorgang in het midden van elke zijde
  GROWS.set(k, r); return r;
}
export function galleriaShops() { const out = []; for (let L = 0; L < GAL.levels; L++) for (let s = 0; s < 4; s++) for (const S of galRow(L, s)) out.push({ ...S, level: L, side: s }); return out; }
// plaats in het centrum: afstand tot de gevel (dd), zijde, positie langs de zijde (u) en diepte (v, 0 = gevel)
function galLocal(x, z) {
  const u = x - GAL.x0, w = z - GAL.z0, N = GAL.N;
  if (u < 0 || w < 0 || u >= N || w >= N) return null;
  const dN = w, dS = N - 1 - w, dW = u, dE = N - 1 - u, dd = Math.min(dN, dS, dW, dE);
  let side, along, depth;
  if (dN <= GAL.ring && dN <= dS) { side = 0; along = u - 1; depth = dN; }
  else if (dS <= GAL.ring) { side = 1; along = N - 2 - u; depth = dS; }
  else if (dW <= dE) { side = 2; along = N - 2 - GAL.ring - w; depth = dW; }
  else { side = 3; along = w - 1 - GAL.ring; depth = dE; }
  return { u, w, dd, side, along, depth };
}
export function galleriaShopAt(x, y, z) {
  const q = galLocal(x, z); if (!q || q.dd > GAL.ring || q.dd < 1) return null;
  const L = Math.floor((y - (G - 1)) / GAL.LH); if (L < 0 || L >= GAL.levels) return null;
  return galRow(L, q.side).find(S => q.along >= S.u0 && q.along < S.u0 + S.w) || null;
}
// roltrappen op de noord- en zuidgalerij (op 28..29 van de gevel), afwisselend zodat je van elk niveau omhoog kan
const GAL_ESC_W = 28, ESC = [{ sd: 0, ux: 100, levels: [0, 2] }, { sd: 0, ux: 120, levels: [1, 3] }, { sd: 1, ux: 100, levels: [1, 3] }, { sd: 1, ux: 120, levels: [0, 2] }];
export function galleriaColumn(x, z, col) {
  const q = galLocal(x, z); if (!q) return 0;
  const { u, w, dd } = q, N = GAL.N, top = levelY(GAL.levels) ;
  col[G - 1] = B.MARBLE;
  for (let y = G; y <= top + 2; y++) col[y] = 0;
  // logistieke kelder (-1): vloer G-9, plafond = vloer niveau 0
  for (let y = G - 10; y <= G - 2; y++) col[y] = 0;
  col[G - 10] = B.CONCRETE; col[G - 9] = B.CONCRETE;
  const mU = Math.abs(u - (N - 1) / 2), mW = Math.abs(w - (N - 1) / 2);
  if (dd === 0) { for (let y = G - 9; y <= G - 2; y++) col[y] = B.CONCRETE; }
  else {
    // laadperrons, rekken met kratten, vrachtwagens, goederenliften
    if ((u % 24 === 12) && dd > 3 && dd < 60) for (let y = G - 8; y <= G - 5; y++) col[y] = (w % 3) ? B.CRATE : 0;
    if (dd >= 60 && dd < 70 && (u % 40 < 12) && (w % 30 < 4)) for (let y = G - 8; y <= G - 6; y++) col[y] = u % 40 < 3 ? B.PAINT_BLACK : B.PAINT_WHITE; // vrachtwagen
    if (u % 32 === 16 && w % 32 === 16) for (let y = G - 8; y <= G - 3; y++) col[y] = B.CONCRETE;      // kolommen
    if (u % 16 === 8 && w % 16 === 8) col[G - 2] = B.LAMP;
  }
  // gevel
  if (dd === 0) {
    const entr = (mU < 6 && (w === 0 || w === N - 1)) || (mW < 6 && (u === 0 || u === N - 1));
    for (let L = 0; L <= GAL.levels; L++) { const y0 = levelY(L); col[y0] = L === GAL.levels ? B.PANEL_WHITE : B.CONCRETE; if (L === GAL.levels) break; for (let l = 1; l < GAL.LH; l++) col[y0 + l] = entr && L === 0 && l <= 4 ? 0 : (L === 4 || (u + w) % 6 !== 0) && l > 1 ? (L === 4 ? B.GLASS : B.GLASS_BLUE) : (L % 2 ? B.LIMESTONE : B.PANEL_WHITE); }
    if (entr) { col[levelY(1) - 1] = B.SIGN; col[levelY(1)] = B.FACADE_LED; }
    return top;
  }
  let maxTop = top;
  for (let L = 0; L < GAL.levels; L++) {
    const y0 = levelY(L);
    // ring met winkels (afstand 1..20 tot de gevel), behalve de doorgang naar de ingang in het midden van elke zijde
    const passage = (q.side < 2 ? mU < 6 : mW < 6);
    if (dd <= GAL.ring) {
      col[y0] = B.MARBLE;
      if (passage) { for (let l = 1; l < GAL.LH; l++) col[y0 + l] = 0; if (dd === GAL.ring && L === 0) col[y0 + GAL.LH - 1] = B.SIGN; continue; }
      if (L === 4 && dd <= 3) { if (dd === 3 && q.along % 8 === 0) col[y0 + 1] = B.BENCH; continue; } // panoramagalerij langs de buitengevel
      const S = galRow(L, q.side).find(s => q.along >= s.u0 && q.along < s.u0 + s.w);
      if (!S) { for (let l = 1; l < GAL.LH; l++) col[y0 + l] = B.PANEL_WHITE; continue; }
      const d = L === 4 ? GAL.ring - 3 : GAL.ring, v = GAL.ring - dd;                 // 0 = pui aan de galerij
      for (let l = 0; l < 5; l++) col[y0 + l] = shopBlock(S, q.along - S.u0, v, l, d, 5, true);
      col[y0 + 5] = B.PANEL_WHITE;
      continue;
    }
    // galerij (afstand 21..30): vloer, balustrade aan de atriumrand, lampen
    if (dd <= GAL.ring + GAL.gal) {
      col[y0] = L === 0 ? B.MARBLE : ((u + w) % 4 < 2 ? B.MARBLE : B.GRANITE);
      if (dd === GAL.ring + GAL.gal && L > 0 && !bridge(u, w)) col[y0 + 1] = B.GLASS;
      if (dd === GAL.ring + 2 && (u + w) % 12 === 0) col[y0 + 1] = B.PLANTER;
      if (dd === GAL.ring + 5 && (u + w) % 16 === 8) col[y0 + 1] = B.BENCH;
      if (dd === GAL.ring + 5 && (u + w) % 24 === 4) col[y0 + 5] = B.LAMP;
      continue;
    }
    // atrium: open vanaf niveau 1, behalve de bruggen (midden) en het foodcourtdek op niveau 3
    if (L === 0) {
      col[y0] = (u + w) % 8 < 4 ? B.MARBLE : B.GRANITE;
      const r = Math.hypot(u - 113.5, w - 140);
      if (r < 6) { col[y0] = B.WATER; col[y0 - 1] = B.WATER; if (r < 1.2) for (let y = y0; y <= y0 + 4; y++) col[y] = B.WATER; }    // fontein
      else if (r < 7) col[y0 + 1] = B.MARBLE;
      else if ((u % 20 === 10) && (w % 20 === 10) && r > 12) { col[y0 + 1] = B.PLANTER; for (let y = y0 + 2; y <= y0 + 6; y++) col[y] = y > y0 + 3 ? B.LEAVES : B.LOG; } // bomen
      else if ((u % 20 === 14) && (w % 10 === 5) && r > 12) col[y0 + 1] = B.BENCH;
      else if (u >= 70 && u <= 84 && w >= 60 && w <= 90 && (u - 70) % 7 === 0) { col[y0 + 1] = B.COUNTER; col[y0 + 2] = B.MENU_BOARD; } // kiosken
      continue;
    }
    if (bridge(u, w)) { col[y0] = B.GRANITE; if (bridgeEdge(u, w)) col[y0 + 1] = B.GLASS; continue; }
    if (L === 3 && dd <= 60) {                                                           // foodcourt
      col[y0] = B.TILE;
      if (dd === 60) col[y0 + 1] = B.GLASS;
      else if (dd > 33 && (u % 5 === 2) && (w % 4 === 1)) col[y0 + 1] = B.TABLE;
      else if (dd > 33 && (u % 5 === 2) && (w % 4 === 0 || w % 4 === 2)) col[y0 + 1] = B.CHAIR;
      continue;
    }
  }
  // roltrappen op de galerij (2 breed, langs de winkels), telkens één niveau omhoog; erboven een gat met balustrade
  for (const E of ESC) {
    const wl = E.sd === 0 ? w : N - 1 - w, k = u - E.ux;
    if ((wl === GAL_ESC_W || wl === GAL_ESC_W + 1) && k >= -1 && k <= 6) for (const l0 of E.levels) {
      if (k >= 0 && k <= 5) {
        const y = levelY(l0) + 1 + k; for (let yy = levelY(l0) + 1; yy < y; yy++) col[yy] = B.CONCRETE;
        col[y] = wl === GAL_ESC_W ? B.ESCALATOR : B.TILE; for (let yy = y + 1; yy <= Math.min(levelY(l0 + 1) + 2, y + 3); yy++) col[yy] = 0;
        if (k < 5) col[levelY(l0 + 1)] = 0;
      }
    }
    if ((wl === GAL_ESC_W - 1 || wl === GAL_ESC_W + 2) && k >= 0 && k <= 4) for (const l0 of E.levels) col[levelY(l0 + 1) + 1] = B.GLASS;
    if ((wl === GAL_ESC_W || wl === GAL_ESC_W + 1) && k === -1) for (const l0 of E.levels) col[levelY(l0 + 1) + 1] = B.GLASS;
  }
  // liften op de galerij bij de vier hoeken (stoppen in de kelder en op elk niveau)
  const lift = (u === GAL.ring + 6 || u === N - 7 - GAL.ring) && (w === GAL.ring + 6 || w === N - 7 - GAL.ring);
  if (lift) { for (let y = G - 9; y <= levelY(4) + 3; y++) col[y] = 0; col[G - 10] = B.CONCRETE; col[G - 9] = B.ELEVATOR; for (let L = 0; L < GAL.levels; L++) col[levelY(L)] = B.ELEVATOR; }
  // dak: glas boven het atrium, elders een dakterras met beplanting
  const roofY = levelY(GAL.levels);
  col[roofY] = dd > GAL.ring + GAL.gal ? ((u % 8 === 0 || w % 8 === 0) ? B.METAL : B.GLASS) : B.CONCRETE;
  if (dd > 3 && dd <= GAL.ring && (u * 7 + w * 3) % 23 === 0) { col[roofY + 1] = B.PLANTER; col[roofY + 2] = B.LEAVES; maxTop = roofY + 2; }
  if (dd === 1) { col[roofY + 1] = B.GLASS; maxTop = Math.max(maxTop, roofY + 1); }
  return maxTop;
}
const bridge = (u, w) => (Math.abs(u - 113.5) < 4 && w > 20 && w < 207) || (Math.abs(w - 113.5) < 4 && u > 20 && u < 207);
const bridgeEdge = (u, w) => (Math.abs(u - 113.5) >= 3 && Math.abs(u - 113.5) < 4 && !(Math.abs(w - 113.5) < 4)) || (Math.abs(w - 113.5) >= 3 && Math.abs(w - 113.5) < 4 && !(Math.abs(u - 113.5) < 4));

// ---------- looproutes voor voetgangers (js/traffic.js 'walk') ----------
// boulevard: twee looplijnen door elke tegel (eindpunten op de tegelranden, zodat ze over de lanen doorlopen), met
// korte zijpaadjes naar elke winkeldeur (bezoek: de voetganger loopt naar binnen en keert om) en naar de banken.
// Galleria: rondgangen op elk niveau, paden van de vier ingangen naar de stoep van de lanen (op een tegelrand) en de
// roltrappen als hellende paden tussen de niveaus.
export function shoppingPaths(tx, tz) {
  const out = [], X0 = tx * T, Z0 = tz * T, add = (pts, extra) => out.push({ type: 'walk', pts: new Float32Array(pts), ...(extra || {}) });
  // een rechte lijn opgeknipt in stukken tussen de gegeven punten (het verkeersnet koppelt alleen eindpunten)
  const line = (ax, az, bx, bz, y, cuts, alongX) => { const pts = [...new Set([0, 1, ...cuts.map(c => (c - (alongX ? ax : az)) / ((alongX ? bx - ax : bz - az) || 1)).filter(t => t > 0 && t < 1)])].sort((p, q) => p - q); for (let i = 0; i + 1 < pts.length; i++) add([ax + (bx - ax) * pts[i], az + (bz - az) * pts[i], y, ax + (bx - ax) * pts[i + 1], az + (bz - az) * pts[i + 1], y]); };
  if (isBoulevard(tx, tz)) {
    const cuts = { 0: [63.5], 1: [63.5] };
    for (const side of [0, 1]) for (const S of blvRow(tz, side)) cuts[side].push(14 + S.u0 + Math.floor(S.w / 2) - 0.5);
    line(50, 0, 50, T, G - 1, cuts[0], false); line(77, 0, 77, T, G - 1, cuts[1], false);
    for (const side of [0, 1]) for (const S of blvRow(tz, side)) {
      const zc = 14 + S.u0 + Math.floor(S.w / 2) - 0.5, fx = side ? 84 : 43, ix = side ? 92 : 35, lx = side ? 77 : 50;
      add([lx, zc, G - 1, fx + (side ? -0.5 : 0.5), zc, G - 1, ix, zc, G - 1]);                 // naar binnen (bezoek)
    }
    add([50, 63.5, G - 1, 58, 63.5, G - 1]); add([77, 63.5, G - 1, 69, 63.5, G - 1]);           // naar de fontein
  }
  if (isGalleria(tx, tz)) {
    const g0x = GAL.x0 - X0, g0z = GAL.z0 - Z0, N = GAL.N, a = GAL.ring + 5, b = N - 1 - GAL.ring - 5, mid = 114, ew = GAL_ESC_W + 0.5;
    for (let L = 0; L < GAL.levels; L++) {
      const y = levelY(L), sp = { 0: [mid], 1: [mid], 2: [mid], 3: [mid] }, spurs = [];
      for (const E of ESC) { if (E.levels.includes(L)) sp[E.sd].push(E.ux); if (E.levels.includes(L - 1)) sp[E.sd].push(E.ux + 6); }
      for (let s = 0; s < 4; s++) galRow(L, s).forEach((S, i) => {
        if (i % 2) return; const al = S.u0 + Math.floor(S.w / 2) - 0.5;
        const P = (along, dep) => s === 0 ? [1 + along, dep] : s === 1 ? [N - 2 - along, N - 1 - dep] : s === 2 ? [dep, N - 2 - GAL.ring - along] : [N - 1 - dep, 1 + GAL.ring + along];
        const [x1, z1] = P(al, s < 2 ? (s === 0 ? a : N - 1 - b) : (s === 2 ? a : N - 1 - b)), [x2, z2] = P(al, GAL.ring - 6);
        if (x1 < a || x1 > b || z1 < a || z1 > b) { /* binnen de ring */ }
        const cx = Math.max(a, Math.min(b, x1)), cz = Math.max(a, Math.min(b, z1));
        sp[s].push(s < 2 ? cx : cz); spurs.push([cx, cz, x2, z2]);
      });
      line(g0x + a, g0z + a, g0x + b, g0z + a, y, sp[0].map(v => g0x + v), true);
      line(g0x + a, g0z + b, g0x + b, g0z + b, y, sp[1].map(v => g0x + v), true);
      line(g0x + a, g0z + a, g0x + a, g0z + b, y, sp[2].map(v => g0z + v), false);
      line(g0x + b, g0z + a, g0x + b, g0z + b, y, sp[3].map(v => g0z + v), false);
      for (const [x1, z1, x2, z2] of spurs) add([g0x + x1, g0z + z1, y, g0x + x2, g0z + z2, y]);
      // roltrappen als hellende looproutes naar het niveau erboven
      for (const E of ESC) if (E.levels.includes(L)) { const wz = E.sd === 0 ? a : b, we = E.sd === 0 ? ew : N - 1 - ew, y1 = levelY(L + 1); add([g0x + E.ux, g0z + wz, y, g0x + E.ux - 0.5, g0z + we, y, g0x + E.ux + 6, g0z + we, y1, g0x + E.ux + 6, g0z + wz, y1]); }
    }
    // ingangen: van de stoep van de laan (eindpunt op een tegelrand) naar de rondgang op niveau 0
    const ent = [[[-2, mid], [a, mid]], [[N + 1, mid], [b, mid]], [[mid, -2], [mid, a]], [[mid, N + 1], [mid, b]]];
    for (const [p0, p1] of ent) add([g0x + p0[0], g0z + p0[1], G - 1, g0x + p1[0], g0z + p1[1], G - 1]);
  }
  return out;
}
export function shoppingPlace(x, y, z) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T);
  if (isGalleria(tx, tz) && galLocal(x, z)) {
    const L = Math.max(-1, Math.floor((y - (G - 1)) / GAL.LH)), S = galleriaShopAt(x, y, z);
    if (y < G - 1) return GAL.name + ' · logistieke verdieping (-1)';
    return `${GAL.name} · niveau ${Math.min(L, 4)}${L === 3 ? ' (foodcourt)' : L === 4 ? ' (panoramagalerij)' : ''}${S ? ' · ' + S.name + ' (' + S.soort.toLowerCase() + ')' : ''}`;
  }
  if (isBoulevard(tx, tz)) { const S = boulevardShopAt(x, z); return 'Grand Boulevard' + (S && y < G + 4 ? ' · ' + S.name + ' (' + S.soort.toLowerCase() + ')' : ''); }
  return null;
}
