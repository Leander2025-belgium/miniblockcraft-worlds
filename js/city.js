// Procedurele stadsgenerator voor Blokstad.
// De stad is 2500 m breed (x) en 25000 m lang (z). 1 blok = 1 meter.
// Alles is deterministisch: dezelfde coördinaten geven altijd dezelfde stad,
// zodat je elk stuk apart kan "downloaden" en ze naadloos op elkaar aansluiten.

import { B } from './blocks.js';

export const WIDTH = 2500;
export const LENGTH = 25000;
export const GROUND = 24;     // y van het straatniveau
export const HEIGHT = 176;    // hoogte van een gedownload gebied
export const WATER_TOP = 21;  // hoogste waterlaag in rivier/zee

const SEA = 160;
const BEACH = 60;
const RIVER_HALF = 20;
const CELL = 50;              // straatraster
const SUPER = 250;            // superblok (laan om de 250 m)

export const D = { PARK: 1, CENTRUM: 2, STAD: 3, WOON: 4, INDUSTRIE: 5, HAVEN: 6, ZEE: 7, RIVIER: 8 };
export const DISTRICT_NAMES = {
  1: 'Park', 2: 'Centrum', 3: 'Stadswijk', 4: 'Woonwijk', 5: 'Industrie', 6: 'Haven', 7: 'Zee & strand', 8: 'Rivier',
};

// Soort ondergrond van de laatst berekende kolom (voor bomen)
export const K = { NONE: 0, PARK: 1, YARD: 2, COURT: 3, STREETTREE: 4 };
const TREE_P = [0, 0.6, 0.3, 0.45, 1];
export let lastKind = 0;

// ---------- hulpfuncties ----------
export function hash(x, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }
export function noise(x, z, s = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function riverX(z) {
  return 1700 + 260 * Math.sin(z / 2300) + 110 * Math.sin(z / 730 + 1.3);
}

function centrality(x, z) {
  const a = Math.exp(-(((z - 12500) / 2600) ** 2));
  const b = 0.8 * Math.exp(-(((z - 5200) / 1500) ** 2));
  const c = 0.75 * Math.exp(-(((z - 19800) / 1700) ** 2));
  const cx = 1 - Math.min(1, Math.abs(x - 1100) / 1600);
  return Math.max(a, b, c) * (0.55 + 0.45 * cx);
}

// Districten per superblok, één keer berekend
const NSBX = Math.ceil(WIDTH / SUPER), NSBZ = Math.ceil(LENGTH / SUPER);
const districtMap = new Uint8Array(NSBX * NSBZ);
for (let sbz = 0; sbz < NSBZ; sbz++) {
  for (let sbx = 0; sbx < NSBX; sbx++) {
    const cx = sbx * SUPER + 125, cz = sbz * SUPER + 125;
    const r = hash(sbx, sbz, 7);
    const c = centrality(cx, cz);
    let d;
    if (sbz <= 2 || sbz >= NSBZ - 3) d = D.HAVEN;
    else if (sbx >= 1 && sbx <= 2 && sbz >= 54 && sbz <= 56) d = D.PARK; // groot stadspark
    else if (r < 0.09) d = D.PARK;
    else if (c > 0.6) d = D.CENTRUM;
    else if (c > 0.33) d = r < 0.16 ? D.PARK : D.STAD;
    else if (hash(Math.floor(sbx / 3), Math.floor(sbz / 6), 9) < 0.28) d = D.INDUSTRIE;
    else d = D.WOON;
    districtMap[sbz * NSBX + sbx] = d;
  }
}
function districtOf(sbx, sbz) {
  if (sbx < 0) sbx = 0; if (sbx >= NSBX) sbx = NSBX - 1;
  if (sbz < 0) sbz = 0; if (sbz >= NSBZ) sbz = NSBZ - 1;
  return districtMap[sbz * NSBX + sbx];
}
function cellDistrict(cx, cz) { return districtOf(Math.floor(cx * CELL / SUPER), Math.floor(cz * CELL / SUPER)); }
function roadWX(cx, cz) { return cx % 5 === 0 ? 14 : (cellDistrict(cx, cz) === D.PARK ? 0 : 8); }
function roadWZ(cx, cz) { return cz % 5 === 0 ? 14 : (cellDistrict(cx, cz) === D.PARK ? 0 : 8); }

const PRE = ['Linden', 'Eiken', 'Molen', 'Kerk', 'Brug', 'Wilgen', 'Beuken', 'Zonne', 'Kasteel', 'Vijver', 'Dijk',
  'Akker', 'Bloemen', 'Steen', 'Water', 'Rozen', 'Klaver', 'Sterre', 'Duinen', 'Hoeve', 'Abdij', 'Markt', 'Toren', 'Vlas'];
const SUF = ['hof', 'dal', 'veld', 'berg', 'kwartier', 'wijk', 'park', 'plein', 'kaai', 'rode', 'dam', 'hoek', 'meers', 'gaarde'];
export function wijkName(x, z) {
  const wx = Math.floor(x / 1250), wz = Math.floor(z / 1000);
  const a = PRE[Math.floor(hash(wx, wz, 21) * PRE.length)];
  const b = SUF[Math.floor(hash(wx, wz, 22) * SUF.length)];
  return a + b;
}

export function districtAt(x, z) {
  const seaD = Math.min(z, LENGTH - 1 - z);
  let d = districtOf(Math.floor(x / SUPER), Math.floor(z / SUPER));
  if (seaD < SEA + BEACH) d = D.ZEE;
  else if (Math.abs(x - riverX(z)) < RIVER_HALF) d = D.RIVIER;
  return { type: d, typeName: DISTRICT_NAMES[d], wijk: wijkName(x, z) };
}

function lotNearRiver(cx, cz) {
  const x0 = cx * CELL - RIVER_HALF - 10, x1 = cx * CELL + CELL + RIVER_HALF + 10;
  for (const dz of [0, 25, 49]) {
    const rx = riverX(cz * CELL + dz);
    if (rx > x0 && rx < x1) return true;
  }
  return false;
}

// ---------- gebouwen ----------
const STYLES = {
  glassDark: { wall: B.CONCRETE, glass: B.DARKGLASS, roof: B.CONCRETE, floor: B.TILE, step: 4, win: 1 },
  glassBlue: { wall: B.METAL, glass: B.GLASS, roof: B.METAL, floor: B.TILE, step: 4, win: 1 },
  office: { wall: B.CONCRETE, glass: B.GLASS, roof: B.CONCRETE, floor: B.TILE, step: 4, win: 0 },
  brickTower: { wall: B.BRICK, glass: B.GLASS, roof: B.ROOF_DARK, floor: B.PLANKS, step: 4, win: 0 },
  brick: { wall: B.BRICK, glass: B.GLASS, roof: B.ROOF_DARK, floor: B.PLANKS, step: 4, win: 0, shop: true },
  plaster: { wall: B.PLASTER, glass: B.GLASS, roof: B.CONCRETE, floor: B.PLANKS, step: 4, win: 0, shop: true },
  yellow: { wall: B.YELLOWBRICK, glass: B.GLASS, roof: B.ROOF_DARK, floor: B.PLANKS, step: 4, win: 0, shop: true },
  hall: { wall: B.METAL, glass: B.GLASS, roof: B.METAL, floor: B.CONCRETE, step: 1000, win: 2 },
  warehouse: { wall: B.BRICK, glass: B.GLASS, roof: B.METAL, floor: B.CONCRETE, step: 1000, win: 2 },
};
const STAD_STYLES = [STYLES.brick, STYLES.plaster, STYLES.yellow, STYLES.brick];
const TOWER_STYLES = [STYLES.glassDark, STYLES.glassBlue, STYLES.office, STYLES.brickTower];

function put(col, y, b) { if (y < HEIGHT) col[y] = b; }

// Vult één kolom van een gebouw.
// edge/corner: ligt de kolom op de gevel; t/L: positie langs de gevel; kFrom..kTo: verdiepingsniveaus
function building(col, edge, corner, t, L, kFrom, kTo, st, roof, bigDoor) {
  const G = GROUND;
  if (kFrom === 1) col[G] = st.floor;
  const doorHalf = bigDoor ? 2 : 1;
  const isDoor = edge && !corner && Math.abs(t + 0.5 - L / 2) <= doorHalf;
  for (let k = kFrom; k <= kTo; k++) {
    const y = G + k;
    if (y >= HEIGHT) break;
    const lev = k % st.step;
    if (edge) {
      if (isDoor && k <= (bigDoor ? 4 : 2)) { col[y] = 0; continue; }
      let win = false;
      if (!corner) {
        if (st.win === 1) win = lev !== 0 && t % 4 !== 0;
        else if (st.win === 2) win = k >= kTo - 2 && k < kTo && t % 3 !== 0;
        else if (st.shop && k <= 3) win = k <= 2 && t % 4 !== 0;
        else win = (lev === 2 || lev === 3) && t % 3 === 1;
      }
      col[y] = win ? st.glass : st.wall;
    } else {
      col[y] = lev === 0 ? st.floor : 0;
    }
  }
  if (roof) {
    put(col, G + kTo + 1, st.roof);
    if (edge) put(col, G + kTo + 2, st.wall);
    return Math.min(HEIGHT - 1, G + kTo + (edge ? 2 : 1));
  }
  return Math.min(HEIGHT - 1, G + kTo);
}

// Edge-info voor een rechthoek [x0,x1)×[z0,z1)
const E = { edge: false, corner: false, t: 0, L: 0 };
function rectEdge(lx, lz, x0, z0, x1, z1) {
  const ex = lx === x0 || lx === x1 - 1, ez = lz === z0 || lz === z1 - 1;
  E.edge = ex || ez; E.corner = ex && ez;
  if (ex) { E.t = lz - z0; E.L = z1 - z0; } else { E.t = lx - x0; E.L = x1 - x0; }
  return E;
}
function inRect(lx, lz, x0, z0, x1, z1) { return lx >= x0 && lx < x1 && lz >= z0 && lz < z1; }

// ---------- wegen ----------
function roadSurface(x, z, s, along, w, wOther, nextOther) {
  // s: positie dwars op de weg, along: positie langs de weg in de cel
  if (wOther > 0 && along >= wOther && along < wOther + 3) return (s % 2 === 0) ? B.LINE_WHITE : B.ASPHALT;
  if (nextOther && along >= CELL - 3) return (s % 2 === 0) ? B.LINE_WHITE : B.ASPHALT;
  if (w === 14) {
    if (s === 6 || s === 7) return B.LINE_YELLOW;
    if ((s === 3 || s === 10) && (along % 8) < 4) return B.LINE_WHITE;
    return B.ASPHALT;
  }
  if (s === 4 && (along % 6) < 3) return B.LINE_WHITE;
  return B.ASPHALT;
}

const CAR_COLORS = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_WHITE, B.PAINT_BLACK, B.PAINT_GREEN, B.PAINT_ORANGE, B.METAL];
function parkedCar(col, s, along, w, wOther, seedA, seedB) {
  if (w !== 8) return -1;
  let side;
  if (s <= 1) side = 0; else if (s >= 6) side = 1; else return -1;
  const start = wOther + 4, end = CELL - 4;
  const q = along - start;
  if (q < 0 || along >= end) return -1;
  const slot = Math.floor(q / 6), pos = q % 6;
  if (start + slot * 6 + 5 > end) return -1;
  if (pos < 1 || pos > 4) return -1;
  const h = hash(seedA * 3 + side, seedB * 16 + slot, 31);
  if (h > 0.42) return -1;
  const color = CAR_COLORS[Math.floor(hash(seedA, seedB * 16 + slot + side * 100, 32) * CAR_COLORS.length)];
  const G = GROUND;
  col[G + 1] = color;
  if (pos === 2 || pos === 3) { col[G + 2] = B.GLASS; return G + 2; }
  return G + 1;
}

// ---------- kolomgenerator ----------
function base(col, top) {
  col[0] = B.BEDROCK;
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
}

// Schrijft de blokken van kolom (x,z) in col (moet leeg zijn). Geeft de hoogste niet-lege y terug.
export function fillColumn(x, z, col) {
  const G = GROUND;
  lastKind = K.NONE;

  // --- zee en strand aan beide uiteinden ---
  const seaD = Math.min(z, LENGTH - 1 - z);
  if (seaD < SEA) {
    const bed = Math.max(4, G - 6 - Math.floor((SEA - seaD) / 12));
    base(col, bed); col[bed] = B.SAND;
    for (let y = bed + 1; y <= WATER_TOP; y++) col[y] = B.WATER;
    return WATER_TOP;
  }
  if (seaD < SEA + BEACH) {
    const top = WATER_TOP + Math.floor(((seaD - SEA) / BEACH) * (G - WATER_TOP + 1));
    const t = Math.min(G, top);
    base(col, t - 2); col[t - 2] = B.SAND; col[t - 1] = B.SAND; col[t] = B.SAND;
    if (seaD < SEA + 6) { for (let y = t + 1; y <= WATER_TOP; y++) col[y] = B.WATER; }
    if (hash(x, z, 5) < 0.004 && t >= G - 1) { // strandparasol
      for (let y = t + 1; y <= t + 3; y++) col[y] = B.POST; col[t + 4] = hash(x, z, 6) < 0.5 ? B.PAINT_RED : B.PAINT_BLUE;
      return t + 4;
    }
    return Math.max(t, seaD < SEA + 6 ? WATER_TOP : 0);
  }

  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  const sx = x - cx * CELL, sz = z - cz * CELL;
  const d = districtOf(Math.floor(x / SUPER), Math.floor(z / SUPER));
  const wx = roadWX(cx, cz), wz = roadWZ(cx, cz);
  const nextX = roadWX(cx + 1, cz) > 0, nextZ = roadWZ(cx, cz + 1) > 0;
  const onX = sx < wx, onZ = sz < wz;

  // --- rivier ---
  const rx = riverX(z), dr = Math.abs(x + 0.5 - rx);
  if (dr < RIVER_HALF) {
    const bed = G - 8 - (dr < RIVER_HALF - 6 ? 2 : 0);
    base(col, bed); col[bed] = B.SAND;
    for (let y = bed + 1; y <= WATER_TOP; y++) col[y] = B.WATER;
    if (onZ) { // brug
      col[G - 1] = B.CONCRETE;
      col[G] = roadSurface(x, z, sz, sx, wz, 0, false);
      if (sz === 0 || sz === wz - 1) { col[G + 1] = B.POST; return G + 1; }
      return G;
    }
    return WATER_TOP;
  }

  base(col, G);
  if (dr < RIVER_HALF + 4) { // kade
    if (onZ) { col[G] = roadSurface(x, z, sz, sx, wz, 0, false); return G; }
    col[G] = B.COBBLE;
    if (dr < RIVER_HALF + 1) {
      if ((z % 4) === 0) { col[G + 1] = B.POST; return G + 1; }
    } else if (dr > RIVER_HALF + 3 && (z % 30) === 15) {
      for (let y = G + 1; y <= G + 4; y++) col[y] = B.POST; col[G + 5] = B.LAMP; return G + 5;
    }
    return G;
  }

  // --- wegen ---
  if (onX || onZ) {
    if (onX && onZ) { col[G] = B.ASPHALT; return G; }
    if (onX) {
      col[G] = roadSurface(x, z, sx, sz, wx, wz, nextZ);
      const c = parkedCar(col, sx, sz, wx, wz, cx, cz);
      return c > 0 ? c : G;
    }
    col[G] = roadSurface(x, z, sz, sx, wz, wx, nextX);
    const c = parkedCar(col, sz, sx, wz, wx, cz + 7777, cx);
    return c > 0 ? c : G;
  }

  // --- perceel ---
  const lx = sx - wx, lz = sz - wz, lw = CELL - wx, ld = CELL - wz;
  const sideW = wx > 0 && lx < 3, sideN = wz > 0 && lz < 3, sideE = nextX && lx >= lw - 3, sideS = nextZ && lz >= ld - 3;
  const r = hash(cx, cz, 1), r2 = hash(cx, cz, 2), r3 = hash(cx, cz, 3);

  let dd = d;
  if (lotNearRiver(cx, cz) && dd !== D.HAVEN) dd = D.PARK;

  if (sideW || sideN || sideE || sideS) {
    col[G] = B.SIDEWALK;
    // straatlantaarns
    if ((sideW && lx === 0 && (z % 25) === 12) || (sideN && lz === 0 && (x % 25) === 12 && !sideW)) {
      for (let y = G + 1; y <= G + 4; y++) col[y] = B.POST; col[G + 5] = B.LAMP; return G + 5;
    }
    // laanbomen langs de lanen
    if (sideW && wx === 14 && lx === 1 && (z % 12) === 6 && lz > 3 && lz < ld - 3) { lastKind = K.STREETTREE; col[G] = B.GRASS; }
    else if (sideN && wz === 14 && lz === 1 && (x % 12) === 6 && lx > 3 && lx < lw - 3) { lastKind = K.STREETTREE; col[G] = B.GRASS; }
    return G;
  }

  switch (dd) {
    case D.PARK: return parkColumn(x, z, lx, lz, lw, ld, col);
    case D.CENTRUM: return centrumColumn(x, z, cx, cz, lx, lz, lw, ld, r, r2, r3, col);
    case D.STAD: return stadColumn(lx, lz, lw, ld, r, r2, col);
    case D.WOON: return woonColumn(x, z, cx, cz, lx, lz, lw, ld, col);
    case D.INDUSTRIE: return industrieColumn(lx, lz, lw, ld, r, r2, col);
    case D.HAVEN: return havenColumn(x, z, cx, cz, lx, lz, lw, ld, r, r2, col);
  }
  col[G] = B.GRASS;
  return G;
}

function parkColumn(x, z, lx, lz, lw, ld, col) {
  const G = GROUND;
  const n = noise(x / 38, z / 38, 3);
  if (n > 0.72) { col[G] = B.WATER; col[G - 1] = B.WATER; col[G - 2] = B.SAND; return G; }
  if (n > 0.69) { col[G] = B.SAND; return G; }
  const p = noise(x / 70, z / 70, 4);
  if (Math.abs(p - 0.5) < 0.025 || Math.abs(lx - (lw >> 1)) < 1 || Math.abs(lz - (ld >> 1)) < 1) { col[G] = B.GRAVEL; return G; }
  // bankje langs het pad
  if (Math.abs(lx - (lw >> 1)) === 2 && (lz % 15) === 7) { col[G] = B.GRASS; col[G + 1] = B.PLANKS; return G + 1; }
  col[G] = hash(x, z, 8) < 0.05 ? B.FLOWERS : B.GRASS;
  lastKind = K.PARK;
  return G;
}

function centrumColumn(x, z, cx, cz, lx, lz, lw, ld, r, r2, r3, col) {
  const G = GROUND;
  if (r < 0.12) { // plein met fontein
    col[G] = B.TILE;
    const dx = lx - lw / 2 + 0.5, dz = lz - ld / 2 + 0.5, dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.8) { for (let y = G + 1; y <= G + 3; y++) col[y] = B.COBBLE; col[G + 4] = B.WATER; return G + 4; }
    if (dist < 3.2) { col[G] = B.WATER; col[G - 1] = B.COBBLE; return G; }
    if (dist < 4.2) { col[G + 1] = B.COBBLE; return G + 1; }
    if (dist > 8) lastKind = K.COURT;
    if (lastKind && hash(x, z, 9) < 0.5) lastKind = K.NONE;
    return G;
  }
  const c = centrality(x, z);
  const m = 1 + Math.floor(r2 * 3);
  const x0 = 3 + m, z0 = 3 + m, x1 = lw - 3 - m, z1 = ld - 3 - m;
  if (!inRect(lx, lz, x0, z0, x1, z1)) { col[G] = B.TILE; return G; }
  let h = Math.round(28 + c * 105 * (0.3 + 0.7 * r3));
  h = Math.max(24, Math.min(136, h)); h -= h % 4;
  const st = TOWER_STYLES[Math.floor(hash(cx, cz, 4) * 4)];
  const setback = hash(cx, cz, 5) < 0.5 && h > 48;
  const e1 = rectEdge(lx, lz, x0, z0, x1, z1);
  if (!setback) {
    const top = building(col, e1.edge, e1.corner, e1.t, e1.L, 1, h, st, true, false);
    return antenna(col, lx, lz, x0, z0, x1, z1, h, top);
  }
  let h1 = Math.floor(h * 0.55); h1 -= h1 % 4;
  const ix0 = x0 + 4, iz0 = z0 + 4, ix1 = x1 - 4, iz1 = z1 - 4;
  if (!inRect(lx, lz, ix0, iz0, ix1, iz1)) {
    return building(col, e1.edge, e1.corner, e1.t, e1.L, 1, h1, st, true, false);
  }
  building(col, e1.edge, e1.corner, e1.t, e1.L, 1, h1, st, false, false);
  const e2 = rectEdge(lx, lz, ix0, iz0, ix1, iz1);
  const top = building(col, e2.edge, e2.corner, e2.t, e2.L, h1 + 1, h, st, true, false);
  return antenna(col, lx, lz, ix0, iz0, ix1, iz1, h, top);
}

function antenna(col, lx, lz, x0, z0, x1, z1, h, top) {
  if (h < 88) return top;
  if (lx !== ((x0 + x1) >> 1) || lz !== ((z0 + z1) >> 1)) return top;
  const G = GROUND;
  let y = G + h + 2;
  for (; y < Math.min(HEIGHT - 1, G + h + 8); y++) col[y] = B.POST;
  col[y] = B.LAMP;
  return y;
}

function stadColumn(lx, lz, lw, ld, r, r2, col) {
  const G = GROUND;
  const x0 = 3, z0 = 3, x1 = lw - 3, z1 = ld - 3;
  const ix0 = 11, iz0 = 11, ix1 = lw - 11, iz1 = ld - 11;
  const st = STAD_STYLES[Math.floor(r2 * STAD_STYLES.length)];
  const h = 12 + 4 * Math.floor(r * 5);
  if (inRect(lx, lz, ix0, iz0, ix1, iz1)) { // binnentuin
    col[G] = (lx === ix0 + 2 || lz === iz0 + 2) ? B.TILE : B.GRASS;
    if (col[G] === B.GRASS) lastKind = K.COURT;
    return G;
  }
  let e = rectEdge(lx, lz, x0, z0, x1, z1);
  let edge = e.edge, corner = e.corner, t = e.t, L = e.L;
  if (!edge && inRect(lx, lz, ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1)) {
    e = rectEdge(lx, lz, ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1);
    edge = true; corner = e.corner; t = e.t; L = 999; // binnengevel: geen deuren
  }
  return building(col, edge, corner, t, L, 1, h, st, true, false);
}

function woonColumn(x, z, cx, cz, lx, lz, lw, ld, col) {
  const G = GROUND;
  const iw = lw - 6, id = ld - 6;
  const nX = Math.max(1, Math.floor(iw / 12));
  const pw = Math.floor(iw / nX);
  const px = Math.min(nX - 1, Math.floor((lx - 3) / pw));
  const ux = (lx - 3) - px * pw;
  const half = id >> 1;
  const row = (lz - 3) < half ? 0 : 1;
  const uz = row === 0 ? lz - 3 : (ld - 4) - lz;
  const pwEff = px === nX - 1 ? iw - px * pw : pw;
  const hp = hash(cx * 8 + px, cz * 2 + row, 40);
  const doorX = pwEff >> 1;

  // haag tussen percelen
  if ((ux === 0 && px > 0) || uz === half - 1) {
    if (uz >= 2 && !(ux === 0 && uz < 3)) { col[G] = B.GRASS; col[G + 1] = B.HEDGE; return G + 1; }
  }
  const hx0 = 2, hx1 = pwEff - 2, hz0 = 3, hz1 = Math.min(12, half - 2);
  if (uz < hz0 && ux === doorX) { col[G] = B.TILE; return G; }
  if (ux >= hx0 && ux < hx1 && uz >= hz0 - 1 && uz <= hz1) {
    const wall = [B.BRICK, B.PLASTER, B.YELLOWBRICK, B.BRICK][Math.floor(hp * 4)];
    const roof = hash(cx * 8 + px, cz * 2 + row, 41) < 0.6 ? B.ROOF_RED : B.ROOF_DARK;
    const depth = hz1 - hz0;
    if (uz === hz0 - 1 || uz === hz1) { // dakoversteek
      col[G] = B.GRASS; put(col, G + 6, roof); return G + 6;
    }
    const exSide = ux === hx0 || ux === hx1 - 1;
    const exFront = uz === hz0 || uz === hz1 - 1;
    const edge = exSide || exFront, corner = exSide && exFront;
    const t = exSide ? uz - hz0 : ux - hx0;
    col[G] = B.PLANKS;
    for (let k = 1; k <= 6; k++) {
      const y = G + k;
      if (edge) {
        if (uz === hz0 && ux === doorX && k <= 2) { col[y] = 0; continue; }
        const win = !corner && (k === 2 || k === 5) && t % 3 === 1;
        col[y] = win ? B.GLASS : wall;
      } else col[y] = k === 3 ? B.PLANKS : 0;
    }
    const e = Math.min(uz - hz0, hz1 - 1 - uz);
    const roofY = G + 7 + e;
    const ridge = G + 7 + Math.floor((depth - 1) / 2);
    for (let y = G + 7; y < roofY; y++) col[y] = exSide ? wall : 0;
    col[roofY] = roof;
    // schoorsteen
    if (ux === hx1 - 2 && uz === hz0 + 2 && hp < 0.5) { for (let y = roofY + 1; y <= ridge + 2; y++) col[y] = B.BRICK; return ridge + 2; }
    return roofY;
  }
  col[G] = hash(x, z, 8) < 0.03 ? B.FLOWERS : B.GRASS;
  if (uz > hz1 + 1) lastKind = K.YARD;
  return G;
}

function industrieColumn(lx, lz, lw, ld, r, r2, col) {
  const G = GROUND;
  const x0 = 5, z0 = 5, x1 = lw - 5, z1 = ld - 5;
  if (!inRect(lx, lz, x0, z0, x1, z1)) { col[G] = (lx + lz) % 9 === 0 ? B.GRAVEL : B.ASPHALT; return G; }
  const h = 8 + 2 * Math.floor(r * 4);
  if (r2 < 0.5 && lx >= x1 - 6 && lx < x1 - 4 && lz >= z1 - 6 && lz < z1 - 4) {
    col[G] = B.CONCRETE;
    const top = Math.min(HEIGHT - 1, G + h + 18);
    for (let y = G + 1; y <= top; y++) col[y] = B.BRICK;
    return top;
  }
  const e = rectEdge(lx, lz, x0, z0, x1, z1);
  return building(col, e.edge, e.corner, e.t, e.L, 1, h, STYLES.hall, true, true);
}

const CONTAINER_COLORS = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_WHITE];
function havenColumn(x, z, cx, cz, lx, lz, lw, ld, r, r2, col) {
  const G = GROUND;
  col[G] = B.CONCRETE;
  if (r < 0.25) { // dokbassin
    if (inRect(lx, lz, 4, 4, lw - 4, ld - 4)) {
      for (let y = G - 8; y <= G; y++) col[y] = 0;
      col[G - 9] = B.SAND;
      for (let y = G - 8; y <= WATER_TOP; y++) col[y] = B.WATER;
      return WATER_TOP;
    }
    if (inRect(lx, lz, 3, 3, lw - 3, ld - 3) && (lx + lz) % 3 === 0) { col[G + 1] = B.POST; return G + 1; }
    col[G] = B.COBBLE;
    return G;
  }
  if (r < 0.65) { // containers
    if (!inRect(lx, lz, 4, 4, lw - 4, ld - 4)) return G;
    const qx = lx - 4, qz = lz - 4;
    if (qx % 7 === 6 || qz % 3 === 2) return G;
    const cX = Math.floor(qx / 7), cZ = Math.floor(qz / 3);
    const stack = Math.floor(hash(cx * 31 + cX, cz * 31 + cZ, 50) * 4.5);
    let top = G;
    for (let s = 0; s < stack; s++) {
      const c = CONTAINER_COLORS[Math.floor(hash(cx * 31 + cX, cz * 31 + cZ + s * 977, 51) * CONTAINER_COLORS.length)];
      for (let k = 1; k <= 3; k++) col[G + s * 3 + k] = c;
      top = G + s * 3 + 3;
    }
    return top;
  }
  // loods
  const x0 = 4, z0 = 4, x1 = lw - 4, z1 = ld - 4;
  if (!inRect(lx, lz, x0, z0, x1, z1)) return G;
  const e = rectEdge(lx, lz, x0, z0, x1, z1);
  return building(col, e.edge, e.corner, e.t, e.L, 1, 10 + 2 * Math.floor(r2 * 4), STYLES.warehouse, true, true);
}

// ---------- bomen ----------
export function treeAt(x, z, kind) {
  if (kind === K.NONE) return 0;
  if (kind !== K.STREETTREE) {
    const gx = Math.floor(x / 7), gz = Math.floor(z / 7);
    const jx = 1 + Math.floor(hash(gx, gz, 11) * 5), jz = 1 + Math.floor(hash(gx, gz, 12) * 5);
    if (x !== gx * 7 + jx || z !== gz * 7 + jz) return 0;
    if (hash(gx, gz, 13) >= TREE_P[kind]) return 0;
  }
  return 4 + Math.floor(hash(x, z, 14) * 3);
}

// Plaatst een boom in een voxelvolume via de setter (alleen in lucht)
export function placeTree(x, z, groundY, th, get, set) {
  for (let y = groundY + 1; y <= groundY + th; y++) set(x, y, z, B.LOG, true);
  const topY = groundY + th;
  for (let dy = -2; dy <= 1; dy++) {
    const rad = dy <= -1 ? 2 : 1;
    for (let dx = -rad; dx <= rad; dx++) {
      for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rad === 1 ? dy === 1 : hash(x + dx, z + dz, 15 + dy) < 0.6)) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        set(x + dx, topY + dy, z + dz, B.LEAVES, false);
      }
    }
  }
}

// ---------- volledige regio ----------
// Genereert een voxelvolume van size×size×HEIGHT. Index: (lz*size + lx)*HEIGHT + y
export function generateRegion(x0, z0, size, onProgress) {
  const H = HEIGHT;
  const vox = new Uint8Array(size * size * H);
  const col = new Uint8Array(H);
  const trees = [];
  const pad = 3;
  for (let z = z0 - pad; z < z0 + size + pad; z++) {
    if (z < 0 || z >= LENGTH) continue;
    const inZ = z >= z0 && z < z0 + size;
    for (let x = x0 - pad; x < x0 + size + pad; x++) {
      if (x < 0 || x >= WIDTH) continue;
      const inside = inZ && x >= x0 && x < x0 + size;
      col.fill(0);
      const top = fillColumn(x, z, col);
      if (inside) vox.set(col.subarray(0, Math.min(H, top + 1)), ((z - z0) * size + (x - x0)) * H);
      const th = treeAt(x, z, lastKind);
      if (th) trees.push(x, z, top, th);
    }
    if (onProgress && (z & 7) === 0) onProgress((z - z0 + pad) / (size + 2 * pad));
  }
  const set = (x, y, z, b, force) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lz < 0 || lx >= size || lz >= size || y < 0 || y >= H) return;
    const i = (lz * size + lx) * H + y;
    if (vox[i] === 0 || force) vox[i] = b;
  };
  for (let i = 0; i < trees.length; i += 4) placeTree(trees[i], trees[i + 1], trees[i + 2], trees[i + 3], null, set);
  return vox;
}
